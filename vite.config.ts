import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      // 'autoUpdate': registra o SW automaticamente e atualiza em background.
      // O usuário não precisa fazer nada — quando houver nova versão, ela é
      // baixada silenciosamente e aplicada no próximo reload.
      registerType: 'autoUpdate',

      // Inclui o SW no build de produção e no dev server (para testar)
      devOptions: {
        enabled: true,
        type: 'module',
      },

      // Arquivos que o Workbox deve pré-cachear (shell do app)
      includeAssets: [
        'favicon-16x16.png',
        'favicon-32x32.png',
        'icons/apple-touch-icon.png',
        'icons/*.png',
      ],

      // Web App Manifest — define como o app aparece instalado
      manifest: {
        name: 'QTecnico — Gestão de OS',
        short_name: 'QTecnico',
        description: 'Gestão de Ordens de Serviço para técnicos',
        theme_color: '#1A2B4E',
        background_color: '#1A2B4E',
        display: 'standalone',          // tela cheia, sem barra do browser
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          // Maskable: tem padding para o sistema recortar o ícone em diferentes formatos
          // (círculo no Android, quadrado arredondado etc.)
          {
            src: '/icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // Estratégia Workbox: cache-first para assets estáticos,
      // network-first para chamadas de API (nunca cacheia dados da API)
      workbox: {
        // Pré-cacheia o shell do app (JS/CSS/HTML gerados pelo Vite)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Rotas de API nunca devem ser cacheadas
        navigateFallbackDenylist: [/^\/api\//],

        runtimeCaching: [
          {
            // Fontes do Google (se houver)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imagens do storage (Backblaze B2) — cache por 1 hora
            // (coincide com o TTL das presigned URLs)
            urlPattern: /^https:\/\/.*backblazeb2\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'b2-images-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
