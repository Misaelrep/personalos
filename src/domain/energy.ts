import type { EnergyState } from './types'

export const ENERGY_LABEL: Record<EnergyState, string> = {
  activacion: 'Activación',
  focus: 'Focus',
  recuperacion: 'Recuperación',
  produccion: 'Producción',
  cuerpo: 'Cuerpo',
  'segundo-pico': 'Segundo pico',
  cierre: 'Cierre',
}

