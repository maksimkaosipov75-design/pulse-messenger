import { useToastStore, Toast } from '@/stores/toastStore';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const styles: Record<Toast['type'], string> = {
  error: 'bg-danger text-white',
  success: 'bg-online text-white',
  info: 'bg-surface-2 text-ink',
};

const icons: Record<Toast['type'], typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export function Toasts() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm safe-area-top">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-em-md shadow-lg ${styles[toast.type]}`}
            role="alert"
          >
            <Icon size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1 break-words">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
