import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is the sub-path the app is served from on GitHub Pages, e.g. "/boh-companion/".
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
});
