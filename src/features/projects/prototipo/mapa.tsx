import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { indexTasks } from '../domain/derive'
import { waitersOf } from '../ui/attention'
import { areasOf, type MapState } from './areas'
import { MapIcon } from './iconos'
import { Ilustracion } from './ilustraciones'
import { AiTag, Back, HumanTag, KindTag, LocalTag, Primary, Secondary, StateBar, go } from './kit'
import { mapHref, mapPathOf, projectMap, taskNode, type Block, type KeyResult, type ProjectMap, type TaskNode } from './mapa-modelo'
import { KIND_LABEL, MONTHS, projectsOfPillar, type ActionKind, type PlanAction, type Sprint } from './plan'
import { useProto, type Proto } from './store'
import { UpdateFlow, type Scope } from './update'

/**
 * PROTOTYPE · The smart project map, one component reached from Mis proyectos,
 * the update screen, sprint preparation and each task. Four levels on one route
 * (#/mapa/<project>/<result>/<block>/<task>), so the back button and the task
 * sheet always return to the exact point.
 *
 * Movement is FUNCTIONAL here: lines are drawn from the work to its purpose and
 * a point of light travels along them to show «this contributes to that». The
 * AMBIENT light lives in the background (platino.css). Both stop with reduced
 * movement, and every level reads the same without them.
 */

type Icon = Parameters<typeof MapIcon>[0]['name']

// ── Lines between nodes ─────────────────────────────────────────────────────

export type LinkKind = 'contribucion' | 'agrupacion' | 'plan'
interface Link {
  from: string
  to: string
  kind: LinkKind
  dim?: boolean
  /** A point of light travels from `to` back to `from`: the work feeding its purpose. */
  pulse?: boolean
  delay?: number
  /** Seconds before the light starts (defaults to `delay` + 0.45). */
  pulseAt?: number
}

/** How long a light takes to cross a connection, and how many times it crosses. */
const PASS = 1.15
const PASSES = 2

function useNodes() {
  const box = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const [, bump] = useState(0)
  const reg = useCallback(
    (k: string) => (el: HTMLElement | null) => {
      if (el) els.current.set(k, el)
      else els.current.delete(k)
    },
    [],
  )
  useLayoutEffect(() => {
    bump((n) => n + 1)
    const ro = new ResizeObserver(() => bump((n) => n + 1))
    if (box.current) ro.observe(box.current)
    // Layout animations move nodes for a moment: measure again once they settle.
    const id = setTimeout(() => bump((n) => n + 1), 450)
    return () => {
      ro.disconnect()
      clearTimeout(id)
    }
  }, [])
  return { box, els, reg }
}

const STROKE: Record<LinkKind, { color: string; dash?: string; width: number }> = {
  contribucion: { color: 'url(#pl-light)', width: 1.8 },
  agrupacion: { color: 'rgba(91, 97, 120, 0.45)', dash: '3 4', width: 1.3 },
  plan: { color: 'color-mix(in srgb, var(--color-violet) 70%, transparent)', dash: '1 4', width: 1.6 },
}

