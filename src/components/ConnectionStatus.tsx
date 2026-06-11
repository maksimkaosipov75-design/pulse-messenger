import { useNetworkStore } from '@/stores/networkStore';
import { Wifi, WifiOff, Loader2, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function ConnectionStatus() {
  const { t } = useTranslation();
  const { status, peerCount, localPeerId, listenAddress, error, startNetwork, stopNetwork, connectPeer } =
    useNetworkStore();
  const [showConnect, setShowConnect] = useState(false);
  const [connectAddr, setConnectAddr] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyPeerId = () => {
    if (localPeerId) {
      navigator.clipboard.writeText(localPeerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnect = async () => {
    if (connectAddr.trim()) {
      await connectPeer(connectAddr.trim());
      setConnectAddr('');
      setShowConnect(false);
    }
  };

  return (
    <div className="bg-elev rounded-em-md p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {status === 'online' ? (
            <Wifi size={18} className="text-online" />
          ) : status === 'starting' ? (
            <Loader2 size={18} className="text-warn animate-spin" />
          ) : (
            <WifiOff size={18} className="text-ink-faint" />
          )}
          <span className="text-sm font-medium text-ink">
            {status === 'online'
              ? t('status.online', { count: peerCount })
              : status === 'starting'
              ? t('status.starting')
              : t('status.offline')}
          </span>
        </div>

        <button
          onClick={status === 'online' ? stopNetwork : startNetwork}
          className={`px-3 py-1 text-xs rounded-em-sm transition-colors ${
            status === 'online'
              ? 'bg-danger-soft text-danger hover:brightness-110'
              : 'bg-accent-soft text-accent hover:brightness-110'
          }`}
        >
          {status === 'online' ? t('status.stop') : t('status.connect')}
        </button>
      </div>

      {localPeerId && (
        <div className="mb-3">
          <p className="text-xs text-ink-dim mb-1">{t('status.peerId')}</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-ink-dim bg-surface px-2 py-1 rounded flex-1 truncate">
              {localPeerId}
            </code>
            <button
              onClick={handleCopyPeerId}
              className="p-1.5 rounded hover:bg-surface transition-colors"
              title={t('status.copyPeerId')}
            >
              {copied ? (
                <Check size={14} className="text-online" />
              ) : (
                <Copy size={14} className="text-ink-faint" />
              )}
            </button>
          </div>
        </div>
      )}

      {listenAddress && (
        <div className="mb-3">
          <p className="text-xs text-ink-dim mb-1">Listen</p>
          <code className="text-xs text-ink-dim bg-surface px-2 py-1 rounded block truncate">
            {listenAddress}
          </code>
        </div>
      )}

      {error && (
        <p className="text-xs text-danger mb-3">{error}</p>
      )}

      {status === 'online' && (
        <div>
          <button
            onClick={() => setShowConnect(!showConnect)}
            className="text-xs text-accent hover:text-accent transition-colors"
          >
            {t('status.connectToPeer')}
          </button>

          {showConnect && (
            <div className="mt-2 flex gap-2">
              <input
                value={connectAddr}
                onChange={(e) => setConnectAddr(e.target.value)}
                placeholder={t('status.addressPlaceholder')}
                className="flex-1 text-xs px-2 py-1.5 bg-surface border rounded-em-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <button
                onClick={handleConnect}
                className="px-3 py-1.5 text-xs bg-accent text-accent-ink rounded-em-sm hover:brightness-110 transition-colors"
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
