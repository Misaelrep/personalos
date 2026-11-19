import { describe, expect, it } from 'vitest'
import { classifyStatus, decideApproval, setCondition } from './domain/ops'
import type { ProjectsData } from './domain/types'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME } from './import/fixtures'
import { applyImport, planImport, type ImportDecisions } from './import/plan'
import { readDossierFile } from './import/readers'
import { emptyProjectsData } from './store/session'
import { attention, causeText, cycleWeek, explain, projectAttention, situationText, waitersOf } from './ui/attention'

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
