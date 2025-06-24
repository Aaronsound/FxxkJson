// src/hooks/useNotifier.ts
import toast, { ToastOptions } from 'react-hot-toast';

export const useNotifier = () => {
  const success = (msg: string, opts?: ToastOptions) => toast.success(msg, opts);
  const error   = (msg: string, opts?: ToastOptions) => toast.error(msg, opts);
  const info    = (msg: string, opts?: ToastOptions) => toast(msg, opts);
  return { success, error, info };
};
