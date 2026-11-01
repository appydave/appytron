import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@preload': resolve('src/preload'),
      '@lint': resolve('lint'),
      '@root': resolve('.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    include: ['test/**/*.test.ts'],
  },
});
