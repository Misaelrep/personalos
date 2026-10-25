import { describe, expect, it } from 'vitest'
import { readinessOf } from './domain/derive'
import { importedId } from './domain/ids'
import { addEvidence, decideApproval, setCondition, setOwner, setStatus } from './domain/ops'
import { validateProjectsData } from './domain/schema'
import type { ProjectsData } from './domain/types'
import { bundleIssues } from './import/bundle'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME } from './import/fixtures'
import { readMarkdown, splitRow } from './import/markdown'
import { applyImport, currentValues, dossierValues, ImportError, planImport, type ImportDecisions } from './import/plan'
import { readDossierFile, READERS } from './import/readers'
import { expandAbbreviation, readRequirements } from './import/requirements'
import { sha256Hex } from './import/sha256'
import { exportProjects, verifyExport } from './store/export'
import { emptyProjectsData, ProjectsSession } from './store/session'
import { createStore, DATA_KEY, PREV_KEYS, readEnvelope, type KeyValue, type Locks } from './store/store'

/* P3 · SYNTHETIC data only (see import/fixtures.ts). */

const enc = (s: string) => new TextEncoder().encode(s)
const file = (text = SYNTHETIC_DOSSIER, name = SYNTHETIC_DOSSIER_NAME) => ({ name, bytes: enc(text) })
let clock = 0
const now = () => `2026-10-25T10:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}-06:00`
let seq = 0
const random = () => `id-${++seq}`
const ctx = () => ({ now: now(), random })

const CREATE: ImportDecisions = {
  target: { create: { name: 'Huerto de prueba' } },
  statusClasses: { Pendiente: 'pendiente', 'No iniciado': 'pendiente' },
  rules: [{ literal: 'máximo dos parcelas activas', kind: 'wip', limit: 2, scope: 'parcelas activas' }],
}

async function bundle(text = SYNTHETIC_DOSSIER) {
  const r = await readDossierFile(file(text))
  if (!r.ok) throw new Error(r.error)
  return r.bundle
}

async function imported(): Promise<{ data: ProjectsData; projectId: string }> {
  const b = await bundle()
  const plan = planImport(emptyProjectsData(), b, CREATE, ctx())
  return { data: applyImport(emptyProjectsData(), plan, CREATE, ctx()), projectId: plan.projectId }
}
const into = (projectId: string): ImportDecisions => ({ target: { projectId } })
const task = (d: ProjectsData, id: string) => d.tasks.find((t) => t.sourceId === id)!

// ── In-memory browser pieces ────────────────────────────────────────────────

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  failOn?: (key: string) => Error | undefined
  dropWrites = false
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => {
    const e = this.failOn?.(k)
    if (e) throw e
    if (!this.dropWrites) this.map.set(k, v)
  }
  removeItem = (k: string) => void this.map.delete(k)
  snapshot = () => JSON.stringify([...this.map])
}

/** An exclusive lock shared by every "tab" built on it, like navigator.locks. */
function memoryLocks(): Locks & { hold(): () => void } {
  let tail = Promise.resolve()
  const locks = {
    request<T>(_name: string, opts: { signal?: AbortSignal }, cb: () => Promise<T>): Promise<T> {
      const prev = tail
      let release!: () => void
      tail = new Promise<void>((r) => (release = r))
      return new Promise<T>((resolve, reject) => {
        let granted = false
        opts.signal?.addEventListener('abort', () => {
          if (!granted) {
            reject(new DOMException('aborted', 'AbortError'))
          }
        })
        prev.then(async () => {
          if (opts.signal?.aborted) return release()
          granted = true
          try {
            resolve(await cb())
          } catch (e) {
            reject(e)
          } finally {
            release()
          }
        })
      })
    },
    hold() {
      const prev = tail
      let release!: () => void
      tail = prev.then(() => new Promise<void>((r) => (release = r)))
      return () => release()
    },
  }
  return locks
}

