import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/** MIÉRCOLES — Wellness + Web + Newsletter. */
export const wednesday: DayRoutine = {
  weekday: 3,
  dayName: 'Miércoles',
  theme: 'Wellness + Web + Newsletter',
  meditation: { blockId: 'wed-meditation-0600', rescueBlockId: 'wed-reading-0930' },
  blocks: [
    block('wed-meditation-0600', '06:00', '06:30', 'Meditación', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('wed-transfer-0630', '06:30', '08:00', 'Llevar hermana / regreso', 'transition', 'activacion', { descriptor: 'Traslado' }),
    block('wed-english-0800', '08:00', '08:25', 'Inglés', 'learning', 'activacion'),
    block('wed-breathwork-0825', '08:25', '08:28', 'Breathwork energizante', 'ritual', 'activacion', { shortTitle: 'Breathwork', descriptor: 'Respiración' }),
    block('wed-substack-0830', '08:30', '08:35', 'Substack', 'admin', 'activacion', {
      descriptor: 'Publicación',
      project: 'substack',
      metadata: { publication: true },
    }),
    block('wed-breakfast-0835', '08:35', '09:30', 'Desayuno', 'recovery', 'activacion'),
    block('wed-reading-0930', '09:30', '09:55', 'Lectura', 'learning', 'activacion'),
    block('wed-wellness-1000', '10:00', '12:00', 'Nueva Marca Wellness', 'deep_work', 'focus', {
      shortTitle: 'Marca Wellness',
      descriptor: 'Trabajo profundo · incluye AI Polaris',
      project: 'wellness',
      dayscapeRole: 'major',
      includes: [{ title: 'AI Polaris', minutes: 60, project: 'polaris' }],
    }),
    block('wed-velocity-1200', '12:00', '12:15', 'Velocity', 'learning', 'recuperacion', { descriptor: 'Recuperación cognitiva' }),
    block('wed-english-1215', '12:15', '13:15', 'Inglés', 'learning', 'produccion'),
    block('wed-protege-1315', '13:15', '13:35', 'PROTEGE', 'learning', 'produccion'),
    block('wed-law-1335', '13:35', '14:00', 'Derecho', 'learning', 'produccion'),
    block('wed-web-1400', '14:00', '15:30', 'Páginas Web', 'deep_work', 'produccion', { project: 'web', dayscapeRole: 'major' }),
    block('wed-jets-1530', '15:30', '16:00', 'Jets', 'admin', 'produccion', { project: 'jets' }),
    block('wed-gym-1600', '16:00', '18:00', 'Gimnasio', 'body', 'cuerpo'),
    block('wed-recovery-1800', '18:00', '19:00', 'Recuperación', 'recovery', 'recuperacion'),
    block('wed-newsletter-1900', '19:00', '20:50', 'Newsletter / contenido', 'deep_work', 'segundo-pico', {
      shortTitle: 'Newsletter',
      descriptor: 'Trabajo profundo · creativo',
      project: 'newsletter',
      dayscapeRole: 'major',
    }),
    // Point in time: the screens go off at 20:50 and stay off until the breathwork.
    block('wed-screens-off-2050', '20:50', undefined, 'Cierre digital', 'ritual', 'cierre'),
    block('wed-breathwork-relax-2145', '21:45', '22:00', 'Breathwork relajante', 'ritual', 'cierre', { descriptor: 'Respiración' }),
    block('wed-sleep-2200', '22:00', undefined, 'Dormir', 'sleep', 'cierre'),
  ],
}
