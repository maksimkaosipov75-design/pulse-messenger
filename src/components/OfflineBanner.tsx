import { useNetworkStore } from '@/stores/networkStore';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';

/** Slim banner shown while the P2P network is down */
export function OfflineBanner() {
  const { t } = useTranslation();
  const { status, startNetwork } = useNetworkStore();

  if (status !== 'offline') return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 text-white text-sm px-4 py-1.5 safe-area-top">
      <WifiOff size={16} />
      <span>{t('status.offlineBanner')}</span>
      <button onClick={startNetwork} className="underline font-medium hover:opacity-80">
        {t('status.reconnect')}
      </button>
    </div>
  );
}
