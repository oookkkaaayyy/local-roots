import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __STUDIO_BUILD__: JSON.stringify(String(Date.now())) },
  build: { sourcemap: true, target: 'es2018', cssTarget: 'safari12' },
});