function Lines({ box, els, links, animate, replay = '' }: { box: React.RefObject<HTMLDivElement | null>; els: React.RefObject<Map<string, HTMLElement>>; links: Link[]; animate: boolean; replay?: string }) {
  const b = box.current?.getBoundingClientRect()
  // Where the light arrives, the node blooms once (a node reached by light looks lit).
  useEffect(() => {
    if (!animate) return
    const timers = links
      .filter((l) => l.pulse && !l.dim)
      .map((l) => {
        const at = (l.pulseAt ?? (l.delay ?? 0) + 0.45) + PASS * 0.92
        return setTimeout(() => {
          const el = els.current?.get(l.from)
          if (!el) return
          el.dataset.lit = 'true'
          setTimeout(() => delete el.dataset.lit, 1000)
        }, at * 1000)
      })
    return () => timers.forEach(clearTimeout)
  }, [animate, replay, links.map((l) => `${l.from}>${l.to}${l.pulse ? 'p' : ''}${l.dim ? 'd' : ''}`).join('|')])
  if (!b) return null
  const paths = links.flatMap((l) => {
    const f = els.current?.get(l.from)?.getBoundingClientRect()
    const t = els.current?.get(l.to)?.getBoundingClientRect()
    if (!f || !t) return []
    const x1 = f.left + f.width / 2 - b.left
    const y1 = f.bottom - b.top
    const x2 = t.left + t.width / 2 - b.left
    const y2 = t.top - b.top
    const my = (y1 + y2) / 2
    return [{ l, d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`, rev: `M${x2},${y2} C${x2},${my} ${x1},${my} ${x1},${y1}` }]
  })
  const lit = paths.filter((p) => animate && p.l.pulse && !p.l.dim)
  return (
    <>
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="pl-light" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
            <stop offset="55%" stopColor="#3a82f6" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#c8d8ee" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {paths.map(({ l, d }) => {
          const st = STROKE[l.kind]
          return (
            <g key={`${l.from}>${l.to}`} opacity={l.dim ? 0.22 : 1} style={{ transition: 'opacity .3s' }}>
              {l.kind === 'contribucion' && !l.dim && <path d={d} fill="none" stroke="white" strokeOpacity={0.8} strokeWidth={5} strokeLinecap="round" />}
              <motion.path d={d} fill="none" stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: l.delay ?? 0, ease: 'easeOut' }} />
            </g>
          )
        })}
        {/* The light itself: a bright comet with a soft trail, crossing the connection from the work to its purpose. */}
        {lit.map(({ l, rev }) => {
          const at = l.pulseAt ?? (l.delay ?? 0) + 0.45
          const t = { duration: PASS, delay: at, repeat: PASSES - 1, repeatDelay: 0.7, ease: 'easeInOut' } as const
          return (
            <g key={`c-${l.from}>${l.to}:${replay}`}>
              <motion.path d={rev} fill="none" stroke="rgba(120,160,255,0.55)" strokeWidth={9} strokeLinecap="round" initial={{ pathLength: 0.2, pathOffset: 0, opacity: 0 }} animate={{ pathLength: 0.2, pathOffset: 0.8, opacity: [0, 1, 1, 0] }} transition={t} style={{ filter: 'blur(4px)' }} />
              <motion.path d={rev} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" initial={{ pathLength: 0.12, pathOffset: 0, opacity: 0 }} animate={{ pathLength: 0.12, pathOffset: 0.88, opacity: [0, 1, 1, 0] }} transition={t} />
            </g>
          )
        })}
      </svg>
      {lit.map(({ l, rev }) => (
        // The bright head of the comet: CSS offset-path, composited by Safari.
        <motion.span
          key={`p-${l.from}>${l.to}:${replay}`}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-3 rounded-full bg-white shadow-[0_0_14px_5px_rgba(58,130,246,0.6)]"
          style={{ offsetPath: `path("${rev}")`, offsetRotate: '0deg' }}
          initial={{ offsetDistance: '0%', opacity: 0 }}
          animate={{ offsetDistance: '100%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: PASS, delay: l.pulseAt ?? (l.delay ?? 0) + 0.45, repeat: PASSES - 1, repeatDelay: 0.7, ease: 'easeInOut' }}
        />
      ))}
    </>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const DOT: Record<ActionKind, string> = {
  ejecutable: 'bg-[var(--color-electric)]',
  decision: 'bg-[#e0a43a]',
  bloqueada: 'bg-ink-4',
  revision: 'bg-[#1f9d6b]',
  terminada: 'bg-ink-3',
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3" data-testid="map-legend">
      <span className="inline-flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden>
          <defs>
            <linearGradient id="lg-l" x1="0" x2="1">
              <stop offset="0" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#3a82f6" />
            </linearGradient>
          </defs>
          <path d="M1 3h16" stroke="url(#lg-l)" strokeWidth="1.8" />
        </svg>
        Aporta a (sugerencia IA)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden>
          <path d="M1 3h16" stroke="rgba(91,97,120,.6)" strokeWidth="1.3" strokeDasharray="3 4" />
        </svg>
        Agrupación (cálculo local)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-ink-2">→</span> Dependencia confirmada (dossier)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rotate-45 bg-[#8b6fe0]" /> En tu plan del trimestre
      </span>
    </div>
  )
}

/** Progress around a node: done (ink), to confirm (amber). Never «achieved». */
function Ring({ counts, size }: { counts: Record<MapState, number>; size: number }) {
  const total = counts.terminado + counts.pendiente + counts.confirmar || 1
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  const done = (counts.terminado / total) * c
  const conf = (counts.confirmar / total) * c
  return (
    <svg aria-hidden width={size} height={size} className="pointer-events-none absolute -inset-[3px] -rotate-90" style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(91,97,120,.12)" strokeWidth={2} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#5b6178" strokeWidth={2} strokeDasharray={`${done} ${c}`} strokeLinecap="round" />
      {conf > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#d9b26e" strokeWidth={2} strokeDasharray={`${conf} ${c}`} strokeDashoffset={-done} strokeLinecap="round" />}
    </svg>
  )
}

/** A pearl node: the visual unit of the map. */
function Pearl({ icon, size = 56, on, counts, nodeRef }: { icon: Icon; size?: number; on?: boolean; counts?: Record<MapState, number>; nodeRef?: (el: HTMLElement | null) => void }) {
  return (
    <span ref={nodeRef} className="pl-node relative inline-grid shrink-0 place-items-center text-[#4b5270]" data-on={on ? 'true' : 'false'} style={{ width: size, height: size }}>
      {counts && <Ring counts={counts} size={size + 6} />}
      <MapIcon name={icon} className={size >= 56 ? 'size-6' : 'size-5'} />
    </span>
  )
}

const resultCounts = (m: ProjectMap, r: KeyResult) => {
  const bs = m.blocks.filter((b) => r.blocks.includes(b.id))
  return bs.reduce((a, b) => ({ terminado: a.terminado + b.counts.terminado, pendiente: a.pendiente + b.counts.pendiente, confirmar: a.confirmar + b.counts.confirmar }), { terminado: 0, pendiente: 0, confirmar: 0 })
}

/** Vertical offsets that lay a row of nodes on a gentle arc under its parent. */
const arc = (i: number, n: number) => (n < 3 ? 0 : Math.round(Math.sin((Math.PI * i) / (n - 1)) * 22))

/** A bottom sheet for updating from any node, so the map stays exactly where it was. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(30,32,52,0.3)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="map-sheet">
      <motion.div
        className="surface max-h-[86dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-medium text-ink">{title}</h2>
          <button type="button" className="hit h-10 px-1 text-[14px] text-ink-3" onClick={onClose} data-testid="sheet-close">
            Cerrar
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

// ── Sprint, as the map shows it ─────────────────────────────────────────────

const actionOf = (sp: Sprint | null, taskId: string): PlanAction | undefined => sp?.actions.find((a) => a.taskId === taskId)
const monthLabel = (a: PlanAction) => MONTHS.find((x) => x.key === a.month)?.label ?? a.month

function SprintBadge({ a }: { a?: PlanAction }) {
  if (!a) return null
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,#8b6fe0_13%,transparent)] px-2 text-[10.5px] font-medium text-[#6d4fd8]" data-testid="in-sprint">
      <span className="size-1.5 rotate-45 bg-[#8b6fe0]" />
      {MONTHS.find((x) => x.key === a.month)?.short}
    </span>
  )
}

// ── The map ─────────────────────────────────────────────────────────────────

export function SmartMap({ projectId, resultId, blockId, taskId }: { projectId: string; resultId?: string; blockId?: string; taskId?: string }) {
  const { s, set } = useProto()
  const p = s.data.projects.find((x) => x.id === projectId)
  const [sheet, setSheet] = useState<{ title: string; scope: Scope } | null>(null)
  if (!p) return <p className="text-ink-3">Ese proyecto no existe en el prototipo.</p>
  const m = projectMap(s.data, p.id)
  const reduced = s.motion === 'reducido'
  const level = taskId || blockId ? 'bloque' : resultId ? 'resultado' : 'panorama'
  const update = (title: string, scope: Scope) => setSheet({ title, scope })
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div data-testid="smart-map" data-level={level} className={reduced ? 'pl-quieto' : ''}>
        <div className="flex items-center justify-between gap-3">
          <Back href={`#/proyecto/${encodeURIComponent(p.id)}`} label={p.name} />
          <button type="button" className="hit h-10 text-[12.5px] text-ink-3" data-testid="motion-toggle" onClick={() => set((x) => ({ ...x, motion: x.motion === 'reducido' ? 'completo' : 'reducido' }))}>
            {reduced ? 'Activar movimiento' : 'Reducir movimiento'}
          </button>
        </div>
        <p className="text-[11px] tracking-[0.12em] text-ink-3 uppercase">Mapa del proyecto</p>
        <h1 className="font-display mt-0.5 text-[24px] leading-[1.15] font-medium tracking-[-0.02em] text-ink">{p.name}</h1>
        {level === 'panorama' && <Panorama m={m} onUpdate={update} />}
        {level === 'resultado' && <ResultView m={m} resultId={resultId!} onUpdate={update} />}
        {level === 'bloque' && <BlockView m={m} resultId={resultId ?? '-'} blockId={blockId!} taskId={taskId} onUpdate={update} />}
        <AnimatePresence>
          {sheet && (
            <Sheet title={sheet.title} onClose={() => setSheet(null)}>
              <UpdateFlow scope={sheet.scope} onDone={() => setSheet(null)} doneLabel="Volver al mapa" />
            </Sheet>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

type OnUpdate = (title: string, scope: Scope) => void

/** Which pillars of the quarter this project feeds, from the plan. */
function quarterOf(s: Proto, projectId: string) {
  const sp = s.sprint
  if (!sp) return { sp, pillars: [] as { id: string; name: string; actions: number; others: string[] }[] }
  const index = indexTasks(s.data)
  const pillars = sp.pillars
    .map((pl) => {
      const projects = projectsOfPillar(s.data, sp, pl.id)
      return { id: pl.id, name: pl.name, inIt: projects.includes(projectId), actions: sp.actions.filter((a) => a.pillarId === pl.id && index.get(a.taskId)?.projectId === projectId).length, others: projects.filter((x) => x !== projectId) }
    })
    .filter((x) => x.inIt)
  return { sp, pillars }
}

/** Scene 1: why the project exists, what it pursues and what produces it. Understood in seconds. */
function Panorama({ m, onUpdate }: { m: ProjectMap; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const { box, els, reg } = useNodes()
  const first = s.motion === 'completo' && !s.introSeen.includes(m.projectId)
  const [intro, setIntro] = useState(first)
  const [run, setRun] = useState(0)
  // The opening sequence: purpose → what makes it possible → where to go next. Never obligatory: skip at any moment.
  const captions = m.noResults ? ['Esto es lo que busca el proyecto', 'Y este es el trabajo que lo mueve'] : ['Esto es lo que busca el proyecto', 'Estos resultados lo hacen posible', 'Toca uno para ver el trabajo que hay detrás']
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!intro) return
    setStep(0)
    const ts = captions.map((_, i) => setTimeout(() => setStep(i), i * 1500))
    const end = setTimeout(() => {
      setIntro(false)
      set((x) => (x.introSeen.includes(m.projectId) ? x : { ...x, introSeen: [...x.introSeen, m.projectId] }))
    }, captions.length * 1500 + 600)
    return () => {
      ts.forEach(clearTimeout)
      clearTimeout(end)
    }
  }, [intro, run])
  const reducedNow = s.motion === 'reducido'
  const { sp, pillars } = quarterOf(s, m.projectId)
  const star = pillars.length && sp?.northStar ? sp.northStar : undefined
  const nodes = m.noResults ? m.blocks.map((b) => ({ key: `b-${b.id}`, kind: 'agrupacion' as const, icon: b.icon, name: b.name, counts: b.counts, href: mapHref(m.projectId, '-', b.id), testId: 'map-block', sub: `${b.counts.terminado} de ${b.tasks.length}` })) : m.results.map((r) => ({ key: `r-${r.id}`, kind: 'contribucion' as const, icon: r.icon, name: r.name, counts: resultCounts(m, r), href: mapHref(m.projectId, r.id), testId: 'map-result', sub: `${r.done} de ${r.total} tareas` }))
  // Light starts only once the purpose has been shown (second caption).
  const T = 1.5
  const links: Link[] = [...(star ? [{ from: 'star', to: 'obj', kind: 'plan' as const, delay: 0.1 }] : []), ...nodes.map((n, i) => ({ from: 'obj', to: n.key, kind: n.kind, delay: intro ? T + i * 0.2 : 0, pulse: intro && n.kind === 'contribucion', pulseAt: T + 0.4 + i * 0.2 }))]
  const skip = () => {
    setIntro(false)
    set((x) => ({ ...x, introSeen: [...x.introSeen, m.projectId] }))
  }
  // Always animate to the final state, so skipping mid-way never leaves a node half drawn.
  const appear = (i: number) => ({ initial: intro ? { opacity: 0, y: 10, scale: 0.9 } : false, animate: { opacity: 1, y: 0, scale: 1 }, transition: intro ? { delay: T + i * 0.2, duration: 0.45, ease: 'easeOut' as const } : { duration: 0.15 } })
  return (
    <div className="mt-3" data-testid="map-panorama">
      <div data-testid="map-objective">
        <p className="text-[12px] text-ink-3">Qué busca este proyecto</p>
        <p className="mt-0.5 text-[18px] leading-[1.35] text-ink">{m.objective ?? 'Objetivo por definir'}</p>
        {m.why ? (
          <p className="mt-1.5 text-[13.5px] leading-[1.45] text-ink-2" data-testid="map-why">
            <span className="text-ink-3">Por qué importa: </span>
            {m.why}
            <AiTag />
          </p>
        ) : (
          <p className="mt-1.5 text-[13px] leading-[1.45] text-ink-3">Por qué importa: por definir. No se ha propuesto nada para este proyecto.</p>
        )}
      </div>

      <div ref={box} className="relative mt-5">
        <Lines box={box} els={els} links={links} animate={intro} replay={String(run)} />
        {star && (
          <div ref={reg('star')} className="relative mx-auto mb-7 flex w-fit max-w-[92%] items-start gap-2 rounded-full bg-[rgba(255,255,255,0.7)] px-3 py-1.5 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]" data-testid="map-star">
            <span className="mt-0.5 text-[#6d4fd8]">
              <MapIcon name="estrella" className="size-4" />
            </span>
            <p className="text-[12.5px] leading-[1.4] text-ink-2">
              <span className="text-ink-3">Estrella polar: </span>
              {star}
            </p>
          </div>
        )}
        <div className="mb-3 h-5 text-center" aria-live="polite" data-testid="intro-caption">
          {intro && (
            <motion.p key={step} className="text-[13px] font-medium tracking-[0.01em] text-ink-2" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              {captions[step]}
            </motion.p>
          )}
        </div>
        <div className="flex justify-center">
          <div className="pl-hero">
            <span className="pl-halo" data-i="1" aria-hidden />
            <span className="pl-halo" data-i="2" aria-hidden />
            <motion.div layoutId={`obj-${m.projectId}`} ref={reg('obj')} className="pl-orb pl-orb-hero grid size-[132px] place-items-center" animate={intro ? { scale: [0.9, 1.06, 1] } : { scale: 1 }} transition={{ duration: 1.3, times: [0, 0.6, 1], ease: 'easeOut' }} data-testid="map-orb">
              <Ilustracion project={m.name} className="size-[84px]" />
            </motion.div>
          </div>
        </div>
        <div className="relative mt-12 flex items-start justify-around gap-1">
          {nodes.map((n, i) => (
            <motion.button key={n.key} type="button" layoutId={n.key} {...appear(i)} onClick={() => go(n.href)} className="hit flex min-w-0 flex-1 flex-col items-center text-center active:opacity-70" style={{ marginTop: arc(i, nodes.length) }} data-testid={n.testId}>
              <Pearl icon={n.icon} counts={n.counts} nodeRef={reg(n.key)} />
              <span className="mt-2 line-clamp-3 px-0.5 text-[13px] leading-[1.25] font-medium text-ink">{n.name}</span>
              <span className="mt-0.5 text-[11px] text-ink-3">{n.sub}</span>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-9 text-center">
        {intro ? (
          <button type="button" className="hit h-9 rounded-full px-3 text-[13px] text-ink-3" onClick={skip} data-testid="intro-skip">
            Omitir animación
          </button>
        ) : (
          !reducedNow && (
            <button
              type="button"
              className="hit h-9 rounded-full px-3 text-[13px] text-ink-3"
              onClick={() => {
                setRun((n) => n + 1)
                setIntro(true)
              }}
              data-testid="intro-replay"
            >
              Ver cómo se conecta
            </button>
          )
        )}
      </div>
      <p className="text-[12.5px] leading-[1.45] text-ink-3">
        {m.noResults ? (
          <>
            Todavía no hay resultados clave propuestos para este proyecto: ves sus bloques de trabajo. No se inventa a qué contribuye cada uno.
            <LocalTag />
          </>
        ) : (
          <>
            Resultados clave deducidos de las tareas. Toca uno para ver qué trabajo lo hace posible. El anillo muestra las tareas hechas, no si el resultado se ha alcanzado.
            <AiTag />
          </>
        )}
      </p>

      <section className="mt-5 border-t border-[var(--line)] pt-4" data-testid="map-quarter">
        <h2 className="text-[13px] font-medium text-ink-3">En el trimestre</h2>
        {!sp ? (
          <p className="mt-1 text-[13.5px] leading-[1.45] text-ink-2">Todavía no hay plan de 90 días. Cuando lo prepares, aquí verás a qué pilar aporta este proyecto.</p>
        ) : pillars.length === 0 ? (
          <p className="mt-1 text-[13.5px] leading-[1.45] text-ink-2">
            Fuera del plan de este trimestre. Sigue disponible para cuando decidas incluirlo.
            <LocalTag />
          </p>
        ) : (
          pillars.map((pl) => (
            <div key={pl.id} className="mt-1.5 text-[13.5px] leading-[1.45] text-ink-2">
              <p>
                Aporta al pilar <span className="text-ink">«{pl.name}»</span> con {pl.actions === 1 ? '1 acción' : `${pl.actions} acciones`}.
                {sp.status === 'aprobado' ? <HumanTag /> : <AiTag />}
              </p>
              {pl.others.length > 0 && (
                <p className="text-[12.5px] text-ink-3">
                  Junto con{' '}
                  {pl.others.map((id, k) => (
                    <span key={id}>
                      {k > 0 && ' y '}
                      <a className="text-electric" href={mapHref(id)} data-testid="map-sibling">
                        {s.data.projects.find((x) => x.id === id)?.name}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))
        )}
      </section>

      <div className="mt-5">
        <Primary testId="map-update-project" onClick={() => onUpdate('¿Qué ha cambiado en el proyecto?', { projectId: m.projectId })}>
          Actualizar este proyecto
        </Primary>
      </div>
    </div>
  )
}

/** Scene 2: one result in focus, the rest dimmed; the work that makes it possible unfolds below. */
function ResultView({ m, resultId, onUpdate }: { m: ProjectMap; resultId: string; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const { box, els, reg } = useNodes()
  const r = m.results.find((x) => x.id === resultId)
  if (!r) return <p className="mt-4 text-ink-3">Ese resultado no existe en el prototipo.</p>
  const blocks = m.blocks.filter((b) => r.blocks.includes(b.id))
  const key = `${m.projectId}:${r.id}`
  const confirmed = s.confirmed.includes(key)
  const animate = s.motion === 'completo'
  const links: Link[] = [
    // The light climbs: from the work to the result, then from the result up to the project's purpose.
    ...m.results.map((x) => ({ from: 'obj', to: `r-${x.id}`, kind: 'contribucion' as const, dim: x.id !== r.id, pulse: x.id === r.id, pulseAt: 2.05 })),
    ...blocks.map((b, i) => ({ from: 'focus', to: `b-${b.id}`, kind: 'contribucion' as const, delay: 0.25 + i * 0.12, pulse: true })),
  ]
  return (
    <div className="mt-3" data-testid="map-result-view">
      <button type="button" className="hit inline-flex h-9 items-center gap-1 rounded-full bg-[rgba(255,255,255,0.6)] px-3 text-[13px] text-ink-2" onClick={() => go(mapHref(m.projectId))} data-testid="to-panorama">
        <MapIcon name="diana" className="size-4" /> Vista panorámica
      </button>
      <div ref={box} className="relative mt-3">
        <Lines box={box} els={els} links={links} animate={animate} replay={r.id} />
        <motion.div layoutId={`obj-${m.projectId}`} ref={reg('obj')} className="relative mx-auto flex w-fit max-w-[88%] items-center gap-2 rounded-full bg-[rgba(255,255,255,0.72)] py-1 pr-3 pl-1 text-[12px] leading-[1.35] text-ink-3">
          <span className="pl-orb grid size-8 shrink-0 place-items-center">
            <Ilustracion project={m.name} className="size-5" />
          </span>
          <span className="line-clamp-1">{m.objective ?? 'Objetivo por definir'}</span>
        </motion.div>
        <div className="relative mt-8 flex items-start justify-around">
          {m.results.map((x) => (
            <motion.button key={x.id} type="button" layoutId={`r-${x.id}`} onClick={() => go(mapHref(m.projectId, x.id))} className={`hit flex flex-1 flex-col items-center ${x.id === r.id ? '' : 'opacity-40'}`} aria-current={x.id === r.id} data-testid={x.id === r.id ? 'result-node' : 'other-result'}>
              <Pearl icon={x.icon} size={x.id === r.id ? 52 : 40} on={x.id === r.id} nodeRef={reg(`r-${x.id}`)} />
            </motion.button>
          ))}
        </div>
        <motion.div ref={reg('focus')} className="surface relative mt-4 rounded-[20px] px-4 py-3.5" data-testid="result-card" initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <p className="text-[12px] text-ink-3">Qué debemos conseguir</p>
          <p className="mt-0.5 text-[18px] leading-[1.3] font-medium text-ink">{r.name}</p>
          <p className="mt-2 text-[12px] text-ink-3">Por qué importa</p>
          <p className="mt-0.5 text-[14px] leading-[1.45] text-ink-2">
            {r.why}
            {confirmed ? <HumanTag /> : <AiTag />}
          </p>
          <p className="mt-2.5 text-[12.5px] leading-[1.4] text-ink-3">
            {r.done} de {r.total} tareas de su trabajo están hechas. Terminar tareas no significa haberlo conseguido: eso lo confirmas tú.
          </p>
          <div className="mt-2">
            {confirmed ? (
              <p className="text-[12.5px] text-[#167a53]">Confirmaste este resultado como parte del proyecto.</p>
            ) : (
              <button type="button" className="hit text-[13px] text-electric" data-testid="confirm-result" onClick={() => set((x) => ({ ...x, confirmed: [...x.confirmed, key], notice: 'Resultado confirmado. Ya no es una sugerencia.' }))}>
                Confirmar que este resultado es parte del proyecto
              </button>
            )}
          </div>
        </motion.div>
        <p className="mt-7 text-center text-[12px] text-ink-3">Trabajo que lo hace posible</p>
        <div className="relative mt-3 flex items-start justify-around gap-1">
          {blocks.map((b, i) => (
            <BlockNode key={b.id} m={m} b={b} r={r} reg={reg} i={i} n={blocks.length} animate={animate} />
          ))}
        </div>
      </div>
      <div className="mt-6">
        <Legend />
      </div>
      <div className="mt-5">
        <Secondary testId="map-update-result" onClick={() => onUpdate(`¿Qué ha cambiado en «${r.name}»?`, { projectId: m.projectId, taskIds: blocks.flatMap((b) => b.tasks.map((t) => t.id)) })}>
          Actualizar este resultado
        </Secondary>
      </div>
    </div>
  )
}

function BlockNode({ m, b, r, reg, i, n, animate }: { m: ProjectMap; b: Block; r?: KeyResult; reg: (k: string) => (el: HTMLElement | null) => void; i: number; n: number; animate: boolean }) {
  const others = b.results.filter((id) => id !== r?.id).map((id) => m.results.find((x) => x.id === id)?.name)
  return (
    <motion.button
      type="button"
      layoutId={`b-${b.id}`}
      onClick={() => go(mapHref(m.projectId, r?.id ?? '-', b.id))}
      className="hit flex min-w-0 flex-1 flex-col items-center text-center active:opacity-70"
      style={{ marginTop: arc(i, n) }}
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animate ? 0.2 + i * 0.12 : 0, duration: 0.3 }}
      data-testid="map-block"
    >
      <Pearl icon={b.icon} counts={b.counts} nodeRef={reg(`b-${b.id}`)} />
      <span className="mt-2 line-clamp-2 px-0.5 text-[13px] leading-[1.25] font-medium text-ink">{b.name}</span>
      <span className="mt-0.5 text-[11px] text-ink-3">
        {b.counts.terminado} de {b.tasks.length} hechas
      </span>
      {others.length > 0 && <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-[1.3] text-ink-4">también «{others.join('», «')}»</span>}
    </motion.button>
  )
}

const ORDER: ActionKind[] = ['decision', 'ejecutable', 'revision', 'bloqueada', 'terminada']
const GROUP_TITLE: Record<ActionKind, string> = { decision: 'Necesitan tu decisión', ejecutable: 'Puedes hacerlas', revision: 'Por revisar', bloqueada: 'Dependen de otras', terminada: 'Terminadas' }
const FIRST = 4

/** Scene 3: a block's next steps on a light trail; a task opens its path up to the purpose. */
function BlockView({ m, resultId, blockId, taskId, onUpdate }: { m: ProjectMap; resultId: string; blockId: string; taskId?: string; onUpdate: OnUpdate }) {
  const { s } = useProto()
  const { box, els, reg } = useNodes()
  const b = m.blocks.find((x) => x.id === blockId)
  const r = m.results.find((x) => x.id === resultId)
  const index = indexTasks(s.data)
  const waiters = waitersOf(s.data, index)
  const nodes = (b?.tasks ?? []).map((t) => taskNode(s.data, t, index, waiters)).sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind))
  const open = nodes.filter((n) => n.kind !== 'terminada' && n.kind !== 'bloqueada')
  const selectedHidden = !!taskId && !open.slice(0, FIRST).some((n) => n.task.id === taskId)
  const [all, setAll] = useState(selectedHidden)
  if (!b) return <p className="mt-4 text-ink-3">Ese bloque no existe en el prototipo.</p>
  const shown = all ? nodes : open.slice(0, FIRST)
  const hiddenCount = nodes.length - shown.length
  const animate = s.motion === 'completo'
  return (
    <div className="mt-3" data-testid="map-block-view">
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <button type="button" className="hit inline-flex h-9 items-center gap-1 rounded-full bg-[rgba(255,255,255,0.6)] px-3 text-ink-2" onClick={() => go(mapHref(m.projectId))} data-testid="to-panorama">
          <MapIcon name="diana" className="size-4" /> Panorama
        </button>
        {r && (
          <>
            <span className="text-ink-4">›</span>
            <button type="button" className="hit inline-flex h-9 items-center gap-1 rounded-full bg-[rgba(255,255,255,0.6)] px-3 text-ink-2" onClick={() => go(mapHref(m.projectId, r.id))} data-testid="to-result">
              <MapIcon name={r.icon} className="size-4" /> <span className="max-w-[46vw] truncate">{r.name}</span>
            </button>
          </>
        )}
      </div>
      <div ref={box} className="relative mt-4">
        <Lines box={box} els={els} links={r ? [{ from: 'r', to: 'b', kind: 'contribucion', pulse: !!taskId, pulseAt: 0.15 }] : []} animate={animate} replay={taskId ?? ''} />
        {r && (
          <div className="flex justify-center">
            <span ref={reg('r')} className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.72)] px-3 py-1 text-[12px] text-ink-3">
              <MapIcon name={r.icon} className="size-4" />
              <span className="line-clamp-1">{r.name}</span>
            </span>
          </div>
        )}
        <motion.div layoutId={`b-${b.id}`} className={`flex flex-col items-center text-center ${r ? 'mt-8' : ''}`} data-testid="block-card">
          <Pearl icon={b.icon} size={60} counts={b.counts} on nodeRef={reg('b')} />
          <p className="mt-2 text-[17px] leading-[1.3] font-medium text-ink">{b.name}</p>
          <p className="mt-0.5 max-w-[34ch] text-[13.5px] leading-[1.4] text-ink-3">{b.purpose}</p>
          <div className="mt-2 w-40">
            <StateBar counts={b.counts} />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.4] text-ink-4">
            Agrupado por el título de cada tarea. No cambia tareas, IDs ni dependencias.
            <LocalTag />
          </p>
        </motion.div>
      </div>

      <section className="mt-6" data-testid="block-trail">
        <h2 className="mb-1 text-[13px] font-medium text-ink-3">{all ? 'Todas las tareas del bloque' : open.length ? 'Siguientes pasos' : 'No queda nada que puedas mover ahora'}</h2>
        <div className="relative pl-6">
          <span className="pl-rail" aria-hidden />
          {shown.map((n, i) => {
            const groupStart = all && (i === 0 || shown[i - 1].kind !== n.kind)
            return (
              <div key={n.task.id} data-testid={`block-${n.kind}`}>
                {groupStart && <p className="mt-3 mb-0.5 -ml-6 text-[11.5px] text-ink-4">{GROUP_TITLE[n.kind]}</p>}
                <TaskItem m={m} b={b} r={r} n={n} open={n.task.id === taskId} onUpdate={onUpdate} />
              </div>
            )
          })}
        </div>
        {(hiddenCount > 0 || all) && (
          <button type="button" className="hit mt-2 h-10 text-[13.5px] text-electric" onClick={() => setAll((x) => !x)} data-testid="block-all">
            {all ? 'Ver solo los siguientes pasos' : `Ver las ${nodes.length} tareas del bloque`}
          </button>
        )}
      </section>
      <div className="mt-5">
        <Legend />
      </div>
      <div className="mt-5">
        <Secondary testId="map-update-block" onClick={() => onUpdate(`¿Qué ha cambiado en «${b.name}»?`, { projectId: m.projectId, areaId: b.id })}>
          Actualizar este bloque
        </Secondary>
      </div>
    </div>
  )
}

function TaskItem({ m, b, r, n, open, onUpdate }: { m: ProjectMap; b: Block; r?: KeyResult; n: TaskNode; open: boolean; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'center', behavior: s.motion === 'reducido' ? 'auto' : 'smooth' })
  }, [open])
  const here = mapHref(m.projectId, r?.id ?? '-', b.id, n.task.id)
  const results = b.results.map((id) => m.results.find((x) => x.id === id)!).filter(Boolean)
  const action = actionOf(s.sprint, n.task.id)
  return (
    <div ref={ref} className={`relative ${open ? '-ml-2 rounded-[16px] bg-[rgba(255,255,255,0.78)] pl-2 shadow-[0_8px_30px_-18px_rgba(40,46,80,0.4)]' : ''}`} data-testid="map-task">
      <span aria-hidden className={`absolute top-[1.05rem] -left-[1.2rem] size-2.5 rounded-full ring-2 ring-[rgba(255,255,255,0.9)] ${DOT[n.kind]} ${open ? '-left-[0.7rem]' : ''}`} />
      <button type="button" className="hit flex w-full items-center gap-2 py-2.5 pr-2 text-left" onClick={() => go(open ? mapHref(m.projectId, r?.id ?? '-', b.id) : here)} aria-expanded={open}>
        <span className={`min-w-0 flex-1 text-[14.5px] leading-[1.35] ${n.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink'}`}>{n.task.title}</span>
        <SprintBadge a={action} />
        {n.unlocks.length > 0 && n.kind !== 'terminada' && <span className="shrink-0 text-[11px] text-ink-3">libera {n.unlocks.length}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden pr-2" data-testid="task-path">
            <PathUp n={n} b={b} results={results} objective={m.objective} />
            <p className="mt-3 text-[12.5px] leading-[1.4] text-ink-2" data-testid="task-sprint">
              {action ? (
                <>
                  En tu plan: {monthLabel(action)} · pilar «{s.sprint?.pillars.find((p) => p.id === action.pillarId)?.name}»
                  {s.sprint?.status === 'aprobado' ? <HumanTag /> : <AiTag />}
                </>
              ) : (
                <span className="text-ink-3">No forma parte del plan del trimestre.</span>
              )}
            </p>
            {(n.waitsFor.length > 0 || n.unlocks.length > 0) && (
              <div className="mt-3 space-y-2.5 text-[13px] leading-[1.4]" data-testid="task-deps">
                {n.waitsFor.length > 0 && <DepList title="Antes necesita" arrow="in" tasks={n.waitsFor} />}
                {n.unlocks.length > 0 && <DepList title={n.kind === 'terminada' ? 'Ahora pueden avanzar' : 'Al terminarla podrían avanzar'} arrow="out" tasks={n.unlocks} note={n.kind !== 'terminada' ? 'si no esperan también a otra cosa' : undefined} />}
                <p className="text-[11px] text-ink-4">Dependencias confirmadas en el dossier. Toca una para ir a ella en el mapa.</p>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2 pb-3">
              <Primary
                testId="map-open-task"
                onClick={() => {
                  set((x) => ({ ...x, mapFrom: here }))
                  go(`#/tarea/${encodeURIComponent(n.task.id)}`)
                }}
              >
                Abrir la ficha
              </Primary>
              <Secondary testId="map-update-task" onClick={() => onUpdate(`¿Qué ha cambiado en «${n.task.title}»?`, { projectId: m.projectId, taskIds: [n.task.id] })}>
                Actualizar esta tarea
              </Secondary>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Confirmed dependencies, each one a way into that task's own place on the map. */
function DepList({ title, arrow, tasks, note }: { title: string; arrow: 'in' | 'out'; tasks: TaskNode['waitsFor']; note?: string }) {
  const { s } = useProto()
  return (
    <div>
      <p className="text-ink-3">
        {title}
        {note && <span className="text-ink-4"> ({note})</span>}
      </p>
      <ul className="mt-1 space-y-1">
        {tasks.map((w) => {
          const p = mapPathOf(s.data, w.id)
          return (
            <li key={w.id}>
              <a href={p ? mapHref(p.projectId, p.resultId, p.blockId, w.id) : `#/tarea/${encodeURIComponent(w.id)}`} className="inline-flex items-start gap-1.5 text-ink" data-testid="dep-link">
                <span aria-hidden className="font-medium text-ink-3">{arrow === 'in' ? '→' : '↳'}</span>
                <span className="underline decoration-[var(--line)] underline-offset-4">{w.title}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The chain from a task to the project's purpose: drawn top to bottom, with light travelling along it. */
function PathUp({ n, b, results, objective }: { n: TaskNode; b: Block; results: KeyResult[]; objective?: string }) {
  const { s } = useProto()
  const animate = s.motion === 'completo'
  const steps: { icon: Icon; label: string; text: string; tag?: ReactNode }[] = [
    { icon: 'herramienta', label: 'Esta tarea', text: n.kind === 'terminada' ? 'Terminada' : KIND_LABEL[n.kind] },
    { icon: b.icon, label: 'Bloque', text: b.name, tag: <LocalTag /> },
    ...(results.length ? [{ icon: results[0].icon, label: results.length > 1 ? 'Contribuye a los resultados' : 'Contribuye al resultado', text: results.map((r) => r.name).join(' · '), tag: <AiTag /> }] : []),
    { icon: 'diana' as const, label: 'Objetivo del proyecto', text: objective ?? 'Objetivo por definir' },
  ]
  const total = 0.15 + steps.length * 0.14
  const TRAVEL = 1.5
  // Each stop blooms at the moment the light reaches it: task → block → result → purpose.
  const reach = (i: number) => total + (steps.length > 1 ? (i / (steps.length - 1)) * TRAVEL : 0)
  return (
    <ol className="relative mt-1 ml-1" aria-label="Para qué sirve esta tarea" data-testid="task-path-steps">
      <motion.span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-[2px] origin-top rounded-full bg-[linear-gradient(180deg,#3a82f6,#a78bfa)]" initial={animate ? { scaleY: 0 } : false} animate={{ scaleY: 1 }} transition={{ duration: total, ease: 'easeInOut' }} />
      {animate && (
        <>
          <motion.span aria-hidden className="absolute left-[7px] w-[14px] rounded-full bg-[linear-gradient(180deg,rgba(58,130,246,0),rgba(120,160,255,0.55))] blur-[3px]" style={{ height: '2.2rem' }} initial={{ top: '0.2rem', opacity: 0 }} animate={{ top: 'calc(100% - 2.8rem)', opacity: [0, 1, 1, 0] }} transition={{ duration: TRAVEL, delay: total, ease: 'easeInOut' }} />
          <motion.span aria-hidden className="absolute left-[9px] size-2.5 rounded-full bg-white shadow-[0_0_12px_4px_rgba(58,130,246,0.65)]" initial={{ top: '0.75rem', opacity: 0 }} animate={{ top: 'calc(100% - 1.4rem)', opacity: [0, 1, 1, 0] }} transition={{ duration: TRAVEL, delay: total, ease: 'easeInOut' }} />
        </>
      )}
      {steps.map((st, i) => (
        <motion.li key={i} className="relative flex items-start gap-3 pb-3 last:pb-0" initial={animate ? { opacity: 0, x: -6 } : false} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.14, duration: 0.25 }}>
          <motion.span
            className={`relative inline-flex size-7 shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-[var(--control)] text-[var(--control-ink)]' : 'pl-node text-[#4b5270]'}`}
            animate={animate ? { scale: [1, 1.22, 1] } : undefined}
            transition={{ delay: reach(i), duration: 0.6, ease: 'easeOut' }}
          >
            <MapIcon name={st.icon} className="size-4" />
          </motion.span>
          <span className="min-w-0 pt-0.5">
            <span className="block text-[11px] text-ink-4">{st.label}</span>
            <span className="block text-[13.5px] leading-[1.35] text-ink">
              {st.text}
              {st.tag}
            </span>
          </span>
        </motion.li>
      ))}
    </ol>
  )
}

// ── Situation of every project (update screen, sprint preparation) ──────────

const sum = (counts: Record<MapState, number>[]) => counts.reduce((a, c) => ({ terminado: a.terminado + c.terminado, pendiente: a.pendiente + c.pendiente, confirmar: a.confirmar + c.confirmar }), { terminado: 0, pendiente: 0, confirmar: 0 })

/** The six projects at a glance, each opening its map. Shown before asking what changed. */
export function Situation() {
  const { s } = useProto()
  return (
    <section data-testid="situation" className="pl-quieto">
      <h2 className="mb-1 text-[13px] font-medium text-ink-3">Situación conocida · toca uno para ver su mapa</h2>
      {s.data.projects.map((p) => {
        const areas = areasOf(s.data, p.id)
        const c = sum(areas.map((a) => a.counts))
        const total = c.terminado + c.pendiente + c.confirmar
        return (
          <a key={p.id} href={mapHref(p.id)} className="hit flex items-center gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0" data-testid="situation-row">
            <span className="pl-orb grid size-9 shrink-0 place-items-center">
              <Ilustracion project={p.name} className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] text-ink">{p.name}</p>
              <div className="mt-1.5">
                <StateBar counts={c} />
              </div>
              <p className="mt-1 text-[12px] text-ink-3">
                {c.terminado} de {total} terminadas{c.confirmar ? ` · ${c.confirmar} por confirmar` : ''}
              </p>
            </div>
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-4">
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )
      })}
    </section>
  )
}

export { KindTag }
