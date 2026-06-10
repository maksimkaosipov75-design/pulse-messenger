use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use tokio::sync::mpsc as tmpsc;

use super::network::NetworkCommand;
use super::protocol::{encode_message, ProtocolMessage};

/// Wire format: 16kHz mono PCM16, 20ms frames
pub const CALL_SAMPLE_RATE: u32 = 16_000;
const FRAME_SAMPLES: usize = 320; // 20ms @ 16kHz

enum AudioCmd {
    Start {
        call_id: String,
        peer_id: libp2p::PeerId,
        net: tmpsc::UnboundedSender<NetworkCommand>,
    },
    Frame(Vec<i16>),
    Mute(bool),
    Stop,
}

/// Native audio call engine: captures the microphone into PCM frames
/// sent over libp2p and plays received frames. cpal streams are not
/// Send, so a dedicated thread owns them and is driven by a channel.
pub struct CallAudioService {
    tx: Mutex<mpsc::Sender<AudioCmd>>,
    active_call: Mutex<Option<String>>,
}

impl CallAudioService {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AudioCmd>();
        std::thread::Builder::new()
            .name("pulse-audio".into())
            .spawn(move || audio_thread(rx))
            .expect("audio thread");
        Self {
            tx: Mutex::new(tx),
            active_call: Mutex::new(None),
        }
    }

    pub fn start(
        &self,
        call_id: &str,
        peer_id: libp2p::PeerId,
        net: tmpsc::UnboundedSender<NetworkCommand>,
    ) -> Result<(), String> {
        *self.active_call.lock().unwrap_or_else(|e| e.into_inner()) = Some(call_id.to_string());
        self.send(AudioCmd::Start {
            call_id: call_id.to_string(),
            peer_id,
            net,
        })
    }

    pub fn play_frame(&self, call_id: &str, data: &[u8]) {
        let active = self.active_call.lock().unwrap_or_else(|e| e.into_inner());
        if active.as_deref() != Some(call_id) {
            return; // stale frames from an ended call
        }
        let samples: Vec<i16> = data
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        let _ = self.send(AudioCmd::Frame(samples));
    }

    pub fn set_muted(&self, muted: bool) -> Result<(), String> {
        self.send(AudioCmd::Mute(muted))
    }

    pub fn stop(&self) -> Result<(), String> {
        *self.active_call.lock().unwrap_or_else(|e| e.into_inner()) = None;
        self.send(AudioCmd::Stop)
    }

    fn send(&self, cmd: AudioCmd) -> Result<(), String> {
        self.tx
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .send(cmd)
            .map_err(|_| "Audio engine unavailable".to_string())
    }
}

impl Default for CallAudioService {
    fn default() -> Self {
        Self::new()
    }
}

fn audio_thread(rx: mpsc::Receiver<AudioCmd>) {
    // Streams live here between Start and Stop
    let mut streams: Option<(cpal::Stream, cpal::Stream)> = None;
    let mut playback_prod: Option<ringbuf::HeapProd<i16>> = None;
    let muted = Arc::new(AtomicBool::new(false));

    while let Ok(cmd) = rx.recv() {
        match cmd {
            AudioCmd::Start {
                call_id,
                peer_id,
                net,
            } => {
                streams = None;
                muted.store(false, Ordering::Relaxed);
                match build_streams(call_id, peer_id, net, muted.clone()) {
                    Ok((input, output, prod)) => {
                        playback_prod = Some(prod);
                        streams = Some((input, output));
                    }
                    Err(e) => log::error!("Audio start failed: {}", e),
                }
            }
            AudioCmd::Frame(samples) => {
                if let Some(prod) = playback_prod.as_mut() {
                    prod.push_slice(&samples);
                }
            }
            AudioCmd::Mute(m) => muted.store(m, Ordering::Relaxed),
            AudioCmd::Stop => {
                streams = None;
                playback_prod = None;
            }
        }
    }
    drop(streams);
}

type BuiltStreams = (cpal::Stream, cpal::Stream, ringbuf::HeapProd<i16>);

