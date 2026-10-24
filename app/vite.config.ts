import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createCartPreviewPlugin } from './cart-preview-plugin.mjs';

export default defineConfig({
  plugins: [react(), createCartPreviewPlugin()],
  build: { sourcemap: true },
});
