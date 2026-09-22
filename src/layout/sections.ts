/**
 * Top-level sections of the personal OS. Only HOY exists in this iteration;
 * the others are listed so the navigation structure can be validated.
 */
export interface Section {
  id: 'hoy' | 'semana' | 'aprender' | 'sistema'
  label: string
  available: boolean
}

export const SECTIONS: Section[] = [
  { id: 'hoy', label: 'Hoy', available: true },
  { id: 'semana', label: 'Semana', available: false },
  { id: 'aprender', label: 'Aprender', available: false },
  { id: 'sistema', label: 'Sistema', available: false },
]
