import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/** VIERNES — Cierre operativo + trabajo profundo + revisión. Substack is worked on, never published. */
export const friday: DayRoutine = {
  weekday: 5,
  dayName: 'Viernes',
  theme: 'Cierre operativo + trabajo profundo + revisión',
  // 09:30 falls inside Páginas Web: no rescue slot on this day.
  meditation: { blockId: 'fri-meditation-0600' },
  blocks: [
    block('fri-meditation-0600', '06:00', '06:30', 'Meditación', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('fri-transfer-0630', '06:30', '08:00', 'Llevar hermana / regreso', 'transition', 'activacion', { descriptor: 'Traslado' }),
    block('fri-web-0800', '08:00', '10:00', 'Páginas Web', 'deep_work', 'focus', {
      descriptor: 'Trabajo profundo',
      project: 'web',
      dayscapeRole: 'major',
    }),
    block('fri-polaris-1000', '10:00', '10:20', 'AI Polaris', 'learning', 'focus', { descriptor: 'Aprendizaje · estrategia', project: 'polaris' }),
    block('fri-wellness-1020', '10:20', '12:00', 'Nueva Marca Wellness', 'deep_work', 'focus', {
      shortTitle: 'Marca Wellness',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('fri-velocity-1200', '12:00', '12:15', 'Velocity', 'learning', 'recuperacion', { descriptor: 'Recuperación cognitiva' }),
    block('fri-protege-1215', '12:15', '12:35', 'PROTEGE', 'learning', 'produccion'),
    block('fri-law-1235', '12:35', '13:00', 'Derecho', 'learning', 'produccion'),
    block('fri-breathwork-training-1300', '13:00', '13:45', 'Formación Breathwork', 'learning', 'produccion'),
    block('fri-transition-1345', '13:45', '14:00', 'Transición', 'transition', 'recuperacion'),
    block('fri-newsletter-1400', '14:00', '16:00', 'Newsletter / Substack', 'deep_work', 'produccion', {
      shortTitle: 'Newsletter',
      descriptor: 'Trabajo · no publicación',
      project: 'newsletter',
      dayscapeRole: 'major',
      metadata: { publication: false },
    }),
    block('fri-rest-1600', '16:00', '16:30', 'Descanso', 'recovery', 'recuperacion'),
    block('fri-jets-1630', '16:30', '17:00', 'Jets', 'admin', 'produccion', { project: 'jets' }),
    block('fri-reading-1700', '17:00', '17:25', 'Lectura', 'learning', 'produccion'),
    block('fri-prep-1725', '17:25', '18:00', 'Preparación / comida', 'transition', 'recuperacion'),
    block('fri-gym-1800', '18:00', '20:00', 'Gimnasio', 'body', 'cuerpo'),
    block('fri-shower-2000', '20:00', '20:30', 'Ducha / transición', 'transition', 'recuperacion'),
    block('fri-introspection-2030', '20:30', '20:50', 'Introspección semanal', 'reflection', 'cierre'),
    // Point in time: the screens go off at 20:50 and stay off until the breathwork.
    block('fri-screens-off-2050', '20:50', undefined, 'Pantallas OFF', 'ritual', 'cierre'),
    block('fri-breathwork-relax-2145', '21:45', '22:00', 'Breathwork relajante', 'ritual', 'cierre', { descriptor: 'Respiración' }),
    block('fri-sleep-2200', '22:00', undefined, 'Dormir', 'sleep', 'cierre'),
  ],
}
