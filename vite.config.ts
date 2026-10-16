import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    // The Firebase SDK chunk alone is ~560 kB (~165 kB gzipped).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Firebase changes rarely; a separate chunk keeps it cached across app updates.
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] },
      },
    },
  },
  preview: {
    proxy: { '/api': 'http://localhost:8787' },
  },
});
