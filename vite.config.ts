import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Strip console.log/warn/error in production builds
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
        },
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor':    ['react', 'react-dom', 'react-router-dom'],
              'supabase-vendor': ['@supabase/supabase-js'],
              'markdown-vendor': ['react-markdown', 'remark-gfm'],
              'pdf-assets':      ['./services/constants', './services/phoneIconBase64'],
              'pdf-engine':      ['jspdf', 'jspdf-autotable'],
              'charts':          ['recharts'],
            }
          }
        }
      }
    };
});
