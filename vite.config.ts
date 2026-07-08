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
      build: {
        // PERF: older TV browsers parse smaller/simpler output faster.
        target: 'es2017',
        // esbuild minification (default) — fast and aggressive tree-shaking.
        minify: 'esbuild',
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks: {
              // Long-cached vendor chunk: framework code changes rarely, so
              // TVs keep it cached across app updates.
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            },
          },
        },
        chunkSizeWarningLimit: 1500,
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // FIX: `__dirname` is not available in Vite's ES module context. 
          // Replaced with `'.'` which resolves to the current working directory (project root).
          '@': path.resolve('.'),
        }
      }
    };
});
