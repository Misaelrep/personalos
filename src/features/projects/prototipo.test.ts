import { describe, expect, it } from 'vitest'
import { validateProjectsData } from './domain/schema'
import { isClosed } from './domain/derive'
import { workClassOf } from './domain/vocabulary'
import { stageOf } from './ui/view'
import { continueHere, decisionsOf, nextInProject, planned } from './prototipo/derive'
import { applyProposals, candidateActions, exampleSprint, monthOf, proposeChanges, reviewPlan, suggestPillars } from './prototipo/plan'
import { INITIAL } from './prototipo/store'
import { exampleText } from './prototipo/update'

/* PROTOTYPE · The 90-day plan over the six INVENTED projects. Nothing here touches storage. */

const data = INITIAL
let n = 0
const ctx = () => ({ now: `2026-11-19T10:00:${String(n++ % 60).padStart(2, '0')}-06:00`, random: () => `r${n}` })
const byName = (name: string) => data.projects.find((p) => p.name === name)!

describe('prototype data', () => {
  it('is valid ProjectsData with six invented projects and 179 tasks', () => {
    expect(validateProjectsData(data).ok).toBe(true)
    expect(data.projects.map((p) => p.name)).toEqual(['Huerto comunitario', 'Taller de cerámica', 'Boletín del barrio', 'Web de la tienda', 'Archivo de recetas', 'App de hábitos'])
    expect(data.tasks).toHaveLength(179)
  })
})

describe('months', () => {
  it('maps a date to the sprint month, before and after included', () => {
    expect(monthOf('2026-11-19')).toEqual({ month: 'dic', before: true, after: false })
    expect(monthOf('2027-01-15').month).toBe('ene')
    expect(monthOf('2027-02-28')).toEqual({ month: 'feb', before: false, after: false })
    expect(monthOf('2027-03-02').after).toBe(true)
  })
})

describe('simulated AI', () => {
  it('suggests actions that are never blocked', () => {
    for (const p of data.projects) for (const t of candidateActions(data, p.id, 6)) expect(stageOf(data, t)).not.toBe('bloqueada')
  })
  it('marks every suggestion as coming from the AI', () => {
    expect(suggestPillars(data).every((p) => p.from === 'ia' && p.projectIds.length === 1)).toBe(true)
  })
  it('the approved example has three pillars, all recorded as the person’s', () => {
    const s = exampleSprint(data, '2026-11-19T09:00:00-06:00')
    expect(s.status).toBe('aprobado')
    expect(s.pillars).toHaveLength(3)
    expect([...s.pillars, ...s.actions].every((x) => x.from === 'tuya')).toBe(true)
    expect(new Set(s.actions.map((a) => a.month))).toEqual(new Set(['dic', 'ene', 'feb']))
  })
  it('Grok-like review observes and never changes the plan', () => {
    const s = exampleSprint(data, 'x')
    const copy = JSON.stringify(s)
    const obs = reviewPlan(data, s)
    expect(JSON.stringify(s)).toBe(copy)
    expect(obs.some((o) => o.text.includes('Web de la tienda'))).toBe(true)
  })
})

describe('updates in plain language', () => {
  it('reads the example as one change of each kind, each tied to the right project', () => {
    const ps = proposeChanges(data, exampleText(data))
    expect(ps.map((p) => p.kind)).toEqual(['hecha', 'descartada', 'cambio', 'nueva'])
    expect(ps.map((p) => data.projects.find((x) => x.id === p.projectId)?.name)).toEqual(['Huerto comunitario', 'Archivo de recetas', 'Taller de cerámica', 'Boletín del barrio'])
    expect(ps.every((p) => p.accepted)).toBe(true)
  })
  it('applies only what is accepted, deletes nothing and records every change', () => {
    const ps = proposeChanges(data, exampleText(data))
    const out = applyProposals(data, ps.map((p) => (p.kind === 'cambio' ? { ...p, accepted: false } : p)), ctx)
    expect(validateProjectsData(out).ok).toBe(true)
    expect(out.tasks).toHaveLength(180)
    const done = out.tasks.find((t) => t.id === ps[0].taskId)!
    expect(isClosed(out, done)).toBe(true)
    expect(workClassOf(out, out.tasks.find((t) => t.id === ps[1].taskId)!)).toBe('descartada')
    expect(out.tasks.find((t) => t.id === ps[2].taskId)!.nextAction).toBeUndefined()
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
  it('a project outside the plan still has decisions and a next action of its own', () => {
    const web = byName('Web de la tienda')
    expect(s.pillars.some((p) => p.projectIds.includes(web.id))).toBe(false)
    expect(decisionsOf(data, web.id, s).length).toBeGreaterThan(0)
    const next = nextInProject(data, byName('Huerto comunitario').id, s, '2026-12-10')
    expect(next && stageOf(data, next)).not.toBe('bloqueada')
  })
})
