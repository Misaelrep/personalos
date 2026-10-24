import { validateProjectsData } from '../domain/schema'
import type { ProjectsData } from '../domain/types'
import { sha256Hex } from '../import/sha256'

/**
 * P3 · PROYECTOS' own storage. Only this module writes `elyum:projects:v1:*`;
 * nothing of the CORE or APRENDER is read or written here.
 *
 *   elyum:projects:v1:data     the envelope: generation, fingerprint, data
 *   elyum:projects:v1:prev:1…3 the three previous envelopes, newest first
 *
 * Rules, each with a test:
 *  - Every save says which generation it started from. Inside an exclusive
 *    Web Lock it re-reads the stored generation; if another tab (or the
 *    installed app) saved meanwhile, nothing is written: «conflicto».
 *  - Without Web Locks the store opens READ-ONLY. It never writes unsafely.
 *  - Data that does not validate is never written; stored data that cannot
 *    be read (corrupt, altered, from a future version) is never overwritten.
 *  - A failed write (quota, refusal) is returned, never swallowed; the stored
 *    data stays as it was. A write is read back before it counts.
 *  - Before each write the previous envelope is kept (`prev:1…3`). That is a
 *    limited local recovery, not a backup: exporting is.
 */

export const STORE_FORMAT = 'elyum-projects-store/1'
export const DATA_KEY = 'elyum:projects:v1:data'
export const PREV_KEYS = ['elyum:projects:v1:prev:1', 'elyum:projects:v1:prev:2', 'elyum:projects:v1:prev:3'] as const
export const LOCK_NAME = 'elyum:projects:v1'
const LOCK_TIMEOUT_MS = 5000

export interface Envelope {
  format: typeof STORE_FORMAT
  generation: number
  savedAt: string
  /** Which tab / app instance wrote it. */
  writer: string
  /** SHA-256 of `JSON.stringify(data)`. */
  sha256: string
  data: ProjectsData
}

/** The part of `Storage` this module needs. */
export interface KeyValue {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** The part of `navigator.locks` this module needs. */
export interface Locks {
  request<T>(name: string, options: { mode: 'exclusive'; signal?: AbortSignal }, callback: () => Promise<T>): Promise<T>
}

export type Loaded =
  | { kind: 'vacio'; generation: 0 }
  | { kind: 'ok'; generation: number; savedAt: string; data: ProjectsData; warnings: string[] }
  | { kind: 'ilegible'; reason: string; raw: string }
  | { kind: 'version-futura'; format: string; raw: string }

export type SaveFailure =
  | 'solo-lectura'
  | 'conflicto'
  | 'datos-no-validos'
  | 'almacen-ilegible'
  | 'sin-espacio'
  | 'error-de-escritura'
  | 'verificacion-fallida'
  | 'bloqueo-no-disponible'

export type SaveResult = { ok: true; generation: number; savedAt: string } | { ok: false; reason: SaveFailure; message: string; storedGeneration?: number }

export interface StoreOptions {
  storage: KeyValue
  /** `undefined` when the browser has no Web Locks: the store is then read-only. */
  locks: Locks | undefined
  now: () => string
  writer: string
}

export interface ProjectsStore {
  readonly mode: 'escritura' | 'solo-lectura'
  readonly readOnlyReason?: string
  load(): Promise<Loaded>
  save(data: ProjectsData, expectedGeneration: number): Promise<SaveResult>
  previous(): Promise<{ slot: 1 | 2 | 3; loaded: Loaded }[]>
  /** Save a previous version as the newest one (the current one becomes prev:1). */
  recover(slot: 1 | 2 | 3, expectedGeneration: number): Promise<SaveResult>
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Read one stored envelope without trusting it. */
export async function readEnvelope(raw: string | null): Promise<Loaded> {
  if (raw === null) return { kind: 'vacio', generation: 0 }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'ilegible', reason: 'no es JSON válido', raw }
  }
  if (!isObject(parsed)) return { kind: 'ilegible', reason: 'no es un objeto', raw }
  if (parsed.format !== STORE_FORMAT) {
    if (typeof parsed.format === 'string' && parsed.format.startsWith('elyum-projects-store/')) return { kind: 'version-futura', format: parsed.format, raw }
    return { kind: 'ilegible', reason: `formato desconocido: ${String(parsed.format)}`, raw }
  }
  if (!Number.isInteger(parsed.generation) || (parsed.generation as number) < 1) return { kind: 'ilegible', reason: 'generación no válida', raw }
  if (typeof parsed.sha256 !== 'string' || typeof parsed.savedAt !== 'string') return { kind: 'ilegible', reason: 'falta la huella o la fecha', raw }
  if ((await sha256Hex(JSON.stringify(parsed.data))) !== parsed.sha256) return { kind: 'ilegible', reason: 'la huella no coincide: los datos se alteraron o se escribieron a medias', raw }
  const v = validateProjectsData(parsed.data)
  if (!v.ok) {
    if (isObject(parsed.data) && typeof parsed.data.version === 'number' && parsed.data.version > 1) return { kind: 'version-futura', format: `datos v${parsed.data.version}`, raw }
    return { kind: 'ilegible', reason: `datos no válidos: ${v.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`, raw }
  }
  return { kind: 'ok', generation: parsed.generation as number, savedAt: parsed.savedAt, data: v.data, warnings: v.warnings.map((w) => `${w.path}: ${w.message}`) }
}

