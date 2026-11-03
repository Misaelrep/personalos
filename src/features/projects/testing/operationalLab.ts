/** Development-only destination for synthetic operational-key tests. Never imports personal storage into the lab. */
import type { ProjectsData } from '../domain/types'
import { syntheticSix } from '../ui/sandbox'
import type { RestoreTarget } from '../ui/RestoreView'
import { createStore, DATA_KEY, LOCK_NAME, PREV_KEYS, type KeyValue, type Locks } from '../store/store'
import { JOURNAL_KEY } from '../store/journal'
import { labLocationAllowed } from './labHost'

export const LAB_KEY = 'elyum:lab:p2r1:run'
export const LAB_PATH = '/e2e/projects/operational.html'
const own = new Set<string>([DATA_KEY, ...PREV_KEYS, JOURNAL_KEY])
const allowed = new Set([...own, LAB_KEY])
type LabData = ProjectsData & { syntheticRecoveryLab?: string }
export interface LabStorage extends KeyValue { readonly length: number; key(index: number): string | null }
export interface LabOptions {
  dev: boolean
  location: { hostname: string; pathname: string; protocol?: string }
  /** The one extra hostname for temporary HTTPS access from a phone; only the lab server sets it. */
  labHost?: string
  storage: LabStorage
  locks: Locks | undefined
  now(): string
  random(): string
}
function locationAllowed(o: LabOptions) {
  if (!o.dev || !labLocationAllowed(o.location, o.labHost) || o.location.pathname !== LAB_PATH)
    throw new Error('El laboratorio solo abre en desarrollo, en este equipo o en el acceso temporal HTTPS configurado, y en su página de prueba dedicada.')
}
function knownKeys(storage: LabStorage) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && !allowed.has(key)) throw new Error('Este origen contiene otras claves. Usa otro puerto y un perfil desechable vacío; no se ha borrado nada.')
  }
}
export async function openOperationalLab(o: LabOptions): Promise<{ target: RestoreTarget; run: string }> {
  locationAllowed(o)
  if (!o.locks) throw new Error('El laboratorio necesita Web Locks; no se ha escrito nada.')
  const locks = o.locks
  return locks.request(`${LOCK_NAME}:laboratorio`, { mode: 'exclusive' }, async () => {
    let run = o.storage.getItem(LAB_KEY)
    if (run === null) {
      // A previously populated origin, even with only project keys, is not a disposable lab.
      if (o.storage.length !== 0) throw new Error('El origen no está vacío. Usa un perfil y puerto desechables; no se ha tocado nada.')
      run = o.random()
      const data: LabData = { ...await syntheticSix(o.now, o.random), syntheticRecoveryLab: run }
      const seed = await createStore({ ...o, locks, writer: 'laboratorio:semilla' }).save(data, 0)
      if (!seed.ok) throw new Error(seed.message)
      o.storage.setItem(LAB_KEY, run)
    }
    knownKeys(o.storage)
    const loaded = await createStore({ ...o, locks, writer: 'laboratorio:abrir' }).load()
    if (loaded.kind !== 'ok' || (loaded.data as LabData).syntheticRecoveryLab !== run)
      throw new Error('El almacén no pertenece a este laboratorio sintético o no se puede leer. Se conserva sin cambios.')
    const expectedRun = run
    const check = () => {
      locationAllowed(o)
      knownKeys(o.storage)
      if (o.storage.getItem(LAB_KEY) !== expectedRun) throw new Error('La sesión del laboratorio cambió. Vuelve a abrir el laboratorio.')
    }
    const storage: KeyValue = {
      getItem: (key) => { check(); if (!own.has(key)) throw new Error('Clave ajena a PROYECTOS'); return o.storage.getItem(key) },
      setItem: (key, value) => {
        check()
        if (!own.has(key)) throw new Error('Escritura fuera de las claves operativas de PROYECTOS')
        if (key === DATA_KEY && (JSON.parse(value) as { data?: LabData }).data?.syntheticRecoveryLab !== expectedRun)
          throw new Error('Se ha rechazado un conjunto ajeno al perfil sintético')
        o.storage.setItem(key, value)
      },
      removeItem: () => { throw new Error('Este laboratorio no permite borrar claves') },
    }
    return {
      run: expectedRun,
      target: {
        createEnv: () => { check(); return { storage, locks, now: o.now, writer: `laboratorio:${o.random()}` } },
        accepts: (backup) => (backup.data as LabData).syntheticRecoveryLab === expectedRun,
      },
    }
  })
}
