/**
 * The only view of the browser storage that P2-E has: reading. This type has
 * no write method, so code written against it cannot change ELYUM's data
 * (a test also scans these sources for any write call).
 */
export interface ReadableStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
}

/** The page's local storage, or a thrown error if this browser refuses it (blocked, some private modes). */
export function browserStorage(): ReadableStorage {
  return window.localStorage
}
