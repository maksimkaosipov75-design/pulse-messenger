import { useEffect } from 'react';
import { useCallStore } from '@/stores/callStore';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { startRinging, stopRinging } from '@/services/sounds';

export function IncomingCallDialog() {
  const { t } = useTranslation();
  const { callState, callInfo, acceptCall, rejectCall } = useCallStore();
  const ringing = callState === 'incoming-ringing' && !!callInfo;

  useEffect(() => {
    if (!ringing) return;
    startRinging();
    return stopRinging;
  }, [ringing]);

  if (!ringing || !callInfo) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-elev rounded-em-lg p-8 text-center w-80 shadow-2xl border">
        {/* Caller avatar */}
        <div className="w-20 h-20 rounded-full bg-violet-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-white">
            {callInfo.peerName[0]?.toUpperCase() || '?'}
          </span>
        </div>

        <h3 className="text-xl font-semibold text-white mb-1">{callInfo.peerName}</h3>
        <p className="text-sm text-ink-faint mb-8">
          {callInfo.callType === 'video' ? t('call.incomingVideo') : t('call.incomingAudio')}
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={rejectCall}
            className="w-16 h-16 rounded-full bg-danger hover:brightness-110 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
          >
            <PhoneOff size={28} className="text-white" />
          </button>
          <button
            onClick={acceptCall}
            className="w-16 h-16 rounded-full bg-online hover:bg-green-600 flex items-center justify-center transition-colors shadow-lg shadow-green-500/30"
          >
            {callInfo.callType === 'video' ? (
              <Video size={28} className="text-white" />
            ) : (
              <Phone size={28} className="text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
