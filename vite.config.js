import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    /**
     * Keep face-api.js (and its heavy TensorFlow.js deps) in its own chunk.
     * Without this Rollup tries to transform the whole ~5 MB library in a
     * single pass and exhausts the default Node.js heap.
     */
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('face-api.js') || id.includes('@tensorflow')) {
            return 'face-api';
          }
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },

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
