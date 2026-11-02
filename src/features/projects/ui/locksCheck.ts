import { sha256Hex } from '../import/sha256'
import { emptyProjectsData } from '../store/session'
import { createStore, DATA_KEY, type KeyValue, type Locks } from '../store/store'
import type { ProjectsData } from '../domain/types'

/**
 * P4a · Web Locks check for the iPhone, with SYNTHETIC data only. It drives
 * the real store (generation, lock, read-back) on its own keys, so it never
 * touches the data of PROYECTOS:
 *
 *   elyum:prueba-p4a:elyum:projects:v1:*   the store under test
 *   elyum:prueba-p4a:registro               one line per run, to see persistence
 *
 * Each step says what it proved and on which browser. Nothing here claims
 * more than the browser it ran on.
 */

export const DIAG_PREFIX = 'elyum:prueba-p4a:'
export const DIAG_LOG_KEY = `${DIAG_PREFIX}registro`
const DIAG_LOCK = 'elyum:prueba-p4a'

export type StepResult = 'ok' | 'falla' | 'aviso'
export interface Step {
  id: 'api' | 'bloqueo' | 'escritura' | 'conflicto' | 'persistencia' | 'sin-bloqueo' | 'almacen'
  label: string
  result: StepResult
  detail: string
}

export interface Run {
  at: string
  where: 'app' | 'navegador'
  locks: boolean
  generation: number
  sha256: string
}

export interface Report {
  at: string
  where: 'app' | 'navegador'
  userAgent: string
  secure: boolean
  locks: boolean
  steps: Step[]
  previous: Run[]
  verdict: string
}

export interface Env {
  storage: KeyValue & { key?(i: number): string | null; readonly length?: number }
  /** `navigator.locks` as the browser gives it (may be missing). */
  locks: Locks | undefined
  now: () => string
  where: 'app' | 'navegador'
  userAgent: string
  secure: boolean
  persisted?: () => Promise<boolean>
}

/** Storage with every key moved under the check's own prefix. */
export function prefixed(storage: KeyValue): KeyValue {
  return {
    getItem: (k) => storage.getItem(DIAG_PREFIX + k),
    setItem: (k, v) => storage.setItem(DIAG_PREFIX + k, v),
    removeItem: (k) => storage.removeItem(DIAG_PREFIX + k),
  }
}

/** Synthetic data that validates: one invented project, no tasks. */
export function syntheticData(run: number): ProjectsData {
  const d = emptyProjectsData()
  return {
    ...d,
    vocabularies: { 'prueba-sintetica': { status: [], priority: [], approval: [] } },
    projects: [{ id: 'prueba-sintetica', name: `Prueba sintética · ejecución ${run}`, dossier: 'prueba-sintetica', expectedResults: [], atlasRefs: [] }],
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms))])
}

