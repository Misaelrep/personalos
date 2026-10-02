import type { DayOverride } from '../../domain/routine'
import type { DayRoutine } from '../../domain/types'
import { block } from './define'

/**
 * JUEVES — Regeneración. Not a day to catch up.
 * Hard rules: no projects, no meetings, no recovering pending work, no
 * filling the gaps. The open space is intentional: few, wide blocks.
 */
export const thursday: DayRoutine = {
  weekday: 4,
  dayName: 'Jueves',
  theme: 'Regeneración',
  // No 09:30 slot on this day: the morning is open, so the meditation has no rescue.
  meditation: { blockId: 'thu-meditation-0600' },
  blocks: [
    block('thu-meditation-0600', '06:00', '06:30', 'Meditación', 'ritual', 'activacion', { descriptor: 'Meditación prioritaria' }),
    block('thu-transfer-0630', '06:30', '08:00', 'Llevar hermana / regreso', 'transition', 'activacion', { descriptor: 'Traslado' }),
    block('thu-breathwork-0825', '08:25', '08:28', 'Breathwork energizante', 'ritual', 'activacion', { shortTitle: 'Breathwork', descriptor: 'Respiración' }),
    block('thu-rest-0830', '08:30', '12:00', 'Desayuno / silencio / descanso', 'free', 'recuperacion', {
      shortTitle: 'Desayuno / silencio',
      subtitle: 'Lectura · naturaleza · caminata · introspección',
      descriptor: 'Regeneración',
      dayscapeRole: 'space',
      // Possibilities for the morning, never an agenda.
      metadata: { possibilities: ['Lectura', 'Naturaleza', 'Caminata', 'Introspección'] },
    }),
    block('thu-free-1200', '12:00', '16:00', 'Regeneración / libre', 'free', 'recuperacion', { shortTitle: 'Regeneración', descriptor: 'Regeneración', dayscapeRole: 'space' }),
    block('thu-gym-1600', '16:00', '18:00', 'Gimnasio', 'body', 'cuerpo'),
    block('thu-free-1800', '18:00', '20:50', 'Regeneración / libre', 'free', 'recuperacion', { shortTitle: 'Regeneración', descriptor: 'Regeneración', dayscapeRole: 'space' }),
    // Point in time: the screens go off at 20:50 and stay off until the breathwork.
    block('thu-screens-off-2050', '20:50', undefined, 'Cierre digital', 'ritual', 'cierre'),
    block('thu-breathwork-relax-2145', '21:45', '22:00', 'Breathwork relajante', 'ritual', 'cierre', { descriptor: 'Respiración' }),
    block('thu-sleep-2200', '22:00', undefined, 'Dormir', 'sleep', 'cierre'),
  ],
}

/**
 * monthlyThursdayNoGym — one Thursday a month also drops the gym: the whole
 * afternoon becomes one open space. Which Thursday is decided in
 * `config.ts` (THURSDAYS_WITHOUT_GYM), never here.
 */
export const THURSDAY_WITHOUT_GYM: DayOverride = {
  remove: ['thu-gym-1600', 'thu-free-1800'],
  patch: { 'thu-free-1200': { end: '20:50' } },
}
