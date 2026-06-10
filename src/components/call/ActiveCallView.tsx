import { useEffect, useRef } from 'react';
import { useCallStore } from '@/stores/callStore';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function ActiveCallView() {
  const { t } = useTranslation();
  const {
    callState, callInfo, localStream, remoteStream,
    callDuration, isMuted, isVideoOff, isSpeakerOn,
    endCall, toggleMute, toggleVideo, toggleSpeaker,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (callInfo?.callType === 'video' && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callInfo?.callType]);

  if ((callState !== 'connected' && callState !== 'connecting') || !callInfo) return null;

  const isVideo = callInfo.callType === 'video';

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col z-50">
      {/* Remote video (full screen background) */}
      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Audio element for audio calls */}
      {!isVideo && (
        <audio ref={remoteAudioRef} autoPlay />
      )}

      {/* Header info */}
      <div className="relative z-10 flex flex-col items-center pt-16">
        {!isVideo && (
          <div className="w-24 h-24 rounded-full bg-violet-600 flex items-center justify-center mb-4">
            <span className="text-4xl font-bold text-white">
              {callInfo.peerName[0]?.toUpperCase() || '?'}
            </span>
          </div>
        )}
        <h2 className="text-xl font-semibold text-white mb-1">{callInfo.peerName}</h2>
        <p className="text-sm text-gray-400">
          {callState === 'connecting' ? t('call.connecting') : formatDuration(callDuration)}
        </p>
      </div>

      {/* Local video overlay (PiP) */}
      {isVideo && (
        <div className="absolute top-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg z-20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Controls */}
      <div className="relative z-10 pb-12">
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
            }`}
          >
            {isMuted ? <MicOff size={24} className="text-white" /> : <Mic size={24} className="text-white" />}
          </button>

          {isVideo && (
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isVideoOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
              }`}
            >
              {isVideoOff ? <VideoOff size={24} className="text-white" /> : <Video size={24} className="text-white" />}
            </button>
          )}

          <button
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isSpeakerOn ? 'bg-pulse-500' : 'bg-white/20 hover:bg-white/30'
            }`}
          >
            {isSpeakerOn ? <Volume2 size={24} className="text-white" /> : <VolumeX size={24} className="text-white" />}
          </button>

          <button
            onClick={() => endCall()}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
          >
            <PhoneOff size={24} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
