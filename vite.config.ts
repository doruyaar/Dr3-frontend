import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Dr3-frontend/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
