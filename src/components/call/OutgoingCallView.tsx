import { useCallStore } from '@/stores/callStore';
import { PhoneOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function OutgoingCallView() {
  const { t } = useTranslation();
  const { callState, callInfo, endCall } = useCallStore();

  if (callState !== 'outgoing-ringing' || !callInfo) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-elev rounded-em-lg p-8 text-center w-80 shadow-2xl border">
        <div className="w-20 h-20 rounded-full bg-violet-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-white">
            {callInfo.peerName[0]?.toUpperCase() || '?'}
          </span>
        </div>

        <h3 className="text-xl font-semibold text-white mb-1">{callInfo.peerName}</h3>
        <p className="text-sm text-ink-faint mb-8">{t('call.calling')}</p>

        {/* Animated ringing indicator */}
        <div className="flex justify-center gap-1 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        <button
          onClick={() => endCall()}
          className="w-16 h-16 rounded-full bg-danger hover:brightness-110 flex items-center justify-center transition-colors mx-auto shadow-lg shadow-red-500/30"
        >
          <PhoneOff size={28} className="text-white" />
        </button>
      </div>
    </div>
  );
}
