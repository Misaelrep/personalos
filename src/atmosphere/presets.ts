import type { EnergyState } from '../domain/types'

/**
 * LA ESTRUCTURA PERMANECE ESTABLE. LA ATMÓSFERA EVOLUCIONA.
 *
 * Each preset only changes light: base color, the four Astral Fade halos,
 * particle tint and a small accent. Layout never depends on the preset.
 */
export type Tone = 'light' | 'deep'

export interface AtmospherePreset {
  tone: Tone
  base: string
  /** Halo colors: [main light source, counter light, low accent, crossing beam]. */
  halos: [string, string, string, string]
  particle: string
  /** Glow around each particle. Defaults to the particle color. */
  glow?: string
  accent: string
}

export type AtmosphereKey = EnergyState | 'focus-session' | 'exhale'

export const PRESETS: Record<AtmosphereKey, AtmospherePreset> = {
  // HOY (light states) share a pearl ground: white light, silver reflections,
  // ice blue. Each state keeps its own hue in the counter light (halo 2).
  // Particles become small glints: a white core with a cool halo.

  // blanco + azul frío
  activacion: {
    tone: 'light',
    base: '#EFF3F9',
    halos: ['rgba(255,255,255,0.95)', 'rgba(190,214,248,0.62)', 'rgba(216,231,250,0.55)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(255,255,255,0.95)',
    glow: 'rgba(150,185,235,0.75)',
    accent: '#3A82F6',
  },
  // azul profundo + azul eléctrico (en HOY se mantiene claro, con luz más intensa)
  focus: {
    tone: 'light',
    base: '#EEF2F9',
    halos: ['rgba(255,255,255,0.92)', 'rgba(150,188,248,0.55)', 'rgba(216,231,250,0.6)', 'rgba(255,255,255,0.88)'],
    particle: 'rgba(255,255,255,0.95)',
    glow: 'rgba(120,165,235,0.75)',
    accent: '#3A82F6',
  },
  // blanco + lavanda
  recuperacion: {
    tone: 'light',
    base: '#F2F2F9',
    halos: ['rgba(255,255,255,0.95)', 'rgba(208,198,250,0.55)', 'rgba(216,231,250,0.45)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(255,255,255,0.95)',
    glow: 'rgba(170,150,240,0.7)',
    accent: '#8B6CF0',
  },
  // blanco + azul limpio
  produccion: {
    tone: 'light',
    base: '#EFF3F9',
    halos: ['rgba(255,255,255,0.95)', 'rgba(176,206,250,0.58)', 'rgba(220,227,234,0.5)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(255,255,255,0.95)',
    glow: 'rgba(140,180,235,0.75)',
    accent: '#3A82F6',
  },
  // muy neutro / limpio
  cuerpo: {
    tone: 'light',
    base: '#F0F3F7',
    halos: ['rgba(255,255,255,0.95)', 'rgba(220,227,234,0.6)', 'rgba(216,231,250,0.35)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(255,255,255,0.95)',
    glow: 'rgba(150,165,190,0.7)',
    accent: '#5B6F8F',
  },
  // azul + violeta
  'segundo-pico': {
    tone: 'light',
    base: '#F0F1F9',
    halos: ['rgba(255,255,255,0.92)', 'rgba(172,190,250,0.55)', 'rgba(204,190,250,0.5)', 'rgba(255,255,255,0.88)'],
    particle: 'rgba(255,255,255,0.95)',
    glow: 'rgba(150,140,240,0.72)',
    accent: '#5B6CF0',
  },
  // azul profundo + naranja cálido extremadamente tenue
  cierre: {
    tone: 'deep',
    base: '#081A32',
    halos: ['rgba(58,130,246,0.22)', 'rgba(16,39,70,0.90)', 'rgba(255,147,77,0.10)', 'rgba(105,165,255,0.08)'],
    particle: 'rgba(255,216,183,0.55)',
    accent: '#FFB787',
  },
  // Focus activo: la atmósfera más profunda del sistema.
  'focus-session': {
    tone: 'deep',
    base: '#071629',
    halos: ['rgba(58,130,246,0.36)', 'rgba(16,39,70,0.85)', 'rgba(105,165,255,0.18)', 'rgba(58,130,246,0.10)'],
    particle: 'rgba(156,195,255,0.85)',
    accent: '#69A5FF',
  },
  // Salida de Focus: exhalación, luz clara y abierta.
  exhale: {
    tone: 'light',
    base: '#F7F9FC',
    halos: ['rgba(105,165,255,0.26)', 'rgba(167,139,250,0.20)', 'rgba(255,216,183,0.16)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(105,165,255,0.55)',
    accent: '#3A82F6',
  },
}