fn build_streams(
    call_id: String,
    peer_id: libp2p::PeerId,
    net: tmpsc::UnboundedSender<NetworkCommand>,
    muted: Arc<AtomicBool>,
) -> Result<BuiltStreams, String> {
    let host = cpal::default_host();
    let input_device = host
        .default_input_device()
        .ok_or("No microphone available")?;
    let output_device = host
        .default_output_device()
        .ok_or("No audio output available")?;

    let in_config = input_device
        .default_input_config()
        .map_err(|e| e.to_string())?;
    let out_config = output_device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let in_rate = in_config.sample_rate() as f64;
    let in_channels = in_config.channels() as usize;
    let out_rate = out_config.sample_rate() as f64;
    let out_channels = out_config.channels() as usize;

    // 2s of playback buffer absorbs network jitter
    let rb = HeapRb::<i16>::new(CALL_SAMPLE_RATE as usize * 2);
    let (prod, mut cons) = rb.split();

    // --- Capture: native rate mono f32 -> 16k PCM16 frames over the wire
    let mut pending: Vec<f32> = Vec::new();
    let mut seq: u32 = 0;
    let ratio_in = in_rate / CALL_SAMPLE_RATE as f64;
    let input_stream = input_device
        .build_input_stream(
            in_config.into(),
            move |data: &[f32], _| {
                if muted.load(Ordering::Relaxed) {
                    return;
                }
                // First channel only
                pending.extend(data.iter().step_by(in_channels));
                let needed = (FRAME_SAMPLES as f64 * ratio_in) as usize + 1;
                while pending.len() >= needed {
                    let mut frame = [0i16; FRAME_SAMPLES];
                    for (i, slot) in frame.iter_mut().enumerate() {
                        let pos = i as f64 * ratio_in;
                        let idx = pos as usize;
                        let frac = (pos - idx as f64) as f32;
                        let a = pending[idx];
                        let b = *pending.get(idx + 1).unwrap_or(&a);
                        let s = a + (b - a) * frac;
                        *slot = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                    }
                    pending.drain(..needed - 1);
                    let bytes: Vec<u8> = frame.iter().flat_map(|s| s.to_le_bytes()).collect();
                    seq = seq.wrapping_add(1);
                    let msg = ProtocolMessage::CallAudio {
                        call_id: call_id.clone(),
                        seq,
                        data: bytes,
                    };
                    if let Ok(data) = encode_message(&msg) {
                        let _ = net.send(NetworkCommand::SendTransient { peer_id, data });
                    }
                }
            },
            |e| log::error!("Audio input error: {}", e),
            None,
        )
        .map_err(|e| format!("Mic stream: {}", e))?;

    // --- Playback: 16k ring -> native rate
    let step = CALL_SAMPLE_RATE as f64 / out_rate;
    let mut hold: f32 = 0.0;
    let mut frac_pos: f64 = 0.0;
    let output_stream = output_device
        .build_output_stream(
            out_config.into(),
            move |out: &mut [f32], _| {
                for frame_out in out.chunks_mut(out_channels) {
                    frac_pos += step;
                    while frac_pos >= 1.0 {
                        frac_pos -= 1.0;
                        let mut s = [0i16; 1];
                        if cons.pop_slice(&mut s) == 1 {
                            hold = s[0] as f32 / 32768.0;
                        } else {
                            hold = 0.0;
                        }
                    }
                    for sample in frame_out.iter_mut() {
                        *sample = hold;
                    }
                }
            },
            |e| log::error!("Audio output error: {}", e),
            None,
        )
        .map_err(|e| format!("Speaker stream: {}", e))?;

    input_stream.play().map_err(|e| e.to_string())?;
    output_stream.play().map_err(|e| e.to_string())?;
    log::info!(
        "Audio call streams running (mic {}Hz/{}ch, out {}Hz/{}ch)",
        in_rate,
        in_channels,
        out_rate,
        out_channels
    );
    Ok((input_stream, output_stream, prod))
}
