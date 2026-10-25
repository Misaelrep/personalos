import { useEffect, useState } from 'react'
import { ExportView } from './ExportView'
import { ImportView } from './ImportView'
import { LocksCheckView } from './LocksCheckView'
import { Overview } from './Overview'
import { Banner, RowLink } from './parts'
import { ProjectView } from './ProjectView'
import { TaskView } from './TaskView'
import { NewProjectView } from './NewProjectView'
import { RestoreView } from './RestoreView'
import { ReviewView } from './ReviewView'
import { useProjects } from './useProjects'
import { WriteProvider } from './write'

/**
 * P4a · PROYECTOS on its test page (proyectos.html), outside the app's
 * navigation until P4c. Screens by URL hash, so the back gesture and reloads
 * keep the place:
 *
 *   #/                 PROYECTOS
 *   #/proyecto/<id>    PROYECTO
 *   #/tarea/<id>       TAREA
 *   #/importar  #/exportar  #/prueba-iphone
 *   #/semana           REVISIÓN SEMANAL (P4b)
 *   #/nuevo-proyecto   NUEVO PROYECTO (P4b)
 *   #/recuperar        RECUPERAR desde una copia, en un almacén de prueba (P2-R1)
 */

type Route =
  | { kind: 'inicio' }
  | { kind: 'proyecto'; id: string }
  | { kind: 'tarea'; id: string }
  | { kind: 'importar' }
  | { kind: 'exportar' }
  | { kind: 'prueba' }
  | { kind: 'semana' }
  | { kind: 'nuevo-proyecto' }
  | { kind: 'recuperar' }