const tab = (storage: MemoryStorage, locks: Locks | undefined, writer = 'tab') => createStore({ storage, locks, now, writer })
const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })

// ── Reader ──────────────────────────────────────────────────────────────────

describe('P3 · lector de dossiers', () => {
  it('reads the synthetic dossier: tasks, sources, references, objective; literal and with place', async () => {
    const b = await bundle()
    expect(bundleIssues(b)).toEqual([])
    expect(b.issues).toEqual([])
    expect(b.dossier).toMatchObject({ name: SYNTHETIC_DOSSIER_NAME, version: '2026-10-20', reader: 'tablas-md/wellness-1', sha256: await sha256Hex(enc(SYNTHETIC_DOSSIER)) })
    expect(b.tasks.map((t) => t.sourceId)).toEqual(['HUE-01', 'HUE-02', 'HUE-03', 'HUE-04', 'HUE-05', 'HUE-06'])
    expect(b.tasks[0]).toMatchObject({
      title: 'Comprobar la llave de *paso*',
      statusLiteral: 'Pendiente',
      area: 'Riego',
      deliverable: 'Foto de la llave',
      dependencyLiteral: 'Acceso al jardín',
      estimateLiteral: '20–35 min',
      delegationLiteral: 'IA sugiere; humano revisa',
      acceptance: ['La llave abre y cierra'],
      sourceRefsLiteral: 'F1 §2; F2',
      extra: {},
    })
    expect(b.tasks[4].title).toBe('Anotar el riego \\| diario')
    expect(b.tasks[0].place.raw).toBe(SYNTHETIC_DOSSIER.split('\n')[b.tasks[0].place.line - 1])
    expect(b.sources.map((s) => s.key)).toEqual(['F1', 'F2'])
    expect(b.references.map((r) => r.label)).toEqual(['Parcela norte', 'Parcela sur'])
    expect(b.references[0].cells[2]).toEqual({ column: 'Aprob.', value: '**Sí, usuario**' })
    expect(b.project).toMatchObject({ name: 'DOSSIER OPERATIVO — HUERTO DE PRUEBA', objective: 'comprobar el importador con un proyecto inventado.' })
  })

  it('refuses what it does not recognize, invalid UTF-8, and reports malformed rows', async () => {
    expect(await readDossierFile(file('# Notas\n\nSin tablas.\n'))).toEqual({ ok: false, error: 'Formato de dossier no reconocido: no se importa nada.' })
    expect((await readDossierFile({ name: 'x.md', bytes: new Uint8Array([0xff, 0xfe, 0x41]) })).ok).toBe(false)
    const broken = SYNTHETIC_DOSSIER.replace('| HUE-02 | Riego |', '| HUE-02 | Riego | celda de más |')
    const b = await bundle(broken)
    expect(b.issues).toContainEqual(expect.objectContaining({ level: 'error', message: 'la fila tiene 11 celdas y la tabla 10 columnas' }))
    expect(planImport(emptyProjectsData(), b, CREATE, ctx()).ok).toBe(false)
  })

  it('a BOM, CRLF and a fenced code block do not change what is read', async () => {
    const crlf = '﻿' + SYNTHETIC_DOSSIER.replace(/\n/g, '\r\n') + '\r\n```\n| ID | Tarea concreta | Estado |\n|---|---|---|\n| X-1 | no | no |\n```\r\n'
    const b = await bundle(crlf)
    expect(b.tasks.map((t) => t.sourceId)).toEqual(['HUE-01', 'HUE-02', 'HUE-03', 'HUE-04', 'HUE-05', 'HUE-06'])
    expect(b.tasks[0].place.raw.endsWith('\r')).toBe(false)
  })

  it('a duplicated ID in the dossier stops the import (not renamed)', async () => {
    const dup = SYNTHETIC_DOSSIER.replace('| HUE-06 |', '| HUE-01 |')
    const plan = planImport(emptyProjectsData(), await bundle(dup), CREATE, ctx())
    expect(plan.ok).toBe(false)
    expect(plan.errors).toContain('ID repetido en el dossier: HUE-01 (no se renombra)')
  })

  it('splits rows on unescaped pipes only; reads headings and the title', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b \\| c', 'd'])
    const doc = readMarkdown('# T\n## S\n| A | B |\n|:-|-:|\n| 1 | 2 |\n')
    expect(doc.title).toBe('T')
    expect(doc.tables[0]).toMatchObject({ section: 'T > S', columns: ['A', 'B'], rows: [{ line: 5, cells: ['1', '2'] }] })
  })

  it('only one reader exists and it is not assumed to fit other layouts', () => {
    expect(READERS.map((r) => r.id)).toEqual(['tablas-md/wellness-1'])
    expect(READERS[0].recognizes('| Código | Acción | Situación |\n|---|---|---|\n| M01 | x | y |\n')).toBe(false)
  })
})

