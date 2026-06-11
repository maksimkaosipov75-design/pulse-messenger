import { useNetworkStore } from '@/stores/networkStore';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

function MonoField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <p className="text-[11.5px] text-ink-faint mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11.5px] font-mono text-ink-dim bg-surface px-2.5 py-1.5 rounded-em-sm truncate">
          {value}
        </code>
        <button
          onClick={copy}
          className="p-1.5 rounded-em-sm hover:bg-surface transition-colors flex-shrink-0"
        >
          {copied ? (
            <Check size={14} className="text-online" />
          ) : (
            <Copy size={14} className="text-ink-faint" />
          )}
        </button>
      </div>
    </div>
  );
}

export function ConnectionStatus() {
  const { t } = useTranslation();
  const { status, peerCount, localPeerId, listenAddress, error, startNetwork, stopNetwork, connectPeer } =
    useNetworkStore();
  const [connectAddr, setConnectAddr] = useState('');

  const handleConnect = async () => {
    if (connectAddr.trim()) {
      await connectPeer(connectAddr.trim());
      setConnectAddr('');
    }
  };

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-x-5 gap-y-2.5">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-[13.5px] text-ink-dim">{t('status.statusLabel')}</span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface text-[11px] font-semibold">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === 'online' ? 'bg-online' : status === 'starting' ? 'bg-warn' : 'bg-ink-faint'
                }`}
              />
              {status === 'online'
                ? t('status.onlineChip', { count: peerCount })
                : status === 'starting'
                ? t('status.starting')
                : t('status.offline')}
            </span>
          </div>
          {localPeerId && <MonoField label={t('status.peerId')} value={localPeerId} />}
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-[13.5px] text-ink-dim">{t('status.discovery')}</span>
            <span className="text-[12.5px] font-bold text-ink-dim">mDNS · {t('status.lan')}</span>
          </div>
          {listenAddress && <MonoField label={t('status.listenAddr')} value={listenAddress} />}
        </div>
      </div>

      {error && <p className="text-xs text-danger mt-3">{error}</p>}

      <div className="flex flex-col md:flex-row md:items-center gap-2 mt-4">
        <input
          value={connectAddr}
          onChange={(e) => setConnectAddr(e.target.value)}
          placeholder={t('status.addressPlaceholder')}
          className="w-full md:flex-1 min-w-0 text-[12px] font-mono px-3 py-2 bg-surface rounded-em-sm placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
        />
        <button
          onClick={handleConnect}
          disabled={!connectAddr.trim()}
          className="px-3.5 py-2 text-[12.5px] font-bold bg-surface rounded-em-sm hover:bg-surface-2 disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {t('status.connectToPeer')}
        </button>
        <button
          onClick={status === 'online' ? stopNetwork : startNetwork}
          className={`px-3.5 py-2 text-[12.5px] font-bold rounded-em-sm transition ${
            status === 'online'
              ? 'bg-danger-soft text-danger hover:brightness-110'
              : 'bg-accent-soft text-accent hover:brightness-110'
          }`}
        >
          {status === 'online' ? t('status.stop') : t('status.connect')}
        </button>
      </div>
    </div>
  );
}
