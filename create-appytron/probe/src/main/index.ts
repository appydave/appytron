import { app } from 'electron';
import { z } from '@appydave/core';
import { IPC, type AppInfo } from '@shared/ipc';
import { createConsole } from './create-console.js';

const desktop = createConsole({
  name: 'probe',

  registerIpc({ ipc }) {
    ipc.register<void, AppInfo>({
      channel: IPC.appInfo,
      handle: () => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
      }),
    });

    ipc.register<string, string>({
      channel: IPC.ping,
      input: z.string(),
      handle: (message) => `pong: ${message}`,
    });
  },

  onReady({ windows, logger }) {
    windows.create({ width: 1100, height: 760 });
    logger.info('window opened');
  },
});

void desktop.start();
