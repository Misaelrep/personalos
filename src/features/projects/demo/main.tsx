import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../styles/index.css'
import { validateProjectsData } from '../domain/schema'
import type { ProjectsData } from '../domain/types'
import { Banner } from '../ui/parts'
import { Overview } from '../ui/Overview'
import { ProjectView } from '../ui/ProjectView'
import { parseRoute } from '../ui/ProjectsApp'
import { TaskView } from '../ui/TaskView'
import DEMO from './demo-sintetica.json'

/**
 * E1 · Demonstration page (demo-e1.html), built for Vercel previews only (vite.config.ts), never for
 * production. Six INVENTED projects with the shape of real data, held in memory: this page reads and
 * writes no storage at all, so it cannot see or change anyone's PROYECTOS. With no WriteProvider, every
 * screen is read-only (useWrite() → writable: false).
 */

// Like the test page: without the app's manifest, iOS never adds THIS page as ELYUM.
document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove())

const data = DEMO as unknown as ProjectsData
const valid = validateProjectsData(data)

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function Demo() {
  const route = parseRoute(useHash())
  const body = !valid.ok ? (
    <Banner tone="error">Los datos de demostración no son válidos.</Banner>
  ) : route.kind === 'proyecto' ? (
    <ProjectView data={data} projectId={route.id} />
  ) : route.kind === 'tarea' ? (
    <TaskView data={data} taskId={route.id} />
  ) : (
    <Overview data={data} embedded />
  )
  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[var(--color-soft)]">
        <div className="absolute -top-[30vmax] -right-[25vmax] size-[80vmax] rounded-full bg-[radial-gradient(closest-side,rgba(216,231,250,0.9),transparent)]" />
        <div className="absolute top-[40vh] -left-[35vmax] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(234,242,255,0.95),transparent)]" />
      </div>
      <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="pt-1 pb-2" data-testid="demo-banner">
          <span className="text-[11px] tracking-[0.08em] text-ink-4 uppercase">Demostración E1 · proyectos inventados · no se guarda nada</span>
        </div>
        {body}
        <p className="mt-12 text-center font-mono text-[10.5px] text-ink-4" data-testid="build">
          Demostración E1 · datos sintéticos en memoria
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
