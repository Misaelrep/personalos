import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/** MARTES — Web + Wellness. Merkaba replaces the meditation. No PROTEGE, Derecho or Formación Breathwork. */
export const tuesday: DayRoutine = {
  weekday: 2,
  dayName: 'Martes',
  theme: 'Web + Wellness',
  meditation: { blockId: 'tue-merkaba-0600', rescueBlockId: 'tue-reading-0930' },
  blocks: [
    block('tue-merkaba-0600', '06:00', '06:30', 'Merkaba', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('tue-transfer-0630', '06:30', '08:00', 'Llevar hermana / regreso', 'transition', 'activacion', { descriptor: 'Traslado' }),
    block('tue-writing-0800', '08:00', '08:25', 'Escritura', 'creative_practice', 'activacion'),
    block('tue-breathwork-0825', '08:25', '08:28', 'Breathwork energizante', 'ritual', 'activacion', { shortTitle: 'Breathwork', descriptor: 'Respiración' }),
    block('tue-substack-0830', '08:30', '08:35', 'Substack', 'admin', 'activacion', {
      descriptor: 'Publicación',
      project: 'substack',
      metadata: { publication: true },
    }),
    block('tue-english-0835', '08:35', '09:15', 'Inglés', 'learning', 'activacion'),
    block('tue-pause-0915', '09:15', '09:30', 'Pausa', 'recovery', 'activacion'),
    block('tue-reading-0930', '09:30', '10:00', 'Lectura', 'learning', 'activacion'),
    block('tue-web-1000', '10:00', '12:00', 'Páginas Web', 'deep_work', 'focus', {
      subtitle: 'MVP / Testeo',
      descriptor: 'Trabajo profundo',
      project: 'web',
      dayscapeRole: 'major',
    }),
    block('tue-velocity-1200', '12:00', '12:20', 'Velocity', 'learning', 'recuperacion', { descriptor: 'Recuperación cognitiva' }),
    block('tue-meal-1220', '12:20', '14:00', 'Alimentación / recuperación / libre', 'recovery', 'recuperacion', { shortTitle: 'Alimentación / recuperación' }),
    block('tue-wellness-1400', '14:00', '16:00', 'Nueva Marca Wellness', 'deep_work', 'produccion', {
      shortTitle: 'Marca Wellness',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('tue-gym-1600', '16:00', '18:00', 'Gimnasio', 'body', 'cuerpo'),
    block('tue-shower-1800', '18:00', '19:00', 'Ducha / comida / transición', 'transition', 'recuperacion', { shortTitle: 'Ducha / comida' }),
    block('tue-wellness-1900', '19:00', '20:50', 'Nueva Marca Wellness', 'deep_work', 'segundo-pico', {
      shortTitle: 'Marca Wellness',
      descriptor: 'Segundo pico cognitivo',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('tue-screens-off-2050', '20:50', '21:45', 'Cierre digital / descanso sin pantallas', 'recovery', 'cierre', { shortTitle: 'Cierre digital' }),
    block('tue-breathwork-relax-2145', '21:45', '22:00', 'Breathwork relajante', 'ritual', 'cierre', { descriptor: 'Respiración' }),
    block('tue-sleep-2200', '22:00', undefined, 'Dormir', 'sleep', 'cierre'),
  ],
}
