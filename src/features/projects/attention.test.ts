import { describe, expect, it } from 'vitest'
import { classifyStatus, decideApproval, setCondition, setNextAction } from './domain/ops'
import { nextActionCandidates, readinessOf } from './domain/derive'
import type { ProjectsData, Requirement } from './domain/types'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME } from './import/fixtures'
import { applyImport, planImport, type ImportDecisions } from './import/plan'
import { readDossierFile } from './import/readers'
import { emptyProjectsData } from './store/session'
import { attention, BLOCK_SUMMARY_TEXT, causeText, cycleWeek, explain, projectAttention, situationText, waitersOf } from './ui/attention'

/* E1 · Orientation, on SYNTHETIC data only (import/fixtures.ts). */

const enc = (s: string) => new TextEncoder().encode(s)
let clock = 0
const now = () => `2026-11-19T10:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}-06:00`
let seq = 0
const ctx = () => ({ now: now(), random: () => `e1-${++seq}` })
const CREATE: ImportDecisions = { target: { create: { name: 'Huerto de prueba' } }, statusClasses: { Pendiente: 'pendiente', 'No iniciado': 'pendiente' } }
const id = (s: string) => `src:${s}`

async function imported(): Promise<ProjectsData> {
  const r = await readDossierFile({ name: SYNTHETIC_DOSSIER_NAME, bytes: enc(SYNTHETIC_DOSSIER) })
  if (!r.ok) throw new Error(r.error)
  const plan = planImport(emptyProjectsData(), r.bundle, CREATE, ctx())
  return applyImport(emptyProjectsData(), plan, CREATE, ctx())
}
const task = (d: ProjectsData, s: string) => d.tasks.find((t) => t.id === id(s))!
const refs = (ts: { sourceId?: string }[]) => ts.map((t) => t.sourceId)

describe('E1 · dónde poner la atención', () => {
  it('groups what needs the person, once per task, without inventing anything', async () => {
    const data = await imported()
    const a = attention(data)
    expect(a.words.map((w) => [w.literal, refs(w.tasks)])).toEqual([
      ['Borrador existente', ['HUE-03']],
      ['No consta', ['HUE-04']],
    ])
    expect(a.checks.map((c) => [c.literal, refs(c.tasks)])).toEqual([['Acceso al jardín', ['HUE-01']]])
    expect(a.approvals).toEqual([])
    expect(a.ready).toEqual([])
    expect(a.counts).toMatchObject({ lista: 0, 'por-verificar': 1, bloqueada: 3, 'por-clasificar': 2 })
    // Every open task is in exactly one of: a word, a check, an approval, ready, or «cannot move yet».
    const p = a.projects[0]
    const placed = [...p.words.flatMap((w) => w.tasks), ...new Set(p.checks.flatMap((c) => c.tasks)), ...p.approvals, ...p.ready].length + p.cannotMove
    expect(placed).toBe(p.open)
  })

  it('counts who waits for whom from the real dependencies, and never ranks blocked tasks', async () => {
    const data = await imported()
    const w = waitersOf(data)
    expect(refs(w.get(id('HUE-01')) ?? [])).toEqual(['HUE-02'])
    expect(refs(w.get(id('HUE-02')) ?? []).sort()).toEqual(['HUE-03', 'HUE-05'])
    expect(attention(data, { min: 1 }).unlockers.every((u) => u.stage !== 'bloqueada')).toBe(true)
    expect(attention(data, { min: 99 }).unlockers).toEqual([])
  })

  it('explains each task by its real cause, with the dossier words literal', async () => {
    const data = await imported()
    const say = (s: string) => explain(data, task(data, s)).causes.map(causeText)
    expect(say('HUE-01')).toEqual(['Falta comprobar «Acceso al jardín»: nadie lo ha confirmado todavía.'])
    expect(say('HUE-02')).toEqual(['Espera a «Comprobar la llave de paso» (HUE-01), que aún no está terminada.'])
    expect(say('HUE-03')[0]).toBe('Su estado en el dossier dice «Borrador existente» y todavía no has aclarado qué significa.')
    expect(say('HUE-05')).toEqual(['Espera a «Cambiar el goteo» (HUE-02) y «Elegir semillas» (HUE-03), que aún no están terminadas.'])
    expect(say('HUE-06').join(' ')).toContain('Espera a «Sembrar según parcela» (HUE-04)')
    expect(say('HUE-06').join(' ')).toContain('«báscula»')
  })

  it('a condition marked as not met is said as such, not as «waiting for a task»', async () => {
    let data = await imported()
    const t = task(data, 'HUE-01')
    data = setCondition(data, t.id, t.requirements![0].id, 0, 'no-cumplida', ctx())
    expect(explain(data, task(data, 'HUE-01')).causes.map(causeText)).toEqual(['Marcaste que «Acceso al jardín» no se cumple. Mientras siga así, no puede avanzar.'])
  })

  it('moves with the person’s decisions: a confirmed condition makes a task ready; an executed one waits for approval', async () => {
    let data = await imported()
    const t = task(data, 'HUE-01')
    data = setCondition(data, t.id, t.requirements![0].id, 0, 'cumplida', ctx())
    let a = attention(data)
    expect(refs(a.ready.map((r) => r.task))).toEqual(['HUE-01'])
    expect(a.checks).toEqual([])
    expect(situationText(a.projects[0])).toBe('Puedes avanzar en 1 tarea; otras necesitan antes una decisión tuya.')
    data = classifyStatus(data, SYNTHETIC_DOSSIER_NAME, 'No consta', 'ejecutada', ctx())
    a = attention(data)
    expect(refs(a.approvals)).toEqual(['HUE-04'])
    expect(explain(data, task(data, 'HUE-04')).causes.map(causeText)).toEqual(['Está hecha y espera tu visto bueno.'])
    expect(situationText(a.projects[0])).toBe('Una tarea hecha espera tu visto bueno.')
    data = decideApproval(data, id('HUE-04'), 'aprobada', ctx())
    expect(projectAttention(data, data.projects[0]).closed).toBe(1)
  })

  it('situation sentences never claim a decision that was not taken', async () => {
    const data = await imported()
    expect(situationText(attention(data).projects[0])).toBe('Necesita una decisión o una comprobación tuya antes de avanzar.')
    const empty = { ...data, tasks: [] }
    expect(situationText(projectAttention(empty, empty.projects[0]))).toBe('Todavía no tiene tareas.')
  })

  it('reads the cycle week like SEMANA does', () => {
    const cycle = { start: '2026-10-26', end: '2027-01-23' }
    expect(cycleWeek(cycle, '2026-10-26')).toEqual({ week: 1, of: 13 })
    expect(cycleWeek(cycle, '2026-11-19')).toEqual({ week: 4, of: 13 })
    expect(cycleWeek(cycle, '2027-01-23')).toEqual({ week: 13, of: 13 })
    expect(cycleWeek(cycle, '2027-02-01')).toBeUndefined()
  })
})

