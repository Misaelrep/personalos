import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEEP_INK, LAUNCH_SCREENS, MANIFEST, PEARL, SHELL_IGNORED_PARAMS } from './config'
import { isUpdateMoment, type AppMoment } from './moment'
import { isStandalone } from './standalone'

const root = new URL('../../', import.meta.url)
const file = (path: string) => readFileSync(new URL(path, root))
const html = file('index.html').toString()

/** Width × height from a PNG header. */
function pngSize(path: string): [number, number] {
  const b = file(path)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('PWA: installable as ELYUM', () => {
  it('manifest: standalone ELYUM from /, Pearl ground, Deep Ink theme', () => {
    expect(MANIFEST).toMatchObject({
      id: '/', // the installed app's identity: renaming the product must never move it
      name: 'ELYUM',
      short_name: 'ELYUM',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      orientation: 'portrait-primary',
      background_color: PEARL,
      theme_color: DEEP_INK,
    })
    // The system's own colors, not new ones.
    const css = file('src/styles/index.css').toString().toLowerCase()
    expect(css).toContain(`--color-soft: ${PEARL.toLowerCase()}`)
    expect(css).toContain(`--color-deep: ${DEEP_INK.toLowerCase()}`)
  })

  it('icons: 192, 512 and maskable 512 exist at their declared sizes; apple-touch-icon is 180', () => {
    const icons = MANIFEST.icons ?? []
    expect(icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable'])
    for (const icon of icons) {
      const [w, h] = pngSize(`public/${icon.src}`)
      expect(`${w}x${h}`).toBe(icon.sizes)
    }
    expect(pngSize('public/apple-touch-icon.png')).toEqual([180, 180])
  })

  it('index.html: iOS standalone metadata, cover viewport, icon and a Pearl launch image per iPhone', () => {
    expect(html).toMatch(/name="viewport" content="[^"]*viewport-fit=cover/)
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="ELYUM" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    expect(html).toContain(`<meta name="theme-color" content="${PEARL}" />`)
    for (const [w, h, scale] of LAUNCH_SCREENS) {
      const src = `/splash/launch-${w * scale}x${h * scale}.png`
      expect(html).toContain(
        `media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait)" href="${src}"`,
      )
      expect(pngSize(`public${src}`)).toEqual([w * scale, h * scale])
    }
  })

  it('a simulated URL is the same app shell: the service worker ignores ?date, ?t, ?entry, ?section', () => {
    const params = [...new URLSearchParams('?date=2026-09-30&t=11:40&entry=none&section=semana').keys()]
    for (const p of params) expect(SHELL_IGNORED_PARAMS.some((re) => re.test(p))).toBe(true)
  })
})

describe('PWA: new versions never interrupt Focus', () => {
  const rest: AppMoment = { phase: 'today', focusOpen: false, entryActive: false, immersive: false }

  it('offered at rest on HOY or SEMANA', () => {
    expect(isUpdateMoment(rest)).toBe(true)
  })

  it('never while entering, inside, or closing Focus — nor with a Focus session still open', () => {
    for (const phase of ['entering', 'focus', 'exiting', 'result', 'next'] as const) expect(isUpdateMoment({ ...rest, phase })).toBe(false)
    expect(isUpdateMoment({ ...rest, focusOpen: true })).toBe(false)
  })

  it('never during the daily entry or a day opened from the week', () => {
    expect(isUpdateMoment({ ...rest, entryActive: true })).toBe(false)
    expect(isUpdateMoment({ ...rest, immersive: true })).toBe(false)
  })
})

describe('PWA: standalone', () => {
  const media = (matches: boolean) => () => ({ matches })

  it('home screen on iOS (navigator.standalone) or display-mode standalone elsewhere', () => {
    expect(isStandalone({ matchMedia: media(false), navigator: { standalone: true } })).toBe(true)
    expect(isStandalone({ matchMedia: media(true), navigator: {} })).toBe(true)
  })

  it('a browser tab is not standalone', () => {
    expect(isStandalone({ matchMedia: media(false), navigator: { standalone: false } })).toBe(false)
    expect(isStandalone({ navigator: {} })).toBe(false)
  })
})
