import { motion, MotionConfig } from 'framer-motion'
import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../styles/index.css'
import './platino.css'
import { Segmented, go } from './kit'
import { ProjectPage, ProjectsView, PlanView, TaskPage } from './screens'
import { DATES, ProtoProvider, SCENARIOS, useNotice, useProto } from './store'
import { UpdatePage } from './update'
import { SmartMap } from './mapa'
import { MetalLiquido, type Intensidad } from './metal-liquido'
import { Scene } from './sprint'

/**
 * PROTOTYPE · prototipo-90.html, built for Vercel previews only (vite.config.ts), never for production.
 * Six INVENTED projects held in memory. This page reads and writes no storage and calls no service:
 * the «AI» and «Grok» are simulations in plan.ts. Reloading starts over.
 */

document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove())

type Route = { kind: 'plan' } | { kind: 'proyectos' } | { kind: 'proyecto'; id: string } | { kind: 'tarea'; id: string } | { kind: 'actualizar'; id?: string } | { kind: 'escena'; n: number } | { kind: 'mapa'; id: string; result?: string; block?: string; task?: string }

export function route(hash: string): Route {
  const h = hash.replace(/^#/, '')
  const m = h.match(/^\/(proyecto|tarea)\/(.+)$/)
  if (m) return { kind: m[1] as 'proyecto' | 'tarea', id: decodeURIComponent(m[2]) }
  const map = h.match(/^\/mapa\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?$/)
  if (map) return { kind: 'mapa', id: decodeURIComponent(map[1]), ...(map[2] ? { result: map[2] } : {}), ...(map[3] ? { block: map[3] } : {}), ...(map[4] ? { task: decodeURIComponent(map[4]) } : {}) }
  const up = h.match(/^\/actualizar(?:\/(.+))?$/)
  if (up) return { kind: 'actualizar', ...(up[1] ? { id: decodeURIComponent(up[1]) } : {}) }
  const sc = h.match(/^\/sprint\/(\d)$/)
  if (sc) return { kind: 'escena', n: Number(sc[1]) }
  // Earlier links to the three moments and six parts land on the matching scene.
  const p = h.match(/^\/plan\/paso\/(\d)$/)
  if (p) return { kind: 'escena', n: [1, 1, 2, 3, 4, 4, 5][Number(p[1])] ?? 1 }
  const mo = h.match(/^\/plan\/(\d)$/)
  if (mo) return { kind: 'escena', n: [1, 1, 3, 5][Number(mo[1])] ?? 1 }
  if (h === '/proyectos') return { kind: 'proyectos' }
  return { kind: 'plan' }
}

/** Where each screen was left, in memory only: coming back from a task or the map finds the same place. */
const positions = new Map<string, number>()
/**
 * A task always opens at its top, and so does a scene of the sprint design reached from another
 * scene. Every other screen, and a scene the person comes back to from a task or a map, returns
 * to where it was left.
 */
const keepsPlace = (hash: string, from: string) => !/^#\/(tarea|sprint)\//.test(hash) || (/^#\/sprint\//.test(hash) && /^#\/(tarea|mapa)\//.test(from))

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  const from = useRef('')
  useEffect(() => {
    let current = window.location.hash
    const onScroll = () => positions.set(current, window.scrollY)
    const on = () => {
      from.current = current
      current = window.location.hash
      setHash(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', on)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', on)
    }
  }, [])
  useLayoutEffect(() => {
    window.scrollTo(0, keepsPlace(hash, from.current) ? (positions.get(hash) ?? 0) : 0)
  }, [hash])
  return hash
}

const OTHER = ['HOY', 'SEMANA', 'PROYECTOS', 'APRENDER']

