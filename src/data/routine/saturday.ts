import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/** SÁBADO — Máximo rendimiento creativo / estratégico. No gym, no night breathwork. */
export const saturday: DayRoutine = {
  weekday: 6,
  dayName: 'Sábado',
  theme: 'Máximo rendimiento creativo / estratégico',
  // No block starts at 09:30 on this day: the meditation has no rescue.
  meditation: { blockId: 'sat-meditation-0600' },
  blocks: [
    block('sat-meditation-0600', '06:00', '06:30', 'Meditación', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('sat-walk-0630', '06:30', '07:00', 'Caminata', 'body', 'activacion'),
    block('sat-english-0700', '07:00', '08:15', 'Inglés', 'learning', 'activacion'),
    block('sat-substack-0830', '08:30', '08:35', 'Substack', 'admin', 'activacion', {
      descriptor: 'Publicar ensayo',
      project: 'substack',
      metadata: { publication: true },
    }),
    block('sat-breakfast-0835', '08:35', '09:00', 'Desayuno / transición', 'recovery', 'activacion', { shortTitle: 'Desayuno' }),
    block('sat-reading-0900', '09:00', '09:45', 'Lectura', 'learning', 'activacion'),
    block('sat-web-1000', '10:00', '12:00', 'Páginas Web', 'deep_work', 'focus', { project: 'web', dayscapeRole: 'major' }),
    // One block, one main activity. Biotron is its alternative, never a second obligation nor a split of the time.
    block('sat-touchdesigner-1200', '12:00', '13:20', 'TouchDesigner', 'creative_practice', 'focus', {
      descriptor: 'Práctica técnica / creativa',
      project: 'touchdesigner',
      focusEligible: true,
      dayscapeRole: 'major',
      secondaryOption: { title: 'Biotron', description: 'Sesión creativa / experimentación', project: 'biotron' },
    }),
    block('sat-transition-1320', '13:20', '13:30', 'Transición', 'transition', 'recuperacion'),
    block('sat-finances-1330', '13:30', '13:45', 'Finanzas personales', 'admin', 'produccion', { project: 'finances' }),
    block('sat-prep-1345', '13:45', '14:00', 'Preparación / transición', 'transition', 'recuperacion'),
    block('sat-wellness-1400', '14:00', '16:00', 'Nueva Marca Wellness', 'deep_work', 'produccion', {
      shortTitle: 'Marca Wellness',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('sat-merkaba-1600', '16:00', '16:20', 'Merkaba', 'ritual', 'recuperacion', { descriptor: 'Meditación' }),
    block('sat-wellness-1620', '16:20', '18:20', 'Nueva Marca Wellness', 'deep_work', 'produccion', {
      shortTitle: 'Marca Wellness',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('sat-protege-1820', '18:20', '18:40', 'PROTEGE', 'learning', 'produccion'),
    block('sat-velocity-1840', '18:40', '18:55', 'Velocity', 'learning', 'recuperacion', { descriptor: 'Recuperación cognitiva' }),
    block('sat-transition-1855', '18:55', '19:00', 'Transición', 'transition', 'recuperacion'),
    block('sat-newsletter-1900', '19:00', '20:20', 'Newsletter', 'deep_work', 'segundo-pico', {
      descriptor: 'Trabajo profundo · creativo',
      project: 'newsletter',
      dayscapeRole: 'major',
    }),
    block('sat-jets-2020', '20:20', '20:50', 'Jets', 'admin', 'segundo-pico', { project: 'jets' }),
    block('sat-rest-2050', '20:50', '21:00', 'Descanso', 'recovery', 'cierre'),
    block('sat-web-2100', '21:00', '22:00', 'Páginas Web / ejecución', 'deep_work', 'segundo-pico', {
      shortTitle: 'Web · ejecución',
      descriptor: 'Ejecución',
      project: 'web',
      dayscapeRole: 'major',
    }),
    block('sat-sleep-2200', '22:00', undefined, 'Cierre / dormir', 'sleep', 'cierre', { shortTitle: 'Dormir' }),
  ],
}
