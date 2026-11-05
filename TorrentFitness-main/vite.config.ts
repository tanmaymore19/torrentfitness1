import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      sourcemap: false,
      // Minify with esbuild (fast, default for Vite 5+)
      minify: 'esbuild',
      // Raise chunk size warning threshold to 1MB (many large pages)
      chunkSizeWarningLimit: 1024,
      rollupOptions: {
        output: {
          // Split vendor / framework chunks so browsers can cache them separately
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react/') || id.includes('react-dom/')) {
                return 'vendor-react';
              }
              if (id.includes('firebase/')) {
                return 'vendor-firebase';
              }
              if (id.includes('motion/')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide-react/')) {
                return 'vendor-lucide';
              }
              if (id.includes('jspdf') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('qrcode') || id.includes('html5-qrcode')) {
                return 'vendor-qr';
              }
            }
          },
          // Content-hashed filenames for long-term asset caching
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        }
      }
    },
    define: {
      // Prevents runtime crashes on Cloudflare Pages / Edge runtime if third-party modules reference process.env
      'process.env': {},
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
