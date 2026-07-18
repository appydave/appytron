/**
 * The typed IPC contract — the single source of truth for every channel that
 * crosses the renderer↔main boundary. Both preload (implements) and renderer
 * (consumes) import from here, so the surface stays in one place.
 */

export const IPC = {
  appInfo: 'app:info',
  ping: 'app:ping',
  counterGet: 'counter:get',
  counterIncrement: 'counter:increment',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: NodeJS.Platform;
}

/** The API exposed to the renderer on `window.appytron`. */
export interface AppytronApi {
  getAppInfo(): Promise<AppInfo>;
  ping(message: string): Promise<string>;
  /** Persistent counter — proves @appydave/core Store survives restarts. */
  counter: {
    get(): Promise<number>;
    increment(): Promise<number>;
  };
}
