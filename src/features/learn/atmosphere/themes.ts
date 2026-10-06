import type { AtmospherePreset } from '../../../atmosphere/presets'
import type { LearnThemeId } from './schedule'

/**
 * THE ATMOSPHERES OF APRENDER — the one place where its color lives.
 *
 * Each one is made of the same three things, so adding another is adding an entry:
 *   atmosphere  the ground, four halos, particles and accent of the shared Atmosphere
 *   ink         text and rules (tokens: they replace the core's inside APRENDER only)
 *   light       APRENDER's own light, painted over the ground (see LearnLight)
 *   mark        the dots of the wordmark
 * Layout never depends on any of this. Which one is in force is `schedule.ts`.
 */
export interface LearnTheme {
  id: LearnThemeId
  atmosphere: AtmospherePreset
  ink: {
    /** Text and the main line. */
    strong: string
    /** Text that accompanies. */
    medium: string
    /** Quiet text. */
    soft: string
    /** The quietest text there is: placeholders, inactive tabs. */
    faint: string
    /** Rules and the field's underline. */
    line: string
  }
  light: {
    /** [horizon, counter-light, side light] — the same places in every atmosphere, so only color changes between them. */
    orbs: [string, string, string]
    /** A band of mist low on the screen. */
    haze: string
    /** Darkening (or cooling) toward the edges: depth. */
    edge: string
  }
  mark: { color: string; glow: string }
}

/**
 * DÍA — pearl white, very light blue, soft lavender, cool celeste touches.
 * The most luminous one: dark indigo ink, never pure black.
 */
const DAY: LearnTheme = {
  id: 'learn-day',
  atmosphere: {
    tone: 'light',
    base: '#F4F5FC',
    halos: ['rgba(255,255,255,0.95)', 'rgba(170,200,250,0.56)', 'rgba(198,186,248,0.5)', 'rgba(255,255,255,0.85)'],
    particle: 'rgba(112,124,222,0.5)',
    glow: 'rgba(150,164,240,0.5)',
    accent: '#5B6CF0',
  },
  ink: { strong: '#0F1730', medium: '#2F3A5C', soft: '#46517A', faint: '#566189', line: 'rgba(40,52,110,0.16)' },
  light: {
    orbs: ['rgba(220,205,250,0.55)', 'rgba(150,200,245,0.5)', 'rgba(186,170,245,0.45)'],
    haze: 'rgba(255,255,255,0.55)',
    edge: 'rgba(176,184,228,0.2)',
  },
  mark: { color: '#2B3274', glow: 'rgba(110,122,230,0.3)' },
}

/**
 * ATARDECER — violet and lavender blue, pale pearl, a whisper of rose.
 * The light descends but it is not night yet.
 */
const SUNSET: LearnTheme = {
  id: 'learn-sunset',
  atmosphere: {
    tone: 'deep',
    base: '#34327E',
    halos: ['rgba(168,156,246,0.34)', 'rgba(84,100,210,0.44)', 'rgba(244,182,214,0.2)', 'rgba(224,226,255,0.14)'],
    particle: 'rgba(232,226,255,0.8)',
    glow: 'rgba(176,166,250,0.65)',
    accent: '#CFC8FF',
  },
  ink: { strong: '#FFFFFF', medium: '#F0EEFD', soft: '#E3DFF9', faint: '#D6D2F5', line: 'rgba(232,228,255,0.18)' },
  light: {
    orbs: ['rgba(250,206,228,0.34)', 'rgba(112,128,230,0.26)', 'rgba(190,178,255,0.28)'],
    haze: 'rgba(236,230,255,0.16)',
    edge: 'rgba(18,16,60,0.5)',
  },
  mark: { color: '#EFEBFF', glow: 'rgba(180,170,255,0.6)' },
}

/**
 * NOCHE — deep, quiet, contemplative; amber, ember and peach as a light
 * inside the dark, never as a flat color over it.
 */
const NIGHT: LearnTheme = {
  id: 'learn-night',
  atmosphere: {
    tone: 'deep',
    base: '#0A0E22',
    halos: ['rgba(255,150,92,0.16)', 'rgba(36,52,122,0.62)', 'rgba(255,112,64,0.22)', 'rgba(255,214,176,0.06)'],
    particle: 'rgba(255,214,176,0.75)',
    glow: 'rgba(255,140,80,0.5)',
    accent: '#FFB787',
  },
  ink: { strong: '#FBF3EA', medium: '#D9D2D9', soft: '#B1ACC2', faint: '#9A96B4', line: 'rgba(255,236,220,0.12)' },
  light: {
    orbs: ['rgba(255,128,70,0.36)', 'rgba(70,96,190,0.26)', 'rgba(255,190,150,0.16)'],
    haze: 'rgba(255,200,160,0.06)',
    edge: 'rgba(2,3,12,0.6)',
  },
  mark: { color: '#FFE3C7', glow: 'rgba(255,140,80,0.5)' },
}

export const LEARN_THEMES: Record<LearnThemeId, LearnTheme> = {
  'learn-day': DAY,
  'learn-sunset': SUNSET,
  'learn-night': NIGHT,
}

/**
 * What the screen sets on itself: ink, rules and the wordmark. Only APRENDER's own subtree
 * sees them: atmosphere.css answers the core's `--ink…` and `--line` with these.
 */
export function learnScreenVars(theme: LearnTheme): Record<string, string> {
  return {
    '--learn-ink': theme.ink.strong,
    '--learn-ink-2': theme.ink.medium,
    '--learn-ink-3': theme.ink.soft,
    '--learn-ink-4': theme.ink.faint,
    '--learn-line': theme.ink.line,
    '--learn-mark': theme.mark.color,
    '--learn-mark-glow': theme.mark.glow,
  }
}

/** What LearnLight sets on itself: its orbs, mist and edge. */
export function learnLightVars(theme: LearnTheme): Record<string, string> {
  const [horizon, counter, side] = theme.light.orbs
  return {
    '--learn-orb-1': horizon,
    '--learn-orb-2': counter,
    '--learn-orb-3': side,
    '--learn-haze': theme.light.haze,
    '--learn-edge': theme.light.edge,
  }
}
