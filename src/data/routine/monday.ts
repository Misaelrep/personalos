import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/** LUNES — Wellness + Web + Newsletter. */
export const monday: DayRoutine = {
  weekday: 1,
  dayName: 'Lunes',
  theme: 'Wellness + Web + Newsletter',
  meditation: { blockId: 'mon-meditation-0600', rescueBlockId: 'mon-reading-0930' },
  blocks: [
    block('mon-meditation-0600', '06:00', '06:30', 'Meditación', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('mon-transfer-0630', '06:30', '08:00', 'Llevar hermana / regreso', 'transition', 'activacion', { descriptor: 'Traslado' }),
    block('mon-english-0800', '08:00', '08:25', 'Inglés', 'learning', 'activacion'),
    block('mon-breathwork-0825', '08:25', '08:28', 'Breathwork energizante', 'ritual', 'activacion', { shortTitle: 'Breathwork', descriptor: 'Respiración' }),
    block('mon-substack-0830', '08:30', '08:35', 'Substack', 'admin', 'activacion', {
      descriptor: 'Publicación',
      project: 'substack',
      metadata: { publication: true },
    }),
    block('mon-breakfast-0835', '08:35', '09:30', 'Desayuno', 'recovery', 'activacion'),
    block('mon-reading-0930', '09:30', '09:55', 'Lectura', 'learning', 'activacion'),
    block('mon-wellness-1000', '10:00', '12:00', 'Nueva Marca Wellness', 'deep_work', 'focus', {
      shortTitle: 'Marca Wellness',
      descriptor: 'Trabajo profundo · incluye AI Polaris',
      project: 'wellness',
      dayscapeRole: 'major',
      includes: [{ title: 'AI Polaris', minutes: 60, project: 'polaris' }],
    }),
    block('mon-velocity-1200', '12:00', '12:15', 'Velocity', 'learning', 'recuperacion', { descriptor: 'Recuperación cognitiva' }),
    block('mon-english-1215', '12:15', '13:15', 'Inglés', 'learning', 'produccion'),
    block('mon-protege-1315', '13:15', '13:35', 'PROTEGE', 'learning', 'produccion'),
    block('mon-breathwork-training-1335', '13:35', '14:00', 'Formación Breathwork', 'learning', 'produccion'),
    block('mon-web-1400', '14:00', '15:30', 'Páginas Web', 'deep_work', 'produccion', { project: 'web', dayscapeRole: 'major' }),
    block('mon-jets-1530', '15:30', '16:00', 'Jets', 'admin', 'produccion', { project: 'jets' }),
    block('mon-gym-1600', '16:00', '18:00', 'Gimnasio', 'body', 'cuerpo'),
    block('mon-recovery-1800', '18:00', '19:00', 'Comida / ducha / recuperación', 'recovery', 'recuperacion', { shortTitle: 'Comida / ducha' }),
    block('mon-newsletter-1900', '19:00', '20:50', 'Newsletter / Substack', 'deep_work', 'segundo-pico', {
      shortTitle: 'Newsletter',
      descriptor: 'Trabajo profundo · creativo',
      project: 'newsletter',
      dayscapeRole: 'major',
    }),
    block('mon-screens-off-2050', '20:50', '21:00', 'Cierre digital', 'ritual', 'cierre'),
    block('mon-reading-2100', '21:00', '21:25', 'Lectura', 'learning', 'cierre'),
    block('mon-breathwork-relax-2145', '21:45', '22:00', 'Breathwork relajante', 'ritual', 'cierre', { descriptor: 'Respiración' }),
    block('mon-sleep-2200', '22:00', undefined, 'Dormir', 'sleep', 'cierre'),
  ],
}
