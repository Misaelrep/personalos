import { describe, expect, it } from 'vitest'
import { applyImport, planImport, type ImportDecisions } from './import/plan'
import { readDossierFile } from './import/readers'
import { expandRange, readRequirements, resolveNumber } from './import/requirements'
import { SYNTHETIC_DOSSIER } from './import/fixtures'
import { validateProjectsData } from './domain/schema'
import { emptyProjectsData } from './store/session'
import type { ProjectsData } from './domain/types'

/*
 * Dependencias explícitas de dossiers con IDs de una letra (M01, A2) y rangos
 * («M03–M04»). Todo el contenido es inventado: el repositorio es público.
 *
 * Reglas: solo se enlaza una tarea que existe en el mismo dossier; lo demás
 * queda como condición «por verificar» con su texto. Nunca un enlace roto.
 */

const known = (...ids: string[]) => new Set(ids)

describe('lectura de dependencias · IDs de una letra y rangos', () => {
  it('enlaza un ID de una letra que existe en el dossier', () => {
    expect(readRequirements('M01', known('M01'))).toEqual([{ id: 'r1', literal: 'M01', kind: 'tarea', mode: 'todas', options: [{ kind: 'tarea', taskId: 'src:M01' }] }])
    expect(readRequirements('A2+A4', known('A2', 'A4'))[0]).toMatchObject({ kind: 'tarea', mode: 'todas', options: [{ taskId: 'src:A2' }, { taskId: 'src:A4' }] })
    expect(readRequirements('M01, M02', known('M01', 'M02'))[0]).toMatchObject({ kind: 'tarea', options: [{ taskId: 'src:M01' }, { taskId: 'src:M02' }] })
  })

  it('un ID que no está en el dossier queda como condición, nunca como enlace', () => {
    expect(readRequirements('M09', known('M01'))[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: 'M09', state: 'por-verificar' }] })
    expect(readRequirements('A2+A9', known('A2'))[0]).toMatchObject({ kind: 'mixto', options: [{ kind: 'tarea', taskId: 'src:A2' }, { kind: 'condicion', literal: 'A9' }] })
  })

  it('un rango explícito se expande y se muestra como lectura', () => {
    expect(expandRange('M03–M05')).toEqual(['M03', 'M04', 'M05'])
    expect(expandRange('M03—M04')).toEqual(['M03', 'M04'])
    expect(readRequirements('M03–M05', known('M03', 'M04', 'M05'))[0]).toMatchObject({ kind: 'tarea', mode: 'todas', reading: 'M03–M05 → M03, M04, M05', options: [{ taskId: 'src:M03' }, { taskId: 'src:M04' }, { taskId: 'src:M05' }] })
  })

  it('un rango con alguna tarea inexistente no se expande: queda entero como condición', () => {
    expect(readRequirements('M03–M05', known('M03', 'M05'))[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: 'M03–M05' }] })
    expect(readRequirements('HUE-02,03', known('HUE-02'))[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: 'HUE-02,03' }] })
  })

  it('no inventa rangos: prefijos distintos, anchos distintos, al revés, guion corto o demasiado largos', () => {
    expect(expandRange('M03–P04')).toBeNull()
    expect(expandRange('M3–M04')).toBeNull()
    expect(expandRange('M05–M03')).toBeNull()
    expect(expandRange('M03-M04')).toBeNull()
    expect(expandRange('M01–M99')).toBeNull()
    expect(readRequirements('Fase 1–2')[0]).toMatchObject({ kind: 'externo' })
  })

  it('conserva alternativas, condiciones y «ninguna»', () => {
    expect(readRequirements('A1 o material del vecino', known('A1'))[0]).toMatchObject({ kind: 'alternativa', mode: 'alguna', options: [{ kind: 'tarea', taskId: 'src:A1' }, { kind: 'condicion', literal: 'material del vecino' }] })
    expect(readRequirements('Permiso del vecino', known('A1'))[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: 'Permiso del vecino' }] })
    expect(readRequirements('Ninguna', known('A1'))).toEqual([])
    expect(readRequirements('—', known('A1'))).toEqual([])
  })

  it('«Ninguna para …» no crea un requisito; lo que añade algo más sigue siendo condición', () => {
    expect(readRequirements('Ninguna para empezar', known('A1'))).toEqual([])
    expect(readRequirements('ninguno para la prueba', known('A1'))).toEqual([])
    expect(readRequirements('Ninguna para empezar + A1', known('A1'))[0]).toMatchObject({ kind: 'mixto' })
    expect(readRequirements('Ninguna para empezar, salvo permiso', known('A1'))[0]).toMatchObject({ kind: 'externo' })
    expect(readRequirements('Ninguna para empezar o permiso', known('A1'))[0]).toMatchObject({ kind: 'alternativa' })
    expect(readRequirements('Ninguna para la fase 2', known('A1'))[0]).toMatchObject({ kind: 'externo' })
    expect(readRequirements('Ninguna salvo permiso', known('A1'))[0]).toMatchObject({ kind: 'externo' })
  })
})

