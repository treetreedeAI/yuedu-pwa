import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative assets work locally, on a project Pages URL, and on a custom domain.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: '粵讀 Cantonese Reader',
        short_name: '粵讀',
        description: '在裝置上閱讀附有香港粵拼的 PDF。',
        lang: 'zh-HK',
        start_url: './#/',
        scope: './',
        display: 'standalone',
        background_color: '#F8F7F4',
        theme_color: '#F8F7F4',
        orientation: 'any',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: [
          '**/*.{js,mjs,css,html,ico,svg}',
          'icons/apple-touch-icon.png'
        ],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    target: 'es2022'
  },
  server: {
    host: '0.0.0.0'
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  }
});
