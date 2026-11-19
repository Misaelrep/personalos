import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../styles/index.css'
import { Segmented, go } from './kit'
import { ProjectPage, ProjectsView, PlanView, TaskPage } from './screens'
import { DATES, ProtoProvider, SCENARIOS, useNotice, useProto } from './store'
import { UpdatePage } from './update'
import { Wizard } from './wizard'

/**
 * PROTOTYPE · prototipo-90.html, built for Vercel previews only (vite.config.ts), never for production.
 * Six INVENTED projects held in memory. This page reads and writes no storage and calls no service:
 * the «AI» and «Grok» are simulations in plan.ts. Reloading starts over.
 */

document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove())

type Route = { kind: 'plan' } | { kind: 'proyectos' } | { kind: 'proyecto'; id: string } | { kind: 'tarea'; id: string } | { kind: 'actualizar' } | { kind: 'paso'; n: number }

export function route(hash: string): Route {
  const h = hash.replace(/^#/, '')
  const m = h.match(/^\/(proyecto|tarea)\/(.+)$/)
  if (m) return { kind: m[1] as 'proyecto' | 'tarea', id: decodeURIComponent(m[2]) }
  const p = h.match(/^\/plan\/paso\/(\d)$/)
  if (p) return { kind: 'paso', n: Number(p[1]) }
  if (h === '/proyectos') return { kind: 'proyectos' }
  if (h === '/actualizar') return { kind: 'actualizar' }
  return { kind: 'plan' }
}

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

const OTHER = ['HOY', 'SEMANA', 'PROYECTOS', 'APRENDER']

function BottomNav() {
  const [tip, setTip] = useState(false)
  return (
    <nav aria-label="Secciones" className="bottom-nav" data-testid="bottom-nav">
      {tip && <p className="pointer-events-none absolute -top-8 rounded-full bg-[var(--control)] px-3 py-1 text-[12px] text-[var(--control-ink)]">En el prototipo solo funciona PROYECTOS</p>}
      <ul className="flex w-full max-w-[420px] items-center justify-evenly" style={{ pointerEvents: 'auto', paddingLeft: 'max(env(safe-area-inset-left), 12px)', paddingRight: 'max(env(safe-area-inset-right), 12px)' }}>
        {OTHER.map((s) => {
          const current = s === 'PROYECTOS'
          return (
            <li key={s}>
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                onClick={() => {
                  if (current) go('#/')
                  else {
                    setTip(true)
                    setTimeout(() => setTip(false), 1800)
                  }
                }}
                className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-2 px-2 pt-2 pb-1.5 text-[10px] font-medium tracking-[0.24em] whitespace-nowrap uppercase max-[359px]:tracking-[0.12em] ${current ? 'text-ink' : 'text-ink-3'}`}
              >
                <span className={`size-1 rounded-full ${current ? 'bg-ink' : 'bg-transparent'}`} />
                {s}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Controls() {
  const { s, set } = useProto()
  return (
    <details className="mt-14 rounded-[18px] border border-dashed border-[var(--line)] px-4 py-2" data-testid="proto-controls">
      <summary className="hit cursor-pointer list-none py-1 text-center text-[12px] text-ink-4 [&::-webkit-details-marker]:hidden">Controles del prototipo</summary>
      <p className="mt-2 text-[12px] text-ink-3">Situación</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {(
          [
            ['sin-plan', 'Sin plan'],
            ['borrador', 'Borrador a medias'],
            ['aprobado', 'Plan aprobado'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-testid={`scenario-${k}`}
            className="h-9 rounded-full border border-[var(--line)] px-3 text-[13px] text-ink"
            onClick={() => {
              set((x) => SCENARIOS[k](x))
              go('#/')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">Fecha simulada</p>
      <div className="mt-1 mb-2">
        <Segmented testId="proto-date" value={s.today} onChange={(today) => set((x) => ({ ...x, today }))} options={DATES} />
      </div>
      <p className="mb-1 text-[11.5px] leading-[1.4] text-ink-4">Cambiar de situación vuelve a los datos inventados del principio. Recargar la página también.</p>
    </details>
  )
}

function App() {
  const r = route(useHash())
  const notice = useNotice()
  const top = r.kind === 'plan' || r.kind === 'proyectos'
  const body =
    r.kind === 'proyectos' ? (
      <ProjectsView />
    ) : r.kind === 'proyecto' ? (
      <ProjectPage id={r.id} />
    ) : r.kind === 'tarea' ? (
      <TaskPage id={r.id} />
    ) : r.kind === 'actualizar' ? (
      <UpdatePage />
    ) : r.kind === 'paso' ? (
      <Wizard step={r.n} />
    ) : (
      <PlanView />
    )
  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[var(--color-soft)]">
        <div className="absolute -top-[30vmax] -right-[25vmax] size-[80vmax] rounded-full bg-[radial-gradient(closest-side,rgba(216,231,250,0.9),transparent)]" />
        <div className="absolute top-[40vh] -left-[35vmax] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(234,242,255,0.95),transparent)]" />
      </div>
      <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <p className="pt-1 pb-3 text-center text-[10.5px] tracking-[0.08em] text-ink-4 uppercase" data-testid="proto-banner">
          Prototipo · proyectos inventados · IA simulada · no se guarda nada
        </p>
        {top && (
          <div className="mb-5" data-testid="top-tabs">
            <Segmented
              value={r.kind}
              onChange={(v) => go(v === 'plan' ? '#/' : '#/proyectos')}
              options={[
                { value: 'plan', label: 'Plan de 90 días' },
                { value: 'proyectos', label: 'Mis proyectos' },
              ]}
            />
          </div>
        )}
        {body}
        <Controls />
      </div>
      {notice && (
        <div role="status" className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4" data-testid="notice">
          <p className="rounded-full bg-[var(--control)] px-4 py-2 text-[13.5px] text-[var(--control-ink)] shadow-lg">{notice}</p>
        </div>
      )}
      <BottomNav />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProtoProvider>
      <App />
    </ProtoProvider>
  </StrictMode>,
)