describe('lectura de dependencias · abreviaturas resueltas contra el mismo dossier', () => {
  const uniform = known('TAR-001', 'TAR-002', 'TAR-003', 'TAR-004', 'TAR-005')

  it('número suelto: solo si todas las tareas tienen las mismas letras y cifras', () => {
    expect(resolveNumber('002', uniform)).toBe('TAR-002')
    expect(readRequirements('002', uniform)[0]).toMatchObject({ kind: 'tarea', reading: '002 → TAR-002', options: [{ kind: 'tarea', taskId: 'src:TAR-002' }] })
    // Not an ID of the dossier, another width, prefixes mixed or no dossier: a condition, never a link.
    expect(readRequirements('009', uniform)[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: '009' }] })
    expect(readRequirements('2', uniform)[0]).toMatchObject({ kind: 'externo' })
    expect(readRequirements('01', known('AAA-01', 'BBB-01'))[0]).toMatchObject({ kind: 'externo' })
    expect(readRequirements('1', known('A1', 'B1', 'A2'))[0]).toMatchObject({ kind: 'externo' })
    expect(readRequirements('001')[0]).toMatchObject({ kind: 'externo' })
  })

  it('lista de números sueltos', () => {
    expect(readRequirements('002,004', uniform)[0]).toMatchObject({ kind: 'tarea', reading: '002,004 → TAR-002, TAR-004', options: [{ taskId: 'src:TAR-002' }, { taskId: 'src:TAR-004' }] })
    expect(readRequirements('002,009', uniform)[0]).toMatchObject({ kind: 'mixto', options: [{ kind: 'tarea', taskId: 'src:TAR-002' }, { kind: 'condicion', literal: '009' }] })
  })

  it('rango de números sueltos', () => {
    expect(readRequirements('002–004', uniform)[0]).toMatchObject({ kind: 'tarea', reading: '002–004 → TAR-002, TAR-003, TAR-004', options: [{ taskId: 'src:TAR-002' }, { taskId: 'src:TAR-003' }, { taskId: 'src:TAR-004' }] })
    expect(readRequirements('004–009', uniform)[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: '004–009' }] })
    expect(expandRange('002–004')).toBeNull()
    expect(expandRange('002-004', uniform)).toBeNull()
    expect(expandRange('002–TAR-004', uniform)).toBeNull()
  })

  it('rango con el final abreviado', () => {
    expect(expandRange('TAR-001–003')).toEqual(['TAR-001', 'TAR-002', 'TAR-003'])
    expect(readRequirements('TAR-001–003', uniform)[0]).toMatchObject({ kind: 'tarea', reading: 'TAR-001–003 → TAR-001, TAR-002, TAR-003' })
    expect(expandRange('TAR-001–03')).toBeNull()
  })

  it('barra en lugar de coma', () => {
    expect(readRequirements('TAR-001/004', uniform)[0]).toMatchObject({ kind: 'tarea', reading: 'TAR-001/004 → TAR-001, TAR-004', options: [{ taskId: 'src:TAR-001' }, { taskId: 'src:TAR-004' }] })
    expect(readRequirements('TAR-001/009', uniform)[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: 'TAR-001/009' }] })
    expect(readRequirements('TAR-001/04', uniform)[0]).toMatchObject({ kind: 'externo' })
  })

  it('el texto original se conserva siempre', () => {
    for (const lit of ['002', '002,004', '002–004', 'TAR-001–003', 'TAR-001/004']) expect(readRequirements(lit, uniform)[0].literal).toBe(lit)
  })
})

