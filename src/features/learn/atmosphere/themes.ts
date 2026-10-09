import type { AtmospherePreset } from '../../../atmosphere/presets'
import type { LearnThemeId } from './schedule'

/**
 * THE ATMOSPHERES OF APRENDER — the one place where its color lives.
 *
 * Each one is made of the same things, so adding another is adding an entry:
 *   atmosphere  the ground, four halos, particles and accent of the shared Atmosphere
 *   ink         text and rules (tokens: they replace the core's inside APRENDER only)
 *   light       APRENDER's own light, painted over the ground (see LearnLight)
 *   mark        the dots of the wordmark
 *   ritual      how the first entry of the day begins ('classic': the wordmark; 'aparicion': see ../aparicion)
 *   stage       only for a ritual that has a stage of its own: the ink of the words that live on it
 * Layout never depends on any of this. Which one is in force is `schedule.ts`.
 */
export type RitualKind = 'classic' | 'aparicion'

export interface LearnTheme {
  id: LearnThemeId
  ritual: RitualKind
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
    /** The question that heads the field. */
    label: string
    /** The tab that is open. */
    tabOn: string
  }
  light: {
    /** [horizon, counter-light, side light] — the same places in every atmosphere, so only color changes between them. */
    orbs: [string, string, string]
    /** A band of mist low on the screen. */
    haze: string
    /** Darkening (or cooling) toward the edges: depth. */
    edge: string
    /** An energetic edge of light along the right side, where the glass catches it. */
    rim: string
    /** A pool of depth in the lower corner. */
    depth: string
    /** Specular streaks (white-hot) and the thin prismatic fringe beside them. */
    spec: string
    prism: string
    /** The glow that leans in from the right edge (broad and soft), and the white-hot spots in it. */
    glow: string
    hot: string
    /** The sheet of water along the bottom: the ice blue of its ground and the streaks of light on it. */
    sea: string
    streak: string
    /** Soft white masses of cloud in the glass. */
    cloud: string
  }
  mark: { color: string; glow: string }
  /** The ink of the words on the ritual's own stage (a dark one, over this atmosphere's light ground). */
  stage?: { strong: string; medium: string; soft: string }
  /** The palette of the ritual's own scene (APARICIÓN): a few primitives; every gradient is mixed from them in CSS. */
  scene?: SceneColors
}

/**
 * The colors that make the whole scene, from pearl to blue-black — everything the scene
 * paints is mixed from these, in CSS or in the textures it generates; none is written anywhere else.
 *   the glass and the water   white · mist · ice (pearl and frost) · haze (gray-blue) · sky · steel · teal (deep cyan-blue) · deep · night (blue-black)
 *   the light that crosses it vermilion · coral · ember · hot (white-hot) · peach (pink-white, where it warms the glass)
 *   its prismatic fringe      cyan · violet · magenta
 *   the few dark letters      garnet
 */
export interface SceneColors {
  white: string
  mist: string
  ice: string
  haze: string
  sky: string
  steel: string
  teal: string
  deep: string
  night: string
  vermilion: string
  coral: string
  ember: string
  hot: string
  peach: string
  cyan: string
  violet: string
  magenta: string
  garnet: string
}

/** Day and night have no edge light, depth pool or prismatic fringe: those layers are there, and clear. */
const NO_RIM = {
  rim: 'rgba(0,0,0,0)',
  depth: 'rgba(0,0,0,0)',
  spec: 'rgba(0,0,0,0)',
  prism: 'rgba(0,0,0,0)',
  glow: 'rgba(0,0,0,0)',
  hot: 'rgba(0,0,0,0)',
  sea: 'rgba(0,0,0,0)',
  streak: 'rgba(0,0,0,0)',
  cloud: 'rgba(0,0,0,0)',
}

/**
 * DÍA — pearl white, very light blue, soft lavender, cool celeste touches.
 * The most luminous one: dark indigo ink, never pure black.
 */
const DAY: LearnTheme = {
  id: 'learn-day',
  ritual: 'classic',
  atmosphere: {
    tone: 'light',
    base: '#F4F5FC',
    halos: ['rgba(255,255,255,0.95)', 'rgba(170,200,250,0.56)', 'rgba(198,186,248,0.5)', 'rgba(255,255,255,0.85)'],
    particle: 'rgba(112,124,222,0.5)',
    glow: 'rgba(150,164,240,0.5)',
    accent: '#5B6CF0',
  },
  ink: { strong: '#0F1730', medium: '#2F3A5C', soft: '#46517A', faint: '#566189', line: 'rgba(40,52,110,0.16)', label: '#2F3A5C', tabOn: '#0F1730' },
  light: {
    orbs: ['rgba(220,205,250,0.55)', 'rgba(150,200,245,0.5)', 'rgba(186,170,245,0.45)'],
    haze: 'rgba(255,255,255,0.55)',
    edge: 'rgba(176,184,228,0.2)',
    ...NO_RIM,
  },
  mark: { color: '#2B3274', glow: 'rgba(110,122,230,0.3)' },
}

/**
 * ATARDECER — ice and sky blue over a pearl ground, blue-black for depth, and a
 * vermilion / orange light that is never a fill: it is the edge of the glass,
 * a reflection, a halo. A prismatic hint (cyan) beside it. The first entry of
 * the day begins with APARICIÓN (see ../aparicion), on a stage of its own.
 */
