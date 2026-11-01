import { ipcMain } from 'electron';
import { z } from '@appydave/core';

/** A handler whose payload is Zod-validated first: `handle` receives the parsed, typed value. */
export interface ValidatedHandlerDef<In, Out> {
  /** Channel name (from `@shared/ipc`'s `IPC` map). */
  channel: string;
  input: z.ZodType<In>;
  handle: (input: In) => Promise<Out> | Out;
}

/** A handler with no schema: the payload is untrusted, so `handle` receives `unknown` and must check it. */
export interface UnvalidatedHandlerDef<Out> {
  channel: string;
  input?: undefined;
  handle: (input: unknown) => Promise<Out> | Out;
}

/**
 * IpcRouter — the single, validated door between renderer and main.
 *
 * Every channel is registered here, and every payload is Zod-validated before
 * its handler runs. Renderer input is untrusted (docs §9 — Electron is a
 * lethal-trifecta surface), so validation-at-the-boundary is not optional.
 */
export class IpcRouter {
  private channels: string[] = [];

  /** Validated: `handle` gets the parsed `In`. */
  register<In, Out>(def: ValidatedHandlerDef<In, Out>): this;
  /** No schema: `handle` gets `unknown`. The first type argument is accepted for old call sites and unused. */
  register<_In, Out>(def: UnvalidatedHandlerDef<Out>): this;
  register<In, Out>(def: ValidatedHandlerDef<In, Out> | UnvalidatedHandlerDef<Out>): this {
    this.channels.push(def.channel);
    ipcMain.handle(def.channel, async (_event, raw: unknown) => {
      return def.input ? def.handle(def.input.parse(raw)) : def.handle(raw);
    });

    return this;
  }

  /** Remove all registered handlers (called on lifecycle stop). */
  dispose(): void {
    for (const channel of this.channels) {
      ipcMain.removeHandler(channel);
    }

    this.channels = [];
  }
}
