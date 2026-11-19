import { describe, expect, it } from 'vitest'
import { validateProjectsData } from './domain/schema'
import { indexTasks, isClosed } from './domain/derive'
import { workClassOf } from './domain/vocabulary'
import { explain } from './ui/attention'
import { stageOf } from './ui/view'
import { areasOf } from './prototipo/areas'
import { continueHere, decisionsOf, nextInProject, planned } from './prototipo/derive'
import { MONTHS, applyProposals, approve, checkPlan, exampleSprint, grokReview, monthOf, projectsOfPillar, proposeChanges, proposeStrategy } from './prototipo/plan'
import { INITIAL } from './prototipo/store'
import { exampleText } from './prototipo/update'

/* PROTOTYPE · The 90-day plan over the six INVENTED projects. Nothing here touches storage. */

const data = INITIAL
let n = 0
const ctx = () => ({ now: `2026-11-19T10:00:${String(n++ % 60).padStart(2, '0')}-06:00`, random: () => `r${n}` })
const byName = (name: string) => data.projects.find((p) => p.name === name)!
const monthIndex = (m: string) => MONTHS.findIndex((x) => x.key === m)

describe('prototype data', () => {
  it('is valid ProjectsData with six invented projects and 179 tasks', () => {
    expect(validateProjectsData(data).ok).toBe(true)
    expect(data.projects.map((p) => p.name)).toEqual(['Huerto comunitario', 'Taller de cerámica', 'Boletín del barrio', 'Web de la tienda', 'Archivo de recetas', 'App de hábitos'])
    expect(data.tasks).toHaveLength(179)
  })
  it('maps a date to the sprint month, before and after included', () => {
    expect(monthOf('2026-11-19')).toEqual({ month: 'dic', before: true, after: false })
    expect(monthOf('2027-01-15').month).toBe('ene')
    expect(monthOf('2027-03-02').after).toBe(true)
  })
})

describe('project map', () => {
  it('puts every task in exactly one area and changes no task', () => {
    const before = JSON.stringify(data.tasks)
    for (const p of data.projects) {
      const areas = areasOf(data, p.id)
      expect(areas.length).toBeGreaterThanOrEqual(3)
      expect(areas.length).toBeLessThanOrEqual(6)
      const ids = areas.flatMap((a) => a.tasks.map((t) => t.id))
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.length).toBe(data.tasks.filter((t) => t.projectId === p.id).length)
      for (const a of areas) expect(a.counts.terminado + a.counts.pendiente + a.counts.confirmar).toBe(a.tasks.length)
    }
    expect(JSON.stringify(data.tasks)).toBe(before)
  })
})

describe('strategy proposal (simulated AI)', () => {
  const s = proposeStrategy(data, 6)
  it('is complete: north star, three pillars, actions in the three months, all marked as AI', () => {
    expect(s.northStar).not.toBe('')
    expect(s.pillars).toHaveLength(3)
    expect(new Set(s.actions.map((a) => a.month))).toEqual(new Set(['dic', 'ene', 'feb']))
    expect([s.northStarFrom, ...s.pillars.map((p) => p.from), ...s.actions.map((a) => a.from)].every((f) => f === 'ia')).toBe(true)
  })
  it('lets a pillar draw from several projects', () => {
    expect(s.pillars.some((p) => projectsOfPillar(data, s, p.id).length > 1)).toBe(true)
  })
  it('never plans a task before what it waits for, and uses each task once', () => {
    const at = new Map(s.actions.map((a) => [a.taskId, monthIndex(a.month)]))
    expect(at.size).toBe(s.actions.length)
    for (const a of s.actions) {
      const t = data.tasks.find((x) => x.id === a.taskId)!
      for (const c of explain(data, t).causes) if (c.kind === 'espera') for (const w of c.tasks) if (at.has(w.id)) expect(at.get(w.id)!).toBeLessThanOrEqual(monthIndex(a.month))
    }
  })
  it('plans fewer actions with fewer hours', () => {
    expect(proposeStrategy(data, 3).actions.length).toBeLessThan(s.actions.length)
  })
  it('approving turns every part into the person’s decision', () => {
    const a = approve(s, 'x')
    expect([a.northStarFrom, ...a.pillars.map((p) => p.from), ...a.actions.map((x) => x.from)].every((f) => f === 'tuya')).toBe(true)
  })
})

