import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    // Component tests opt in to jsdom with a `@vitest-environment jsdom` docblock.
    include: ['src/**/*.test.{ts,tsx}'],
    // First query in each file boots PGlite (a few seconds).
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