const isQuota = (e: unknown) =>
  e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(e.message)) ? true : (e as { code?: number })?.code === 22

export function createStore(o: StoreOptions): ProjectsStore {
  const mode = o.locks ? 'escritura' : 'solo-lectura'

  async function writeLocked(data: ProjectsData, expected: number): Promise<SaveResult> {
    const raw = o.storage.getItem(DATA_KEY)
    const current = await readEnvelope(raw)
    if (current.kind === 'ilegible' || current.kind === 'version-futura')
      return { ok: false, reason: 'almacen-ilegible', message: 'Los datos guardados no se pueden leer; no se sobrescriben. Expórtalos tal cual.' }
    if (current.generation !== expected)
      return { ok: false, reason: 'conflicto', message: 'Otra pestaña o la app instalada guardó cambios. No se ha escrito nada; recarga.', storedGeneration: current.generation }

    const copy = JSON.parse(JSON.stringify(data)) as unknown
    const v = validateProjectsData(copy)
    if (!v.ok) return { ok: false, reason: 'datos-no-validos', message: v.errors.map((e) => `${e.path}: ${e.message}`).join('; ') }

    const savedAt = o.now()
    const envelope: Envelope = { format: STORE_FORMAT, generation: expected + 1, savedAt, writer: o.writer, sha256: await sha256Hex(JSON.stringify(copy)), data: copy as ProjectsData }
    const next = JSON.stringify(envelope)

    try {
      if (raw !== null) {
        const p1 = o.storage.getItem(PREV_KEYS[0])
        const p2 = o.storage.getItem(PREV_KEYS[1])
        if (p2 !== null) o.storage.setItem(PREV_KEYS[2], p2)
        if (p1 !== null) o.storage.setItem(PREV_KEYS[1], p1)
        o.storage.setItem(PREV_KEYS[0], raw)
      }
      o.storage.setItem(DATA_KEY, next)
    } catch (e) {
      // `setItem` replaces a value whole or not at all: the data key still holds `raw`.
      return isQuota(e)
        ? { ok: false, reason: 'sin-espacio', message: 'No hay espacio en el almacenamiento del navegador. No se ha guardado; exporta y libera espacio.' }
        : { ok: false, reason: 'error-de-escritura', message: `El navegador rechazó la escritura: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (o.storage.getItem(DATA_KEY) !== next) {
      try {
        if (raw === null) o.storage.removeItem(DATA_KEY)
        else o.storage.setItem(DATA_KEY, raw)
      } catch {
        /* reported below */
      }
      return { ok: false, reason: 'verificacion-fallida', message: 'Lo guardado no coincide al releerlo; se intentó dejar la versión anterior.' }
    }
    return { ok: true, generation: envelope.generation, savedAt }
  }

  const store: ProjectsStore = {
    mode,
    ...(mode === 'solo-lectura' ? { readOnlyReason: 'Este navegador no ofrece Web Locks: PROYECTOS se abre en solo lectura para no arriesgar escrituras simultáneas.' } : {}),
    load: () => readEnvelope(o.storage.getItem(DATA_KEY)),
    async save(data, expected) {
      if (!o.locks) return { ok: false, reason: 'solo-lectura', message: store.readOnlyReason! }
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), LOCK_TIMEOUT_MS)
      try {
        return await o.locks.request(LOCK_NAME, { mode: 'exclusive', signal: ctrl.signal }, async () => {
          clearTimeout(timer)
          return writeLocked(data, expected)
        })
      } catch (e) {
        if (ctrl.signal.aborted) return { ok: false, reason: 'bloqueo-no-disponible', message: 'Otra pestaña retiene el almacén. No se ha guardado; inténtalo de nuevo.' }
        return { ok: false, reason: 'error-de-escritura', message: e instanceof Error ? e.message : String(e) }
      } finally {
        clearTimeout(timer)
      }
    },
    async previous() {
      return Promise.all(PREV_KEYS.map(async (k, i) => ({ slot: (i + 1) as 1 | 2 | 3, loaded: await readEnvelope(o.storage.getItem(k)) })))
    },
    async recover(slot, expected) {
      const loaded = await readEnvelope(o.storage.getItem(PREV_KEYS[slot - 1]))
      if (loaded.kind !== 'ok') return { ok: false, reason: 'datos-no-validos', message: `La versión anterior ${slot} no se puede usar (${loaded.kind}).` }
      return store.save(loaded.data, expected)
    },
  }
  return store
}

/** The browser's storage and locks, or read-only when either is missing. */
export function browserStore(writer: string, now: () => string): ProjectsStore {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: Locks }) : undefined
  return createStore({ storage: window.localStorage, locks: nav?.locks && typeof nav.locks.request === 'function' ? nav.locks : undefined, now, writer })
}
