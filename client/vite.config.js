import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in dev, so the browser never needs a CORS preflight.
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