export function parseRoute(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/')
  if (a === 'proyecto' && b) return { kind: 'proyecto', id: decodeURIComponent(b) }
  if (a === 'tarea' && b) return { kind: 'tarea', id: decodeURIComponent(b) }
  if (a === 'importar') return { kind: 'importar' }
  if (a === 'exportar') return { kind: 'exportar' }
  if (a === 'prueba-iphone') return { kind: 'prueba' }
  if (a === 'semana') return { kind: 'semana' }
  if (a === 'nuevo-proyecto') return { kind: 'nuevo-proyecto' }
  if (a === 'recuperar') return { kind: 'recuperar' }
  return { kind: 'inicio' }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

function ModePill({ writable, reason }: { writable: boolean; reason?: string }) {
  return (
    <span
      data-testid="mode"
      data-mode={writable ? 'escritura' : 'solo-lectura'}
      title={reason}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] tracking-[0.04em] ${writable ? 'bg-[var(--line)] text-ink-3' : 'bg-[color-mix(in_srgb,var(--color-aurora)_14%,transparent)] text-[#b5531a]'}`}
    >
      <span className={`size-1.5 rounded-full ${writable ? 'bg-[#1f9d6a]' : 'bg-[var(--color-aurora)]'}`} />
      {writable ? 'Escritura protegida' : 'Solo lectura'}
    </span>
  )
}

/**
 * `embedded` (P4c): inside ELYUM as a section. No page background (the app's
 * atmosphere is behind), no «prueba» label or build stamp, room for the
 * bottom navigation. Same screens, same store.
 */
export function ProjectsApp({ embedded = false }: { embedded?: boolean }) {
  const p = useProjects()
  const route = useRoute()
  const s = p.state

  let body
  if (!s) body = <p className="py-20 text-center text-[14px] text-ink-3">Abriendo PROYECTOS…</p>
  else if (route.kind === 'prueba') body = <LocksCheckView />
  else if (route.kind === 'exportar') body = <ExportView />
  else if (route.kind === 'recuperar') body = <RestoreView />
  else if (s.status !== 'listo')
    body = (
      <div className="flex flex-col gap-3 pt-6">
        <Banner tone="error">
          Los datos guardados de PROYECTOS no se pueden leer ({s.reason}). No se han tocado ni se sobrescribirán. Expórtalos tal cual para conservarlos.
        </Banner>
        <a href="#/exportar" className="text-[15px] text-electric">
          Ir a Exportar
        </a>
      </div>
    )
  else if (route.kind === 'importar') body = <ImportView p={p} />
  else if (route.kind === 'proyecto') body = <ProjectView data={s.data} projectId={route.id} />
  else if (route.kind === 'tarea') body = <TaskView data={s.data} taskId={route.id} />
  else if (route.kind === 'semana') body = <ReviewView data={s.data} />
  else if (route.kind === 'nuevo-proyecto') body = <NewProjectView data={s.data} />
  else
    body = (
      <>
        <Overview data={s.data} />
        <div className="mt-8 surface-quiet overflow-hidden rounded-[20px]">
          <RowLink href="#/semana" testId="go-review">
            <p className="text-[15px] text-ink">Revisión semanal</p>
            <p className="text-[12.5px] text-ink-3">Capacidad, compromisos, encargos y aprobaciones</p>
          </RowLink>
          <RowLink href="#/nuevo-proyecto" testId="go-new-project">
            <p className="text-[15px] text-ink">Nuevo proyecto</p>
            <p className="text-[12.5px] text-ink-3">Nombre y objetivo, sin dossier</p>
          </RowLink>
          <RowLink href="#/importar" testId="go-import">
            <p className="text-[15px] text-ink">Importar un dossier</p>
            <p className="text-[12.5px] text-ink-3">Con vista previa; nada se guarda sin confirmar</p>
          </RowLink>
          <RowLink href="#/exportar" testId="go-export">
            <p className="text-[15px] text-ink">Exportar una copia</p>
            <p className="text-[12.5px] text-ink-3">Generarla y verificarla</p>
          </RowLink>
          <RowLink href="#/recuperar" testId="go-restore">
            <p className="text-[15px] text-ink">Recuperar desde una copia</p>
            <p className="text-[12.5px] text-ink-3">En un almacén de prueba separado; con vista previa</p>
          </RowLink>
          <RowLink href="#/prueba-iphone" testId="go-check">
            <p className="text-[15px] text-ink">Prueba del iPhone</p>
            <p className="text-[12.5px] text-ink-3">Web Locks y persistencia, con datos sintéticos</p>
          </RowLink>
        </div>
      </>
    )

  const inner = (
    <>
      <div className="flex items-center justify-between gap-3 pt-1 pb-1">
        <span className="text-[11px] tracking-[0.08em] text-ink-4 uppercase">{embedded ? 'Proyectos' : 'Prueba · datos sintéticos'}</span>
        {s?.status === 'listo' && <ModePill writable={s.writable} reason={s.readOnlyReason} />}
      </div>
      {s?.status === 'listo' && !s.writable && route.kind !== 'prueba' && (
        <div className="mt-2">
          <Banner tone="warn">Solo lectura en este navegador: {s.readOnlyReason ?? 'no ofrece Web Locks'}. Puedes consultar y exportar; no se guarda nada.</Banner>
        </div>
      )}
      {p.notice && (
        <div className="mt-2" onClick={p.clearNotice}>
          <Banner tone="info">{p.notice}</Banner>
        </div>
      )}
      {body}
    </>
  )

  if (embedded)
    return (
      <WriteProvider p={p}>
        <main className="relative z-10 mx-auto w-full max-w-[560px] px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pt-12" data-testid="projects-section">
          {inner}
        </main>
      </WriteProvider>
    )

  return (
    <WriteProvider p={p}>
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[var(--color-soft)]">
        <div className="absolute -top-[30vmax] -right-[25vmax] size-[80vmax] rounded-full bg-[radial-gradient(closest-side,rgba(216,231,250,0.9),transparent)]" />
        <div className="absolute top-[40vh] -left-[35vmax] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(234,242,255,0.95),transparent)]" />
      </div>
      <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {inner}
        <p className="mt-12 text-center font-mono text-[10.5px] text-ink-4" data-testid="build">
          P4a · {new URL(import.meta.url).pathname.split('/').pop()}
        </p>
      </div>
    </div>
    </WriteProvider>
  )
}
