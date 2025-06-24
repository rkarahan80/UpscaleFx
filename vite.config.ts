import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // COOP/COEP headers were for ffmpeg.wasm's SharedArrayBuffer.
    // We can remove them if no other part of the application needs them.
    // For now, let's comment them out or remove if certain they're not needed.
    // headers: {
    //   'Cross-Origin-Opener-Policy': 'same-origin',
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    // },
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // Your Python backend address
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // optimizeDeps.exclude for ffmpeg/wasm is no longer needed.
  // optimizeDeps: {
  //   exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  // }
});
