import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RestoreView } from '../ui/RestoreView'
import { createStore, DATA_KEY, type Locks } from '../store/store'
import { ProjectsSession, type SessionState } from '../store/session'
import { exportProjects, verifyExport } from '../store/export'
import { JOURNAL_KEY } from '../store/journal'
import { localChange, loseProject } from '../ui/sandbox'
import { saveJsonFile, stampedName } from '../ui/files'
import { openOperationalLab } from './operationalLab'
import '../../../styles/index.css'

/** Set only by e2e/projects/lab-server.mjs (temporary HTTPS access from a phone). Absent in a normal `npm run dev`. */
declare const __ELYUM_LAB_HOST__: string | undefined
const labHost = typeof __ELYUM_LAB_HOST__ === 'string' ? __ELYUM_LAB_HOST__ : undefined

type Lab = Awaited<ReturnType<typeof openOperationalLab>>
function LabView({ lab }: { lab: Lab }) {
  const session = useMemo(() => new ProjectsSession(createStore(lab.target.createEnv()), () => new Date().toISOString()), [lab])
  const [state, setState] = useState<SessionState>()
  const [notice, setNotice] = useState('')
  const [delivered, setDelivered] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => { setState(await session.open()) }, [session])
  const target = useMemo(() => ({ ...lab.target, onRefresh: () => { void reload() } }), [lab, reload])
  useEffect(() => {
    void reload()
    const changed = (e: StorageEvent) => { if (e.key === DATA_KEY || e.key === JOURNAL_KEY) void reload() }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [reload])
  const data = state?.status === 'listo' ? state.data : undefined
  const pending = state?.status === 'listo' ? state.pendingRecovery : undefined
  const change = async (lose: boolean) => {
    setBusy(true)
    try {
      const r = await session.change((d) => lose ? loseProject(d, d.projects[0].id) : localChange(d, () => new Date().toISOString()))
      setNotice(r.ok ? 'Cambio sintético guardado.' : r.message)
      await reload()
    } catch (error) { setNotice(String(error)) } finally { setBusy(false) }
  }
  return <>
    <h1 className="text-xl">Laboratorio local · perfil sintético desechable</h1>
    <p>Sesión: <code data-testid="lab-run">{lab.run}</code>. Usa exclusivamente esta página en las dos pestañas de prueba.</p>
    <section className="my-4 flex flex-col gap-3" data-testid="operational-lab">
      <p data-testid="lab-session">{data?.projects.length} proyectos · generación {state?.status === 'listo' ? state.generation : '…'}</p>
      {pending && <p data-testid="lab-pending">{pending}</p>}
      <button disabled={busy || !data} data-testid="lab-export" onClick={async () => {
        setBusy(true)
        try {
          const at = new Date().toISOString()
          const copy = await exportProjects(lab.target.createEnv().storage, at)
          const checked = await verifyExport(copy.text)
          if (!checked.ok || !checked.readable) throw new Error('La copia sintética no se ha podido verificar')
          const result = await saveJsonFile(stampedName('elyum-laboratorio-operativo', at), copy.text)
          setDelivered(result.status === 'entregado')
          setConfirmed(false)
          setNotice(result.status === 'entregado' ? 'Entrega solicitada. Comprueba el archivo antes de simular la pérdida.' : result.status === 'cancelado' ? 'Entrega cancelada.' : result.message)
        } catch (error) { setNotice(String(error)) } finally { setBusy(false) }
      }}>Exportar copia sintética</button>
      {delivered && <label><input type="checkbox" data-testid="lab-copy-confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> He comprobado que la copia sintética está guardada.</label>}
      <button disabled={busy || !confirmed || !data?.projects.length || !!pending} data-testid="lab-lose" onClick={() => void change(true)}>Simular pérdida en el perfil sintético</button>
      <button disabled={busy || !data?.tasks.length || !!pending} data-testid="lab-edit" onClick={() => void change(false)}>Hacer un cambio sintético normal</button>
      <p role="status">{notice}</p>
    </section>
    <RestoreView target={target} />
  </>
}
function Entry() {
  const [lab, setLab] = useState<Lab>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <main className="mx-auto max-w-[600px] p-5">
    {lab ? <LabView lab={lab} /> : <>
      <h1>Prueba sintética de recuperación operativa</h1>
      <p>Abre un perfil de navegador desechable y un puerto local nuevo. El origen debe estar vacío. Aquí se crean seis proyectos inventados; no cargues dossiers ni copias personales.</p>
      <p data-testid="lab-capabilities">Conexión segura: {window.isSecureContext ? 'sí' : 'no'} · Web Locks: {'locks' in navigator ? 'disponible' : 'no disponible'} · Dirección: {window.location.hostname}</p>
      <button disabled={busy} data-testid="lab-start" onClick={async () => {
        setBusy(true)
        try {
          const result = await openOperationalLab({ dev: import.meta.env.DEV, location: window.location, labHost, storage: window.localStorage, locks: (navigator as Navigator & { locks?: Locks }).locks, now: () => new Date().toISOString(), random: () => crypto.randomUUID() })
          setLab(result)
        } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
      }}>Iniciar o reabrir el laboratorio sintético</button>
      {error && <p role="alert">{error}</p>}
    </>}
  </main>
}
createRoot(document.getElementById('root')!).render(<Entry />)
