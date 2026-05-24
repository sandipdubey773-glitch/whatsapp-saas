import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
  },
  server: {
    host: true,
    proxy: {
      '/admin': 'http://localhost:3000',
      '/client': 'http://localhost:3000',
      '/booking': 'http://localhost:3000',
    },
  },
});