function BottomNav() {
  const [tip, setTip] = useState(false)
  return (
    <nav aria-label="Secciones" className="bottom-nav" data-testid="bottom-nav">
      {tip && <p className="pointer-events-none absolute -top-8 rounded-full bg-[var(--control)] px-3 py-1 text-[14px] text-[var(--control-ink)]">En el prototipo solo funciona PROYECTOS</p>}
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
                className={`flex min-h-12 min-w-11 flex-col items-center justify-center gap-1.5 px-1.5 pt-2 pb-1.5 text-[14px] font-medium tracking-[0.06em] whitespace-nowrap uppercase max-[359px]:px-1 max-[359px]:tracking-[0.01em] ${current ? 'text-ink' : 'text-ink-3'}`}
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
      <summary className="hit min-h-11 cursor-pointer list-none py-2 text-center text-[15px] text-ink-3 [&::-webkit-details-marker]:hidden">Controles del prototipo</summary>
      <p className="mt-2 text-[14px] text-ink-3">Situación</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {(
          [
            ['sin-plan', 'Sin plan'],
            ['borrador', 'Borrador a medias'],
            ['aprobado-antes', 'Aprobado, antes del 1 dic'],
            ['aprobado', 'Plan en marcha'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-testid={`scenario-${k}`}
            className="min-h-11 rounded-full border border-[var(--line)] px-3 text-[15px] text-ink"
            onClick={() => {
              set((x) => SCENARIOS[k](x))
              go('#/')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-ink-3">Fecha simulada</p>
      <div className="mt-1 mb-2">
        <Segmented testId="proto-date" value={s.today} onChange={(today) => set((x) => ({ ...x, today }))} options={DATES} />
      </div>
      <p className="mb-1 text-[14px] leading-[1.4] text-ink-4">Cambiar de situación vuelve a los datos inventados del principio. Recargar la página también.</p>
    </details>
  )
}

/** The metal's expression follows the experience: map = full, plan = focused, projects = clean, tasks = calm. */
const intensityOf = (kind: Route['kind']): Intensidad => (kind === 'mapa' ? 'vivo' : kind === 'plan' || kind === 'escena' ? 'enfoque' : kind === 'proyectos' || kind === 'proyecto' ? 'limpio' : 'calma')

/** Ambient light: strongest on the map, discreet on lists, calm where you read and decide. */
function Ambient({ intensity }: { intensity: Intensidad }) {
  const { s } = useProto()
  return (
    <div aria-hidden className="pl-ambient" data-intensity={intensity} data-quieto={s.motion === 'reducido' ? 'true' : 'false'} data-testid="ambient">
      <MetalLiquido acabado="B" intensidad={intensity} quieto={s.motion === 'reducido'} />
    </div>
  )
}

function App() {
  const { s } = useProto()
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
      <UpdatePage key={r.id ?? 'todo'} {...(r.id ? { projectId: r.id } : {})} />
    ) : r.kind === 'mapa' ? (
      <SmartMap key={r.id} projectId={r.id} {...(r.result ? { resultId: r.result } : {})} {...(r.block ? { blockId: r.block } : {})} {...(r.task ? { taskId: r.task } : {})} />
    ) : r.kind === 'escena' ? (
      <Scene key={r.n} n={r.n} />
    ) : (
      <PlanView />
    )
  return (
    <div className="platino relative min-h-dvh" data-acabado="B" data-quieto={s.motion === 'reducido' ? 'true' : 'false'}>
      <Ambient intensity={intensityOf(r.kind)} />
      <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <p className="pt-1 pb-3 text-center text-[14px] leading-[1.4] text-ink-3" data-testid="proto-banner">
          Prototipo con datos inventados e IA simulada · nada se guarda
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
        {/* A short fade-and-rise on entering a screen: nothing waits for it, and reduced movement removes it. */}
        <MotionConfig reducedMotion={s.motion === 'reducido' ? 'always' : 'never'}>
          <motion.div key={r.kind === 'mapa' ? `mapa-${r.id}` : r.kind === 'proyecto' || r.kind === 'tarea' ? `${r.kind}-${r.id}` : r.kind} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }} data-testid="screen">
            {body}
          </motion.div>
        </MotionConfig>
        <Controls />
      </div>
      {notice && (
        <div role="status" className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4" data-testid="notice">
          <p className="rounded-full bg-[var(--control)] px-4 py-2 text-[15px] text-[var(--control-ink)] shadow-lg">{notice}</p>
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
