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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {status === 'online' ? (
            <Wifi size={18} className="text-green-500" />
          ) : status === 'starting' ? (
            <Loader2 size={18} className="text-yellow-500 animate-spin" />
          ) : (
            <WifiOff size={18} className="text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {status === 'online'
              ? t('status.online', { count: peerCount })
              : status === 'starting'
              ? t('status.starting')
              : t('status.offline')}
          </span>
        </div>

        <button
          onClick={status === 'online' ? stopNetwork : startNetwork}
          className={`px-3 py-1 text-xs rounded-lg transition-colors ${
            status === 'online'
              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
          }`}
        >
          {status === 'online' ? t('status.stop') : t('status.connect')}
        </button>
      </div>

      {localPeerId && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('status.peerId')}</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-1 truncate">
              {localPeerId}
            </code>
            <button
              onClick={handleCopyPeerId}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t('status.copyPeerId')}
            >
              {copied ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <Copy size={14} className="text-gray-400" />
              )}
            </button>
          </div>
        </div>
      )}

      {listenAddress && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Listen</p>
          <code className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded block truncate">
            {listenAddress}
          </code>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mb-3">{error}</p>
      )}

      {status === 'online' && (
        <div>
          <button
            onClick={() => setShowConnect(!showConnect)}
            className="text-xs text-pulse-500 hover:text-pulse-600 transition-colors"
          >
            {t('status.connectToPeer')}
          </button>

          {showConnect && (
            <div className="mt-2 flex gap-2">
              <input
                value={connectAddr}
                onChange={(e) => setConnectAddr(e.target.value)}
                placeholder={t('status.addressPlaceholder')}
                className="flex-1 text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-pulse-500"
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <button
                onClick={handleConnect}
                className="px-3 py-1.5 text-xs bg-pulse-500 text-white rounded-lg hover:bg-pulse-600 transition-colors"
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