const SUNSET: LearnTheme = {
  id: 'learn-sunset',
  ritual: 'aparicion',
  atmosphere: {
    tone: 'light',
    base: '#E5EDF8',
    halos: ['rgba(255,255,255,0.95)', 'rgba(140,184,238,0.55)', 'rgba(255,112,64,0.16)', 'rgba(196,232,255,0.5)'],
    particle: 'rgba(56,104,186,0.5)',
    glow: 'rgba(255,120,70,0.4)',
    accent: '#C8361F',
  },
  ink: { strong: '#0B1630', medium: '#1B2542', soft: '#2A3654', faint: '#374363', line: 'rgba(24,48,100,0.16)', label: '#8B1C1C', tabOn: '#8B1C1C' },
  light: {
    orbs: ['rgba(30,62,130,0.2)', 'rgba(255,255,255,0.7)', 'rgba(255,98,52,0.28)'],
    haze: 'rgba(255,255,255,0.5)',
    edge: 'rgba(20,40,96,0.14)',
    rim: 'rgba(255,92,48,0.66)',
    depth: 'rgba(8,30,86,0.34)',
    spec: 'rgba(255,255,255,0.9)',
    prism: 'rgba(110,220,255,0.55)',
    glow: 'rgba(255,120,84,0.5)',
    hot: 'rgba(255,238,220,0.95)',
    sea: 'rgba(122,164,208,0.55)',
    streak: 'rgba(255,255,255,0.8)',
    cloud: 'rgba(255,255,255,0.7)',
  },
  mark: { color: '#FF7452', glow: 'rgba(255,96,56,0.85)' },
  stage: { strong: '#F6F9FF', medium: '#DCE6F6', soft: '#B4C3DA' },
  scene: {
    white: '#FFFFFF',
    mist: '#EAF1F9',
    ice: '#CBE0F2',
    haze: '#86A7C2',
    sky: '#5FA8D6',
    steel: '#3C7096',
    teal: '#1B5C8A',
    deep: '#1B3245',
    night: '#071328',
    vermilion: '#FF4A28',
    coral: '#FF8264',
    ember: '#FF8A3D',
    hot: '#FFE6C8',
    peach: '#F4B9A0',
    cyan: '#6FE0FF',
    violet: '#8F7DFF',
    magenta: '#FF6EAF',
    garnet: '#8B1C1C',
  },
}

/**
 * NOCHE — deep, quiet, contemplative; amber, ember and peach as a light
 * inside the dark, never as a flat color over it.
 */
const NIGHT: LearnTheme = {
  id: 'learn-night',
  ritual: 'classic',
  atmosphere: {
    tone: 'deep',
    base: '#0A0E22',
    halos: ['rgba(255,150,92,0.16)', 'rgba(36,52,122,0.62)', 'rgba(255,112,64,0.22)', 'rgba(255,214,176,0.06)'],
    particle: 'rgba(255,214,176,0.75)',
    glow: 'rgba(255,140,80,0.5)',
    accent: '#FFB787',
  },
  ink: { strong: '#FBF3EA', medium: '#D9D2D9', soft: '#B1ACC2', faint: '#9A96B4', line: 'rgba(255,236,220,0.12)', label: '#D9D2D9', tabOn: '#FBF3EA' },
  light: {
    orbs: ['rgba(255,128,70,0.36)', 'rgba(70,96,190,0.26)', 'rgba(255,190,150,0.16)'],
    haze: 'rgba(255,200,160,0.06)',
    edge: 'rgba(2,3,12,0.6)',
    ...NO_RIM,
  },
  mark: { color: '#FFE3C7', glow: 'rgba(255,140,80,0.5)' },
}

/** The colors of a crossing of polarities (see crossing.ts): the extremes of the ink and the halo that holds the text while it crosses. */
export const CROSSING_COLORS = {
  dark: '#000000',
  light: '#FFFFFF',
  /** The halo behind dark text on a ground that is going dark… and behind light text on one going light. */
  haloOnLight: 'rgba(255,255,255,1)',
  haloOnDark: 'rgba(0,0,0,1)',
} as const

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
    '--learn-label': theme.ink.label,
    '--learn-tab-on': theme.ink.tabOn,
    '--learn-mark': theme.mark.color,
    '--learn-mark-glow': theme.mark.glow,
  }
}

/** What the APARICIÓN scene sets on itself: its colors, as tokens. */
export function sceneVars(scene: SceneColors): Record<string, string> {
  return Object.fromEntries(Object.entries(scene).map(([name, color]) => [`--apa-${name}`, color]))
}

/** What LearnLight sets on itself: its orbs, mist, edge, rim and fringe. */
export function learnLightVars(theme: LearnTheme): Record<string, string> {
  const [horizon, counter, side] = theme.light.orbs
  return {
    '--learn-orb-1': horizon,
    '--learn-orb-2': counter,
    '--learn-orb-3': side,
    '--learn-haze': theme.light.haze,
    '--learn-edge': theme.light.edge,
    '--learn-rim': theme.light.rim,
    '--learn-depth': theme.light.depth,
    '--learn-spec': theme.light.spec,
    '--learn-prism': theme.light.prism,
    '--learn-glow': theme.light.glow,
    '--learn-hot': theme.light.hot,
    '--learn-sea': theme.light.sea,
    '--learn-streak': theme.light.streak,
    '--learn-cloud': theme.light.cloud,
  }
}
