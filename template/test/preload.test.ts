import { afterEach, describe, expect, it, vi } from 'vitest';
import { IPC, type AppytronApi } from '@shared/ipc';

// AF3 (audit S1): the preload exposes one API on window.appytron. With contextIsolation on it goes
// through contextBridge; with it off it falls back to Reflect.set on the shared global. Both are run here.
const exposeInMainWorld = vi.fn();
const invoke = vi.fn();

vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke } }));

function setIsolated(value: boolean | undefined): void {
  Object.defineProperty(process, 'contextIsolated', { value, configurable: true });
}

async function loadPreload(): Promise<void> {
  vi.resetModules();
  await import('@preload/index');
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'appytron');
  Reflect.deleteProperty(process, 'contextIsolated');
  exposeInMainWorld.mockReset();
  invoke.mockReset();
});

describe('preload exposes the typed API', () => {
  it('without context isolation, puts it on the global as window.appytron', async () => {
    setIsolated(false);
    await loadPreload();

    const api: unknown = Reflect.get(globalThis, 'appytron');

    expect(api).toEqual({
      getAppInfo: expect.any(Function),
      ping: expect.any(Function),
      counter: { get: expect.any(Function), increment: expect.any(Function) },
    });
    expect(exposeInMainWorld).not.toHaveBeenCalled();
  });

  it('with context isolation, goes through contextBridge and leaves the global alone', async () => {
    setIsolated(true);
    await loadPreload();

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith('appytron', expect.any(Object));
    expect(Reflect.get(globalThis, 'appytron')).toBeUndefined();
  });

  it('wires each method to its IPC channel', async () => {
    setIsolated(false);
    await loadPreload();

    const api: AppytronApi = Reflect.get(globalThis, 'appytron');

    await api.ping('hi');
    expect(invoke).toHaveBeenCalledWith(IPC.ping, 'hi');
    await api.counter.increment();
    expect(invoke).toHaveBeenCalledWith(IPC.counterIncrement);
  });
});
