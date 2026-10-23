import { useCallback, useEffect, useState } from 'react'
import { browserStorage } from '../storage/storage'
import { checkStorage, type StorageHealth } from '../storage/system'

/** Where a finished import leaves its report for the reloaded app to show (this tab only). */
export const IMPORT_REPORT_KEY = 'elyum:system:v1:import-report'

export interface ImportNotice {
  written: number
  at: number
}

/**
 * Storage health, checked when the app opens, whenever it comes back to the
 * foreground, and on demand (after every copy).
 */
export function useStorageHealth(): { health: StorageHealth; recheck: () => StorageHealth } {
  const [health, setHealth] = useState<StorageHealth>(() => checkStorage(browserStorage(), Date.now()))
  const recheck = useCallback(() => {
    const h = checkStorage(browserStorage(), Date.now())
    setHealth(h)
    return h
  }, [])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [recheck])
  return { health, recheck }
}

export function leaveImportNotice(notice: ImportNotice): void {
  try {
    window.sessionStorage.setItem(IMPORT_REPORT_KEY, JSON.stringify(notice))
  } catch {
    // The import is done and verified; only the message after reloading is lost.
  }
}

export function takeImportNotice(): ImportNotice | undefined {
  try {
    const raw = window.sessionStorage.getItem(IMPORT_REPORT_KEY)
    if (!raw) return undefined
    window.sessionStorage.removeItem(IMPORT_REPORT_KEY)
    const parsed = JSON.parse(raw) as ImportNotice
    return typeof parsed.written === 'number' ? parsed : undefined
  } catch {
    return undefined
  }
}