function readLog(storage: KeyValue): Run[] {
  try {
    const v = JSON.parse(storage.getItem(DIAG_LOG_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as Run[]) : []
  } catch {
    return []
  }
}

export async function runLocksCheck(env: Env): Promise<Report> {
  const steps: Step[] = []
  const at = env.now()
  const add = (s: Step) => steps.push(s)
  const store = prefixed(env.storage)
  const previous = readLog(env.storage)
  const hasLocks = !!env.locks && typeof env.locks.request === 'function'
  // Read before anything is written: this is what the previous run left.
  const startRaw = store.getItem(DATA_KEY)
  const startSha = startRaw === null ? '' : await sha256Hex(startRaw)

  // 1 · The API exists.
  add({ id: 'api', label: 'navigator.locks existe', result: hasLocks ? 'ok' : 'falla', detail: hasLocks ? 'Web Locks disponible en este navegador.' : 'Este navegador no ofrece Web Locks: PROYECTOS abre en solo lectura.' })

  // 2 · A lock can be taken and released.
  if (hasLocks) {
    try {
      const t0 = Date.now()
      await withTimeout(env.locks!.request(DIAG_LOCK, { mode: 'exclusive' }, async () => undefined), 3000)
      add({ id: 'bloqueo', label: 'Tomar y soltar un bloqueo', result: 'ok', detail: `Bloqueo exclusivo concedido y liberado en ${Date.now() - t0} ms.` })
    } catch (e) {
      add({ id: 'bloqueo', label: 'Tomar y soltar un bloqueo', result: 'falla', detail: `El bloqueo no se concedió: ${e instanceof Error ? e.message : String(e)}.` })
    }
  }

  // 3 · Write through the real store and read it back from a fresh one.
  let generation = 0
  let sha = ''
  if (hasLocks) {
    try {
      const a = createStore({ storage: store, locks: env.locks, now: env.now, writer: `prueba:${env.where}:a` })
      const before = await a.load()
      if (before.kind === 'ilegible' || before.kind === 'version-futura') throw new Error('los datos de prueba anteriores no se pueden leer')
      const r = await a.save(syntheticData(previous.length + 1), before.generation)
      if (!r.ok) throw new Error(`${r.reason}: ${r.message}`)
      const again = await createStore({ storage: store, locks: env.locks, now: env.now, writer: `prueba:${env.where}:b` }).load()
      if (again.kind !== 'ok' || again.generation !== r.generation) throw new Error('lo releído no coincide con lo guardado')
      generation = r.generation
      sha = await sha256Hex(store.getItem(DATA_KEY) ?? '')
      add({ id: 'escritura', label: 'Escribir y releer (datos sintéticos)', result: 'ok', detail: `Guardado con bloqueo y releído: generación ${before.generation} → ${r.generation}.` })
    } catch (e) {
      add({ id: 'escritura', label: 'Escribir y releer (datos sintéticos)', result: 'falla', detail: e instanceof Error ? e.message : String(e) })
    }

    // 4 · Two writers from the same generation: the second must be refused.
    try {
      const a = createStore({ storage: store, locks: env.locks, now: env.now, writer: `prueba:${env.where}:c` })
      const b = createStore({ storage: store, locks: env.locks, now: env.now, writer: `prueba:${env.where}:d` })
      const base = await a.load()
      if (base.kind !== 'ok' && base.kind !== 'vacio') throw new Error('no se pudo leer la base')
      const [ra, rb] = await Promise.all([a.save(syntheticData(previous.length + 1), base.generation), b.save(syntheticData(previous.length + 1), base.generation)])
      const okCount = [ra, rb].filter((r) => r.ok).length
      const refused = [ra, rb].filter((r) => !r.ok && r.reason === 'conflicto').length
      const good = okCount === 1 && refused === 1
      const after = await a.load()
      if (after.kind === 'ok') {
        generation = after.generation
        sha = await sha256Hex(store.getItem(DATA_KEY) ?? '')
      }
      add({
        id: 'conflicto',
        label: 'Dos escrituras a la vez',
        result: good ? 'ok' : 'falla',
        detail: good ? 'Una se guardó y la otra se rechazó como conflicto; no se perdió nada.' : `Resultado inesperado: ${okCount} guardadas, ${refused} rechazadas.`,
      })
    } catch (e) {
      add({ id: 'conflicto', label: 'Dos escrituras a la vez', result: 'falla', detail: e instanceof Error ? e.message : String(e) })
    }
  }

  // 5 · What the previous run left is still here, byte for byte (close and reopen to prove it).
  const last = previous[previous.length - 1]
  if (!last) {
    add({ id: 'persistencia', label: 'Persistencia al cerrar y abrir', result: 'aviso', detail: 'Primera ejecución aquí. Cierra la pestaña o la app, vuelve a abrirla y repite la prueba.' })
  } else {
    const where = last.where === 'app' ? 'app instalada' : 'navegador'
    const intact = last.sha256 === '' ? true : startSha === last.sha256
    add({
      id: 'persistencia',
      label: 'Persistencia al cerrar y abrir',
      result: intact ? 'ok' : 'falla',
      detail: intact
        ? `Lo que dejó la ejecución anterior (${last.at}, ${where}) sigue aquí${last.sha256 ? ', con la misma huella' : ''}. Ejecuciones registradas: ${previous.length}.`
        : `Lo guardado por la ejecución anterior (${last.at}, ${where}) no está o cambió.`,
    })
  }

  // 6 · Without locks the store must refuse to write and leave the data as it was.
  try {
    const raw = store.getItem(DATA_KEY)
    const ro = createStore({ storage: store, locks: undefined, now: env.now, writer: `prueba:${env.where}:sin-bloqueo` })
    const base = await ro.load()
    const r = await ro.save(syntheticData(0), base.kind === 'ok' ? base.generation : 0)
    const untouched = store.getItem(DATA_KEY) === raw
    const good = ro.mode === 'solo-lectura' && !r.ok && r.reason === 'solo-lectura' && untouched
    add({
      id: 'sin-bloqueo',
      label: 'Sin Web Locks: solo lectura',
      result: good ? 'ok' : 'falla',
      detail: good ? 'Simulado quitando el bloqueo: no escribió y los datos quedaron igual.' : 'El almacén sin bloqueo no se comportó como solo lectura.',
    })
  } catch (e) {
    add({ id: 'sin-bloqueo', label: 'Sin Web Locks: solo lectura', result: 'falla', detail: e instanceof Error ? e.message : String(e) })
  }

  // 7 · Whether the browser promised to keep this storage (information).
  if (env.persisted) {
    try {
      const p = await env.persisted()
      add({ id: 'almacen', label: 'Almacenamiento persistente', result: p ? 'ok' : 'aviso', detail: p ? 'El navegador se compromete a no borrarlo.' : 'El navegador puede borrarlo si falta espacio o tras un tiempo sin uso. Exporta.' })
    } catch {
      /* not offered: nothing to report */
    }
  }

  const failed = steps.filter((s) => s.result === 'falla')
  const verdict = !hasLocks
    ? 'Sin Web Locks en este navegador: PROYECTOS queda en solo lectura aquí.'
    : failed.length
      ? `Fallan ${failed.length} comprobaciones: no uses PROYECTOS para escribir aquí todavía.`
      : 'Web Locks funciona en este navegador con datos sintéticos.'

  try {
    env.storage.setItem(DIAG_LOG_KEY, JSON.stringify([...previous, { at, where: env.where, locks: hasLocks, generation, sha256: sha } satisfies Run].slice(-20)))
  } catch {
    /* quota: the report still shows */
  }
  return { at, where: env.where, userAgent: env.userAgent, secure: env.secure, locks: hasLocks, steps, previous, verdict }
}

export function reportText(r: Report): string {
  const mark = { ok: '✓', falla: '✗', aviso: '·' }
  return [
    `ELYUM · PROYECTOS · prueba de Web Locks (P4a)`,
    `Fecha: ${r.at}`,
    `Dónde: ${r.where === 'app' ? 'app instalada (pantalla de inicio)' : 'navegador'}`,
    `Navegador: ${r.userAgent}`,
    `Contexto seguro: ${r.secure ? 'sí' : 'no'}`,
    '',
    ...r.steps.map((s) => `${mark[s.result]} ${s.label}: ${s.detail}`),
    '',
    `Resultado: ${r.verdict}`,
  ].join('\n')
}

/** Remove only what the check wrote. */
export function clearCheck(storage: KeyValue & { key(i: number): string | null; readonly length: number }): number {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k?.startsWith(DIAG_PREFIX)) keys.push(k)
  }
  for (const k of keys) storage.removeItem(k)
  return keys.length
}
