import { create } from 'zustand';
import type { AppInfo } from '@shared/ipc';

interface AppState {
  info: AppInfo | null;
  pong: string | null;
  loadInfo: () => Promise<void>;
  sendPing: (message: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  info: null,
  pong: null,
  loadInfo: async () => {
    const info = await window.appytron.getAppInfo();
    set({ info });
  },
  sendPing: async (message: string) => {
    const pong = await window.appytron.ping(message);
    set({ pong });
  },
}));
