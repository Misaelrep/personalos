import type { Rotation } from '../../domain/routine'
import type { DayRoutine, RoutineBlock } from '../../domain/types'
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
    // Resolved per date into Newsletter or Páginas Web (config.ts). This neutral reading only shows if no anchor is set.
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

export type SundayVariant = 'newsletter' | 'web'

/**
 * DEFINITION of the Sunday 13:00–16:00 rotation: what each week's variant is.
 * WHICH week gets which (anchor and order) is decided in config.ts.
 */
export const SUNDAY_DEEP_VARIANTS: Record<SundayVariant, Partial<RoutineBlock>> = {
  newsletter: {
    title: 'Newsletter',
    shortTitle: 'Newsletter',
    subtitle: undefined,
    descriptor: 'Trabajo profundo',
    project: 'newsletter',
  },
  web: {
    title: 'Páginas Web',
    shortTitle: 'Páginas Web',
    subtitle: undefined,
    descriptor: 'Trabajo profundo',
    project: 'web',
  },
}

export const sundayDeepRotation = (order: SundayVariant[]): Rotation => ({
  id: 'sunday-deep',
  blockId: 'sun-rotation-1300',
  variants: order.map((key) => ({ key, patch: SUNDAY_DEEP_VARIANTS[key] })),
})
