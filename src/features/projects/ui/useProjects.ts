import { useCallback, useEffect, useMemo, useState } from 'react'
import { isStandalone } from '../../../pwa/standalone'
import { ProjectsSession, type SessionState } from '../store/session'
import { browserStore, DATA_KEY, type ProjectsStore } from '../store/store'

/**
 * P4a · The open PROYECTOS of this page. Reads again when another tab or
 * window saves (the `storage` event) and when the page comes back to the
 * front, so a stale screen never offers to write over newer data. Writing is
 * still guarded by the store itself (generation + Web Lock).
 */
export interface Projects {
  store: ProjectsStore
  session: ProjectsSession
  state: SessionState | undefined
  /** Shown once after the data was re-read because someone else saved. */
  notice: string | undefined
  clearNotice(): void
  reload(): Promise<void>
  /** After the session changed its own state (an import was confirmed). */
  sync(): void
}

const now = () => new Date().toISOString()

export function useProjects(): Projects {
  const { store, session } = useMemo(() => {
    const writer = `prueba-p4a:${typeof window !== 'undefined' && isStandalone(window) ? 'app' : 'navegador'}:${Math.random().toString(36).slice(2, 8)}`
    const store = browserStore(writer, now)
    return { store, session: new ProjectsSession(store, now) }
  }, [])
  const [state, setState] = useState<SessionState | undefined>()
  const [notice, setNotice] = useState<string | undefined>()

  const reload = useCallback(async () => {
    setState(await session.open())
  }, [session])

  useEffect(() => {
    void reload()
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DATA_KEY) return
      setNotice('Otra pestaña guardó cambios. PROYECTOS se ha vuelto a leer.')
      void reload()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  return {
    store,
    session,
    state,
    notice,
    clearNotice: () => setNotice(undefined),
    reload,
    sync: () => setState(session.state),
  }
}