/* Regressions for the three findings Codex reproduced on 4f12467 (SYNTHETIC data only). */

/** Test fixture only: give a synthetic task other requirements. The requirement engine is the real one. */
const withRequirements = (d: ProjectsData, s: string, requirements: Requirement[]): ProjectsData => ({
  ...d,
  tasks: d.tasks.map((t) => (t.id === id(s) ? { ...t, requirements } : t)),
})
const onTasks = (...xs: string[]) => xs.map((x) => ({ kind: 'tarea' as const, taskId: id(x) }))
const onCondition = (literal: string) => ({ kind: 'condicion' as const, literal, state: 'por-verificar' as const })
const only = (d: ProjectsData, ...xs: string[]): ProjectsData => ({ ...d, tasks: d.tasks.filter((t) => xs.map(id).includes(t.id)) })

describe('E1 · correcciones F01–F03 (dictamen Codex sobre 4f12467)', () => {
  it('F01 · a blocked task with a written next action is not «Se puede hacer ya»', async () => {
    let data = await imported()
    data = setNextAction(data, id('HUE-02'), 'Comprar el codo de goteo', ctx())
    const t = task(data, 'HUE-02')
    expect(t.nextAction).toBe('Comprar el codo de goteo')
    expect(readinessOf(data, t)).toBe('bloqueada')
    const p = projectAttention(data, data.projects[0])
    expect(refs(p.ready)).toEqual([])
    expect(refs(attention(data).ready.map((r) => r.task))).toEqual([])
    // The list is the engine's own: exactly the candidates it says are ready.
    expect(p.ready).toEqual(nextActionCandidates(data, data.projects[0].id, 'humano'))
    expect(situationText(p)).not.toMatch(/Puedes avanzar/)
    // Once its dependency is done, the same task becomes ready, with or without the written action.
    const h1 = task(data, 'HUE-01')
    data = setCondition(data, h1.id, h1.requirements![0].id, 0, 'cumplida', ctx())
    expect(refs(projectAttention(data, data.projects[0]).ready)).toEqual(['HUE-01'])
  })

  it('F02 · required and alternative requirements keep their structure: «A y, además, B o C»', async () => {
    let data = await imported()
    data = withRequirements(data, 'HUE-05', [
      { id: 'r1', literal: 'HUE-01', kind: 'tarea', mode: 'todas', options: onTasks('HUE-01') },
      { id: 'r2', literal: 'HUE-02 o HUE-03', kind: 'alternativa', mode: 'alguna', options: onTasks('HUE-02', 'HUE-03') },
    ])
    expect(explain(data, task(data, 'HUE-05')).causes.map(causeText)).toEqual([
      'Espera a «Comprobar la llave de paso» (HUE-01) y, además, a «Cambiar el goteo» (HUE-02) o «Elegir semillas» (HUE-03).',
    ])
    // Two required tasks are still said with «y».
    data = withRequirements(data, 'HUE-05', [{ id: 'r1', literal: 'HUE-01, HUE-02', kind: 'tarea', mode: 'todas', options: onTasks('HUE-01', 'HUE-02') }])
    expect(explain(data, task(data, 'HUE-05')).causes.map(causeText)).toEqual([
      'Espera a «Comprobar la llave de paso» (HUE-01) y «Cambiar el goteo» (HUE-02), que aún no están terminadas.',
    ])
  })

  it('F02 · an alternative between a task and a condition is never said as two obligations', async () => {
    const data = await imported()
    // HUE-03 in the synthetic dossier: «HUE-02 o semillas del vecino».
    const say = explain(data, task(data, 'HUE-03')).causes.map(causeText)
    expect(say).toContain('Espera a que se cumpla una de estas: «Cambiar el goteo» (HUE-02) o que se confirme «semillas del vecino».')
    expect(say.join(' ')).not.toMatch(/Falta comprobar «semillas del vecino»/)
  })

  it('F02 · alternatives that are only conditions are one group to check, next to the required ones', async () => {
    let data = await imported()
    data = withRequirements(data, 'HUE-06', [
      { id: 'r1', literal: 'Cesta', kind: 'condicional', mode: 'todas', options: [onCondition('Cesta')] },
      { id: 'r2', literal: 'báscula o balanza prestada', kind: 'alternativa', mode: 'alguna', options: [onCondition('báscula'), onCondition('balanza prestada')] },
    ])
    const why = explain(data, task(data, 'HUE-06'))
    expect(why.causes.map(causeText)).toEqual(['Falta comprobar «Cesta» y, además, «báscula» o «balanza prestada»: nadie lo ha confirmado todavía.'])
  })

  it('F03 · blocks that come only from a condition are not attributed to other tasks', async () => {
    let data = await imported()
    const h1 = task(data, 'HUE-01')
    data = setCondition(data, h1.id, h1.requirements![0].id, 0, 'no-cumplida', ctx())
    const alone = only(data, 'HUE-01')
    const p = projectAttention(alone, alone.projects[0])
    expect(p.blockedBy).toBe('condiciones')
    expect(situationText(p)).toBe('Ninguna tarea puede avanzar todavía: piden algo que no se cumple o que se descartó.')
    expect(BLOCK_SUMMARY_TEXT[p.blockedBy!]).not.toMatch(/otras tareas\./)
  })

  it('F03 · several causes give a neutral summary; only tasks give «esperan a otras»', async () => {
    let data = await imported()
    const h1 = task(data, 'HUE-01')
    data = setCondition(data, h1.id, h1.requirements![0].id, 0, 'no-cumplida', ctx())
    const mixed = only(data, 'HUE-01', 'HUE-02')
    const p = projectAttention(mixed, mixed.projects[0])
    expect(p.blockedBy).toBe('varias')
    expect(situationText(p)).toBe('Ninguna tarea puede avanzar todavía, por causas distintas. Al abrir el proyecto verás la de cada una.')
    // Each task still says its own cause in detail.
    expect(explain(mixed, task(mixed, 'HUE-02')).causes.map(causeText)).toEqual(['Espera a «Comprobar la llave de paso» (HUE-01), que aún no está terminada.'])
    const fresh = only(await imported(), 'HUE-01', 'HUE-02')
    const tasksOnly = projectAttention(fresh, fresh.projects[0])
    expect(tasksOnly.blockedBy).toBe('tareas')
    expect(BLOCK_SUMMARY_TEXT.tareas).toBe('Esperan a otras tareas. Se liberan al terminar lo anterior.')
  })
})
