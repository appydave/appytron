import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppInfo, type AppytronApi } from '../shared/ipc';

const api: AppytronApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
  ping: (message: string): Promise<string> => ipcRenderer.invoke(IPC.ping, message),
  counter: {
    get: (): Promise<number> => ipcRenderer.invoke(IPC.counterGet),
    increment: (): Promise<number> => ipcRenderer.invoke(IPC.counterIncrement),
  },
};

// The ONLY door: expose a minimal, typed API on window.appytron.
// contextIsolation is on, so the renderer never sees Node or ipcRenderer directly.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('appytron', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // Fallback for the (non-default) case where contextIsolation is off.
  (globalThis as unknown as { window: { appytron: AppytronApi } }).window.appytron = api;
}
