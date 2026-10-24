import type { SceneColors } from '../atmosphere/themes'
import type { RGB } from './color'
import type { Point, View } from './fragments'
import { fbm2, noise2, smoothstep } from './noise'
import { SLABS, bendPx, edgeLight, edgesOf } from './optics'
import { makePixels, paletteOf, wetFrom, wordsBand, wordsFrom, type Pixels, type TextureJob } from './pixels'

/**
 * What the scene draws on canvases, and how the soft textures (pixels.ts) get to them. The glass, its depth and the
 * finger are made by a worker — a few hundred milliseconds of noise that would otherwise sit in front of the frames — and put
 * on their canvases as they arrive; the information inside the glass, the wet of the surface and the thread of light along the
 * plates are drawn here, because they are quick.
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
 * that is made of words. Behind a plate of the glass (optics.ts) the letters are displaced, split into their colors,
 * a little magnified or reduced, and repeated: the same refraction as everything else. Drawn once, at the screen's own resolution so the letters stay sharp.
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
      const warm = noise2(col * 1.9 + 9, row * 1.7, 29) > 0.88
      // Behind a plate: shifted (the world is seen from a little to one side), split, scaled, and once more beside it.
      const b = bendPx(x, y, view)
      const inside = b.weight > 0
      const gx = x - b.dx + (r - 0.5) * 2
      const gy = y - b.dy + (noise2(col, row, 3) - 0.5) * 2
      const size = (big ? 16 : 11) * (inside ? 1 + 0.2 * b.weight * (SLABS[b.slab].k > 0 ? 1 : -0.3) : 1)
      ctx.font = `${bright ? 500 : 400} ${size.toFixed(1)}px ${MATRIX_FONT}`
      if (inside) {
        // The colors parted: a warm ghost to one side and a cool one to the other.
        const ca = Math.max(1.4, b.ca * 1.7)
        ctx.fillStyle = rgb(c.vermilion, Math.min(0.6, alpha * 0.6))
        ctx.fillText(g, gx - ca, gy)
        ctx.fillStyle = rgb(c.cyan, Math.min(0.6, alpha * 0.6))
        ctx.fillText(g, gx + ca, gy)
        // A small zone, repeated: a fainter copy of the letter, higher and to one side.
        if (r > 0.55) {
          ctx.fillStyle = rgb(c.white, alpha * 0.28)
          ctx.fillText(g, gx + (SLABS[b.slab].k > 0 ? 11 : -11), gy - 17)
        }
      }
      // A little shade under each, so a ring of white reads on pale glass as well as on dark.
      ctx.fillStyle = rgb(c.steel, Math.min(0.5, alpha * 0.7))
      ctx.fillText(g, gx + 0.7, gy + 0.7)
      ctx.fillStyle = rgb(warm ? c.peach : c.white, Math.min(0.95, alpha + 0.12) * (inside ? 0.85 : 1))
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

/** The band the wordmark and the phrase sit in — from above the wordmark to the wet below the phrase: nothing bright is scattered over it. */
const inWords = (view: View, u: number, v: number) => u > 0.03 && u < 0.97 && v > wordsFrom(view) - 0.02 && v < wetFrom(view)

/** How quiet the words' band makes the thread of light there (0: not at all, 1: entirely): along the right edge the light is let through. */
const hush = (view: View, u: number, v: number) => wordsBand(view, v) * (1 - 0.8 * smoothstep(0.9, 0.97, u))

/**
 * The surface is wet and it is dusty with light: droplets on the glass, each a small lens (a darker
 * rim where it bends the light, a bright point where it catches it) — thick at the sides and bare
 * where the words go — and specks of white-hot dust, caught along the edges of the plates. Drawn once.
 */
export function paintWet(canvas: HTMLCanvasElement, scene: SceneColors, view: View): void {
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
  for (let i = 0; i < 380 * area; i++) {
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
    // Where it catches the light, and the thin edge of light on the side that faces the plate's edge.
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
  // Dust of light, caught along the edges of the plates.
  const edges = edgesOf(view.w, view)
  for (let i = 0; i < 150 * area; i++) {
    const x = r() * view.w
    const y = r() * view.h
    if (inWords(view, x / view.w, y / view.h)) continue
    const near = Math.min(...edges.map((e) => Math.abs(x - e.x)))
    if (r() > 0.02 + 0.98 * Math.exp(-((near / 16) ** 2))) continue
    ctx.fillStyle = rgb(r() < 0.82 ? c.white : c.hot, 0.3 + 0.45 * r())
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1 + Math.floor(r() * 3))
  }
}

/**
 * The thread of light along the glass, drawn sharp: the edge of every plate (a white thread with its fringe of color — cool outside, warm inside — brighter in
 * places than in others), the light that spills from it, the red and orange that leak along the warm plate (the only red there is: refracted light, never a source),
 * the fans where an edge splits the light into its spectrum, the glints along the edges, a few soft halos where the light gathers, and, low on the screen,
 * the broken threads of the wet. Drawn once; the page scales its whole presence with the ritual's intensity (beats.ts: INTENSITY).
 */
export function paintGlass(canvas: HTMLCanvasElement, scene: SceneColors, view: View): void {
  // The plates' matter, leaks, halos and reflections come from the assets (A1/A2/C1/C2); the code keeps only
  // the sharp thread of light, 1 px, on each physical edge (edgesOf), hushed behind the words as before.
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(view.w * dpr)
  canvas.height = Math.round(view.h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  const c = paletteOf(scene)
  const { w, h } = view
  const SEG = 6
  const quiet = (y: number, x: number) => 1 - 0.88 * hush(view, x / w, y / h)
  for (const e of edgesOf(w, view)) {
    const x = Math.round(e.x)
    const out = e.side === 0 ? -1 : 1
    for (let y = 0; y < h; y += SEG) {
      const v = (y + SEG / 2) / h
      const k = edgeLight(e.slab, e.side, v) * quiet(y, x)
      if (k < 0.04) continue
      ctx.fillStyle = rgb(c.cyan, 0.5 * k)
      ctx.fillRect(x + out, y, 1, SEG)
      ctx.fillStyle = rgb(c.vermilion, 0.45 * k)
      ctx.fillRect(x - out, y, 1, SEG)
      ctx.fillStyle = rgb(c.white, 0.92 * k)
      ctx.fillRect(e.side === 0 ? x : x - 1, y, 1, SEG)
    }
  }
  canvas.dataset.ready = ''
}
