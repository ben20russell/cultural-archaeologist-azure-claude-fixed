/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.AZURE_OPENAI_API_KEY':        JSON.stringify(env.AZURE_OPENAI_API_KEY),
      'process.env.AZURE_OPENAI_ENDPOINT':       JSON.stringify(env.AZURE_OPENAI_ENDPOINT),
      'process.env.AZURE_OPENAI_API_VERSION':    JSON.stringify(env.AZURE_OPENAI_API_VERSION),
      'process.env.AZURE_OPENAI_DEPLOYMENT_NAME': JSON.stringify(env.AZURE_OPENAI_DEPLOYMENT_NAME),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined, // Let Vite/Rollup handle chunk splitting
        },
      },
      chunkSizeWarningLimit: 1200, // Increase chunk size warning limit (in KB)
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
    },
  };
});
