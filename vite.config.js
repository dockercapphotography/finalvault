import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'FinalVault',
        short_name: 'FinalVault',
        description: 'Beautiful client gallery delivery for photographers.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
      },
      // Registration is already handled manually in index.html
      // (navigator.serviceWorker.register('/sw.js')) -- disable the
      // plugin's own auto-injected registration script so we don't
      // register the worker twice.
      injectRegister: null,
      // Was false under generateSW (the plugin did nothing in dev, so
      // public/sw.js was served as-is). Now true so dev runs the real
      // injectManifest-built worker -- needed to test push locally,
      // and closes the dev/prod behavior gap that existed before.
      devOptions: { enabled: true, type: 'module' }
    })
  ],
  define: {
    // Frozen at build time (this runs in Node during `vite build`/`vite
    // dev`, not in the browser) -- see PageWrapper.jsx for why this
    // matters. Textually replaced wherever __BUILD_DATE__ appears in
    // source, so it's a build-time constant, not a runtime lookup.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: { host: true }
})
