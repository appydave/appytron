import { describe, expectTypeOf, it } from 'vitest';
import type { Console, CreateConsoleOptions } from '@main/create-console';
import type { ManagedProcess } from '@main/process-supervisor';

// G16 item C: ConsoleContext, ProcessStatus and LogChunk are not exported (Knip would flag an unused
// export, and a re-export is forbidden). A consumer names each one from the exported type that uses it.
// This file is checked by `npm run typecheck:tests`: a type that stops being derivable fails there.
type Context = Parameters<CreateConsoleOptions['onReady']>[0];
type Status = ManagedProcess['status'];
type Chunk = Parameters<Parameters<ManagedProcess['onLog']>[0]>[0];

describe('the types a public signature uses can be named without an export', () => {
  it('ConsoleContext: the argument of onReady, and the base of Console', () => {
    expectTypeOf<Context>().toHaveProperty('processes');
    expectTypeOf<Console>().toExtend<Context>();
  });

  it('ProcessStatus: the status of a managed process', () => {
    expectTypeOf<Status>().toEqualTypeOf<'running' | 'exited' | 'error'>();
  });

  it('LogChunk: the argument of an onLog callback', () => {
    expectTypeOf<Chunk>().toEqualTypeOf<{ stream: 'stdout' | 'stderr'; data: string }>();
  });
});
