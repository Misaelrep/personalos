/**
 * Top-level sections of ELYUM. HOY, SEMANA and APRENDER exist; the others are
 * listed so the navigation structure can be validated.
 */
export type SectionId = 'hoy' | 'semana' | 'aprender' | 'sistema'

export interface Section {
  id: SectionId
  label: string
  available: boolean
}

export const SECTIONS: Section[] = [
  { id: 'hoy', label: 'Hoy', available: true },
  { id: 'semana', label: 'Semana', available: true },
  { id: 'aprender', label: 'Aprender', available: true },
  { id: 'sistema', label: 'Sistema', available: false },
]