// A synthetic dossier with one-letter IDs, an explicit range and a reference to a task it does not have.
const ONE_LETTER = `# DOSSIER DE EJECUCIÓN — JARDÍN INVENTADO

| ID | Área | Tarea concreta | Estado | Entregable | Dependencia | Tiempo humano | Agente posible | Hecho cuando… | Fuente |
|---|---|---|---|---|---|---|---|---|---|
| M01 | Alcance | Decidir el tamaño del jardín | Pendiente | Decisión | — | 0.5 h | No | Una medida | Inventada |
| M02 | Riego | Comprar la manguera | Pendiente | Manguera | M01 | 1 h | Parcial | Manguera en casa | Inventada |
| M03 | Riego | Montar el riego | Pendiente | Riego | M01, M02 | 2 h | Sí | Agua en todas las plantas | Inventada |
| M04 | Siembra | Sembrar | Pendiente | Semillas en tierra | M02–M03 | 1 h | No | Semillas en tierra | Inventada |
| M05 | Registro | Anotar el crecimiento | Pendiente | Hoja | M04 + regla | 15 min | Sí | Una fila por semana | Inventada |
| M06 | Cierre | Revisar con el vecino | Pendiente | Notas | M09 | 30 min | No | Notas escritas | Inventada |
| M07 | Cierre | Pensar en el año que viene | Pendiente | Nota | Ninguna para empezar | 10 min | No | Una nota | Inventada |
`

async function importText(data: ProjectsData, text: string, name: string) {
  const r = await readDossierFile({ name, bytes: new TextEncoder().encode(text) })
  if (!r.ok) throw new Error(r.error)
  const decisions: ImportDecisions = { target: { create: { name } } }
  const plan = planImport(data, r.bundle, decisions, { now: '2026-11-05T00:00:00-06:00' })
  expect(plan.ok).toBe(true)
  return { plan, data: applyImport(data, plan, decisions, { now: '2026-11-05T00:00:01-06:00' }) }
}

describe('importación · dependencias explícitas sin enlaces rotos', () => {
  it('enlaza M01–M05 dentro del dossier; M09 (no existe) queda como condición', async () => {
    const { plan, data } = await importText(emptyProjectsData(), ONE_LETTER, 'JARDIN_INVENTADO.md')
    const t = (id: string) => data.tasks.find((x) => x.sourceId === id)!
    expect(t('M02').requirements?.[0]).toMatchObject({ kind: 'tarea', options: [{ taskId: 'src:M01' }] })
    expect(t('M04').requirements?.[0]).toMatchObject({ kind: 'tarea', reading: 'M02–M03 → M02, M03' })
    expect(t('M05').requirements?.[0]).toMatchObject({ kind: 'mixto', options: [{ kind: 'tarea', taskId: 'src:M04' }, { kind: 'condicion', literal: 'regla' }] })
    expect(t('M06').requirements?.[0]).toMatchObject({ kind: 'externo', options: [{ kind: 'condicion', literal: 'M09', state: 'por-verificar' }] })
    expect(t('M07').requirements ?? []).toEqual([])
    expect(t('M07').origin?.raw).toContain('Ninguna para empezar')
    expect(plan.items.find((i) => i.sourceId === 'M04')?.readings).toEqual(['M02–M03 → M02, M03'])
    // dependsOn stays empty: the dossier's dependencies live in `requirements`, as for every imported dossier.
    expect(data.tasks.every((x) => x.dependsOn.length === 0)).toBe(true)
    const v = validateProjectsData(data)
    expect(v.ok).toBe(true)
    expect(v.warnings.filter((w) => /no existe/.test(w.message))).toEqual([])
  })

  it('el dossier sintético de siempre se lee igual que antes', async () => {
    const { data } = await importText(emptyProjectsData(), SYNTHETIC_DOSSIER, 'DOSSIER_SINTETICO_HUERTO_2026-10-20.md')
    const req = (id: string) => data.tasks.find((x) => x.sourceId === id)!.requirements
    expect(req('HUE-02')).toEqual([{ id: 'r1', literal: 'HUE-01', kind: 'tarea', mode: 'todas', options: [{ kind: 'tarea', taskId: 'src:HUE-01' }] }])
    expect(req('HUE-05')?.[0]).toMatchObject({ kind: 'tarea', reading: 'HUE-02,03 → HUE-02, HUE-03' })
    expect(req('HUE-04')?.[0]).toMatchObject({ kind: 'condicional' })
  })

  it('reimportar el mismo archivo no cambia nada', async () => {
    const first = await importText(emptyProjectsData(), ONE_LETTER, 'JARDIN_INVENTADO.md')
    const r = await readDossierFile({ name: 'JARDIN_INVENTADO.md', bytes: new TextEncoder().encode(ONE_LETTER) })
    if (!r.ok) throw new Error(r.error)
    const plan = planImport(first.data, r.bundle, { target: { projectId: first.plan.projectId } }, { now: '2026-11-05T00:00:02-06:00' })
    expect(plan.counts).toMatchObject({ new: 0, changed: 0, conflicts: 0, unchanged: 7 })
  })
})
