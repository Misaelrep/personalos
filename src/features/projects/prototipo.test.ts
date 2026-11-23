import { describe, expect, it } from 'vitest'
import { validateProjectsData } from './domain/schema'
import { indexTasks, isClosed } from './domain/derive'
import { workClassOf } from './domain/vocabulary'
import { explain } from './ui/attention'
import { stageOf } from './ui/view'
import { areasOf } from './prototipo/areas'
import { continueHere, decisionsOf, focusNow, nextInProject, planned } from './prototipo/derive'
import { categoriesOf, reviewPlan } from './prototipo/revision'
import { MONTHS, applyProposals, approve, checkPlan, exampleSprint, grokReview, monthOf, projectsOfPillar, proposeChanges, proposeStrategy } from './prototipo/plan'
import { INITIAL } from './prototipo/store'
import { exampleText } from './prototipo/update'
import { briefOf } from './prototipo/contexto'
import { mapHref, mapPathOf, projectMap, resultsOfTasks, taskNode } from './prototipo/mapa-modelo'

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

describe('smart project map', () => {
  const huerto = byName('Huerto comunitario')
  const web = byName('Web de la tienda')
  it('two structures: results over blocks, and blocks alone when no result was proposed', () => {
    const m = projectMap(data, huerto.id)
    expect(m.noResults).toBe(false)
    expect(m.results.length).toBeGreaterThanOrEqual(3)
    expect(m.results.length).toBeLessThanOrEqual(5)
    const w = projectMap(data, web.id)
    expect(w.noResults).toBe(true)
    expect(w.results).toEqual([])
    // No invented link: without results, no block contributes to anything.
    expect(w.blocks.every((b) => b.results.length === 0)).toBe(true)
  })
  it('is many-to-many and every task sits in exactly one block', () => {
    const m = projectMap(data, huerto.id)
    expect(m.blocks.find((b) => b.id === 'agua')!.results).toEqual(['agua', 'cosecha'])
    expect(m.results.find((r) => r.id === 'vecinos')!.blocks).toEqual(['personas', 'espacio'])
    const ids = m.blocks.flatMap((b) => b.tasks.map((t) => t.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(data.tasks.filter((t) => t.projectId === huerto.id).length)
    for (const r of m.results) expect(r.done).toBeLessThanOrEqual(r.total)
  })
  it('a task reaches its results through its block, and the map opens at it', () => {
    const m = projectMap(data, huerto.id)
    const t = m.blocks.find((b) => b.id === 'agua')!.tasks[0]
    expect(resultsOfTasks(data, [t.id]).map((r) => r.id).sort()).toEqual(['agua', 'cosecha'])
    expect(mapPathOf(data, t.id)).toEqual({ projectId: huerto.id, resultId: 'agua', blockId: 'agua' })
    expect(mapHref(huerto.id, 'agua', 'agua', t.id)).toBe(`#/mapa/${encodeURIComponent(huerto.id)}/agua/agua/${encodeURIComponent(t.id)}`)
    const wt = data.tasks.find((x) => x.projectId === web.id)!
    expect(resultsOfTasks(data, [wt.id])).toEqual([])
  })
  it('dependencies shown are the confirmed ones, both ways', () => {
    const index = indexTasks(data)
    for (const t of data.tasks.filter((x) => x.projectId === huerto.id)) {
      const node = taskNode(data, t, index)
      for (const w of node.unlocks) expect(taskNode(data, w, index).waitsFor.map((x) => x.id).concat(explain(data, w).causes.flatMap((c) => (c.kind === 'espera' ? c.tasks.map((x) => x.id) : [])))).toContain(t.id)
    }
  })
  it('an update said from a task touches only that task, and reading the map writes nothing', () => {
    const before = JSON.stringify(data)
    const t = projectMap(data, huerto.id).blocks[0].tasks.find((x) => !isClosed(data, x))!
    const props = proposeChanges(data, exampleText(data, { projectId: huerto.id, taskIds: [t.id] }), { projectId: huerto.id, taskIds: [t.id] })
    expect(props.flatMap((p) => p.taskIds)).toEqual([t.id])
    for (const p of data.projects) projectMap(data, p.id)
    expect(JSON.stringify(data)).toBe(before)
  })
  it('orientation texts never carry amounts, dates or names of people', () => {
    for (const p of data.projects) for (const b of projectMap(data, p.id).blocks) expect(b.implies).not.toMatch(/\d|€|\$/)
  })
})

describe('task context', () => {
  it('every task gets what to do, why and what it implies, without inventing amounts or times', () => {
    for (const t of data.tasks) {
      const b = briefOf(data, t)
      for (const text of [b.hacer, b.porque, b.implica]) {
        expect(text.length).toBeGreaterThan(10)
        const withoutTitles = data.tasks.filter((x) => x.projectId === t.projectId).reduce((acc, x) => acc.split(x.title).join('').split(x.title.replace(/^\S+\s+/, '').toLowerCase()).join(''), text)
        expect(withoutTitles).not.toMatch(/\d|€|\$|\bhoras?\b|\bminutos?\b/)
      }
    }
  })
  it('a follow-up task points to the work it checks', () => {
    const t = data.tasks.find((x) => x.sourceId === 'HUE-17')!
    expect(briefOf(data, t).porque).toContain('Organizar los turnos de riego')
  })
  it('only projects with proposed results say why they matter; nothing is written to the data', () => {
    const before = JSON.stringify(data)
    expect(projectMap(data, byName('Huerto comunitario').id).why).toBeTruthy()
    expect(projectMap(data, byName('Web de la tienda').id).why).toBeUndefined()
    for (const t of data.tasks) briefOf(data, t)
    expect(JSON.stringify(data)).toBe(before)
  })
})

describe('refinement · review before approving and «Continúa aquí»', () => {
  const draft = proposeStrategy(data, 6)
  it('groups what to review by kind, keeps the three weights apart and adds nothing to the sprint', () => {
    const before = JSON.stringify(draft)
    const r = reviewPlan(data, draft, { hoursOk: false, kept: [] })
    const cats = categoriesOf(r)
    expect(new Set(cats.map((c) => c.id)).size).toBe(cats.length)
    expect(cats.map((c) => `${c.id}:${c.severity}`)).toEqual(['fuera:corregir', 'decisiones:decision', 'estados:decision', 'horas:informativa'])
    expect(JSON.stringify(draft)).toBe(before)
    // Outside dependencies: open tasks not in the sprint, never presented as met.
    const inPlan = new Set(draft.actions.map((a) => a.taskId))
    for (const o of r.outside) for (const t of o.tasks) expect(inPlan.has(t.id) || isClosed(data, t)).toBe(false)
  })
  it('a dependency kept outside stays listed, as an accepted reserve', () => {
    const r0 = reviewPlan(data, draft, { hoursOk: true, kept: [] })
    const r1 = reviewPlan(data, draft, { hoursOk: true, kept: r0.outside.map((o) => o.key) })
    expect(r1.outside).toHaveLength(r0.outside.length)
    expect(categoriesOf(r1).find((c) => c.id === 'fuera')!.severity).toBe('informativa')
    expect(categoriesOf(r1).some((c) => c.id === 'horas')).toBe(false)
  })
  it('the same weekly hours for the three months, without inventing estimates', () => {
    const r = reviewPlan(data, proposeStrategy(data, 8), { hoursOk: true, kept: [] })
    expect(new Set(r.loads.map((l) => l.capacity))).toEqual(new Set([Math.round(8 * 60 * 4.3)]))
    for (const l of r.loads) expect(l.known).toBeLessThanOrEqual(checkPlan(data, proposeStrategy(data, 8)).months.find((m) => m.month === l.month)!.load)
  })
  it('«Continúa aquí» follows explicit rules and never shows a blocked task as doable', () => {
    const s = exampleSprint(data, 'x')
    const dic = focusNow(data, s, '2026-12-10')
    expect(dic.kind).toBe('hacer')
    expect(dic.item!.stage).toBe('lista')
    expect(dic.rule).toContain('No hay una prioridad decidida')
    const ene = focusNow(data, s, '2027-01-15')
    expect(['decidir', 'visto-bueno', 'esperar']).toContain(ene.kind)
    expect(ene.item!.stage).not.toBe('lista')
    const pre = focusNow(data, s, '2026-11-19')
    expect(pre.kind).toBe('preparar')
    expect(['por-clasificar', 'por-verificar']).toContain(pre.item!.stage)
  })
})