describe('P3 · lectura de dependencias (solo añade restricciones)', () => {
  it('reads each shape, keeping the literal', () => {
    expect(readRequirements('—')).toEqual([])
    expect(readRequirements(undefined)).toEqual([])
    expect(readRequirements('HUE-01')).toEqual([{ id: 'r1', literal: 'HUE-01', kind: 'tarea', mode: 'todas', options: [{ kind: 'tarea', taskId: 'src:HUE-01' }] }])
    expect(readRequirements('Acceso al jardín')[0]).toMatchObject({ kind: 'externo', mode: 'todas', options: [{ kind: 'condicion', literal: 'Acceso al jardín', state: 'por-verificar' }] })
    expect(readRequirements('Permiso del vecino y llave')[0].options).toHaveLength(1)
    expect(readRequirements('HUE-02 o semillas del vecino')[0]).toMatchObject({ kind: 'alternativa', mode: 'alguna', options: [{ kind: 'tarea' }, { kind: 'condicion', literal: 'semillas del vecino' }] })
    expect(readRequirements('HUE-01..03 según parcela')[0]).toMatchObject({ kind: 'condicional', options: [{ kind: 'condicion', literal: 'HUE-01..03 según parcela' }] })
    expect(readRequirements('HUE-02,03')[0]).toMatchObject({ kind: 'tarea', reading: 'HUE-02,03 → HUE-02, HUE-03', options: [{ taskId: 'src:HUE-02' }, { taskId: 'src:HUE-03' }] })
    expect(readRequirements('HUE-04 + báscula')[0]).toMatchObject({ kind: 'mixto', options: [{ kind: 'tarea', taskId: 'src:HUE-04' }, { kind: 'condicion', literal: 'báscula' }] })
    expect(readRequirements('HUE-01, HUE-02')[0]).toMatchObject({ kind: 'tarea', options: [{ taskId: 'src:HUE-01' }, { taskId: 'src:HUE-02' }] })
  })

  it('an abbreviation is only expanded when it is unambiguous', () => {
    expect(expandAbbreviation('AAA-02,03,05')).toEqual(['AAA-02', 'AAA-03', 'AAA-05'])
    expect(expandAbbreviation('AAA-02,3')).toBeNull()
    expect(expandAbbreviation('AAA-02')).toBeNull()
  })
})

// ── Plan and apply ──────────────────────────────────────────────────────────

