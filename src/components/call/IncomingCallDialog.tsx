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
        {/* Caller avatar with pulse rings */}
        <div className="flex justify-center mb-6 pt-3">
          <div className="em-rings w-24 h-24 rounded-full bg-surface-2 flex items-center justify-center">
            <span className="text-3xl font-extrabold text-ink">
              {callInfo.peerName[0]?.toUpperCase() || '?'}
            </span>
          </div>
        </div>

        <h3 className="text-xl font-bold text-ink mb-1">{callInfo.peerName}</h3>
        <p className="text-sm text-ink-faint mb-3">
          {callInfo.callType === 'video' ? t('call.incomingVideo') : t('call.incomingAudio')}
        </p>
        <div className="flex justify-center gap-1.5 mb-7">
          <span className="px-2 py-0.5 rounded-full bg-surface text-[10.5px] font-mono text-ink-faint">
            e2e
          </span>
          <span className="px-2 py-0.5 rounded-full bg-surface text-[10.5px] font-mono text-ink-faint">
            p2p · {t('call.direct')}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={rejectCall}
            className="w-16 h-16 rounded-full bg-danger hover:brightness-110 flex items-center justify-center transition-colors shadow-lg shadow-danger/30"
          >
            <PhoneOff size={28} className="text-white" />
          </button>
          <button
            onClick={acceptCall}
            className="w-16 h-16 rounded-full bg-online hover:brightness-110 flex items-center justify-center transition-colors shadow-lg"
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
