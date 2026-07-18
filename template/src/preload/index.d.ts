import type { AppytronApi } from '../shared/ipc';

declare global {
  interface Window {
    appytron: AppytronApi;
  }
}