describe('P3 · primera importación', () => {
  it('creates the project and tasks without inventing anything; validates', async () => {
    const { data, projectId } = await imported()
    expect(validateProjectsData(JSON.parse(JSON.stringify(data))).ok).toBe(true)
    const p = data.projects[0]
    expect(p).toMatchObject({ id: projectId, name: 'Huerto de prueba', dossier: SYNTHETIC_DOSSIER_NAME, objective: 'comprobar el importador con un proyecto inventado.' })
    expect(p.rules).toEqual([{ literal: 'máximo dos parcelas activas', kind: 'wip', limit: 2, scope: 'parcelas activas' }])
    expect(data.vocabularies[SYNTHETIC_DOSSIER_NAME].status).toEqual([
      { literal: 'Pendiente', workClass: 'pendiente' },
      { literal: 'Borrador existente', workClass: 'sin-decidir' },
      { literal: 'No consta', workClass: 'sin-decidir' },
      { literal: 'No iniciado', workClass: 'pendiente' },
    ])
    for (const t of data.tasks) {
      expect(t.approval).toEqual({ state: 'sin-dato' })
      expect(t.owner).toBeUndefined()
      expect(t.priority).toBeUndefined()
      expect(t.estimateHours).toBeUndefined()
      expect(t.delegation?.candidates ?? []).toEqual([])
    }
    const t1 = task(data, 'HUE-01')
    expect(t1).toMatchObject({ id: 'src:HUE-01', area: 'Riego', deliverable: 'Foto de la llave', estimate: { literal: '20–35 min', minMinutes: 20, maxMinutes: 35 }, sourceRefs: { literal: 'F1 §2; F2', keys: ['F1', 'F2'] } })
    expect(t1.origin).toMatchObject({ dossier: SYNTHETIC_DOSSIER_NAME, dossierVersion: '2026-10-20', location: 'DOSSIER OPERATIVO — HUERTO DE PRUEBA > 8. Backlog · línea 26' })
    expect(data.sources).toHaveLength(2)
    expect(data.references).toHaveLength(2)
    expect(data.imports).toHaveLength(1)
    expect(data.history.filter((h) => h.by === 'importación' && h.field === 'created')).toHaveLength(7) // project + 6 tasks
  })

  it('a task citing a source the dossier does not list is kept, with a warning', async () => {
    const { data } = await imported()
    expect(validateProjectsData(data).ok && validateProjectsData(data).warnings.map((w) => w.message)).toContain('cita una fuente que el dossier no lista: F9')
  })

  it('nothing comes out «ready» that depends on an unchecked condition', async () => {
    const { data } = await imported()
    const r = Object.fromEntries(data.tasks.map((t) => [t.sourceId, readinessOf(data, t)]))
    expect(r).toEqual({ 'HUE-01': 'por-verificar', 'HUE-02': 'bloqueada', 'HUE-03': 'por-clasificar', 'HUE-04': 'por-clasificar', 'HUE-05': 'bloqueada', 'HUE-06': 'bloqueada' })
  })

  it('every dossier field of every task is what the dossier says (no silent loss)', async () => {
    const b = await bundle()
    const { data } = await imported()
    for (const d of b.tasks) expect(currentValues(task(data, d.sourceId))).toEqual(dossierValues(d))
  })

  it('a decision with an impossible class makes the import fail whole', async () => {
    const bad: ImportDecisions = { ...CREATE, statusClasses: { Pendiente: 'quizá' as never } }
    const plan = planImport(emptyProjectsData(), await bundle(), bad, ctx())
    expect(() => applyImport(emptyProjectsData(), plan, bad, ctx())).toThrow(ImportError)
  })

  it('creating a second project on the same dossier, or an ID owned by another project, is refused', async () => {
    const { data } = await imported()
    expect(planImport(data, await bundle(), CREATE, ctx()).errors[0]).toMatch(/ya hay un proyecto que usa el dossier/)
    const other = planImport(data, await bundle(), { target: { create: { name: 'Otro' } } }, ctx())
    expect(other.ok).toBe(false)
  })
})

