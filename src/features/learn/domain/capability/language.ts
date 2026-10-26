import type { SkillDimensions } from './dimensions'
import type { GapReason } from './gaps'
import type { NextTestKind } from './nextTest'
import type { Autonomy, ContextRelation, CriterionVerdict, Dimension, Evidence, Skill } from './model'
import type { TemplateFields } from './validate'

/**
 * The words of DESARROLLAR — fixed Spanish templates filled with the person's own text. No generated language, no
 * percentages, no levels. Pure functions.
 */

export const AUTONOMY_LABEL: Record<Autonomy, string> = { GUIDED: 'Guiado', SUPPORTED: 'Apoyado', AUTONOMOUS: 'Autónomo' }
/** How the help reads inside a sentence ("…con guía"). */
export const AUTONOMY_PHRASE: Record<Autonomy, string> = { GUIDED: 'con guía', SUPPORTED: 'con apoyo puntual', AUTONOMOUS: 'de forma autónoma' }
export const AUTONOMY_HINT: Record<Autonomy, string> = {
  GUIDED: 'Alguien o algo te lleva paso a paso.',
  SUPPORTED: 'Lo haces tú; consultas ayuda en algún momento.',
  AUTONOMOUS: 'Sin ayuda de nadie ni de nada.',
}
export const VERDICT_LABEL: Record<CriterionVerdict, string> = { MET: 'Sí', PARTIAL: 'En parte', NOT_MET: 'No' }
export const CONTEXT_LABEL: Record<ContextRelation, string> = { SAME: 'El mismo', VARIED: 'Uno variado', NOVEL: 'Uno nuevo' }
/** How the context reads inside a sentence. */
export const CONTEXT_PHRASE: Record<ContextRelation, string> = { SAME: 'en el mismo contexto', VARIED: 'en un contexto variado', NOVEL: 'en un contexto nuevo' }
export const CONTEXT_HINT: Record<ContextRelation, string> = {
  SAME: 'El contexto de la habilidad, tal como está definido.',
  VARIED: 'Parecido, con algo distinto.',
  NOVEL: 'Uno en el que no lo habías hecho nunca.',
}
export const DIMENSION_LABEL: Record<Dimension, string> = {
  COMPREHENSION: 'comprensión',
  EXECUTION: 'ejecución',
  AUTONOMY: 'autonomía',
  TRANSFER: 'transferencia',
  CONSISTENCY: 'consistencia',
}

const blank = (s: string, placeholder: string) => (s.trim() ? s.trim() : placeholder)
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "Ser capaz de [acción] para producir [resultado], en [contexto], cumpliendo [criterio], [con ayuda]." Missing parts stay as their placeholder. */
export function templateSentence(f: TemplateFields): string {
  return `Ser capaz de ${lower(blank(f.action, '[acción]'))} para producir ${lower(blank(f.result, '[resultado]'))}, en ${lower(blank(f.context, '[contexto]'))}, cumpliendo ${lower(blank(f.criterion, '[criterio]'))}, ${AUTONOMY_PHRASE[f.targetAutonomy]}.`
}

export const shortSkill = (s: Pick<Skill, 'action'>) => blank(s.action, '[acción]')

