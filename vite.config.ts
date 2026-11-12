import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is the sub-path the app is served from on GitHub Pages, e.g. "/boh-companion/".
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  // stamped on the data requests so that a new deploy is never paired with data files the browser cached earlier
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  server: { host: '127.0.0.1', port: 5173 },
});