describe('P3 · reimportación sin destruir el trabajo hecho en ELYUM', () => {
  it('the same file: everything unchanged, flagged as already imported', async () => {
    const { data, projectId } = await imported()
    const plan = planImport(data, await bundle(), into(projectId), ctx())
    expect(plan.sameFile).toBe(true)
    expect(plan.counts).toMatchObject({ new: 0, changed: 0, unchanged: 6, conflicts: 0, missing: 0 })
  })

  it('a change only in the dossier is shown and applied on confirmation', async () => {
    const { data, projectId } = await imported()
    const b2 = await bundle(SYNTHETIC_DOSSIER.replace('Cambiar el goteo', 'Cambiar el goteo entero'))
    const plan = planImport(data, b2, into(projectId), ctx())
    const item = plan.items.find((i) => i.sourceId === 'HUE-02')!
    expect(item).toMatchObject({ kind: 'cambiada', changes: [{ field: 'title', current: 'Cambiar el goteo', incoming: 'Cambiar el goteo entero', conflict: false }] })
    const next = applyImport(data, plan, into(projectId), ctx())
    expect(task(next, 'HUE-02').title).toBe('Cambiar el goteo entero')
    expect(task(next, 'HUE-02').origin!.raw).toContain('entero')
    expect(next.history.at(-2)).toMatchObject({ by: 'importación', field: 'title', from: 'Cambiar el goteo', to: 'Cambiar el goteo entero' })
  })

  it('a change only in ELYUM is kept and reported, not a conflict', async () => {
    let { data, projectId } = await imported()
    data = setStatus(data, importedId('HUE-01'), 'No iniciado', ctx())
    const plan = planImport(data, await bundle(), into(projectId), ctx())
    expect(plan.items[0]).toMatchObject({ kind: 'igual', editedInElyum: ['status'] })
    expect(task(applyImport(data, plan, into(projectId), ctx()), 'HUE-01').status).toBe('No iniciado')
  })

  it('both changed: a visible conflict; ELYUM wins unless the person picks the dossier', async () => {
    let { data, projectId } = await imported()
    data = setStatus(data, importedId('HUE-01'), 'No iniciado', ctx())
    const b2 = await bundle(SYNTHETIC_DOSSIER.replace('| Comprobar la llave de *paso* | Pendiente |', '| Comprobar la llave de *paso* | No consta |'))
    const plan = planImport(data, b2, into(projectId), ctx())
    expect(plan.items[0]).toMatchObject({ kind: 'conflicto', changes: [{ field: 'status', current: 'No iniciado', incoming: 'No consta', conflict: true }] })
    const kept = applyImport(data, plan, into(projectId), ctx())
    expect(task(kept, 'HUE-01').status).toBe('No iniciado')
    expect(kept.imports!.at(-1)!.resolutions).toEqual([{ taskId: 'src:HUE-01', field: 'status', choice: 'mantener-elyum' }])
    expect(kept.history.find((h) => h.note?.startsWith('conflicto'))).toBeDefined()
    const used = applyImport(data, plan, into(projectId), ctx(), { 'src:HUE-01': { status: 'usar-dossier' } })
    expect(task(used, 'HUE-01').status).toBe('No consta')
    // Next time, the same dossier is no longer a conflict.
    expect(planImport(kept, b2, into(projectId), ctx()).items[0].kind).toBe('igual')
  })

  it('a condition the person answered is never replaced silently by a new dependency text', async () => {
    let { data, projectId } = await imported()
    data = setCondition(data, importedId('HUE-01'), 'r1', 0, 'cumplida', ctx())
    const same = planImport(data, await bundle(), into(projectId), ctx())
    expect(same.items[0].kind).toBe('igual')
    expect(task(applyImport(data, same, into(projectId), ctx()), 'HUE-01').requirements![0].options[0]).toMatchObject({ state: 'cumplida' })
    const b2 = await bundle(SYNTHETIC_DOSSIER.replace('| Acceso al jardín |', '| Acceso al jardín y llave |'))
    expect(planImport(data, b2, into(projectId), ctx()).items[0]).toMatchObject({ kind: 'conflicto', changes: [{ field: 'requirements', conflict: true }] })
  })

  it('what the person owns survives any re-import, even choosing the dossier', async () => {
    let { data, projectId } = await imported()
    const id = importedId('HUE-02')
    data = setOwner(data, id, { kind: 'agente', name: 'Claude Code' }, ctx())
    data = addEvidence(data, id, { label: 'Foto', kind: 'nota' }, ctx())
    data = setStatus(data, id, 'No iniciado', ctx())
    data = decideApproval(data, id, 'devuelta', ctx(), 'otra vez')
    const b2 = await bundle(SYNTHETIC_DOSSIER.replace('| Cambiar el goteo | Pendiente |', '| Cambiar el goteo | No consta |'))
    const plan = planImport(data, b2, into(projectId), ctx())
    const next = applyImport(data, plan, into(projectId), ctx(), { [id]: { status: 'usar-dossier' } })
    const t = task(next, 'HUE-02')
    expect(t.owner).toEqual({ kind: 'agente', name: 'Claude Code' })
    expect(t.evidence).toHaveLength(1)
    expect(t.approval).toMatchObject({ state: 'devuelta', note: 'otra vez' })
    expect(t.status).toBe('No consta')
  })

  it('a task gone from the dossier is listed and kept; a new one is added', async () => {
    const { data, projectId } = await imported()
    const lines = SYNTHETIC_DOSSIER.split('\n')
    const without = lines.filter((l) => !l.startsWith('| HUE-06 ')).join('\n') + '| HUE-07 | Registro | Nueva tarea | Pendiente | x | — | 5 min | — | y | F1 |\n'
    const plan = planImport(data, await bundle(without), into(projectId), ctx())
    expect(plan.missing.map((m) => m.sourceId)).toEqual(['HUE-06'])
    expect(plan.counts).toMatchObject({ new: 1, missing: 1 })
    const next = applyImport(data, plan, into(projectId), ctx())
    expect(next.tasks.map((t) => t.sourceId)).toContain('HUE-06')
    expect(next.tasks.map((t) => t.sourceId)).toContain('HUE-07')
  })
})

