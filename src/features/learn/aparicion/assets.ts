/**
 * The frozen assets of ATARDECER, as the app serves them (public/learn/sunset/), and their preload.
 *
 *   a1     A1 v4, the light glass — runtime WebP q92 derived from the frozen PNG master (which never ships)
 *   a2     A2-A, the deep glass (q92)
 *   b      B R2, the finger
 *   c1     C1 v2, the warm leaks
 *   c2     C2 v2, the cold halos
 *   ahora  sunset-ahora (master v2, 20 % presence), AHORA's light glass
 *
 * The ritual's clock must not start before the glass can be painted: A1 has to be on screen before B comes in at
 * BEATS.contact (0.2 s). So the scene's images are fetched and decoded first; only then do the ritual and the scene start.
 */
export const SUNSET_ASSETS = {
  a1: '/learn/sunset/sunset-surface-light@2x.webp',
  a2: '/learn/sunset/sunset-surface-deep@2x.webp',
  b: '/learn/sunset/sunset-touch@2x.webp',
  c1: '/learn/sunset/sunset-prism-edge.webp',
  c2: '/learn/sunset/sunset-prism-ghost.webp',
  ahora: '/learn/sunset/sunset-ahora.webp',
} as const

/** What the scene paints from its first frame: all of it must be decoded before the clock starts. */
export const CRITICAL: readonly (keyof typeof SUNSET_ASSETS)[] = ['a1', 'a2', 'b', 'c1', 'c2']

/** Beyond this the scene does not wait: the ritual goes on without it (the classic ritual), never with a half-painted glass. */
export const PRELOAD_LIMIT_MS = 2500

export type Preload = 'loading' | 'ready' | 'failed'

/** Decoded images are kept here, so the browser keeps them decoded while the scene uses them. */
const held: HTMLImageElement[] = []
let pending: Promise<Preload> | null = null
let settled: Preload = 'loading'

function decode(src: string): Promise<void> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  held.push(img)
  return img.decode ? img.decode() : new Promise((resolve, reject) => ((img.onload = () => resolve()), (img.onerror = reject)))
}

/**
 * Fetches and decodes the critical assets once (later calls share the same answer): 'ready' when all of them can be painted,
 * 'failed' if one of them cannot be read or they take longer than PRELOAD_LIMIT_MS. sunset-ahora is fetched too, but not waited for:
 * it is needed at 6 s, not at 0.
 */
export function preloadSunset(limitMs = PRELOAD_LIMIT_MS): Promise<Preload> {
  if (pending) return pending
  void decode(SUNSET_ASSETS.ahora).catch(() => {})
  const all = Promise.all(CRITICAL.map((k) => decode(SUNSET_ASSETS[k]))).then(
    () => 'ready' as const,
    () => 'failed' as const,
  )
  const limit = new Promise<Preload>((resolve) => setTimeout(() => resolve('failed'), limitMs))
  pending = Promise.race([all, limit]).then((r) => (settled = r))
  return pending
}

/** The preload's answer so far, synchronously (a second entry the same session finds it ready). */
export const preloadState = (): Preload => settled

/** For tests: forget everything. */
export function resetPreload(): void {
  pending = null
  settled = 'loading'
  held.length = 0
}
