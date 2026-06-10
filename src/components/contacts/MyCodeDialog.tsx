import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';
import { X, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNetworkStore } from '@/stores/networkStore';
import { formatError } from '@/services/api';

/** Shows the user's own "pulse code" as a QR plus a copyable string */
export function MyCodeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { listenAddress, status } = useNetworkStore();
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await invoke<string>('get_my_contact_code', {
          listenAddr: listenAddress ?? null,
        });
        setCode(c);
        setQrDataUrl(await QRCode.toDataURL(c, { width: 280, margin: 1 }));
      } catch (e) {
        setError(formatError(e));
      }
    })();
  }, [listenAddress]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('contacts.myCode')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <>
            {qrDataUrl && (
              <div className="flex justify-center mb-4 bg-white rounded-xl p-3">
                <img src={qrDataUrl} alt="QR" className="w-full max-w-[280px]" />
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {status !== 'online' ? t('contacts.myCodeOffline') : t('contacts.myCodeHint')}
            </p>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-pulse-500 text-white rounded-xl hover:bg-pulse-600 transition-colors text-sm font-medium"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t('contacts.copied') : t('contacts.copyCode')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
