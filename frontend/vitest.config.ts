import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    css: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/**', 'node_modules/**'],
  },
});
