import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const base = process.env.GITHUB_ACTIONS ? '/tile-creator/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
