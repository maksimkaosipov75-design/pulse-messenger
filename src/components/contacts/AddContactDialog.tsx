import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useContactsStore } from '@/stores/contactsStore';
import { toast } from '@/stores/toastStore';
import { formatError } from '@/services/api';

/**
 * Add a contact from a pulse code: paste the string, or scan the
 * other device's QR with the camera (the main path on Android).
 */
export function AddContactDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { addContactByCode } = useContactsStore();
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  const stopScan = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => stopScan, []);

  const handleAdd = async (rawCode: string) => {
    if (!rawCode.trim() || busy) return;
    setBusy(true);
    try {
      const contact = await addContactByCode(rawCode.trim(), nickname.trim() || undefined);
      toast.success(
        t('contacts.added', { name: contact.user.displayName || contact.user.username })
      );
      onClose();
    } catch (e) {
      toast.error(formatError(e));
      setBusy(false);
    }
  };

  const startScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
      // Wait for the video element to mount
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const tick = () => {
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(img.data, img.width, img.height);
            if (qr?.data) {
              stopScan();
              handleAdd(qr.data);
              return;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch {
      toast.error(t('contacts.cameraUnavailable'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('contacts.addTitle')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {scanning ? (
          <div className="space-y-3">
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" muted playsInline />
            <button
              onClick={stopScan}
              className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {t('group.cancel')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('contacts.pasteCode')}
              rows={3}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-500 resize-none font-mono"
            />
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('contacts.nickname')}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-500"
            />
            <button
              onClick={() => handleAdd(code)}
              disabled={!code.trim() || busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-pulse-500 text-white rounded-xl hover:bg-pulse-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <UserPlus size={16} />
              {t('contacts.add')}
            </button>
            <button
              onClick={startScan}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              <Camera size={16} />
              {t('contacts.scanQr')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
