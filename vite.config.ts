import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { MANIFEST, SHELL_IGNORED_PARAMS } from './src/pwa/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app: manifest + a service worker that precaches every build.
    // New versions wait for the page to apply them (see src/pwa/updates.ts).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: MANIFEST,
      // The manifest request carries the session cookie (Vercel preview protection).
      useCredentials: true,
      // Every static file is already in the precache glob.
      includeManifestIcons: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Launch images are read by iOS when the app is added, never by the page.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        ignoreURLParametersMatching: SHELL_IGNORED_PARAMS,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
