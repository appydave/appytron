import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from '@appydave/core';

type Handler = (event: unknown, raw: unknown) => Promise<unknown>;

const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}));

const { IpcRouter } = await import('@main/ipc-router');

function invoke(channel: string, raw: unknown): Promise<unknown> | undefined {
  return handlers.get(channel)?.({}, raw);
}

describe('IpcRouter', () => {
  beforeEach(() => handlers.clear());

  it('hands a validated handler the parsed value', async () => {
    new IpcRouter().register({
      channel: 'echo',
      input: z.string(),
      handle: (m) => m.toUpperCase(),
    });

    expect(await invoke('echo', 'hi')).toBe('HI');
  });

  it('rejects a payload that fails the schema, without running the handler', async () => {
    const handle = vi.fn();

    new IpcRouter().register({ channel: 'echo', input: z.string(), handle });

    await expect(invoke('echo', 42)).rejects.toThrow();
    expect(handle).not.toHaveBeenCalled();
  });

  it('hands an unvalidated handler the raw payload as unknown', async () => {
    const seen: unknown[] = [];

    new IpcRouter().register({ channel: 'raw', handle: (input) => seen.push(input) });

    await invoke('raw', { any: 'thing' });

    expect(seen).toEqual([{ any: 'thing' }]);
  });

  it('removes every handler on dispose', () => {
    const router = new IpcRouter();

    router.register({ channel: 'a', handle: () => 1 }).register({ channel: 'b', handle: () => 2 });
    router.dispose();

    expect(handlers.size).toBe(0);
  });

  it('forgets its channels on dispose, so a second dispose is a no-op', () => {
    const router = new IpcRouter();

    router.register({ channel: 'a', handle: () => 1 });
    router.dispose();

    // Another owner takes the channel after the first dispose; a second dispose must leave it alone.
    handlers.set('a', () => Promise.resolve('theirs'));
    router.dispose();

    expect(handlers.has('a')).toBe(true);
  });
});
