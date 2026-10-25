import { CROSSING_COLORS, type LearnTheme } from './themes'

/**
 * WHEN THE GROUND AND THE INK CROSS POLARITIES.
 *
 * Going from a light ground to a dark one (or back), an ink that glides from dark to
 * light passes through grey — and the ground, gliding the other way, passes through
 * grey at the same time: for a moment the text is exactly as light as what is behind
 * it. So the ink does not glide. It is decoupled from the ground:
 *
 *   0 → HARDEN   it hardens to the extreme of the side it is on (black on a light ground,
 *                white on a dark one): more contrast than before, while the ground is still far from it;
 *   SNAP         at the ground's middle tone — where black and white read equally well, ≈ 4.5:1 —
 *                it steps, in one frame, to the extreme of the other side;
 *   RELAX → 1    it softens to the new theme's own inks, now far from the ground.
 *
 * And because the ground is never perfectly even (lights, edges), a halo of the opposite tone —
 * dark around light text, light around dark — holds every letter for as long as it crosses: the letter always stands against its own surround, whatever
 * the glass behind it is doing.
 *
 * The inks are the tokens of text (never the rules or the wordmark). Animated with the Web
 * Animations API so that it shares the ground's clock: it starts in the same frame.
 */
export const CROSSING = {
  /** When the ink has hardened (fraction of the change). */
  harden: 0.12,
  /**
   * The moment the ground is at the tone where black and white are equally legible. It is not the
   * same going to dark as going to light: the lights of the glass are in the way differently.
   */
  snapToDark: 0.55,
  snapToLight: 0.45,
  /** When the ink starts softening toward the new theme's own. */
  relax: 0.84,
} as const

export const TEXT_TOKENS = ['--learn-ink', '--learn-ink-2', '--learn-ink-3', '--learn-ink-4', '--learn-label', '--learn-tab-on'] as const


type Tokens = Record<(typeof TEXT_TOKENS)[number], string>

const textTokens = (theme: LearnTheme): Tokens => ({
  '--learn-ink': theme.ink.strong,
  '--learn-ink-2': theme.ink.medium,
  '--learn-ink-3': theme.ink.soft,
  '--learn-ink-4': theme.ink.faint,
  '--learn-label': theme.ink.label,
  '--learn-tab-on': theme.ink.tabOn,
})

/** A halo of one color around the letters: stacked shadows, close and soft, so that the surround is certain. */
export const halo = (color: string) =>
  [1, 1.5, 2, 2.5, 3, 4].map((blur) => `0 0 ${blur}px ${color}`).concat([`0 0 0.3em ${color}`, `0 0 0.6em ${color}`]).join(', ')

const NO_HALO = 'none'

const all = (color: string): Tokens => Object.fromEntries(TEXT_TOKENS.map((t) => [t, color])) as Tokens

/** The keyframes that carry the text's ink across a change of polarity, or null when the polarity does not change. */
export function crossingKeyframes(from: LearnTheme, to: LearnTheme): Keyframe[] | null {
  if (from.atmosphere.tone === to.atmosphere.tone) return null
  const lightGround = from.atmosphere.tone === 'light'
  const snap = lightGround ? CROSSING.snapToDark : CROSSING.snapToLight
  const leaving = lightGround ? CROSSING_COLORS.dark : CROSSING_COLORS.light
  const arriving = lightGround ? CROSSING_COLORS.light : CROSSING_COLORS.dark
  // Dark text on a ground that is darkening needs a light halo; light text on a ground that has darkened, a dark one.
  const haloLeaving = halo(lightGround ? CROSSING_COLORS.haloOnLight : CROSSING_COLORS.haloOnDark)
  const haloArriving = halo(lightGround ? CROSSING_COLORS.haloOnDark : CROSSING_COLORS.haloOnLight)
  return [
    { offset: 0, ...textTokens(from), textShadow: NO_HALO },
    { offset: CROSSING.harden, ...all(leaving), textShadow: haloLeaving },
    { offset: snap, ...all(leaving), textShadow: haloLeaving },
    { offset: snap + 0.0005, ...all(arriving), textShadow: haloArriving },
    { offset: CROSSING.relax, ...all(arriving), textShadow: haloArriving },
    { offset: 1, ...textTokens(to), textShadow: NO_HALO },
  ]
}
