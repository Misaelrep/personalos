import type { RequirementState } from '../domain/derive'
import type { ApprovalState, ConditionState, RequirementKind, VerificationState, WorkClass } from '../domain/types'
import type { DossierField } from '../import/plan'
import type { Stage } from './view'

/** P4a · The words the screens use. One place, so a state always reads the same. */

export const STAGE_LABEL: Record<Stage, string> = {
  lista: 'Se puede hacer ya',
  'por-verificar': 'Falta comprobar algo',
  bloqueada: 'No puede avanzar todavía',
  'por-clasificar': 'Estado por aclarar',
  'en-aprobacion': 'Espera tu visto bueno',
  cerrada: 'Cerrada',
}

/** E1 · The same states, short enough for a chip next to a task title. */
export const STAGE_CHIP: Record<Stage, string> = {
  lista: 'Se puede hacer',
  'por-verificar': 'Comprobar',
  bloqueada: 'No puede avanzar',
  'por-clasificar': 'Por aclarar',
  'en-aprobacion': 'Visto bueno',
  cerrada: 'Cerrada',
}

export const STAGE_HINT: Record<Stage, string> = {
  lista: 'Nada la frena',
  'por-verificar': 'El dossier pide algo que nadie ha confirmado',
  bloqueada: 'Espera a otra tarea o a algo que no se cumple',
  'por-clasificar': 'El dossier usa una palabra que todavía no has aclarado',
  'en-aprobacion': 'Está hecha; falta tu decisión',
  cerrada: 'Hecha o descartada',
}

export const WORK_CLASS_LABEL: Record<WorkClass, string> = {
  'sin-decidir': 'sin decidir',
  pendiente: 'pendiente',
  'en-curso': 'en curso',
  'en-espera': 'en espera',
  ejecutada: 'ejecutada',
  descartada: 'descartada',
}

export const APPROVAL_LABEL: Record<ApprovalState, string> = {
  'sin-dato': 'Sin dato',
  'no-requiere': 'No requiere',
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  devuelta: 'Devuelta',
}

export const VERIFICATION_LABEL: Record<VerificationState | 'sin-dato', string> = {
  verificada: 'Verificada',
  'sin-verificar': 'Sin verificar',
  'no-consta': 'No consta',
  'sin-dato': 'Sin dato',
}

export const REQUIREMENT_STATE_LABEL: Record<RequirementState, string> = {
  cumplido: 'Cumplido',
  pendiente: 'Pendiente',
  'por-verificar': 'Por verificar',
  'no-cumplido': 'No cumplido',
}

export const CONDITION_LABEL: Record<ConditionState, string> = {
  'por-verificar': 'por verificar',
  cumplida: 'cumplida',
  'no-cumplida': 'no cumplida',
}

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  tarea: 'tarea',
  alternativa: 'alternativa',
  condicional: 'condicional',
  externo: 'externo',
  recurso: 'recurso',
  mixto: 'mixto',
}

export const FIELD_LABEL: Record<DossierField, string> = {
  title: 'Tarea',
  status: 'Estado',
  acceptance: 'Hecho cuando…',
  area: 'Área',
  deliverable: 'Entregable',
  estimate: 'Tiempo humano',
  delegation: 'Agente posible',
  sourceRefs: 'Fuente',
  requirements: 'Dependencia',
  approvalOriginal: 'Aprobación',
  priority: 'Prioridad',
  extra: 'Otros campos',
}

/** A field value from the import plan, as one readable line. */
export function fieldText(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.length ? v.map(fieldText).join(' · ') : '—'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.literal === 'string') return o.literal
    return Object.entries(o)
      .map(([k, x]) => `${k}: ${fieldText(x)}`)
      .join(' · ')
  }
  return String(v)
}

export const shortHash = (h: string | undefined) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '—')

export function dateTime(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
