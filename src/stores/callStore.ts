import { create } from 'zustand';
import { UnlistenFn } from '@tauri-apps/api/event';
import { webrtcService, CallInfo, CallState, CallType } from '@/services/webrtc';

interface CallStoreState {
  callState: CallState;
  callInfo: CallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callDuration: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  callListeners: UnlistenFn[] | null;
  durationTimer: ReturnType<typeof setInterval> | null;

  startCall: (chatId: string, peerId: string, peerName: string, callType: CallType, callerId: string, callerName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  setupCallListeners: () => Promise<void>;
  cleanupCallListeners: () => void;
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  callState: 'idle',
  callInfo: null,
  localStream: null,
  remoteStream: null,
  callDuration: 0,
  isMuted: false,
  isVideoOff: false,
  isSpeakerOn: true,
  callListeners: null,
  durationTimer: null,

  startCall: async (chatId, peerId, peerName, callType, callerId, callerName) => {
    try {
      await webrtcService.startCall(chatId, peerId, peerName, callType, callerId, callerName);
    } catch (e) {
      console.error('Failed to start call:', e);
      set({ callState: 'idle', callInfo: null });
    }
  },

  acceptCall: async () => {
    try {
      await webrtcService.acceptCall();
    } catch (e) {
      console.error('Failed to accept call:', e);
      set({ callState: 'idle', callInfo: null });
    }
  },

  rejectCall: async () => {
    await webrtcService.rejectCall();
    set({ callState: 'idle', callInfo: null });
  },

  endCall: async () => {
    await webrtcService.endCall();
    const { durationTimer } = get();
    if (durationTimer) clearInterval(durationTimer);
    set({ callState: 'idle', callInfo: null, callDuration: 0, durationTimer: null });
  },

  toggleMute: () => {
    const muted = webrtcService.toggleMuteAudio();
    set({ isMuted: muted });
  },

  toggleVideo: () => {
    const off = webrtcService.toggleMuteVideo();
    set({ isVideoOff: off });
  },

  toggleSpeaker: () => {
    set((s) => ({ isSpeakerOn: !s.isSpeakerOn }));
  },

  setupCallListeners: async () => {
    const { callListeners } = get();
    if (callListeners) return;

    const unlisteners: UnlistenFn[] = [];

    // WebRTC service events
    webrtcService.setEventCallback((event, data) => {
      const d = data as Record<string, unknown>;
      const state = get();

      switch (event) {
        case 'call-state': {
          const newState = d.state as CallState;
          const info = d.callInfo as CallInfo | null;
          set({ callState: newState, callInfo: info });

          // Start duration timer when connected
          if (newState === 'connected' && !state.durationTimer) {
            const timer = setInterval(() => {
              set((s) => ({ callDuration: s.callDuration + 1 }));
            }, 1000);
            set({ durationTimer: timer, callDuration: 0 });
          }
          break;
        }
        case 'local-stream': {
          set({ localStream: d.stream as MediaStream });
          break;
        }
        case 'remote-stream': {
          set({ remoteStream: d.stream as MediaStream });
          break;
        }
        case 'incoming-call': {
          set({ callState: 'incoming-ringing', callInfo: d.callInfo as CallInfo });
          break;
        }
        case 'call-ended':
        case 'call-rejected': {
          if (state.durationTimer) clearInterval(state.durationTimer);
          set({ callState: 'idle', callInfo: null, callDuration: 0, durationTimer: null, localStream: null, remoteStream: null });
          break;
        }
      }
    });

    await webrtcService.setupSignalingListeners();

    set({ callListeners: unlisteners });
  },

  cleanupCallListeners: () => {
    const { callListeners, durationTimer } = get();
    if (durationTimer) clearInterval(durationTimer);
    if (callListeners) {
      callListeners.forEach((u) => u());
    }
    webrtcService.destroy();
    set({ callListeners: null, durationTimer: null });
  },
}));
