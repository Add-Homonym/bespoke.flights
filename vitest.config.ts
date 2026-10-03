import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // First query in each file boots PGlite (a few seconds).
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
