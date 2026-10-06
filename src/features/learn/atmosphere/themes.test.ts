import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRESETS } from '../../../atmosphere/presets'
import { SCHEDULE } from './schedule'
import { LEARN_THEMES, learnLightVars, learnScreenVars, type LearnTheme } from './themes'

type RGBA = [number, number, number, number]

function parse(color: string): RGBA {
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGBA
  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (!rgba) throw new Error(`unreadable color: ${color}`)
  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])]
}

const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: RGBA) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a: RGBA, b: RGBA) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const over = (ground: RGBA, light: RGBA): RGBA => [0, 1, 2].map((i) => Math.round(ground[i] * (1 - light[3]) + light[i] * light[3])).concat(1) as RGBA

/** Every light the theme paints: the four halos, three orbs and the mist. */
const lightsOf = (t: LearnTheme) => [...t.atmosphere.halos, ...t.light.orbs, t.light.haze].map(parse)

const THEMES = Object.values(LEARN_THEMES)
const day = LEARN_THEMES['learn-day']
const sunset = LEARN_THEMES['learn-sunset']
const night = LEARN_THEMES['learn-night']

describe('the registry', () => {
  it('has an atmosphere for every one the schedule can ask for, each filed under its own id', () => {
    for (const slot of SCHEDULE) expect(LEARN_THEMES[slot.id]).toBeDefined()
    for (const [id, theme] of Object.entries(LEARN_THEMES)) expect(theme.id).toBe(id)
    expect(Object.keys(LEARN_THEMES).sort()).toEqual(['learn-day', 'learn-night', 'learn-sunset'])
  })

  it('DÍA is light, ATARDECER and NOCHE are deep (it decides the keyboard and the native controls)', () => {
    expect(day.atmosphere.tone).toBe('light')
    expect(sunset.atmosphere.tone).toBe('deep')
    expect(night.atmosphere.tone).toBe('deep')
  })

  it('each one is a complete preset: ground, four halos, particle, accent', () => {
    for (const t of THEMES) {
      expect(t.atmosphere.halos).toHaveLength(4)
      expect(() => parse(t.atmosphere.base)).not.toThrow()
      for (const c of [...t.atmosphere.halos, t.atmosphere.particle, t.atmosphere.accent]) expect(() => parse(c)).not.toThrow()
      for (const c of [...Object.values(t.ink), ...t.light.orbs, t.light.haze, t.light.edge, t.mark.color, t.mark.glow]) expect(() => parse(c)).not.toThrow()
    }
  })

  it('the three are three different places', () => {
    expect(new Set(THEMES.map((t) => t.atmosphere.base)).size).toBe(3)
  })
})

describe('independence from the core', () => {
  it('none of them is, or reuses the ground of, focus-session or any other core preset', () => {
    const core = Object.values(PRESETS)
    for (const t of THEMES) {
      expect(core).not.toContain(t.atmosphere)
      expect(core.map((p) => p.base)).not.toContain(t.atmosphere.base)
    }
  })

  it('APRENDER’s source never names focus-session', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(20)
    for (const f of files) expect(f.text, f.path).not.toContain('focus-session')
  })
})

describe('light, in order: DÍA is the most luminous, ATARDECER is not yet night, NOCHE is deep', () => {
  const ground = (t: LearnTheme) => luminance(parse(t.atmosphere.base))

  it('ground luminance falls from day to sunset to night, with room between', () => {
    expect(ground(day)).toBeGreaterThan(0.85)
    expect(ground(sunset)).toBeLessThan(ground(day) / 4)
    expect(ground(sunset)).toBeGreaterThan(ground(night) * 3)
    expect(ground(night)).toBeLessThan(0.02)
  })

  it('NOCHE: the warm light is a light inside the dark — never strong, never the ground', () => {
    const base = parse(night.atmosphere.base)
    const warm = lightsOf(night).filter(([r, , b]) => r > b + 40)
    expect(warm.length).toBeGreaterThanOrEqual(3) // amber, ember, peach are there…
    for (const l of warm) {
      expect(l[3]).toBeLessThanOrEqual(0.4) // …but none is more than a glow…
      expect(luminance(over(base, l))).toBeLessThan(0.2) // …and none lifts the dark into a sunset
    }
  })

  it('ATARDECER is violet-blue: blue leads its ground and its lights', () => {
    const [r, g, b] = parse(sunset.atmosphere.base)
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })
})

describe('text is readable in every atmosphere (WCAG)', () => {
  it('against the ground: the main text ≥ 7:1, the quietest ≥ 4.5:1 (AA)', () => {
    for (const t of THEMES) {
      const base = parse(t.atmosphere.base)
      const { strong, medium, soft, faint } = t.ink
      expect(contrast(parse(strong), base), `${t.id} strong`).toBeGreaterThanOrEqual(7)
      expect(contrast(parse(medium), base), `${t.id} medium`).toBeGreaterThanOrEqual(7)
      expect(contrast(parse(soft), base), `${t.id} soft`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(parse(faint), base), `${t.id} faint`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('and still ≥ 4.5:1 for the main text under the strongest single light the theme paints', () => {
    for (const t of THEMES) {
      const base = parse(t.atmosphere.base)
      for (const light of lightsOf(t)) {
        expect(contrast(parse(t.ink.strong), over(base, light)), `${t.id} under ${light}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('the ink keeps its order: each step is quieter than the one before it', () => {
    for (const t of THEMES) {
      const base = parse(t.atmosphere.base)
      const c = [t.ink.strong, t.ink.medium, t.ink.soft, t.ink.faint].map((x) => contrast(parse(x), base))
      expect(c).toEqual([...c].sort((a, b) => b - a))
    }
  })
})

describe('how a theme reaches the screen', () => {
  it('the screen sets ink, rules and the wordmark; the light sets its own layers — as tokens, nothing inline', () => {
    expect(learnScreenVars(night)).toEqual({
      '--learn-ink': night.ink.strong,
      '--learn-ink-2': night.ink.medium,
      '--learn-ink-3': night.ink.soft,
      '--learn-ink-4': night.ink.faint,
      '--learn-line': night.ink.line,
      '--learn-mark': night.mark.color,
      '--learn-mark-glow': night.mark.glow,
    })
    expect(learnLightVars(day)).toEqual({
      '--learn-orb-1': day.light.orbs[0],
      '--learn-orb-2': day.light.orbs[1],
      '--learn-orb-3': day.light.orbs[2],
      '--learn-haze': day.light.haze,
      '--learn-edge': day.light.edge,
    })
  })

  it('no color is written outside atmosphere/themes.ts: not in components, screens, nor the light’s stylesheet', () => {
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
    for (const f of sourceFiles()) {
      if (f.path.startsWith('atmosphere/themes.ts') || f.path.endsWith('.test.ts')) continue
      expect(f.text, f.path).not.toMatch(literal)
    }
  })
})

/** Every non-test source file of APRENDER, with its path relative to features/learn. */
function sourceFiles(): { path: string; text: string }[] {
  const root = new URL('../', import.meta.url)
  const out: { path: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`
      if (entry.isDirectory()) walk(`${rel}/`)
      else if (/\.(ts|tsx|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push({ path: rel, text: readFileSync(new URL(rel, root), 'utf8') })
    }
  }
  walk('')
  return out
}