export function gapStatement(reason: GapReason, dimension: Dimension, skill: Skill, dims: SkillDimensions, best: Autonomy | undefined): string {
  switch (reason) {
    case 'NO_ATTEMPT':
      return 'No tenemos todavía un intento directo de esta habilidad.'
    case 'NO_DIRECT_ATTEMPT':
      return 'Solo hay un registro hecho después: falta un intento directo de esta habilidad.'
    case 'CONTRADICTION':
      return `Hay evidencia contradictoria sobre la ${DIMENSION_LABEL[dimension]}: necesitamos una prueba que la resuelva.`
    case 'CRITERION_NOT_MET':
      return `El resultado aún no cumple el criterio: «${skill.criterion.trim()}».`
    case 'AUTONOMY_BELOW_TARGET':
      return dims.AUTONOMY.status === 'NOT_YET'
        ? `Al intentarlo ${AUTONOMY_PHRASE[skill.targetAutonomy]}, el resultado aún no cumple el criterio.`
        : `Has producido el resultado ${AUTONOMY_PHRASE[best ?? 'GUIDED']}, pero todavía no existe evidencia de hacerlo ${AUTONOMY_PHRASE[skill.targetAutonomy]}.`
    case 'TRANSFER_UNKNOWN':
      return dims.TRANSFER.status === 'UNKNOWN' ? 'Solo existe evidencia en el contexto original.' : 'Ha funcionado fuera del contexto original, pero todavía no en uno nuevo.'
    case 'CONSISTENCY_UNKNOWN':
      return dims.CONSISTENCY.status === 'SUPPORTED'
        ? 'Ha salido bien en varios intentos, pero todavía no sabemos si se mantiene en otras ocasiones.'
        : 'Existe un resultado exitoso, pero todavía no sabemos si es consistente.'
  }
}

export function nextTestStatement(kind: NextTestKind, skill: Skill, t: { targetContext: ContextRelation; maxAssistance: Autonomy }, against?: Evidence): string {
  const act = lower(shortSkill(skill))
  const res = lower(blank(skill.result, '[resultado]'))
  switch (kind) {
    case 'BASE':
      return `Intenta ${act} para producir ${res}, en ${lower(blank(skill.context, '[contexto]'))}, antes de estudiar nada. Anota exactamente qué ocurre.`
    case 'FOCUS_CRITERION':
      return `Vuelve a intentar ${act}, esta vez centrado en el criterio: «${skill.criterion.trim()}». No uses más ayuda que la última vez.`
    case 'LESS_HELP':
      return `Haz lo mismo ${AUTONOMY_PHRASE[t.maxAssistance]}: ${act} para producir ${res}.`
    case 'TRANSFER':
      return t.targetContext === 'NOVEL'
        ? `Prueba a ${act} en un contexto en el que no lo hayas hecho nunca, con el mismo criterio.`
        : `Prueba a ${act} en un contexto parecido pero distinto del original, con el mismo criterio.`
    case 'REPEAT':
      return `Repítelo en otra ocasión: ${act} para producir ${res}.`
    case 'RESOLVE':
      return against
        ? `Reproduce las condiciones del intento que no salió (${CONTEXT_PHRASE[against.contextRelation]}, ${AUTONOMY_PHRASE[against.assistance]}): ${act} para producir ${res}.`
        : `Reproduce las condiciones en las que los resultados no coinciden: ${act} para producir ${res}.`
  }
}

/** LO QUE SABEMOS — only what the evidence says. */
export function whatWeKnow(skill: Skill, dims: SkillDimensions, evidence: readonly Evidence[], best: Autonomy | undefined): string[] {
  const mine = evidence.filter((e) => e.skillId === skill.id)
  const live = mine.filter((e) => e.capture === 'LIVE')
  const out: string[] = []
  const ex = dims.EXECUTION
  if (ex.status === 'NOT_YET') out.push(live.length === 1 ? 'Lo has intentado una vez y el resultado todavía no cumple el criterio.' : `Lo has intentado ${live.length} veces y el resultado todavía no cumple el criterio.`)
  const met = live.filter((e) => e.criterionVerdict === 'MET').length
  if (ex.status === 'SUPPORTED') out.push('Has cumplido el criterio en un intento directo.')
  if (ex.status === 'DEMONSTRATED') out.push(`Has cumplido el criterio en ${met} intentos directos, sin ninguno en contra.`)
  if (ex.status === 'MIXED') {
    const against = live.length - met
    out.push(`Has cumplido el criterio en ${met === 1 ? 'un intento' : `${met} intentos`}, y en ${against === 1 ? 'otro' : `otros ${against}`} no: los resultados no coinciden.`)
  }
  if (best) out.push(`Tu mejor resultado fue ${AUTONOMY_PHRASE[best]}.`)
  if (dims.TRANSFER.status === 'SUPPORTED' || dims.TRANSFER.status === 'DEMONSTRATED') out.push('Ha funcionado fuera del contexto original.')
  const retro = mine.filter((e) => e.capture === 'RETROSPECTIVE')
  if (retro.length) out.push(`Registraste ${retro.length === 1 ? 'un intento anterior' : `${retro.length} intentos anteriores`}: es un indicio débil, sin las condiciones de un intento directo.`)
  return out
}

