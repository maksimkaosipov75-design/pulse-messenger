import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show: (message, type = 'error', durationMs = 5000) => {
    const id = nextId++;
    set((state) => {
      // Collapse duplicates so a retry loop doesn't stack identical toasts
      if (state.toasts.some((t) => t.message === message && t.type === type)) {
        return state;
      }
      return { toasts: [...state.toasts, { id, type, message }] };
    });
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience for non-React modules (stores, services) */
export const toast = {
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
};
