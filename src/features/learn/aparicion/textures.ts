import type { SceneColors } from '../atmosphere/themes'
import type { RGB } from './color'
import type { Point, View } from './fragments'
import { lightWeb } from './facets'
import { fbm2, noise2 } from './noise'
import { horizonOf, makePixels, mix3 as mix, paletteOf, type Pixels, type TextureJob } from './pixels'

/**
 * What the scene draws on canvases, and how the soft textures (pixels.ts) get to them. The haze, the hand and
 * the sky are made by a worker — a few hundred milliseconds of noise that would otherwise sit in front of the
 * frames — and put on their canvases as they arrive; the information inside the glass and the wet of the surface
 * are drawn here, because they are quick.
 */

/** `rgba()` from an RGB triple, for a canvas. */
const rgb = (col: RGB, a: number) => `rgba(${Math.round(col[0])},${Math.round(col[1])},${Math.round(col[2])},${Math.round(a * 1000) / 1000})`

/** Puts finished pixels on a canvas, and says so (the page fades them in). */
export function paintPixels(canvas: HTMLCanvasElement, px: Pixels): void {
  canvas.width = px.w
  canvas.height = px.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.putImageData(new ImageData(px.data, px.w, px.h), 0, 0)
  canvas.dataset.ready = ''
}

interface Reply {
  id: number
  pixels: Pixels
}

/**
 * Makes textures in a worker, one after the other, and calls back with each. Where a worker cannot be had (no
 * support, or the page is not allowed one) — or it fails — the same pixels are made on this thread, one per timer:
 * slower to arrive and in the way of a frame, but never missing. Returns what cancels the rest.
 */
