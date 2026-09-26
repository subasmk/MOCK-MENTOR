import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    /**
     * Dev proxy — forwards /api/* to a local Vercel dev server or any
     * Node listener on port 3001.
     *
     * To test the serverless function locally, run:
     *   npx vercel dev          (starts on port 3000 — change target below)
     * Or run the Vite dev server normally; requests to /api/interview will
     * 404 until you wire up a local function runner.
     *
     * The proxy is only active during `npm run dev`; in production Vercel
     * routes /api/* directly to the serverless functions.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