describe('coherence (local calculation)', () => {
  const s = proposeStrategy(data, 6)
  it('says when a result has no actions', () => {
    const empty = { ...s, actions: s.actions.filter((a) => !(a.pillarId === 'p1' && a.month === 'feb')) }
    const r = checkPlan(data, empty).months[2].results.find((x) => x.pillarId === 'p1')!
    expect(r.items).toHaveLength(0)
    expect(r.note).toMatch(/Falta planificarlo/)
  })
  it('proposes, never adds, the tasks outside the plan that planned actions wait for', () => {
    const c = checkPlan(data, s)
    const inPlan = new Set(s.actions.map((a) => a.taskId))
    expect(c.prerequisites.length).toBeGreaterThan(0)
    for (const p of c.prerequisites) {
      expect(inPlan.has(p.task.id)).toBe(false)
      expect(inPlan.has(p.forTask.id)).toBe(true)
    }
  })
  it('tells apart actions that can be done, decisions, blocked and review', () => {
    const kinds = new Set(checkPlan(data, s).months.flatMap((m) => m.results.flatMap((r) => r.items.map((i) => i.kind))))
    expect(kinds.has('ejecutable')).toBe(true)
    expect(kinds.has('decision')).toBe(true)
    expect(kinds.has('bloqueada')).toBe(true)
  })
  it('Grok observes without changing the plan', () => {
    const copy = JSON.stringify(s)
    const obs = grokReview(data, s, '2026-11-19')
    expect(JSON.stringify(s)).toBe(copy)
    expect(obs.length).toBeGreaterThan(0)
  })
})

describe('updates in plain language', () => {
  it('reads the example as grouped changes, with why and the tasks affected', () => {
    const ps = proposeChanges(data, exampleText(data))
    expect(ps.map((p) => p.kind)).toEqual(['hecha', 'descartada', 'cambio', 'nueva'])
    expect(ps[0].taskIds.length).toBeGreaterThan(1)
    expect(ps.every((p) => p.why.length > 0)).toBe(true)
    expect(data.projects.find((x) => x.id === ps[3].projectId)?.name).toBe('Boletín del barrio')
  })
  it('understands an area named without task names', () => {
    const [p] = proposeChanges(data, 'Terminamos todo lo del agua y riego.')
    const area = areasOf(data, byName('Huerto comunitario').id).find((a) => a.id === 'agua')!
    expect(p.taskIds.sort()).toEqual(area.tasks.filter((t) => !isClosed(data, t)).map((t) => t.id).sort())
  })
  it('applies only what is confirmed, deletes nothing, keeps approval apart', () => {
    const ps = proposeChanges(data, exampleText(data)).map((p) => (p.kind === 'cambio' ? { ...p, accepted: false } : p))
    const keep = ps[0].taskIds[0]
    ps[0] = { ...ps[0], taskIds: [keep] }
    const out = applyProposals(data, ps, ctx)
    expect(validateProjectsData(out).ok).toBe(true)
    expect(out.tasks).toHaveLength(180)
    expect(stageOf(out, out.tasks.find((t) => t.id === keep)!)).toBe('en-aprobacion')
    expect(workClassOf(out, out.tasks.find((t) => t.id === ps[1].taskIds[0])!)).toBe('descartada')
    expect(out.tasks.find((t) => t.id === ps[2].taskIds[0])!.nextAction).toBeUndefined()
    expect(out.history.length).toBeGreaterThan(data.history.length)
    expect(data.tasks).toHaveLength(179)
  })
})

describe('what the screens show', () => {
  const s = exampleSprint(data, 'x')
  it('«Continúa aquí» is an open action of the plan, this month first', () => {
    const here = continueHere(data, s, '2026-12-10')!
    expect(here.action.month).toBe('dic')
    expect(here.stage).not.toBe('cerrada')
  })
  it('lists the plan per month', () => {
    expect(planned(data, s, 'ene').every((p) => p.action.month === 'ene')).toBe(true)
  })
  it('decisions are asked about the work, and a project outside the plan keeps its own', () => {
    const web = byName('Web de la tienda')
    const index = indexTasks(data)
    expect(s.actions.some((a) => index.get(a.taskId)?.projectId === web.id)).toBe(false)
    const ds = decisionsOf(data, web.id, s)
    expect(ds.length).toBeGreaterThan(0)
    expect(ds.every((d) => !d.text.includes('qué significa'))).toBe(true)
    const next = nextInProject(data, byName('Huerto comunitario').id, s, '2026-12-10')
    expect(next && stageOf(data, next)).not.toBe('bloqueada')
  })
})
