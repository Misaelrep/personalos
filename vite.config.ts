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
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Launch images are read by iOS when the app is added, never by the page.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        ignoreURLParametersMatching: SHELL_IGNORED_PARAMS,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // P4 · Página de prueba de PROYECTOS (proyectos.html): solo en las vistas previas de Vercel, nunca en
  // producción (comparte almacén con la sección PROYECTOS y ofrece dossiers sintéticos). En local, `vite`
  // la sirve igualmente. Si Vercel no indica el entorno, se excluye.
  // E1 · demo-e1.html: seis proyectos INVENTADOS en memoria, sin almacenamiento. También solo en vistas previas.
  // Prototipo · prototipo-90.html: plan de 90 días con los mismos proyectos inventados, IA simulada, sin almacenamiento. Solo vistas previas.
  build: {
    rollupOptions: {
      input: process.env.VERCEL_ENV === 'preview' ? { main: 'index.html', proyectos: 'proyectos.html', demo: 'demo-e1.html', prototipo: 'prototipo-90.html' } : undefined,
    },
  },
})