// ── Store ───────────────────────────────────────────────────────────────────

describe('P3 · almacén', () => {
  it('saves with a generation; a stale tab cannot overwrite (conflict, nothing written)', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const a = tab(storage, locks, 'A')
    const b = tab(storage, locks, 'B')
    const { data } = await imported()
    expect(await a.load()).toEqual({ kind: 'vacio', generation: 0 })
    expect(await a.save(data, 0)).toMatchObject({ ok: true, generation: 1 })
    const before = storage.snapshot()
    expect(await b.save(emptyProjectsData(), 0)).toMatchObject({ ok: false, reason: 'conflicto', storedGeneration: 1 })
    expect(storage.snapshot()).toBe(before)
    const loaded = await b.load()
    expect(loaded.kind === 'ok' && loaded.data).toEqual(data)
  })

  it('two tabs saving at the same moment: exactly one wins, the other is told', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const results = await Promise.all(['A', 'B', 'C', 'D'].map((w) => tab(storage, locks, w).save(emptyProjectsData(), 0)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.reason === 'conflicto')).toHaveLength(3)
  })

  it('without Web Locks it is read-only and writes nothing', async () => {
    const storage = new MemoryStorage()
    const s = tab(storage, undefined)
    expect(s.mode).toBe('solo-lectura')
    expect(await s.save(emptyProjectsData(), 0)).toMatchObject({ ok: false, reason: 'solo-lectura' })
    expect(storage.map.size).toBe(0)
  })

  it('a lock held elsewhere for too long: refused visibly, nothing written', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const release = locks.hold()
    const r = await tab(storage, locks).save(emptyProjectsData(), 0)
    release()
    expect(r).toMatchObject({ ok: false, reason: 'bloqueo-no-disponible' })
    expect(storage.map.size).toBe(0)
  }, 10_000)

  it('keeps the three previous versions and can bring one back without losing the current', async () => {
    const storage = new MemoryStorage()
    const s = tab(storage, memoryLocks())
    let d = emptyProjectsData()
    for (let g = 0; g < 5; g++) {
      d = { ...d, history: [...d.history, { at: now(), by: 'usuario', entity: 'week', id: '2026-10-26', field: `n${g}` }] }
      expect(await s.save(d, g)).toMatchObject({ ok: true, generation: g + 1 })
    }
    const prev = await s.previous()
    expect(prev.map((p) => (p.loaded.kind === 'ok' ? p.loaded.generation : p.loaded.kind))).toEqual([4, 3, 2])
    expect(await s.recover(3, 5)).toMatchObject({ ok: true, generation: 6 })
    const now6 = await s.load()
    expect(now6.kind === 'ok' && now6.data.history.length).toBe(2)
    const p1 = (await s.previous())[0].loaded
    expect(p1.kind === 'ok' && p1.generation).toBe(5)
  })

  it('a full storage: the error is returned and the stored data stays readable and unchanged', async () => {
    const storage = new MemoryStorage()
    const s = tab(storage, memoryLocks())
    await s.save(emptyProjectsData(), 0)
    const before = storage.getItem(DATA_KEY)
    storage.failOn = (k) => (k === DATA_KEY ? quota() : undefined)
    expect(await s.save((await imported()).data, 1)).toMatchObject({ ok: false, reason: 'sin-espacio' })
    expect(storage.getItem(DATA_KEY)).toBe(before)
    expect((await s.load()).kind).toBe('ok')
    storage.failOn = (k) => (k === PREV_KEYS[0] ? quota() : undefined)
    expect(await s.save((await imported()).data, 1)).toMatchObject({ ok: false, reason: 'sin-espacio' })
    expect(storage.getItem(DATA_KEY)).toBe(before)
  })

  it('a write the browser does not keep is detected on read-back', async () => {
    const storage = new MemoryStorage()
    const s = tab(storage, memoryLocks())
    storage.dropWrites = true
    expect(await s.save(emptyProjectsData(), 0)).toMatchObject({ ok: false, reason: 'verificacion-fallida' })
  })

  it('other errors are returned too, never swallowed', async () => {
    const storage = new MemoryStorage()
    storage.failOn = () => new Error('SecurityError')
    expect(await tab(storage, memoryLocks()).save(emptyProjectsData(), 0)).toMatchObject({ ok: false, reason: 'error-de-escritura' })
  })

  it('invalid data is never written', async () => {
    const storage = new MemoryStorage()
    const bad = { ...emptyProjectsData(), version: 2 } as unknown as ProjectsData
    expect(await tab(storage, memoryLocks()).save(bad, 0)).toMatchObject({ ok: false, reason: 'datos-no-validos' })
    expect(storage.map.size).toBe(0)
  })

  it('corrupt, altered or future data is not loaded as data, and is never overwritten', async () => {
    const storage = new MemoryStorage()
    const s = tab(storage, memoryLocks())
    await s.save((await imported()).data, 0)
    const good = storage.getItem(DATA_KEY)!
    const cases: [string, string][] = [
      ['{"format":', 'ilegible'],
      [good.replace('Huerto de prueba', 'Huerto alterado'), 'ilegible'],
      [good.replace('"generation":1', '"generation":0'), 'ilegible'],
      [JSON.stringify({ format: 'elyum-projects-store/2', generation: 9 }), 'version-futura'],
      ['"texto"', 'ilegible'],
    ]
    for (const [raw, kind] of cases) {
      storage.map.set(DATA_KEY, raw)
      expect((await s.load()).kind).toBe(kind)
      expect(await s.save(emptyProjectsData(), 1)).toMatchObject({ ok: false, reason: 'almacen-ilegible' })
      expect(storage.getItem(DATA_KEY)).toBe(raw)
    }
  })

  it('only writes its own keys', async () => {
    const storage = new MemoryStorage()
    storage.map.set('personal-os:day:2026-10-25', '{"x":1}')
    const s = tab(storage, memoryLocks())
    for (let g = 0; g < 4; g++) await s.save(emptyProjectsData(), g)
    expect([...storage.map.keys()].sort()).toEqual([DATA_KEY, ...PREV_KEYS, 'personal-os:day:2026-10-25'].sort())
    expect(storage.getItem('personal-os:day:2026-10-25')).toBe('{"x":1}')
  })
})

