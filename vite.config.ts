import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks to the API and the game socket on the same origin, so nothing needs CORS in development.
export default defineConfig({
  plugins: [react()],
  define: { global: 'globalThis' }, // a few Solana packages still refer to Node's `global`
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
