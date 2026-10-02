import type { ManifestOptions } from 'vite-plugin-pwa'

/**
 * ELYUM as an installable app (home screen, standalone). Shared by the
 * build (vite.config.ts) and the tests; nothing here runs in the page.
 */

/** What the app paints before its atmosphere arrives (`--color-soft`): the launch ground. */
export const PEARL = '#F7F9FC'
/** Deep Ink (`--color-deep`). */
export const DEEP_INK = '#081A32'

export const MANIFEST: Partial<ManifestOptions> = {
  id: '/',
  name: 'ELYUM',
  short_name: 'ELYUM',
  description: 'Sistema operativo personal — Hoy · Semana · Focus',
  lang: 'es',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: PEARL,
  theme_color: DEEP_INK,
  icons: [
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

/**
 * The app is one shell whatever its URL: `?date=`, `?t=`, `?entry=` and
 * `?section=` are read by the page, never a different version of it. The
 * service worker ignores every query parameter when it looks up the shell.
 */
export const SHELL_IGNORED_PARAMS: RegExp[] = [/.*/]

/** iPhone screens (points × scale) that get a Pearl launch image, portrait. */
export const LAUNCH_SCREENS: [width: number, height: number, scale: number][] = [
  [320, 568, 2], // SE (1st)
  [375, 667, 2], // 6 · 7 · 8 · SE (2nd, 3rd)
  [414, 736, 3], // 6 · 7 · 8 Plus
  [375, 812, 3], // X · XS · 11 Pro · 12 mini · 13 mini
  [414, 896, 2], // XR · 11
  [414, 896, 3], // XS Max · 11 Pro Max
  [390, 844, 3], // 12 · 13 · 14 (and Pro)
  [428, 926, 3], // 12 · 13 Pro Max · 14 Plus
  [393, 852, 3], // 14 Pro · 15 · 15 Pro · 16
  [430, 932, 3], // 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
  [402, 874, 3], // 16 Pro · 17 · 17 Pro
  [440, 956, 3], // 16 Pro Max · 17 Pro Max
  [420, 912, 3], // Air
]