/** LO QUE TODAVÍA NO SABEMOS — the dimensions without evidence that applies, said as questions still open. */
export function whatWeDontKnow(skill: Skill, dims: SkillDimensions): string[] {
  const out: string[] = []
  if (dims.EXECUTION.status === 'UNKNOWN') out.push('Si puedes producir el resultado cumpliendo el criterio.')
  if (dims.AUTONOMY.status === 'UNKNOWN') out.push(`Si puedes hacerlo ${AUTONOMY_PHRASE[skill.targetAutonomy]}.`)
  if (dims.TRANSFER.status === 'UNKNOWN') out.push('Si funciona fuera del contexto original.')
  if (dims.CONSISTENCY.status === 'UNKNOWN') out.push('Si el resultado se repite en otra ocasión.')
  out.push(
    dims.COMPREHENSION.note === 'EXPLANATION_UNVERIFIED'
      ? 'Si lo comprendes: tu explicación está guardada, pero todavía no hay forma de verificarla.'
      : 'Si lo comprendes: todavía no hay forma de comprobarlo.',
  )
  return out
}

/** Why something cannot go on yet — said as what is missing, never as a fault. */
export const ISSUE_TEXT: Record<import('./validate').Issue, string> = {
  MISSING_ACTION: 'Falta la acción: qué harías.',
  NOT_OBSERVABLE: '«Aprender», «saber» o «entender» no se pueden ver. ¿Qué harías para demostrarlo?',
  MISSING_RESULT: 'Falta el resultado: qué quedaría hecho al terminar.',
  RESULT_SAME_AS_ACTION: 'El resultado es lo que queda cuando terminas, no la acción repetida.',
  MISSING_CONTEXT: 'Falta el contexto: dónde, con qué o para quién.',
  MISSING_CRITERION: 'Falta el criterio: cómo sabrías que salió bien.',
  TOO_FEW_SKILLS: 'Hacen falta al menos 3 habilidades.',
  TOO_MANY_SKILLS: 'Como máximo, 7 habilidades.',
  DUPLICATE_SKILL: 'Esa habilidad ya está en la lista.',
  INVALID_SKILL: 'Alguna habilidad está incompleta.',
}

export function errorText(error: import('./commands').CapabilityError): string {
  switch (error.code) {
    case 'INVALID':
      return ISSUE_TEXT[error.issues[0]]
    case 'ACTIVE_LIMIT':
      return 'Ya hay 3 capacidades activas. Pausa una para activar esta.'
    case 'SUPERSEDED':
      return 'Esa es una versión anterior: se conserva tal como estaba.'
    case 'BAD_DATE':
      return 'Esa fecha no vale: un día real, no posterior a hoy.'
    case 'ATTEMPT_IN_PROGRESS':
      return 'Hay un intento en curso: regístralo o descártalo primero.'
    case 'INCOMPLETE_RECORD':
      return 'Falta algo: qué ocurrió, si cumplió el criterio, cuánta ayuda y qué contexto.'
    case 'MISSING_REASON':
      return 'Di por qué corriges el registro.'
    case 'NOT_ACTIVE':
      return 'Esta capacidad no está activa.'
    default:
      return 'No se pudo hacer.'
  }
}
