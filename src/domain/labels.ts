import type { BlockCategory, ScheduledBlock } from './types'

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  deep_work: 'Trabajo profundo',
  learning: 'Aprendizaje',
  ritual: 'Ritual',
  creative_practice: 'Práctica creativa',
  body: 'Cuerpo',
  recovery: 'Recuperación',
  transition: 'Transición',
  admin: 'Gestión',
  reflection: 'Reflexión',
  sleep: 'Descanso',
  free: 'Libre',
}

/** "Trabajo profundo", or the block's own descriptor. */
export function natureLabel(block: Pick<ScheduledBlock, 'category' | 'descriptor'>): string {
  return block.descriptor ?? CATEGORY_LABEL[block.category]
}

/** "MVP / Testeo · Trabajo profundo" */
export function blockDescription(block: ScheduledBlock): string {
  const parts = [block.subtitle, natureLabel(block)]
  if (block.replaces) parts.push(`Sustituye a ${block.replaces}`)
  return parts.filter(Boolean).join(' · ')
}

export function blockName(block: ScheduledBlock): string {
  return block.shortTitle ?? block.title
}

/** "Alternativa: Biotron · sesión creativa / experimentación" — never a second obligation. */
export function alternativeLine(block: Pick<ScheduledBlock, 'secondaryOption'>): string | undefined {
  const option = block.secondaryOption
  if (!option) return undefined
  const description = option.description ? ` · ${option.description.charAt(0).toLowerCase()}${option.description.slice(1)}` : ''
  return `Alternativa: ${option.title}${description}`
}

/** Human line for a resolved block. */
export function resolutionLine(block: ScheduledBlock): string {
  const { status, record } = block
  if (status === 'omitido') return 'Omitido'
  if (status === 'parcial') return 'Parcial'
  if (status === 'completado') {
    if (record.outcome === 'si') return 'Completado · resultado conseguido'
    if (record.outcome === 'no') return 'Completado · resultado no conseguido'
    return 'Completado'
  }
  return ''
}

/** Blocks that only inform; HOY offers no actions on them (not registered, no Focus). */
export function isPassive(block: ScheduledBlock): boolean {
  return Boolean(block.synthetic) || (!block.focusEligible && !block.countsForProgress)
}
