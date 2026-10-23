/**
 * The part of `Storage` the copies need. Injectable, so every rule is tested
 * without a browser (and a failing storage can be simulated).
 */
export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Why a storage operation failed, in the words SISTEMA shows. */
export type StorageErrorKind = 'quota' | 'unavailable' | 'mismatch'

export class StorageError extends Error {
  readonly kind: StorageErrorKind
  readonly key?: string
  constructor(kind: StorageErrorKind, message: string, key?: string) {
    super(message)
    this.name = 'StorageError'
    this.kind = kind
    this.key = key
  }
}

/** Quota exceeded, whatever the browser calls it (Safari, Chrome and Firefox differ). */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error) && !(typeof error === 'object' && error !== null)) return false
  const e = error as { name?: string; code?: number }
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014
}

/** Write one key and read it back: anything else than the same text is a failure. */
export function writeVerified(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch (error) {
    throw isQuotaError(error)
      ? new StorageError('quota', 'El almacenamiento del dispositivo está lleno.', key)
      : new StorageError('unavailable', 'El almacenamiento del dispositivo no está disponible.', key)
  }
  let read: string | null
  try {
    read = storage.getItem(key)
  } catch {
    throw new StorageError('unavailable', 'No se pudo releer lo escrito.', key)
  }
  if (read !== value) throw new StorageError('mismatch', 'Lo releído no coincide con lo escrito.', key)
}

/** Every key in the storage (a snapshot of the list, safe to iterate while writing). */
export function listKeys(storage: StorageLike): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k !== null) keys.push(k)
  }
  return keys
}

export function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}
