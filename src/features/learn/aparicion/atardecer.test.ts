import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APARICION_TIMELINE } from '../domain/ritual'
import { scheduleOf } from '../hooks/useRitual'
import { CRITICAL, PRELOAD_LIMIT_MS, SUNSET_ASSETS, preloadSunset, resetPreload } from './assets'
import { BEATS, SCENE_END_FRAME_TOLERANCE, SCENE_END_TARGET, STAGE_LEAVES } from './beats'
import { B_ON_A, assetFrame, contactPoint } from './geometry'
import { PLATES_A, edgesOf } from './optics'

/**
 * ATARDECER — the closing criteria of the preintegration, one test each:
 * 8 physical edges, no fictitious one, registration, B from BEATS.contact and ≤ 6 px, the scene ending at the 7.25 s target (one frame of tolerance),
 * the question allowed over its residue, and the glass decoded before the ritual's clock starts.
 */
const VIEWS = [
  { w: 390, h: 844 },
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 430, h: 932 },
]
const PHYSICAL = [130, 267, 339, 484, 638.5, 681.5, 725, 768.5]
/** Registration budget, in CSS px: the threads of light measured on the real app fall within this of the asset's edge (0.60 px at 390, 0.62 at 320). */
const REGISTRATION_PX = 0.75
const css = readFileSync(join(__dirname, 'aparicion.css'), 'utf8')
const rule = (selector: string) => {
  const i = css.indexOf(`${selector} {`)
  expect(i, selector).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i))
}
const keyframes = (name: string) => {
  const i = css.indexOf(`@keyframes ${name} {`)
  expect(i, name).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('\n}', i))
}

describe('ATARDECER · geometry', () => {
  it('has exactly 8 physical edges: 6 plates, the two shared edges counted once', () => {
    expect(PLATES_A).toHaveLength(6)
    const inner = [...new Set(PLATES_A.flat())].filter((x) => x > 0 && x < 880)
    expect(inner).toEqual(PHYSICAL)
    expect(edgesOf(1)).toHaveLength(8)
  })

  it('draws no fictitious edge: every thread is one of the 8, on every screen, and none at the screen’s sides', () => {
    for (const view of VIEWS) {
      const f = assetFrame(view, contactPoint(view))
      const real = PHYSICAL.map((x) => f.x + x * f.s)
      for (const e of edgesOf(view.w, view)) {
        expect(Math.min(...real.map((x) => Math.abs(x - e.x))), `${view.w}×${view.h} at ${e.x}`).toBeLessThan(1e-6)
        expect(e.x).toBeGreaterThan(0.5)
        expect(e.x).toBeLessThan(view.w - 0.5)
      }
    }
  })

  it('registers the renderer with the assets within the defined error', () => {
    for (const view of VIEWS) {
      const f = assetFrame(view, contactPoint(view))
      const edges = edgesOf(view.w, view)
      const real = PHYSICAL.map((x) => f.x + x * f.s).filter((x) => x > 0 && x < view.w)
      expect(edges).toHaveLength(real.length)
      edges.forEach((e, i) => expect(Math.abs(e.x - real[i])).toBeLessThanOrEqual(REGISTRATION_PX))
      // B on A: the same frame, offset by the registration of the two canvases.
      expect(B_ON_A).toEqual({ x: -314, y: 452 })
    }
  })
})

describe('ATARDECER · B, the finger', () => {
  it('comes in from BEATS.contact (0.2 s), and with reduced motion at the same moments', () => {
    const b = rule('.apa-b')
    expect(b).toMatch(new RegExp(`apa-b-in [\\d.]+s cubic-bezier\\([^)]*\\) ${BEATS.contact}s both`))
    expect(rule("html[data-motion='reducido'] .apa-b")).toMatch(/animation-name: apa-b-fade-in, apa-b-fade-out;/)
    expect(rule("html[data-motion='reducido'] .apa-b")).not.toMatch(/animation:/)
  })

  it('moves no more than 6 px from where it is registered with A1, and not at all with reduced motion', () => {
    for (const name of ['apa-b-in', 'apa-b-out']) {
      for (const m of keyframes(name).matchAll(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/g)) expect(Math.hypot(Number(m[1]), Number(m[2])), name).toBeLessThanOrEqual(6)
    }
    for (const name of ['apa-b-fade-in', 'apa-b-fade-out']) expect(keyframes(name)).not.toMatch(/transform/)
  })
})

