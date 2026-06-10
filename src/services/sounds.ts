import messageSoundUrl from '@/assets/sounds/message.wav';
import ringtoneUrl from '@/assets/sounds/ringtone.wav';

// One shared context: WebKitGTK can't stream media elements from custom
// URI schemes, so every sound goes through Web Audio (WAV decodes
// everywhere). The context unlocks on the first user gesture.
let ctx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    getAudioContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

async function getBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const resp = await fetch(url);
  const bytes = await resp.arrayBuffer();
  const buffer = await getAudioContext().decodeAudioData(bytes);
  bufferCache.set(url, buffer);
  return buffer;
}

function playBuffer(buffer: AudioBuffer, volume: number, loop = false): AudioBufferSourceNode {
  const c = getAudioContext();
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  const gain = c.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(c.destination);
  source.start();
  return source;
}

/** Short ding on incoming messages */
export function playMessageSound() {
  getBuffer(messageSoundUrl)
    .then((b) => playBuffer(b, 0.6))
    .catch(() => {});
}

let ringSource: AudioBufferSourceNode | null = null;

/** Looping ring for an incoming call; idempotent */
export function startRinging() {
  if (ringSource) return;
  getBuffer(ringtoneUrl)
    .then((b) => {
      if (!ringSource) ringSource = playBuffer(b, 0.7, true);
    })
    .catch(() => {});
}

export function stopRinging() {
  try {
    ringSource?.stop();
  } catch {
    // already stopped
  }
  ringSource = null;
}
