import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'win';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push(text: string, kind?: ToastKind, ms?: number): void;
  dismiss(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(text, kind = 'info', ms = 3800) {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  info: (t: string) => useToasts.getState().push(t, 'info'),
  success: (t: string) => useToasts.getState().push(t, 'success'),
  error: (t: string) => useToasts.getState().push(t, 'error', 5000),
  win: (t: string) => useToasts.getState().push(t, 'win', 4500),
};
