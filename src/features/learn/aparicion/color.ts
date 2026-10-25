/**
 * Small color arithmetic for what is drawn on a canvas or inside an image, where CSS
 * variables and color-mix() are not available. The palette stays the theme's: these
 * only mix and thin out the colors it gives.
 */
export type RGB = [number, number, number]

export function parseHex(hex: string): RGB {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB
}

const round = (n: number) => Math.round(Math.min(255, Math.max(0, n)))

/** `rgba()` of a palette color at the given opacity (0..1). */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r},${g},${b},${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`
}

/** The color `t` of the way from `a` to `b` (in sRGB, like color-mix does). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  const h = (n: number) => round(n).toString(16).padStart(2, '0')
  return `#${h(ar + (br - ar) * t)}${h(ag + (bg - ag) * t)}${h(ab + (bb - ab) * t)}`
}
