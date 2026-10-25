import { activateObjective, addSkill, confirmAttempt, createObjective, saveAttemptRecord, startAttempt, updateObjective, type Result } from './commands'
import { EMPTY_CAPABILITY, type Autonomy, type CapabilityData, type ContextRelation, type CriterionVerdict } from './model'

/** Test helpers: build histories step by step, failing loudly if any step is refused. Synthetic data only. */

export const HOUR = 60 * 60 * 1000
export const T0 = Date.UTC(2026, 9, 26, 9, 0)

export function must(r: Result): CapabilityData {
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.error)}`)
  return r.data
}

export const OBJECTIVE = {
  action: 'Presentar en inglés una propuesta técnica',
  result: 'una presentación de 10 minutos con preguntas respondidas',
  context: 'una reunión con el equipo de un cliente',
  criterion: 'el cliente entiende la propuesta sin pedir traducción',
  targetAutonomy: 'AUTONOMOUS' as Autonomy,
}

export const SKILLS = [
  { action: 'Explicar la arquitectura en inglés', result: 'una explicación de 3 minutos', context: 'una llamada de práctica', criterion: 'sin pausas largas ni cambiar al español', targetAutonomy: 'AUTONOMOUS' as Autonomy },
  { action: 'Responder preguntas técnicas en inglés', result: 'respuestas a 5 preguntas', context: 'una llamada de práctica', criterion: 'cada respuesta en menos de un minuto', targetAutonomy: 'AUTONOMOUS' as Autonomy },
  { action: 'Escribir las diapositivas en inglés', result: '8 diapositivas', context: 'la propuesta real', criterion: 'sin errores gramaticales marcados por un revisor', targetAutonomy: 'SUPPORTED' as Autonomy },
]

/** An ACTIVE objective `o1` with skills `s1`, `s2`, `s3`. */
export function activeObjective(data: CapabilityData = EMPTY_CAPABILITY, id = 'o1', now = T0): CapabilityData {
  let d = must(createObjective(data, { id, rawIntent: 'Quiero poder presentar en inglés', now }))
  d = must(updateObjective(d, id, OBJECTIVE, now))
  SKILLS.forEach((s, i) => (d = must(addSkill(d, { ...s, id: `${id === 'o1' ? 's' : `${id}-s`}${i + 1}`, objectiveId: id, now }))))
  return must(activateObjective(d, id, now))
}

let seq = 0
/** One attempt on `skillId`, recorded and confirmed at `at`. */
export function attempt(
  d: CapabilityData,
  skillId: string,
  at: number,
  verdict: CriterionVerdict,
  assistance: Autonomy = 'AUTONOMOUS',
  relation: ContextRelation = 'SAME',
  extra: { capture?: 'LIVE' | 'RETROSPECTIVE'; explanation?: string; reference?: string; context?: string } = {},
): CapabilityData {
  const id = `a${++seq}`
  d = must(startAttempt(d, { id, skillId, testStatement: 'La prueba', contextDescription: extra.context ?? 'Una llamada de práctica', capture: extra.capture ?? 'LIVE', now: at - 10 * 60 * 1000 }))
  d = must(saveAttemptRecord(d, id, { outcomeDescription: `Resultado de ${id}`, criterionVerdict: verdict, assistance, contextRelation: relation, explanation: extra.explanation ?? '', reference: extra.reference ?? '' }))
  return must(confirmAttempt(d, id, `e${seq}`, at))
}
