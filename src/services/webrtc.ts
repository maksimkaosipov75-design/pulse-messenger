import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // TURN fallback for symmetric NAT / restrictive networks
  // Replace with your own TURN server for production
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export type CallType = 'audio' | 'video';

export type CallState =
  | 'idle'
  | 'outgoing-ringing'
  | 'incoming-ringing'
  | 'connecting'
  | 'connected';

export interface CallInfo {
  callId: string;
  chatId: string;
  peerId: string;
  peerName: string;
  callType: CallType;
  isOutgoing: boolean;
  /** Audio over libp2p (Rust backend) instead of browser WebRTC */
  native?: boolean;
}

/** SDP marker for the native PCM-over-libp2p audio path */
const NATIVE_SDP = 'native-pcm16';

type CallEventCallback = (event: string, data: unknown) => void;

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCall: CallInfo | null = null;
  private eventListeners: UnlistenFn[] = [];
  private onEvent: CallEventCallback | null = null;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private nativeMuted = false;

  setEventCallback(cb: CallEventCallback) {
    this.onEvent = cb;
  }

  private emit(event: string, data: unknown) {
    this.onEvent?.(event, data);
  }

  async startCall(chatId: string, peerId: string, peerName: string, callType: CallType, callerId: string, callerName: string): Promise<string> {
    const callId = crypto.randomUUID();

    // Audio calls run natively over libp2p on every platform —
    // WebKitGTK has no WebRTC, and one path beats two
    const native = callType === 'audio';
    this.currentCall = {
      callId,
      chatId,
      peerId,
      peerName,
      callType,
      isOutgoing: true,
      native,
    };

    let sdp: string | undefined = NATIVE_SDP;
    if (!native) {
      await this.setupMedia(callType);
      this.createPeerConnection();
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      sdp = offer.sdp;
    }

    await invoke('send_call_offer', {
      callId,
      chatId,
      callerId,
      callerName,
      calleeId: peerId,
      callType,
      sdp,
    });

    this.emit('call-state', { state: 'outgoing-ringing', callInfo: this.currentCall });
    return callId;
  }

  async handleOffer(callId: string, chatId: string, callerId: string, callerName: string, callType: CallType, sdp: string) {
    this.currentCall = {
      callId,
      chatId,
      peerId: callerId,
      peerName: callerName,
      callType,
      isOutgoing: false,
      native: sdp === NATIVE_SDP,
    };

    this.emit('incoming-call', { callInfo: this.currentCall, sdp });
    this.emit('call-state', { state: 'incoming-ringing', callInfo: this.currentCall });

    // Store the offer SDP for when user accepts
    (this as unknown as Record<string, unknown>)._pendingOfferSdp = sdp;
  }

  async acceptCall(): Promise<void> {
    if (!this.currentCall) throw new Error('No active call');

    if (this.currentCall.native) {
      await invoke('send_call_answer', {
        callId: this.currentCall.callId,
        callerId: this.currentCall.peerId,
        sdp: NATIVE_SDP,
      });
      await invoke('native_call_start_audio', {
        callId: this.currentCall.callId,
        toPeer: this.currentCall.peerId,
      });
      this.nativeMuted = false;
      this.emit('call-state', { state: 'connected', callInfo: this.currentCall });
      return;
    }

    const sdp = (this as unknown as Record<string, unknown>)._pendingOfferSdp as string;
    if (!sdp) throw new Error('No pending offer');

    await this.setupMedia(this.currentCall.callType);
    this.createPeerConnection();

    // Set remote description (the offer)
    await this.peerConnection!.setRemoteDescription({
      type: 'offer',
      sdp,
    });

    // Process queued ICE candidates
    for (const candidate of this.iceCandidateQueue) {
      await this.peerConnection!.addIceCandidate(candidate);
    }
    this.iceCandidateQueue = [];

    // Create answer
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    await invoke('send_call_answer', {
      callId: this.currentCall.callId,
      callerId: this.currentCall.peerId,
      sdp: answer.sdp,
    });

    this.emit('call-state', { state: 'connecting', callInfo: this.currentCall });
  }

  async handleAnswer(sdp: string) {
    if (this.currentCall?.native && sdp === NATIVE_SDP) {
      await invoke('native_call_start_audio', {
        callId: this.currentCall.callId,
        toPeer: this.currentCall.peerId,
      });
      this.nativeMuted = false;
      this.emit('call-state', { state: 'connected', callInfo: this.currentCall });
      return;
    }
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription({
      type: 'answer',
      sdp,
    });

    // Process queued ICE candidates
    for (const candidate of this.iceCandidateQueue) {
      await this.peerConnection.addIceCandidate(candidate);
    }
    this.iceCandidateQueue = [];

    this.emit('call-state', { state: 'connecting', callInfo: this.currentCall });
  }

  async handleIceCandidate(candidate: string, sdpMid: string, sdpMLineIndex: number) {
    const iceCandidate: RTCIceCandidateInit = {
      candidate,
      sdpMid,
      sdpMLineIndex,
    };

    if (this.peerConnection?.remoteDescription) {
      await this.peerConnection.addIceCandidate(iceCandidate);
    } else {
      this.iceCandidateQueue.push(iceCandidate);
    }
  }

  async endCall(reason: string = 'hungUp') {
    if (this.currentCall) {
      try {
        await invoke('send_call_end', {
          callId: this.currentCall.callId,
          toPeer: this.currentCall.peerId,
          reason,
        });
      } catch (e) {
        console.error('Failed to send call end:', e);
      }
    }

    this.cleanup();
    this.emit('call-state', { state: 'idle', callInfo: null });
  }

  async rejectCall() {
    if (this.currentCall) {
      try {
        await invoke('send_call_reject', {
          callId: this.currentCall.callId,
          toPeer: this.currentCall.peerId,
        });
      } catch (e) {
        console.error('Failed to send call reject:', e);
      }
    }

    this.cleanup();
    this.emit('call-state', { state: 'idle', callInfo: null });
  }

  toggleMuteAudio(): boolean {
    if (this.currentCall?.native) {
      this.nativeMuted = !this.nativeMuted;
      void invoke('native_call_mute', { muted: this.nativeMuted }).catch(() => {});
      return this.nativeMuted;
    }
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  toggleMuteVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return false;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getCurrentCall(): CallInfo | null {
    return this.currentCall;
  }

  isInCall(): boolean {
    return this.currentCall !== null;
  }

  async setupSignalingListeners() {
    this.cleanupListeners();

    this.eventListeners.push(
      await listen<{
        callId: string;
        chatId: string;
        callerId: string;
        callerName: string;
        calleeId: string;
        callType: { Audio?: {}; Video?: {} };
        sdp: string;
        timestamp: number;
        fromPeer: string;
      }>('call-offer', (event) => {
        const p = event.payload;
        const callType: CallType = p.callType.Video ? 'video' : 'audio';
        this.handleOffer(p.callId, p.chatId, p.fromPeer, p.callerName, callType, p.sdp);
      })
    );

    this.eventListeners.push(
      await listen<{ callId: string; sdp: string }>('call-answer', (event) => {
        this.handleAnswer(event.payload.sdp);
      })
    );

    this.eventListeners.push(
      await listen<{ callId: string; candidate: string; sdpMid: string; sdpMLineIndex: number }>(
        'ice-candidate',
        (event) => {
          const p = event.payload;
          this.handleIceCandidate(p.candidate, p.sdpMid, p.sdpMLineIndex);
        }
      )
    );

    this.eventListeners.push(
      await listen<{ callId: string; reason: unknown }>('call-end', (event) => {
        this.cleanup();
        this.emit('call-state', { state: 'idle', callInfo: null });
        this.emit('call-ended', { reason: event.payload.reason });
      })
    );

    this.eventListeners.push(
      await listen<{ callId: string }>('call-reject', () => {
        this.cleanup();
        this.emit('call-state', { state: 'idle', callInfo: null });
        this.emit('call-rejected', {});
      })
    );
  }

  private createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    this.remoteStream = new MediaStream();

    this.peerConnection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream!.addTrack(track);
      });
      this.emit('remote-stream', { stream: this.remoteStream });
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCall) {
        invoke('send_ice_candidate', {
          callId: this.currentCall.callId,
          toPeer: this.currentCall.peerId,
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid || '',
          sdpMLineIndex: event.candidate.sdpMLineIndex || 0,
        }).catch(console.error);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === 'connected') {
        this.emit('call-state', { state: 'connected', callInfo: this.currentCall });
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        if (this.currentCall) {
          this.endCall('failed');
        }
      }
    };
  }

  private async setupMedia(callType: CallType) {
    // Preflight: WebKitGTK reports a missing capture device as
    // OverconstrainedError("Invalid constraint") — translate it
    let hasMic = true;
    let hasCam = true;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      hasMic = devices.some((d) => d.kind === 'audioinput');
      hasCam = devices.some((d) => d.kind === 'videoinput');
    } catch {
      // enumeration unsupported — try getUserMedia anyway
    }
    if (!hasMic) {
      throw new Error('No microphone found on this device');
    }

    // Progressive fallback: devices without a camera throw on the
    // full request
    const attempts: MediaStreamConstraints[] =
      callType === 'video' && hasCam
        ? [{ audio: true, video: true }, { audio: true }]
        : [{ audio: true }];
    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.emit('local-stream', { stream: this.localStream });
        return;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  private cleanup() {
    if (this.currentCall?.native) {
      void invoke('native_call_stop').catch(() => {});
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.currentCall = null;
    this.iceCandidateQueue = [];
    (this as unknown as Record<string, unknown>)._pendingOfferSdp = undefined;
  }

  private cleanupListeners() {
    this.eventListeners.forEach((u) => u());
    this.eventListeners = [];
  }

  destroy() {
    this.cleanup();
    this.cleanupListeners();
  }
}

export const webrtcService = new WebRTCService();
