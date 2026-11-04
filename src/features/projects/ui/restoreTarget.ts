import { sha256Hex } from '../import/sha256'
import { assessJournal, JOURNAL_KEY } from '../store/journal'
import { prefixedStorage, RESTORE_LOCK, type Backup, type RestoreEnv } from '../store/restore'
import { DATA_KEY, LOCK_NAME, PREV_KEYS, type KeyValue, type Locks } from '../store/store'
import type { RestoreTarget } from './RestoreView'

/**
 * P2-R1.4 · Where Recuperar writes. ONE place builds each destination, so the
 * data, the previous versions, the journal and the locks always belong to the
 * same store:
 *
 *   operativo  PROYECTOS itself: the browser's storage WITHOUT prefix and
 *              `navigator.locks` — the same keys and lock names the section
 *              uses (`browserStore`). Only inside ELYUM and on the test page.
 *   prueba     the separate test store (`elyum:prueba-p2r1:*`), only on the
 *              test page of the previews (`#/recuperar-prueba`).
 *
 * The synthetic lab (`testing/operationalLab.ts`) builds its own target and
 * keeps its own rule (only copies of its own synthetic session). That rule is
 * NOT applied here: the regular route checks a copy as always (`readBackup`:
 * format, version, fingerprints, valid data) and, on top, refuses copies
 * marked as test copies (D3).
 *
 * The recovery engine (`store/restore.ts`, `journal.ts`, `store.ts`,
 * `export.ts`) is used as it is.
 */

/** Every key a recovery on the operational store may change. Nothing else. */
export const OPERATIONAL_KEYS: readonly string[] = [DATA_KEY, ...PREV_KEYS, JOURNAL_KEY]
/** Every lock a recovery on the operational store takes. */
export const OPERATIONAL_LOCKS: readonly string[] = [LOCK_NAME, RESTORE_LOCK]

/**
 * D3 · Why a copy must not go into PROYECTOS itself, or `undefined`. A copy of
 * the separate test store says so in the file (`origin`); a copy of the
 * synthetic lab carries its session mark inside the data.
 */
export function testCopyReason(backup: Pick<Backup, 'file' | 'data'>): string | undefined {
  if (backup.file.origin === 'prueba-p2r1') return 'Es una copia del almacén de prueba (datos inventados). No se recupera en PROYECTOS.'
  if ('syntheticRecoveryLab' in (backup.data as object)) return 'Es una copia del laboratorio sintético (datos inventados). No se recupera en PROYECTOS.'
  return undefined
}

/**
 * Precisión 2 · A plan made from the operational journal («Volver a lo de
 * antes») is legitimate when its stored text is exactly the text before of the
 * journal now in this store. Checked again right before confirming.
 */
export async function isJournalBefore(storage: Pick<KeyValue, 'getItem'>, storedSha256: string): Promise<boolean> {
  const a = await assessJournal(storage)
  if (a.kind !== 'valido' || a.journal.before === null) return false
  return (await sha256Hex(a.journal.before)) === storedSha256
}

/**
 * D2 · The copy of what is stored now, made from Recuperar before confirming.
 * It counts only for the exact stored text and generation it was made from:
 * any change to the data invalidates it. Cancelling the export records nothing.
 */
export interface CurrentCopy {
  generation: number
  /** SHA-256 of the stored text exported (the file's `storedSha256`). */
  storedSha256: string
  /** The person ticked «He comprobado que está guardada» for this copy. */
  confirmed: boolean
}

export type CopyGate = { ok: true } | { ok: false; why: string }

/** Whether a recovery may be confirmed now, as far as the copy of the current data goes. */
export async function currentCopyGate(copy: CurrentCopy | undefined, currentRaw: string | null, baseGeneration: number): Promise<CopyGate> {
  // Nothing stored: nothing to lose, nothing to copy.
  if (currentRaw === null) return { ok: true }
  if (!copy) return { ok: false, why: 'Primero guarda una copia de lo que hay ahora.' }
  if (copy.generation !== baseGeneration || copy.storedSha256 !== (await sha256Hex(currentRaw)))
    return { ok: false, why: 'Los datos cambiaron después de guardar la copia de lo actual. Vuelve a guardarla.' }
  if (!copy.confirmed) return { ok: false, why: 'Marca que has comprobado que la copia de lo actual está guardada.' }
  return { ok: true }
}

const locksOf = (): Locks | undefined => {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: Locks }) : undefined
  return nav?.locks && typeof nav.locks.request === 'function' ? nav.locks : undefined
}

const now = () => new Date().toISOString()

export function operationalTarget(o: { storage?: KeyValue; locks?: Locks; where: string; onRefresh?: () => void; writer?: string }): RestoreTarget {
  const writer = o.writer ?? `recuperar:${Math.random().toString(36).slice(2, 8)}`
  return {
    kind: 'operativo',
    createEnv: (): RestoreEnv => ({ storage: o.storage ?? window.localStorage, locks: o.locks ?? locksOf(), now, writer }),
    accepts: (backup) => testCopyReason(backup) === undefined,
    refusal: (backup) => testCopyReason(backup),
    requireCurrentCopy: true,
    where: o.where,
    filePrefix: 'elyum-proyectos',
    back: '#/',
    ...(o.onRefresh ? { onRefresh: o.onRefresh } : {}),
  }
}

export function sandboxTarget(): RestoreTarget {
  const writer = `recuperar-prueba:${Math.random().toString(36).slice(2, 8)}`
  return {
    kind: 'prueba',
    createEnv: (): RestoreEnv => ({ storage: prefixedStorage(window.localStorage), locks: locksOf(), now, writer }),
    accepts: () => true,
    filePrefix: 'elyum-prueba',
    back: '#/exportar',
  }
}