export function requestTextures(jobs: TextureJob[], onDone: (index: number, px: Pixels) => void): () => void {
  let cancelled = false
  let handle = 0
  const delivered = new Set<number>()
  const deliver = (index: number, px: Pixels) => {
    if (cancelled || delivered.has(index)) return
    delivered.add(index)
    onDone(index, px)
  }
  // The jobs not answered yet, done here, one per timer.
  const here = () => {
    const todo = jobs.map((_, i) => i).filter((i) => !delivered.has(i))
    const step = () => {
      const i = todo.shift()
      if (cancelled || i === undefined) return
      deliver(i, makePixels(jobs[i]))
      handle = window.setTimeout(step, 0)
    }
    handle = window.setTimeout(step, 0)
  }
  let worker: Worker | null = null
  try {
    worker = new Worker(new URL('./textures.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  if (!worker) {
    here()
  } else {
    worker.onmessage = (e: MessageEvent<Reply>) => {
      deliver(e.data.id, e.data.pixels)
      if (delivered.size === jobs.length) {
        worker?.terminate()
        worker = null
      }
    }
    worker.onerror = () => {
      worker?.terminate()
      worker = null
      here()
    }
    jobs.forEach((job, id) => worker?.postMessage({ id, job }))
  }
  return () => {
    cancelled = true
    worker?.terminate()
    window.clearTimeout(handle)
  }
}

const MATRIX_FONT = '"Inter Tight Variable", ui-sans-serif, system-ui, sans-serif'
/** What the glass holds: mostly rings (the o of conectar, comprender, recordar, explorar), and the letters around them. */
const MATRIX_GLYPHS = 'ooooooooccceeeraunpbmdt'

/**
 * Information inside the surface: a grid of small letters, thick in some places and bare in others,
 * brighter around the point of contact. Not text to read and not a rain — it does not fall; it is there, like a grain
 * that is made of words. Drawn once, at the screen's own resolution (up to 1.5×) so the letters stay sharp.
 */
export function paintMatrix(canvas: HTMLCanvasElement, scene: SceneColors, view: View, contact: Point): void {
  const dpr = Math.min(1, window.devicePixelRatio || 1)
  canvas.width = Math.round(view.w * dpr)
  canvas.height = Math.round(view.h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const pitchX = view.w < 360 ? 12 : 13.5
  const pitchY = 15.5
  const cols = Math.ceil(view.w / pitchX) + 1
  const rows = Math.ceil(view.h / pitchY) + 1
  const c = paletteOf(scene)
  for (let col = 0; col < cols; col++) {
    // Whole columns are thick or bare, like curtains of information.
    const weight = noise2(col * 0.55, 3.3, 77)
    for (let row = 0; row < rows; row++) {
      const x = col * pitchX + (noise2(row * 0.7, col * 0.3, 61) - 0.5) * 5
      const y = row * pitchY + (noise2(col * 0.4, row * 0.2, 63) - 0.5) * 4
      const cluster = fbm2(col * 0.16, row * 0.09, 41, 3)
      const v = y / view.h
      const density = cluster * 0.8 + weight * 0.7 + (0.5 - v) * 0.25
      if (density < 0.8) continue
      const r = noise2(col * 7.3 + 2, row * 5.1 + 1, 5)
      const near = Math.exp(-(((x - contact.x) / 160) ** 2 + ((y - contact.y) / 260) ** 2))
      // Most are faint; some stand out.
      const bright = r > 0.78
      const alpha = (bright ? 0.8 : 0.24 + 0.3 * r) + 0.25 * near
      const g = MATRIX_GLYPHS[Math.floor(noise2(col * 3.7, row * 2.9, 13) * MATRIX_GLYPHS.length) % MATRIX_GLYPHS.length]
      const big = r > 0.95
      ctx.font = `${bright ? 500 : 400} ${big ? 16 : 11}px ${MATRIX_FONT}`
      const warm = noise2(col * 1.9 + 9, row * 1.7, 29) > 0.88
      const gx = x + (r - 0.5) * 2
      const gy = y + (noise2(col, row, 3) - 0.5) * 2
      // A little shade under each, so a ring of white reads on pale glass as well as on dark.
      ctx.fillStyle = rgb(c.steel, Math.min(0.5, alpha * 0.7))
      ctx.fillText(g, gx + 0.7, gy + 0.7)
      ctx.fillStyle = rgb(warm ? c.peach : c.white, Math.min(0.95, alpha + 0.12))
      ctx.fillText(g, gx, gy)
    }
  }
}

/** Deterministic numbers in [0, 1), for what is scattered (droplets, dust). */
function scatter(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** The band the wordmark and the phrase sit in — from above the wordmark to the horizon, which is placed just below the phrase: nothing bright is scattered over it. */
const inWords = (view: View, u: number, v: number) => u > 0.03 && u < 0.97 && v > 0.35 && v < horizonOf(view)

/**
 * The surface is wet and it is dusty with light: droplets on the glass, each a small lens (a darker
 * rim where it bends the light, a bright point where it catches it) — thick at the sides and bare
 * where the words go — and specks of white-hot dust, crowding toward the sun. Drawn once.
 */
export function paintWet(canvas: HTMLCanvasElement, scene: SceneColors, view: View, sun: Point): void {
  const dpr = Math.min(1, window.devicePixelRatio || 1)
  canvas.width = Math.round(view.w * dpr)
  canvas.height = Math.round(view.h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  const c = paletteOf(scene)
  const r = scatter(1234)
  const area = (view.w * view.h) / (390 * 844)
  // Droplets.
  for (let i = 0; i < 460 * area; i++) {
    const x = r() * view.w
    const y = r() * view.h
    const u = x / view.w
    const v = y / view.h
    // None where the words are: a drop's bright point behind a letter would be a speck in it.
    if (inWords(view, u, v)) continue
    // More at the left and the top, where the glass is coldest.
    if (r() > 0.4 + 0.6 * (1 - u) * (1 - 0.5 * v)) continue
    const rad = 1 + r() ** 2 * 3.4
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, rgb(c.white, 0.05))
    g.addColorStop(0.62, rgb(c.white, 0))
    g.addColorStop(0.9, rgb(c.night, 0.34))
    g.addColorStop(1, rgb(c.night, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
    // Where it catches the light, and the thin edge of light on the side that faces the sun.
    ctx.fillStyle = rgb(c.white, 0.35 + 0.5 * r())
    ctx.beginPath()
    ctx.arc(x + rad * 0.28, y + rad * 0.3, Math.max(0.5, rad * 0.22), 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = rgb(c.ice, 0.28)
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.arc(x, y, rad * 0.86, Math.PI * 1.05, Math.PI * 1.55)
    ctx.stroke()
  }
  // Dust of light.
  const near = (x: number, y: number) => Math.exp(-(((x - sun.x) / (view.w * 0.55)) ** 2 + ((y - sun.y) / (view.h * 0.4)) ** 2))
  for (let i = 0; i < 150 * area; i++) {
    const x = r() * view.w
    const y = r() * view.h
    if (inWords(view, x / view.w, y / view.h) || r() > 0.25 + 0.75 * near(x, y)) continue
    const big = r() > 0.9
    const rad = big ? 2.2 + r() * 2 : 0.5 + r() * 0.9
    if (big) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.2)
      g.addColorStop(0, rgb(c.hot, 0.85))
      g.addColorStop(0.35, rgb(c.ember, 0.35))
      g.addColorStop(1, rgb(c.ember, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rad * 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = rgb(r() < 0.7 ? c.white : c.hot, 0.4 + 0.55 * r())
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** The sun's own light, painted once on a canvas: no layer of the page has to hold a mask or a rotation for it. */
export function paintSun(canvas: HTMLCanvasElement, scene: SceneColors, view: View, sun: Point): void {
  const dpr = Math.min(1, window.devicePixelRatio || 1)
  canvas.width = Math.round(view.w * dpr)
  canvas.height = Math.round(view.h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  const c = paletteOf(scene)
  const vmin = Math.min(view.w, view.h)

  // Spokes of light, thin, fading with distance: two uneven sets, so the light is not a sunburst.
  const reach = 0.78 * vmin
  const spoke = (deg: number, widthDeg: number, color: RGB, alpha: number) => {
    const a0 = ((deg - widthDeg / 2) * Math.PI) / 180
    const a1 = ((deg + widthDeg / 2) * Math.PI) / 180
    const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, reach)
    g.addColorStop(0, rgb(color, alpha))
    g.addColorStop(1, rgb(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(sun.x, sun.y)
    ctx.lineTo(sun.x + Math.cos(a0) * reach, sun.y + Math.sin(a0) * reach)
    ctx.lineTo(sun.x + Math.cos(a1) * reach, sun.y + Math.sin(a1) * reach)
    ctx.closePath()
    ctx.fill()
  }
  for (let deg = 6; deg < 366; deg += 17) spoke(deg, 0.55, c.hot, 0.7)
  for (let deg = 31; deg < 391; deg += 23) spoke(deg, 0.4, c.cyan, 0.45)

  // The web of light around the sun: the edges of a net of cells, dotted, thinning toward its limit.
  ctx.lineCap = 'round'
  ctx.setLineDash([1.5, 5.5])
  ctx.lineWidth = 0.8
  for (const cell of lightWeb(sun, vmin * 0.62)) {
    for (let i = 0; i < cell.length; i++) {
      const a = cell[i]
      const b = cell[(i + 1) % cell.length]
      const d = Math.hypot((a.x + b.x) / 2 - sun.x, (a.y + b.y) / 2 - sun.y)
      const alpha = Math.max(0, 1 - d / (vmin * 0.58)) * 0.8
      if (alpha < 0.03) continue
      ctx.strokeStyle = rgb(mix(c.hot, c.ember, 0.2), alpha)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])

  // Neither the spokes nor the web reach the words: they fade out above the wordmark.
  ctx.globalCompositeOperation = 'destination-in'
  const keep = ctx.createLinearGradient(0, 0, 0, view.h)
  keep.addColorStop(0, rgb(c.night, 1))
  keep.addColorStop(0.28, rgb(c.night, 1))
  keep.addColorStop(0.36, rgb(c.night, 0))
  keep.addColorStop(1, rgb(c.night, 0))
  ctx.fillStyle = keep
  ctx.fillRect(0, 0, view.w, view.h)
  ctx.globalCompositeOperation = 'source-over'

  // The glare itself: a white-hot core in a bloom of white, an orange halo, and a red that reaches far.
  const halo = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 0.65 * vmin * 1.0)
  for (const [at, color, a] of [
    [0, c.white, 1],
    [0.032, c.white, 1],
    [0.065, c.hot, 0.92],
    [0.1, c.peach, 0.7],
    [0.15, c.ember, 0.7],
    [0.24, c.vermilion, 0.46],
    [0.38, c.coral, 0.16],
    [0.55, c.vermilion, 0.05],
    [1, c.vermilion, 0],
  ] as const) halo.addColorStop(at, rgb(color, a))
  ctx.fillStyle = halo
  ctx.fillRect(sun.x - 0.65 * vmin, sun.y - 0.65 * vmin, 1.3 * vmin, 1.3 * vmin)

  // A horizontal streak of light through it, and a vertical one that stops above the words, with their warm and cool edges.
  const long = 0.52 * vmin
  const streak = ctx.createLinearGradient(sun.x - long, 0, sun.x + long, 0)
  streak.addColorStop(0, rgb(c.hot, 0))
  streak.addColorStop(0.5, rgb(c.white, 0.94))
  streak.addColorStop(1, rgb(c.hot, 0))
  ctx.fillStyle = rgb(c.cyan, 0.3)
  ctx.fillRect(sun.x - long, sun.y - 4, 2 * long, 1)
  ctx.fillStyle = rgb(c.vermilion, 0.36)
  ctx.fillRect(sun.x - long, sun.y + 3, 2 * long, 1)
  ctx.fillStyle = streak
  ctx.fillRect(sun.x - long, sun.y - 1, 2 * long, 2)
  const upright = 0.18 * vmin
  const vert = ctx.createLinearGradient(0, sun.y - upright, 0, sun.y + upright)
  vert.addColorStop(0, rgb(c.hot, 0))
  vert.addColorStop(0.5, rgb(c.hot, 0.8))
  vert.addColorStop(1, rgb(c.hot, 0))
  ctx.fillStyle = vert
  ctx.fillRect(sun.x - 1, sun.y - upright, 2, 2 * upright)

  // Two soft prismatic ghosts of the sun beside it.
  for (const [dx, dy, color] of [[-0.13 * vmin, 0.015 * vmin, c.cyan], [0.17 * vmin, -0.01 * vmin, c.vermilion]] as const) {
    const r = 0.045 * vmin
    const g = ctx.createRadialGradient(sun.x + dx, sun.y + dy, 0, sun.x + dx, sun.y + dy, r)
    g.addColorStop(0, rgb(color, 0.55))
    g.addColorStop(1, rgb(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(sun.x + dx - r, sun.y + dy - r, 2 * r, 2 * r)
  }
  canvas.dataset.ready = ''
}