describe('P3 · exportación verificable', () => {
  it('exports the stored text byte for byte and verifies it', async () => {
    const storage = new MemoryStorage()
    await tab(storage, memoryLocks()).save((await imported()).data, 0)
    const { text, file } = await exportProjects(storage, now())
    expect(file.stored).toBe(storage.getItem(DATA_KEY))
    expect(file.summary).toMatchObject({ generation: 1, projects: 1, tasks: 6, references: 2, imports: 1 })
    expect(await verifyExport(text)).toMatchObject({ ok: true, readable: true })
  })

  it('detects an altered copy: stored text, fingerprint, summary or format', async () => {
    const storage = new MemoryStorage()
    await tab(storage, memoryLocks()).save((await imported()).data, 0)
    const { file } = await exportProjects(storage, now())
    const variants = [
      { ...file, stored: file.stored!.replace('Huerto de prueba', 'Huerto falso') },
      { ...file, storedSha256: '0'.repeat(64) },
      { ...file, summary: { ...file.summary!, tasks: 5 } },
      { ...file, format: 'otra-cosa' },
    ]
    for (const v of variants) expect((await verifyExport(JSON.stringify(v))).ok).toBe(false)
    expect((await verifyExport('no es json')).ok).toBe(false)
  })

  it('unreadable data is still exported whole, marked as such', async () => {
    const storage = new MemoryStorage()
    storage.map.set(DATA_KEY, '{"roto":')
    const { text, file } = await exportProjects(storage, now())
    expect(file).toMatchObject({ stored: '{"roto":', readable: false })
    expect(await verifyExport(text)).toEqual({ ok: true, readable: false })
  })
})

