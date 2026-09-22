import type { BlockKind, ScheduledBlock } from './types'

const KIND_LABEL: Record<BlockKind, string> = {
  deep: 'Trabajo profundo',
  practice: 'Práctica diaria',
  ritual: 'Ritual',
  recovery: 'Recuperación',
  body: 'Cuerpo',
  transition: 'Transición',
  sleep: 'Descanso',
}

/** "MVP / Testeo · Trabajo profundo" */
export function blockDescription(block: ScheduledBlock): string {
  const parts = [block.subtitle, block.descriptor ?? KIND_LABEL[block.kind]]
  if (block.replaces) parts.push(`Sustituye a ${block.replaces}`)
  return parts.filter(Boolean).join(' · ')
}

export function blockName(block: ScheduledBlock): string {
  return block.shortTitle ?? block.title
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

/** Blocks that only inform; HOY offers no actions on them. */
export function isPassive(block: ScheduledBlock): boolean {
  return block.kind === 'transition' || block.kind === 'sleep' || Boolean(block.synthetic)
}
