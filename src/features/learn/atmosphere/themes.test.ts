import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRESETS } from '../../../atmosphere/presets'
import { SCHEDULE } from './schedule'
import { LEARN_THEMES, learnLightVars, learnScreenVars, sceneVars, type LearnTheme } from './themes'

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

/** Every light the theme paints: the four halos, three orbs, the mist, the edge of light and the pool of depth (clear ones are not there). */
const lightsOf = (t: LearnTheme) => [...t.atmosphere.halos, ...t.light.orbs, t.light.haze, t.light.rim, t.light.depth].map(parse).filter((l) => l[3] > 0)

/**
 * The ritual stage's sky where the phrase sits (see aparicion.css): from night at the bottom up to
 * a mix of night and steel at 38% of the height. The phrase lives below that; this is the brightest it can be.
 */
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)).concat(1) as RGBA

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

  it('DÍA and ATARDECER are light, NOCHE is deep (it decides the keyboard and the native controls)', () => {
    expect(day.atmosphere.tone).toBe('light')
    expect(sunset.atmosphere.tone).toBe('light')
    expect(night.atmosphere.tone).toBe('deep')
  })

  it('only ATARDECER opens with APARICIÓN, and only it has a stage of its own; day and night keep the classic ritual and no edge light', () => {
    expect(sunset.ritual).toBe('aparicion')
    expect(sunset.stage).toBeDefined()
    for (const t of [day, night]) {
      expect(t.ritual).toBe('classic')
      expect(t.stage).toBeUndefined()
      for (const c of [t.light.rim, t.light.depth, t.light.spec, t.light.prism]) expect(parse(c)[3]).toBe(0)
    }
  })

  it('each one is a complete preset: ground, four halos, particle, accent', () => {
    for (const t of THEMES) {
      expect(t.atmosphere.halos).toHaveLength(4)
      expect(() => parse(t.atmosphere.base)).not.toThrow()
      for (const c of [...t.atmosphere.halos, t.atmosphere.particle, t.atmosphere.accent]) expect(() => parse(c)).not.toThrow()
      for (const c of [...Object.values(t.ink), ...t.light.orbs, ...Object.values(t.light).filter((v): v is string => typeof v === 'string'), t.mark.color, t.mark.glow]) expect(() => parse(c)).not.toThrow()
      for (const c of Object.values(t.stage ?? {})) expect(() => parse(c)).not.toThrow()
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

describe('light, in order: DÍA is the most luminous, ATARDECER is ice and sky, NOCHE is deep', () => {
  const ground = (t: LearnTheme) => luminance(parse(t.atmosphere.base))

  it('ground luminance: day ≥ sunset, both light; night far below', () => {
    expect(ground(day)).toBeGreaterThan(ground(sunset))
    expect(ground(sunset)).toBeGreaterThan(0.75)
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

  it('ATARDECER: blue leads the ground; the vermilion is an edge of light, never a fill; blue-black gives it depth', () => {
    const [r, g, b] = parse(sunset.atmosphere.base)
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
    // The warm lights (the rim, the orb on the side, the low halo) are all present…
    const warm = [sunset.light.rim, sunset.light.orbs[2], sunset.atmosphere.halos[2]].map(parse)
    for (const [wr, , wb] of warm) expect(wr).toBeGreaterThan(wb + 100)
    // …none of them covers the ground (alpha well under 1), and the ground keeps blue over red in every halo that is not warm.
    for (const l of warm) expect(l[3]).toBeLessThanOrEqual(0.7)
    const cool = [sunset.atmosphere.halos[1], sunset.atmosphere.halos[3]].map(parse)
    for (const [cr, , cb] of cool) expect(cb).toBeGreaterThan(cr)
    // The depth is blue-black.
    const depth = parse(sunset.light.depth)
    expect(luminance(depth)).toBeLessThan(0.02)
    expect(depth[2]).toBeGreaterThan(depth[0])
  })

  it('ATARDECER: the ink is a dark blue and the question and the open tab carry the deep red', () => {
    expect(luminance(parse(sunset.ink.strong))).toBeLessThan(0.02)
    const [r, g, b] = parse(sunset.ink.label)
    expect(r).toBeGreaterThan(g + 40)
    expect(r).toBeGreaterThan(b + 40)
    expect(sunset.ink.tabOn).toBe(sunset.ink.label)
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

  it('the question and the open tab are readable too (≥ 7:1 on the ground, ≥ 4.5:1 under every light that can sit behind the text)', () => {
    for (const t of THEMES) {
      const base = parse(t.atmosphere.base)
      for (const color of [t.ink.label, t.ink.tabOn]) {
        expect(contrast(parse(color), base), `${t.id} ${color}`).toBeGreaterThanOrEqual(7)
        // The edge of light (rim) hugs the right border and the pool of depth sits in the lower corner, both away from the
        // text; their real reach is measured on the rendered pixels (QA).
        const away = [t.light.rim, t.light.depth].map((c) => parse(c).join())
        for (const light of lightsOf(t).filter((l) => !away.includes(l.join()))) expect(contrast(parse(color), over(base, light)), `${t.id} ${color} under ${light}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('the words on the ritual stage (light ink on the dark sky) are readable: ≥ 7:1 on the deepest sky and ≥ 4.5:1 on the brightest it gets where the phrase sits', () => {
    expect(sunset.stage).toBeDefined()
    const { strong, medium, soft } = sunset.stage!
    const night = parse(sunset.scene!.night)
    const brightest = mix(night, parse(sunset.scene!.steel), 0.3)
    expect(contrast(parse(strong), night)).toBeGreaterThanOrEqual(7)
    expect(contrast(parse(medium), night)).toBeGreaterThanOrEqual(7)
    expect(contrast(parse(strong), brightest)).toBeGreaterThanOrEqual(7)
    expect(contrast(parse(medium), brightest)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(parse(soft), night)).toBeGreaterThanOrEqual(4.5)
  })

  it('the wordmark’s dots (vermilion on the dark sky) are bright enough to read as a word: ≥ 4.5:1 on the sky’s deepest tone', () => {
    expect(contrast(parse(sunset.mark.color), parse(sunset.scene!.night))).toBeGreaterThanOrEqual(4.5)
  })

  it('the ink keeps its order: each step is quieter than the one before it', () => {
    for (const t of THEMES) {
      const base = parse(t.atmosphere.base)
      const c = [t.ink.strong, t.ink.medium, t.ink.soft, t.ink.faint].map((x) => contrast(parse(x), base))
      expect(c).toEqual([...c].sort((a, b) => b - a))
    }
  })
})

describe('the scene’s palette', () => {
  it('is eighteen colors, only on the atmosphere that has the scene; each becomes a token', () => {
    expect(Object.keys(sunset.scene!).sort()).toEqual(['coral', 'cyan', 'deep', 'ember', 'garnet', 'haze', 'hot', 'ice', 'magenta', 'mist', 'night', 'peach', 'sky', 'steel', 'teal', 'vermilion', 'violet', 'white'])
    for (const c of Object.values(sunset.scene!)) expect(() => parse(c)).not.toThrow()
    expect(day.scene).toBeUndefined()
    expect(night.scene).toBeUndefined()
    expect(sceneVars(sunset.scene!)['--apa-vermilion']).toBe(sunset.scene!.vermilion)
    expect(Object.keys(sceneVars(sunset.scene!))).toHaveLength(18)
  })

  it('is balanced like the reference: ice and sky blue as the base, blue-black for depth, vermilion and ember as the accent, cyan as the microaccent', () => {
    const s = sunset.scene!
    for (const name of ['ice', 'sky', 'steel'] as const) {
      const [r, , b] = parse(s[name])
      expect(b, name).toBeGreaterThan(r + 25) // blue leads
    }
    const [nr, , nb] = parse(s.night)
    expect(nb).toBeGreaterThan(nr)
    expect(luminance(parse(s.night))).toBeLessThan(0.01)
    for (const name of ['vermilion', 'ember', 'hot'] as const) {
      const [r, , b] = parse(s[name])
      expect(r, name).toBeGreaterThan(b + 30) // warm
    }
    const [cr, , cb] = parse(s.cyan)
    expect(cb).toBeGreaterThan(cr + 80)
    // The warm light is an accent, not the ground: the base colors are all cooler and darker than white-hot, and the glass is not warm anywhere.
    expect(luminance(parse(s.white))).toBeGreaterThan(0.9)
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
      '--learn-label': night.ink.label,
      '--learn-tab-on': night.ink.tabOn,
      '--learn-mark': night.mark.color,
      '--learn-mark-glow': night.mark.glow,
    })
    expect(learnLightVars(day)).toEqual({
      '--learn-orb-1': day.light.orbs[0],
      '--learn-orb-2': day.light.orbs[1],
      '--learn-orb-3': day.light.orbs[2],
      '--learn-haze': day.light.haze,
      '--learn-edge': day.light.edge,
      '--learn-rim': day.light.rim,
      '--learn-depth': day.light.depth,
      '--learn-spec': day.light.spec,
      '--learn-prism': day.light.prism,
      '--learn-glow': day.light.glow,
      '--learn-hot': day.light.hot,
      '--learn-sea': day.light.sea,
      '--learn-streak': day.light.streak,
      '--learn-cloud': day.light.cloud,
    })
  })

  it('no color is written outside atmosphere/themes.ts: not in components, screens, nor the light’s stylesheet', () => {
    // A literal color: a hex, or rgb()/hsl() written with numbers (a call such as rgba(c.white, 0.3) is the palette being used, not a color written).
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d/
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
