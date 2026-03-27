/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load ALL env vars from .env (the empty string '' means no prefix filter)
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Legacy Gemini key (kept so existing code doesn't break)
      'process.env.API_KEY': JSON.stringify(env.API_KEY),

      // ✅ Azure OpenAI — these are now injected into the browser bundle at build time
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
    },
  };
});
