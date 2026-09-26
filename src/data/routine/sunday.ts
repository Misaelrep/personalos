import type { Rotation } from '../../domain/routine'
import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/**
 * DOMINGO — Profundización. 17:00–21:00 is one great period of deep work with
 * a single rest (19:00–19:30): nothing else goes in there.
 */
export const sunday: DayRoutine = {
  weekday: 0,
  dayName: 'Domingo',
  theme: 'Profundización',
  // 09:30 is Formación Breathwork on this day: no rescue slot is assumed.
  meditation: { blockId: 'sun-meditation-0600' },
  blocks: [
    block('sun-meditation-0600', '06:00', '06:30', 'Meditación', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('sun-walk-0630', '06:30', '07:00', 'Caminata', 'body', 'activacion'),
    block('sun-english-0700', '07:00', '08:15', 'Inglés', 'learning', 'activacion'),
    block('sun-breathwork-0825', '08:25', '08:28', 'Breathwork energizante', 'ritual', 'activacion', { shortTitle: 'Breathwork', descriptor: 'Respiración' }),
    block('sun-email-0830', '08:30', '09:30', 'Correo', 'admin', 'activacion', { descriptor: 'Excepción al bloqueo de inputs' }),
    block('sun-breathwork-training-0930', '09:30', '10:00', 'Formación Breathwork', 'learning', 'activacion'),
    block('sun-transition-1000', '10:00', '10:30', 'Transición', 'transition', 'activacion'),
    block('sun-gym-1030', '10:30', '12:30', 'Gimnasio', 'body', 'cuerpo'),
    block('sun-transition-1230', '12:30', '13:00', 'Transición', 'transition', 'recuperacion'),
    // Its content comes from SUNDAY_DEEP_ROTATION for the week (see config.ts); this is how it reads while undecided.
    block('sun-rotation-1300', '13:00', '16:00', 'Trabajo profundo rotativo', 'deep_work', 'produccion', {
      shortTitle: 'Trabajo rotativo',
      subtitle: 'Newsletter / Páginas Web',
      descriptor: 'Variante de esta semana sin definir',
      dayscapeRole: 'major',
      metadata: { rotation: 'sunday-deep' },
    }),
    block('sun-merkaba-1600', '16:00', '16:20', 'Merkaba', 'ritual', 'recuperacion', { descriptor: 'Meditación' }),
    block('sun-law-1620', '16:20', '16:45', 'Derecho', 'learning', 'produccion'),
    block('sun-velocity-1645', '16:45', '17:00', 'Velocity', 'learning', 'recuperacion', { descriptor: 'Recuperación cognitiva' }),
    block('sun-wellness-1700', '17:00', '19:00', 'Nueva Marca Wellness', 'deep_work', 'produccion', {
      shortTitle: 'Marca Wellness',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('sun-rest-1900', '19:00', '19:30', 'Descanso', 'recovery', 'recuperacion', { descriptor: 'Único descanso' }),
    block('sun-wellness-1930', '19:30', '21:00', 'Nueva Marca Wellness', 'deep_work', 'segundo-pico', {
      shortTitle: 'Marca Wellness',
      project: 'wellness',
      dayscapeRole: 'major',
    }),
    block('sun-reading-2100', '21:00', '21:45', 'Lectura / descanso', 'recovery', 'cierre', { shortTitle: 'Lectura' }),
    block('sun-breathwork-relax-2145', '21:45', '22:00', 'Breathwork relajante', 'ritual', 'cierre', { descriptor: 'Respiración' }),
    block('sun-sleep-2200', '22:00', undefined, 'Dormir', 'sleep', 'cierre'),
  ],
}

/**
 * DEFINITION of the Sunday 13:00–16:00 rotation: it alternates week by week,
 * A then B. WHICH week is A is not decided here — see config.ts.
 */
export const SUNDAY_DEEP_ROTATION: Rotation = {
  id: 'sunday-deep',
  blockId: 'sun-rotation-1300',
  variants: [
    {
      key: 'newsletter',
      patch: {
        title: 'Newsletter',
        shortTitle: 'Newsletter',
        subtitle: 'Trabajo profundo rotativo',
        descriptor: 'Trabajo profundo · creativo',
        project: 'newsletter',
      },
    },
    {
      key: 'web',
      patch: {
        title: 'Páginas Web',
        shortTitle: 'Páginas Web',
        subtitle: 'Trabajo profundo rotativo',
        descriptor: 'Trabajo profundo',
        project: 'web',
      },
    },
  ],
}