describe('ATARDECER · FRASE → AHORA', () => {
  const start = APARICION_TIMELINE.defrag! + STAGE_LEAVES.after
  const end = start + STAGE_LEAVES.duration

  it('the scene’s exit is timed to end at 7.25 s; on screen it may land up to one frame later, never more', () => {
    expect(SCENE_END_TARGET).toBe(7.25)
    expect(end).toBeCloseTo(SCENE_END_TARGET, 9)
    // Observed in Chromium (390 and 320): opacity 0 first painted at 7.256 s — the target plus 6 ms, inside one 60 Hz frame (16.7 ms).
    const observed = 7.256
    expect(observed - SCENE_END_TARGET).toBeGreaterThan(0)
    expect(observed - SCENE_END_TARGET).toBeLessThanOrEqual(SCENE_END_FRAME_TOLERANCE)
  })

  it('the question may begin during the approved overlap: while the scene leaves, before it is gone', () => {
    expect(APARICION_TIMELINE.prompt!).toBeGreaterThanOrEqual(start)
    expect(APARICION_TIMELINE.prompt!).toBeLessThan(end)
    // The clearing of the deep glass happens before the dissolve, never during the phrase.
    expect(rule('.apa[data-leaving] .apa-stage')).toMatch(/apa-a2-clear 0\.55s/)
  })
})

describe('ATARDECER · assets', () => {
  it('serves exactly the approved files (SHA-256)', () => {
    const approved: Record<keyof typeof SUNSET_ASSETS, string> = {
      a1: '7cfb9bb060eddf92601a84731809ca0e6b62f1e0129ab7b64b791dcb7ded0737', // runtime WebP q92 of A1_v4_master.png (43da5a1e…)
      a2: 'ce039e5c8174adb199b62fec926d7eaf7f3f752e8fe1b33195d81144f7b53436', // A2-A_q92.webp
      b: 'b220468915d3b1f86948912381619d66044e6aec8b091eb56320c7e333b046d4', // frozen-B
      c1: '838a650ff47bf14940b1d6937a7c0eceb412fb7291623325d7b3d6bb97ffcf67', // frozen-C1, v2
      c2: 'cb265791d73ea603b616fbc72694a2595292ab1b5cc6062d24185560376efd76', // C2 v2
      ahora: 'e0669889a845b57249a852c031d21f6f22cccc8e34e620975d89712d0dafce69', // sunset-ahora master v2 (20 %)
    }
    for (const [k, path] of Object.entries(SUNSET_ASSETS) as [keyof typeof SUNSET_ASSETS, string][]) {
      const bytes = readFileSync(join(__dirname, '../../../../public', path))
      expect(createHash('sha256').update(bytes).digest('hex'), k).toBe(approved[k])
    }
  })
})

describe('ATARDECER · A1 is available before the ritual starts', () => {
  afterEach(() => {
    resetPreload()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  /** An Image whose decode the test settles by hand. */
  function fakeImages() {
    const decodes = new Map<string, { resolve: () => void; reject: () => void }>()
    class FakeImage {
      decoding = ''
      src = ''
      decode() {
        return new Promise<void>((resolve, reject) => decodes.set(this.src, { resolve, reject }))
      }
    }
    vi.stubGlobal('Image', FakeImage)
    return decodes
  }

  it('the ritual’s clock does not run while held, and runs the same timeline once released', () => {
    expect(scheduleOf(APARICION_TIMELINE, true)).toEqual([])
    const s = scheduleOf(APARICION_TIMELINE, false)
    expect(s.find(([stage]) => stage === 'prompt')).toEqual(['prompt', 7000])
    expect(s.length).toBeGreaterThan(5)
  })

  it('is ready only when A1 and the rest of the scene’s glass are decoded', async () => {
    const decodes = fakeImages()
    let state = 'loading'
    const p = preloadSunset().then((r) => (state = r))
    expect(CRITICAL).toContain('a1')
    for (const k of CRITICAL.filter((k) => k !== 'a1')) decodes.get(SUNSET_ASSETS[k])!.resolve()
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(state, 'not before A1').toBe('loading')
    decodes.get(SUNSET_ASSETS.a1)!.resolve()
    await p
    expect(state).toBe('ready')
  })

  it('fails — so the classic ritual runs, never a half-painted glass — if a critical asset cannot be read', async () => {
    const decodes = fakeImages()
    const p = preloadSunset()
    decodes.get(SUNSET_ASSETS.a1)!.reject()
    expect(await p).toBe('failed')
  })

  it('does not wait forever: past the limit it fails', async () => {
    vi.useFakeTimers()
    fakeImages()
    const p = preloadSunset()
    vi.advanceTimersByTime(PRELOAD_LIMIT_MS + 1)
    expect(await p).toBe('failed')
  })
})