describe('P3 · sesión: vista previa, cancelar, confirmar', () => {
  it('previewing writes nothing; cancelling is not doing anything; confirming saves', async () => {
    const storage = new MemoryStorage()
    const session = new ProjectsSession(tab(storage, memoryLocks()), now, random)
    await session.open()
    const p = await session.previewImport(file(), CREATE)
    if (!p.ok) throw new Error(p.error)
    expect(p.preview.plan.counts).toMatchObject({ new: 6 })
    expect(storage.map.size).toBe(0)
    expect(await session.confirmImport(p.preview)).toMatchObject({ ok: true, generation: 1 })
    expect((await readEnvelope(storage.getItem(DATA_KEY))).kind).toBe('ok')
  })

  it('confirming a preview after the data moved is refused', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const session = new ProjectsSession(tab(storage, locks), now, random)
    await session.open()
    const p = await session.previewImport(file(), CREATE)
    if (!p.ok) throw new Error(p.error)
    await tab(storage, locks, 'otra').save(emptyProjectsData(), 0)
    const r = await session.confirmImport(p.preview)
    expect(r).toMatchObject({ ok: false, reason: 'conflicto' })
    expect(session.lastError).toBe(r)
  })

  it('a failed save keeps the data as stored and the error visible', async () => {
    const storage = new MemoryStorage()
    const session = new ProjectsSession(tab(storage, memoryLocks()), now, random)
    await session.open()
    storage.failOn = () => quota()
    const r = await session.change((d) => ({ ...d, history: [...d.history, { at: now(), by: 'usuario', entity: 'week', id: 'x', field: 'y' }] }))
    expect(r).toMatchObject({ ok: false, reason: 'sin-espacio' })
    expect(session.state?.status === 'listo' && session.state.data.history).toEqual([])
    expect(session.lastError).toBe(r)
  })

  it('unreadable stored data opens as such, never as an empty project list', async () => {
    const storage = new MemoryStorage()
    storage.map.set(DATA_KEY, 'basura')
    const session = new ProjectsSession(tab(storage, memoryLocks()), now, random)
    expect(await session.open()).toMatchObject({ status: 'ilegible', raw: 'basura' })
    expect((await session.change((d) => d)).ok).toBe(false)
  })
})
