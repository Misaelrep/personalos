import { describe, expect, it } from 'vitest'
import { CROSSING, TEXT_TOKENS, crossingKeyframes, halo } from './crossing'
import { CROSSING_COLORS, LEARN_THEMES } from './themes'

const { 'learn-day': day, 'learn-sunset': sunset, 'learn-night': night } = LEARN_THEMES

type Frame = Record<string, string | number>

describe('a change of polarity: the ink is stepped across, not glided', () => {
  it('light → dark: hardens to black, steps to white at the ground’s middle, softens to the new inks', () => {
    const k = crossingKeyframes(sunset, night) as Frame[]
    expect(k.map((f) => f.offset)).toEqual([0, CROSSING.harden, CROSSING.snapToDark, CROSSING.snapToDark + 0.0005, CROSSING.relax, 1])
    for (const token of TEXT_TOKENS) {
      expect(k[0][token]).toBe(sunset.ink[token === '--learn-ink' ? 'strong' : token === '--learn-ink-2' ? 'medium' : token === '--learn-ink-3' ? 'soft' : token === '--learn-ink-4' ? 'faint' : token === '--learn-label' ? 'label' : 'tabOn'])
      expect(k[1][token]).toBe(CROSSING_COLORS.dark)
      expect(k[2][token]).toBe(CROSSING_COLORS.dark)
      expect(k[3][token]).toBe(CROSSING_COLORS.light)
      expect(k[4][token]).toBe(CROSSING_COLORS.light)
    }
    expect(k[5]['--learn-ink']).toBe(night.ink.strong)
    expect(k[5]['--learn-label']).toBe(night.ink.label)
  })

  it('dark → light is the same, the other way round', () => {
    const k = crossingKeyframes(night, day) as Frame[]
    expect(k[1]['--learn-ink']).toBe(CROSSING_COLORS.light)
    expect(k[3]['--learn-ink']).toBe(CROSSING_COLORS.dark)
    expect(k[5]['--learn-ink']).toBe(day.ink.strong)
  })

  it('the step is a single frame (it does not pass through the middle tones) and comes in the middle of the change', () => {
    const k = crossingKeyframes(sunset, night) as Frame[]
    expect((k[3].offset as number) - (k[2].offset as number)).toBeLessThan(0.001)
    for (const snap of [CROSSING.snapToDark, CROSSING.snapToLight]) {
      expect(snap).toBeGreaterThan(0.35)
      expect(snap).toBeLessThan(0.7)
      expect(CROSSING.harden).toBeLessThan(snap)
      expect(CROSSING.relax).toBeGreaterThan(snap)
    }
    expect(CROSSING.relax).toBeLessThan(1)
  })

  it('a halo of the opposite tone holds the text for as long as it is crossing, and there is none before or after', () => {
    const light = crossingKeyframes(sunset, night) as Frame[]
    expect(light.map((f) => f.textShadow)).toEqual([
      'none',
      halo(CROSSING_COLORS.haloOnLight), // dark text, ground going dark: a light halo
      halo(CROSSING_COLORS.haloOnLight),
      halo(CROSSING_COLORS.haloOnDark), // light text now: a dark halo
      halo(CROSSING_COLORS.haloOnDark),
      'none',
    ])
    const dark = crossingKeyframes(night, day) as Frame[]
    expect(dark[1].textShadow).toBe(halo(CROSSING_COLORS.haloOnDark))
    expect(dark[3].textShadow).toBe(halo(CROSSING_COLORS.haloOnLight))
  })

  it('the halo is a stack of close, soft shadows of one color (so the surround is certain), nothing at rest', () => {
    const h = halo('rgba(0,0,0,1)')
    expect(h.split('), ').length + h.split(', ').length).toBeGreaterThan(8)
    expect(h).toContain('0 0 1px rgba(0,0,0,1)')
    expect(h).toContain('0 0 0.6em rgba(0,0,0,1)')
  })

  it('changes that keep the polarity (day ↔ sunset) glide on their own: nothing is stepped', () => {
    expect(crossingKeyframes(day, sunset)).toBeNull()
    expect(crossingKeyframes(sunset, day)).toBeNull()
    expect(crossingKeyframes(day, day)).toBeNull()
  })

  it('only text is stepped: the rules and the wordmark are not among the tokens', () => {
    expect(TEXT_TOKENS).not.toContain('--learn-line')
    expect(TEXT_TOKENS).not.toContain('--learn-mark')
    const k = crossingKeyframes(sunset, night) as Frame[]
    for (const f of k) expect(Object.keys(f).filter((key) => key !== 'offset').sort()).toEqual([...TEXT_TOKENS, 'textShadow'].sort())
  })
})
