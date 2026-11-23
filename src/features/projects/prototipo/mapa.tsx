import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { indexTasks } from '../domain/derive'
import { waitersOf } from '../ui/attention'
import { areasOf, type MapState } from './areas'
import { MapIcon } from './iconos'
import { Ilustracion } from './ilustraciones'
import { GAP, Sequence, useReveal, useSequence, wasRevealed } from './aparicion'
import { AiTag, Back, HumanTag, KindTag, LocalTag, More, Primary, Secondary, StateBar, go } from './kit'
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
  /** The light goes from `from` down to `to` (towards what can be explored) instead of up to the purpose. */
  down?: boolean
}

/** How long a light takes to cross a connection. One crossing per event: perceptible, then quiet. */
const PASS = 0.9
const PASSES = 1

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
  contribucion: { color: 'url(#pl-light)', width: 2.2 },
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
          const el = els.current?.get(l.down ? l.to : l.from)
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
            // Keyed by `animate`: when a sequence ends (or is skipped) the line is redrawn complete at once.
            <g key={`${l.from}>${l.to}:${animate ? 'a' : 's'}`} opacity={l.dim ? 0.22 : 1} style={{ transition: 'opacity .3s' }}>
              {l.kind === 'contribucion' && !l.dim && <path d={d} fill="none" stroke="white" strokeOpacity={0.85} strokeWidth={6} strokeLinecap="round" />}
              <motion.path d={d} fill="none" stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: l.delay ?? 0, ease: 'easeOut' }} />
            </g>
          )
        })}
        {/* The light itself: a bright comet with a soft trail, crossing the connection from the work to its purpose. */}
        {lit.map(({ l, d, rev: up }) => {
          const rev = l.down ? d : up
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
      {lit.map(({ l, d, rev }) => (
        // The bright head of the comet: CSS offset-path, composited by Safari.
        <motion.span
          key={`p-${l.from}>${l.to}:${replay}`}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-3 rounded-full bg-white shadow-[0_0_14px_5px_rgba(58,130,246,0.6)]"
          style={{ offsetPath: `path("${l.down ? d : rev}")`, offsetRotate: '0deg' }}
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

/** How to read the map: the legend and the notes, one tap away instead of always on screen. */
function MapInfo({ notes, testId = 'map-info' }: { notes: ReactNode[]; testId?: string }) {
  return (
    <More
      id="mapa:info"
      testId={testId}
      lead={
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[15px] font-medium text-ink-3">
          i
        </span>
      }
      title="Cómo leer el mapa"
      hint="Qué significan las líneas, los anillos y las etiquetas"
    >
      <div className="space-y-2 text-[16px] leading-[1.45] text-ink-2" data-testid="map-legend">
        <p className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden className="shrink-0">
            <defs>
              <linearGradient id="lg-l" x1="0" x2="1">
                <stop offset="0" stopColor="#a78bfa" />
                <stop offset="1" stopColor="#3a82f6" />
              </linearGradient>
            </defs>
            <path d="M1 4h24" stroke="url(#lg-l)" strokeWidth="2.4" />
          </svg>
          <span>Aporta a: una sugerencia de la IA, no una dependencia.</span>
        </p>
        <p className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden className="shrink-0">
            <path d="M1 4h24" stroke="rgba(60,66,90,.8)" strokeWidth="1.6" strokeDasharray="3 4" />
          </svg>
          <span>Agrupación por el título de cada tarea: un cálculo local que no cambia tareas, IDs ni dependencias.</span>
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden className="w-[26px] shrink-0 text-center font-medium text-ink">→</span>
          <span>Dependencia confirmada en el dossier.</span>
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden className="mx-[9px] size-2 shrink-0 rotate-45 bg-[#8b6fe0]" />
          <span>En tu plan del trimestre.</span>
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden className="mx-[5px] size-4 shrink-0 rounded-full border-2 border-[#3e4560]" />
          <span>El anillo muestra las tareas hechas, no si el resultado se ha alcanzado: eso lo confirmas tú.</span>
        </p>
        {notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
    </More>
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
          <h2 className="text-[18px] font-medium text-ink">{title}</h2>
          <button type="button" className="hit min-h-11 px-1 text-[16px] text-ink-3" onClick={onClose} data-testid="sheet-close">
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
    <span className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full bg-[#ece6fb] px-2 text-[14px] font-medium text-[#5634c4]" data-testid="in-sprint">
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
  // One sequence per place on the map; each plays once per visit. The task path has its own, inside the block.
  const seq = level === 'panorama' ? `mapa:${p.id}` : level === 'resultado' ? `resultado:${p.id}:${resultId}` : `bloque:${p.id}:${blockId}`
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div data-testid="smart-map" data-level={level} className={reduced ? 'pl-quieto' : ''}>
        <div className="flex items-center justify-between gap-3">
          <Back href={`#/proyecto/${encodeURIComponent(p.id)}`} label="Proyecto" />
          <button type="button" className="hit min-h-11 text-right text-[15px] text-ink-3" data-testid="motion-toggle" onClick={() => set((x) => ({ ...x, motion: x.motion === 'reducido' ? 'completo' : 'reducido' }))}>
            {reduced ? 'Más movimiento' : 'Menos movimiento'}
          </button>
        </div>
        <Sequence key={seq} id={seq} length={level === 'panorama' ? 2.1 : level === 'resultado' ? 1.6 : 0.9} testId="map-sequence">
          <MapHeader name={p.name} reveal={level === 'panorama'} />
          {level === 'panorama' && <Panorama m={m} onUpdate={update} />}
          {level === 'resultado' && <ResultView m={m} resultId={resultId!} onUpdate={update} />}
          {level === 'bloque' && <BlockView m={m} resultId={resultId ?? '-'} blockId={blockId!} taskId={taskId} onUpdate={update} />}
        </Sequence>
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

/** 1 · The project's name comes first, on the panorama only; between levels it stays put. */
function MapHeader({ name, reveal }: { name: string; reveal: boolean }) {
  const r = useReveal()
  const at = (t: number, c: string) => (reveal ? r(t, c) : { className: c })
  return (
    <>
      <p {...at(0, 'mt-1 text-[15px] font-medium text-ink-3')}>Mapa del proyecto</p>
      <h1 {...at(0.06, 'font-display mt-0.5 text-[31px] leading-[1.12] font-medium tracking-[-0.022em] text-balance text-ink')}>{name}</h1>
    </>
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

/**
 * Scene 1: why the project exists, what it pursues and what produces it. Understood in seconds.
 * Sequence: name and purpose → the central orb → connections drawn → results one by one →
 * the result to explore is singled out by a light travelling to it.
 */
function Panorama({ m, onUpdate }: { m: ProjectMap; onUpdate: OnUpdate }) {
  const { s } = useProto()
  const { box, els, reg } = useNodes()
  const { running } = useSequence()
  const reveal = useReveal()
  const { sp, pillars } = quarterOf(s, m.projectId)
  const star = pillars.length && sp?.northStar ? sp.northStar : undefined
  const nodes = m.noResults ? m.blocks.map((b) => ({ key: `b-${b.id}`, kind: 'agrupacion' as const, icon: b.icon, name: b.name, counts: b.counts, href: mapHref(m.projectId, '-', b.id), testId: 'map-block', sub: `${b.counts.terminado} de ${b.tasks.length}`, open: b.counts.pendiente + b.counts.confirmar })) : m.results.map((r) => ({ key: `r-${r.id}`, kind: 'contribucion' as const, icon: r.icon, name: r.name, counts: resultCounts(m, r), href: mapHref(m.projectId, r.id), testId: 'map-result', sub: `${r.done} de ${r.total} tareas`, open: r.total - r.done }))
  // The one to explore: the first with work still open (a fact of the data, not a priority).
  const explore = nodes.find((n) => n.open > 0)?.key ?? nodes[0]?.key
  const ORB = 0.34
  const LINES = 0.72
  const nodeAt = (i: number) => LINES + 0.1 + i * GAP
  const HIGHLIGHT = nodeAt(nodes.length) + 0.05
  const links: Link[] = [
    ...(star ? [{ from: 'star', to: 'obj', kind: 'plan' as const, delay: LINES }] : []),
    ...nodes.map((n, i) => ({ from: 'obj', to: n.key, kind: n.kind, delay: LINES + i * GAP, pulse: running && n.key === explore, down: true, pulseAt: HIGHLIGHT })),
  ]
  return (
    <div className="mt-3" data-testid="map-panorama">
      <div data-testid="map-objective">
        <p {...reveal(0.1, 'text-[15px] font-medium text-ink-3')}>Qué busca este proyecto</p>
        <p {...reveal(0.14, 'mt-1 text-[22px] leading-[1.35] text-ink')}>{m.objective ?? 'Objetivo por definir'}</p>
      </div>

      <div ref={box} className="relative mt-6">
        <Lines box={box} els={els} links={links} animate={running} />
        {star && (
          <div ref={reg('star')} {...reveal(LINES - 0.1, 'relative mx-auto mb-7 flex w-fit max-w-[92%] items-start gap-2 rounded-full bg-[rgba(255,255,255,0.74)] px-3 py-1.5 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]')} data-testid="map-star">
            <span className="mt-0.5 text-[#5634c4]">
              <MapIcon name="estrella" className="size-4" />
            </span>
            <p className="line-clamp-1 text-[15px] leading-[1.4] text-ink-2">
              <span className="text-ink-3">Estrella polar: </span>
              {star}
            </p>
          </div>
        )}
        <div className="flex justify-center">
          {/* 2 · The central orb enters softly. */}
          <div {...reveal(ORB, 'pl-hero pl-orb-enter')}>
            <span className="pl-halo" data-i="1" aria-hidden />
            <span className="pl-halo" data-i="2" aria-hidden />
            <motion.div layoutId={`obj-${m.projectId}`} ref={reg('obj')} className="pl-orb pl-orb-hero grid size-[128px] place-items-center" data-testid="map-orb">
              <Ilustracion project={m.name} className="size-[82px]" />
            </motion.div>
          </div>
        </div>
        {/* 4 · Results, one after another, on a gentle arc. */}
        <div className="relative mt-12 flex items-start justify-around gap-1">
          {nodes.map((n, i) => (
            <motion.button key={n.key} type="button" layoutId={n.key} onClick={() => go(n.href)} {...reveal(nodeAt(i), 'hit flex min-w-0 flex-1 flex-col items-center text-center active:opacity-70')} style={{ marginTop: arc(i, nodes.length), ...reveal(nodeAt(i)).style }} data-testid={n.testId} data-explore={n.key === explore ? 'true' : undefined}>
              {/* 5 · The one to explore keeps a soft ring of light. */}
              <Pearl icon={n.icon} counts={n.counts} on={n.key === explore} nodeRef={reg(n.key)} />
              <span className="mt-2 line-clamp-3 px-0.5 text-[15px] leading-[1.25] font-medium text-ink">{n.name}</span>
              <span className="mt-0.5 text-[14px] text-ink-3">{n.sub}</span>
            </motion.button>
          ))}
        </div>
      </div>
      <p {...reveal(HIGHLIGHT, 'mt-6 text-center text-[16px] leading-[1.45] text-ink-2')} data-testid="map-hint">
        {m.noResults ? 'Toca un bloque para ver sus tareas.' : 'Toca un resultado para ver qué trabajo lo hace posible.'}
      </p>

      {m.why ? (
          <p {...reveal(HIGHLIGHT + 0.06, 'mt-4 text-[17px] leading-[1.5] text-ink-2')} data-testid="map-why">
            <span className="text-ink-3">Por qué importa: </span>
            {m.why}
            <AiTag />
          </p>
        ) : (
          <p {...reveal(HIGHLIGHT + 0.06, 'mt-4 text-[17px] leading-[1.5] text-ink-3')}>Por qué importa: por definir. No se ha propuesto nada para este proyecto.</p>
        )}

      <div {...reveal(HIGHLIGHT + GAP, 'mt-6 border-t border-[var(--line)]')}>
      <More id={`mapa:${m.projectId}:trimestre`} testId="map-quarter" title="En el plan del trimestre" hint={!sp ? 'Todavía no hay plan de 90 días' : pillars.length === 0 ? 'Fuera del plan de este trimestre' : `Aporta a ${pillars.length === 1 ? '1 pilar' : `${pillars.length} pilares`}`}>
        {!sp ? (
          <p className="mt-1 text-[16px] leading-[1.45] text-ink-2">Todavía no hay plan de 90 días. Cuando lo prepares, aquí verás a qué pilar aporta este proyecto.</p>
        ) : pillars.length === 0 ? (
          <p className="mt-1 text-[16px] leading-[1.45] text-ink-2">
            Fuera del plan de este trimestre. Sigue disponible para cuando decidas incluirlo.
            <LocalTag />
          </p>
        ) : (
          pillars.map((pl) => (
            <div key={pl.id} className="mt-1.5 text-[16px] leading-[1.45] text-ink-2">
              <p>
                Aporta al pilar <span className="text-ink">«{pl.name}»</span> con {pl.actions === 1 ? '1 acción' : `${pl.actions} acciones`}.
                {sp.status === 'aprobado' ? <HumanTag /> : <AiTag />}
              </p>
              {pl.others.length > 0 && (
                <p className="text-[15px] text-ink-3">
                  Junto con{' '}
                  {pl.others.map((id, k) => (
                    <span key={id}>
                      {k > 0 && ' y '}
                      <a className="hit text-electric underline underline-offset-4" href={mapHref(id)} data-testid="map-sibling">
                        {s.data.projects.find((x) => x.id === id)?.name}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))
        )}
      </More>
      <MapInfo
        notes={[
          m.noResults ? (
            <>Este proyecto aún no tiene resultados clave propuestos: ves sus bloques de trabajo y no se inventa a qué contribuye cada uno.<LocalTag /></>
          ) : (
            <>Los resultados clave se deducen de las tareas; el iluminado es el primero con trabajo pendiente, no una prioridad.<AiTag /></>
          ),
        ]}
      />
      </div>

      <div {...reveal(HIGHLIGHT + GAP * 2, 'mt-5')}>
        <Primary testId="map-update-project" onClick={() => onUpdate('¿Qué ha cambiado en el proyecto?', { projectId: m.projectId })}>
          Actualizar este proyecto
        </Primary>
      </div>
    </div>
  )
}

/** Where you are on the map, and the way back to the panorama in one tap. */
function Crumbs({ m, r }: { m: ProjectMap; r?: KeyResult }) {
  const pill = 'hit inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.72)] px-3.5 text-[16px] text-ink-2 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgba(120,128,156,0.14)]'
  return (
    <nav aria-label="Posición en el mapa" className="flex min-w-0 flex-wrap items-center gap-1.5">
      <button type="button" className={pill} onClick={() => go(mapHref(m.projectId))} data-testid="to-panorama">
        <MapIcon name="diana" className="size-4" /> Panorama
      </button>
      {r && (
        <>
          <span aria-hidden className="text-ink-3">›</span>
          <button type="button" className={`${pill} min-w-0 max-w-full`} onClick={() => go(mapHref(m.projectId, r.id))} data-testid="to-result">
            <MapIcon name={r.icon} className="size-4 shrink-0" /> <span className="truncate">{r.name}</span>
          </button>
        </>
      )}
    </nav>
  )
}

/**
 * Scene 2: one result in focus, the rest dimmed; the work that makes it possible unfolds below.
 * Sequence: the result stands out → its connections light up → its explanation → its blocks,
 * one by one → the way into the tasks.
 */
function ResultView({ m, resultId, onUpdate }: { m: ProjectMap; resultId: string; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const { box, els, reg } = useNodes()
  const { running } = useSequence()
  const reveal = useReveal()
  const r = m.results.find((x) => x.id === resultId)
  // 1 · The selected result blooms as soon as it is in place.
  useEffect(() => {
    if (!running || !r) return
    const t = setTimeout(() => {
      const el = els.current.get(`r-${r.id}`)
      if (!el) return
      el.dataset.lit = 'true'
      setTimeout(() => delete el.dataset.lit, 1000)
    }, 60)
    return () => clearTimeout(t)
  }, [])
  if (!r) return <p className="mt-4 text-ink-3">Ese resultado no existe en el prototipo.</p>
  const blocks = m.blocks.filter((b) => r.blocks.includes(b.id))
  const key = `${m.projectId}:${r.id}`
  const confirmed = s.confirmed.includes(key)
  const CARD = 0.38
  const blockAt = (i: number) => CARD + 0.26 + i * GAP
  const READY = blockAt(blocks.length) + 0.05
  const links: Link[] = [
    // 2 · Its connection to the purpose lights up, travelling down to it.
    { from: 'obj', to: `r-${r.id}`, kind: 'contribucion' as const, pulse: true, down: true, pulseAt: 0.08 },
    // 4 · Each block is drawn as it appears; light rises from it to the result.
    ...blocks.map((b, i) => ({ from: 'focus', to: `b-${b.id}`, kind: 'contribucion' as const, delay: blockAt(i), pulse: true, pulseAt: blockAt(i) + 0.3 })),
  ]
  return (
    <div className="mt-3" data-testid="map-result-view">
      <Crumbs m={m} />
      <div ref={box} className="relative mt-3">
        <Lines box={box} els={els} links={links} animate={running} />
        <motion.div layoutId={`obj-${m.projectId}`} ref={reg('obj')} className="relative mx-auto flex w-fit max-w-full items-center gap-2 rounded-full bg-[rgba(255,255,255,0.8)] py-1 pr-4 pl-1 text-[15px] leading-[1.35] text-ink-2 shadow-[inset_0_1px_0_#fff]">
          <span className="pl-orb grid size-8 shrink-0 place-items-center">
            <Ilustracion project={m.name} className="size-5" />
          </span>
          <span className="line-clamp-1">{m.objective ?? 'Objetivo por definir'}</span>
        </motion.div>
        {/* Only the branch being explored: its result, and below it the work that makes it possible. */}
        <div className="relative mt-8 flex justify-center">
          <motion.div layoutId={`r-${r.id}`} aria-current="true" data-testid="result-node">
            <Pearl icon={r.icon} size={60} on nodeRef={reg(`r-${r.id}`)} />
          </motion.div>
        </div>
        {/* 3 · What it is and why it matters. */}
        <div ref={reg('focus')} {...reveal(CARD, 'surface relative mt-4 rounded-[22px] px-4 py-4')} data-testid="result-card">
          <p className="text-[15px] font-medium text-ink-3">Qué debemos conseguir</p>
          <p className="font-display mt-1 text-[23px] leading-[1.25] font-medium tracking-[-0.012em] text-ink">{r.name}</p>
          <p className="mt-3 text-[15px] font-medium text-ink-3">Por qué importa</p>
          <p className="mt-1 text-[17px] leading-[1.5] text-ink-2">
            {r.why}
            {confirmed ? <HumanTag /> : <AiTag />}
          </p>
          <p className="mt-3 text-[15px] leading-[1.45] text-ink-3">
            {r.done} de {r.total} tareas hechas
          </p>
          <div className="mt-2">
            {confirmed ? (
              <p className="text-[15px] text-[#094d33]">Confirmaste este resultado como parte del proyecto.</p>
            ) : (
              <button type="button" className="hit min-h-11 text-left text-[16px] text-electric underline underline-offset-4" data-testid="confirm-result" onClick={() => set((x) => ({ ...x, confirmed: [...x.confirmed, key], notice: 'Resultado confirmado. Ya no es una sugerencia.' }))}>
                Confirmar que este resultado es parte del proyecto
              </button>
            )}
          </div>
        </div>
        <p {...reveal(CARD + 0.16, 'mt-7 text-center text-[15px] font-medium text-ink-3')}>Trabajo que lo hace posible</p>
        <div className="relative mt-3 flex items-start justify-around gap-1">
          {blocks.map((b, i) => (
            <BlockNode key={b.id} m={m} b={b} r={r} reg={reg} i={i} n={blocks.length} at={blockAt(i)} />
          ))}
        </div>
        {/* 5 · The way into the tasks. */}
        <p {...reveal(READY, 'mt-4 text-center text-[16px] text-ink-2')} data-testid="explore-tasks">
          Toca un bloque para ver sus tareas
        </p>
      </div>
      <div {...reveal(READY + GAP, 'mt-6 border-t border-[var(--line)]')}>
        <MapInfo notes={['Terminar tareas no significa haber conseguido el resultado: eso lo confirmas tú.']} />
      </div>
      <div {...reveal(READY + GAP, 'mt-5')}>
        <Secondary testId="map-update-result" onClick={() => onUpdate(`¿Qué ha cambiado en «${r.name}»?`, { projectId: m.projectId, taskIds: blocks.flatMap((b) => b.tasks.map((t) => t.id)) })}>
          Actualizar este resultado
        </Secondary>
      </div>
    </div>
  )
}

function BlockNode({ m, b, r, reg, i, n, at }: { m: ProjectMap; b: Block; r?: KeyResult; reg: (k: string) => (el: HTMLElement | null) => void; i: number; n: number; at: number }) {
  const reveal = useReveal()
  const others = b.results.filter((id) => id !== r?.id).map((id) => m.results.find((x) => x.id === id)?.name)
  const rv = reveal(at, 'hit flex min-w-0 flex-1 flex-col items-center text-center active:opacity-70')
  return (
    <motion.button type="button" layoutId={`b-${b.id}`} onClick={() => go(mapHref(m.projectId, r?.id ?? '-', b.id))} className={rv.className} style={{ marginTop: arc(i, n), ...rv.style }} data-testid="map-block">
      <Pearl icon={b.icon} counts={b.counts} nodeRef={reg(`b-${b.id}`)} />
      <span className="mt-2 line-clamp-2 px-0.5 text-[15px] leading-[1.25] font-medium text-ink">{b.name}</span>
      <span className="mt-0.5 text-[14px] text-ink-3">
        {b.counts.terminado} de {b.tasks.length} hechas
      </span>
      {others.length > 0 && <span className="mt-0.5 line-clamp-2 text-[14px] leading-[1.3] text-ink-3">también «{others.join('», «')}»</span>}
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
  const { running } = useSequence()
  const reveal = useReveal()
  // A task opened for the first time sends its light up from the block to the result (AI suggestion, drawn as such).
  const fresh = useMemo(() => !!taskId && s.motion === 'completo' && !wasRevealed(`tarea:${taskId}`), [taskId])
  return (
    <div className="mt-3" data-testid="map-block-view">
      <Crumbs m={m} r={r} />
      <div ref={box} className="relative mt-4">
        <Lines box={box} els={els} links={r ? [{ from: 'r', to: 'b', kind: 'contribucion', pulse: fresh, pulseAt: 0.42 }] : []} animate={running || fresh} replay={taskId ?? ''} />
        {r && (
          <div className="flex justify-center">
            {/* The result it serves, already named above: here only its orb, where the light arrives. */}
            <Pearl icon={r.icon} size={40} nodeRef={reg('r')} />
          </div>
        )}
        <motion.div layoutId={`b-${b.id}`} className={`flex flex-col items-center text-center ${r ? 'mt-8' : ''}`} data-testid="block-card">
          <Pearl icon={b.icon} size={60} counts={b.counts} on nodeRef={reg('b')} />
          <p className="mt-2 text-[19px] leading-[1.3] font-medium text-ink">{b.name}</p>
          <p className="mt-1 max-w-[34ch] text-[17px] leading-[1.45] text-ink-2">{b.purpose}</p>
          <div className="mt-2.5 w-40">
            <StateBar counts={b.counts} />
          </div>
          <p className="mt-1.5 text-[15px] text-ink-3">
            {b.counts.terminado} de {b.tasks.length} hechas
            <LocalTag />
          </p>
        </motion.div>
      </div>

      <section {...reveal(GAP, 'mt-6')} data-testid="block-trail">
        <h2 className="mb-1 text-[17px] font-medium text-ink">{all ? 'Todas las tareas del bloque' : open.length ? 'Siguientes pasos' : 'No queda nada que puedas mover ahora'}</h2>
        <div className="relative pl-6">
          <span className="pl-rail" aria-hidden />
          {shown.map((n, i) => {
            const groupStart = all && (i === 0 || shown[i - 1].kind !== n.kind)
            return (
              <div key={n.task.id} data-testid={`block-${n.kind}`}>
                {groupStart && <p className="mt-4 mb-0.5 -ml-6 text-[15px] font-medium text-ink-3">{GROUP_TITLE[n.kind]}</p>}
                <TaskItem m={m} b={b} r={r} n={n} open={n.task.id === taskId} onUpdate={onUpdate} />
              </div>
            )
          })}
        </div>
        {(hiddenCount > 0 || all) && (
          <button type="button" className="hit mt-2 min-h-11 text-[16px] text-electric underline underline-offset-4" onClick={() => setAll((x) => !x)} data-testid="block-all">
            {all ? 'Ver solo los siguientes pasos' : `Ver las ${nodes.length} tareas del bloque`}
          </button>
        )}
      </section>
      <div className="mt-6 border-t border-[var(--line)]">
        <MapInfo
          notes={[
            'Al tocar una tarea, la luz sube de la tarea a su bloque, a su resultado y al objetivo del proyecto: muestra para qué sirve. No es una dependencia; las dependencias confirmadas aparecen aparte, con flecha.',
          ]}
        />
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
  const { s } = useProto()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'center', behavior: s.motion === 'reducido' ? 'auto' : 'smooth' })
  }, [open])
  const here = mapHref(m.projectId, r?.id ?? '-', b.id, n.task.id)
  const results = b.results.map((id) => m.results.find((x) => x.id === id)!).filter(Boolean)
  const action = actionOf(s.sprint, n.task.id)
  return (
    <div ref={ref} className={`relative ${open ? '-ml-2 rounded-[16px] bg-[rgba(255,255,255,0.78)] pl-2 shadow-[0_8px_30px_-18px_rgba(40,46,80,0.4)]' : ''}`} data-testid="map-task">
      <span aria-hidden className={`absolute top-[1.05rem] -left-[1.2rem] size-2.5 rounded-full ring-2 ring-[rgba(255,255,255,0.9)] ${DOT[n.kind]} ${open ? 'pl-dot-on -left-[0.7rem]' : ''}`} />
      <button type="button" className="hit flex min-h-12 w-full items-center gap-2 py-2.5 pr-2 text-left" onClick={() => go(open ? mapHref(m.projectId, r?.id ?? '-', b.id) : here)} aria-expanded={open}>
        <span className={`min-w-0 flex-1 text-[17px] leading-[1.4] ${n.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink'}`}>{n.task.title}</span>
        <SprintBadge a={action} />
        {n.unlocks.length > 0 && n.kind !== 'terminada' && <span className="shrink-0 text-[14px] text-ink-3">libera {n.unlocks.length}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0, overflow: 'hidden' }} animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }} exit={{ height: 0, opacity: 0, overflow: 'hidden' }} transition={{ duration: 0.22 }} className="pr-2" data-testid="task-path">
            <Sequence id={`tarea:${n.task.id}`} length={PATH_READY}>
            <PathUp n={n} b={b} results={results} objective={m.objective} />
            <TaskActions m={m} n={n} here={here} action={action} onUpdate={onUpdate} />
            </Sequence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 5 · Once the light has reached the purpose: the plan, the confirmed dependencies and the way into the ficha. */
function TaskActions({ m, n, here, action, onUpdate }: { m: ProjectMap; n: TaskNode; here: string; action?: PlanAction; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const reveal = useReveal()
  return (
    <div {...reveal(PATH_READY)}>
            <p className="mt-3 text-[16px] leading-[1.45] text-ink-2" data-testid="task-sprint">
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
              <div className="mt-3 space-y-3 text-[16px] leading-[1.45]" data-testid="task-deps">
                {n.waitsFor.length > 0 && <DepList title="Antes necesita · dependencia del dossier" arrow="in" tasks={n.waitsFor} />}
                {n.unlocks.length > 0 && <DepList title={n.kind === 'terminada' ? 'Ahora pueden avanzar' : 'Al terminarla podrían avanzar'} arrow="out" tasks={n.unlocks} note={n.kind !== 'terminada' ? 'si no esperan también a otra cosa' : undefined} />}
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
              <a href={p ? mapHref(p.projectId, p.resultId, p.blockId, w.id) : `#/tarea/${encodeURIComponent(w.id)}`} className="hit inline-flex min-h-11 items-start gap-1.5 py-1 text-ink" data-testid="dep-link">
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

/** Seconds between two stops of the task's path, and when the path has reached the purpose. */
const HOP = 0.28
const PATH_READY = 0.12 + 3 * HOP + 0.2

/**
 * The chain from a task to the project's purpose, drawn top to bottom. A current of light runs
 * task → block → result → purpose and each stop appears as it arrives: why this task matters.
 * The block is a local grouping and the result an AI suggestion; neither is a dependency.
 */
function PathUp({ n, b, results, objective }: { n: TaskNode; b: Block; results: KeyResult[]; objective?: string }) {
  const { running } = useSequence()
  const reveal = useReveal()
  const steps: { icon: Icon; label: string; text: string; tag?: ReactNode }[] = [
    { icon: 'herramienta', label: 'Esta tarea', text: n.kind === 'terminada' ? 'Terminada' : KIND_LABEL[n.kind] },
    { icon: b.icon, label: 'Bloque', text: b.name, tag: <LocalTag /> },
    ...(results.length ? [{ icon: results[0].icon, label: results.length > 1 ? 'Contribuye a los resultados' : 'Contribuye al resultado', text: results.map((r) => r.name).join(' · '), tag: <AiTag /> }] : []),
    { icon: 'diana' as const, label: 'Objetivo del proyecto', text: objective ?? 'Objetivo por definir' },
  ]
  const reach = (i: number) => 0.12 + i * HOP
  const travel = reach(steps.length - 1) - reach(0)
  return (
    <>
      <ol className="relative mt-1 ml-1" aria-label="Para qué sirve esta tarea" data-testid="task-path-steps">
        <motion.span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-[2px] origin-top rounded-full bg-[linear-gradient(180deg,#3a82f6,#a78bfa)]" initial={running ? { scaleY: 0 } : false} animate={{ scaleY: 1 }} transition={{ duration: travel, delay: reach(0), ease: 'easeInOut' }} />
        {running && (
          <>
            <motion.span aria-hidden className="absolute left-[7px] w-[14px] rounded-full bg-[linear-gradient(180deg,rgba(58,130,246,0),rgba(120,160,255,0.6))] blur-[3px]" style={{ height: '2.2rem' }} initial={{ top: '0.2rem', opacity: 0 }} animate={{ top: 'calc(100% - 2.8rem)', opacity: [0, 1, 1, 0] }} transition={{ duration: travel + 0.1, delay: reach(0), ease: 'easeInOut' }} />
            <motion.span aria-hidden className="absolute left-[9px] size-2.5 rounded-full bg-white shadow-[0_0_12px_4px_rgba(58,130,246,0.65)]" initial={{ top: '0.75rem', opacity: 0 }} animate={{ top: 'calc(100% - 1.4rem)', opacity: [0, 1, 1, 0] }} transition={{ duration: travel + 0.1, delay: reach(0), ease: 'easeInOut' }} />
          </>
        )}
        {steps.map((st, i) => (
          <li key={i} {...reveal(Math.max(0, reach(i) - 0.06), 'relative flex items-start gap-3 pb-3 last:pb-0')}>
            <motion.span
              className={`relative inline-flex size-7 shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-[var(--control)] text-[var(--control-ink)]' : 'pl-node text-[#4b5270]'}`}
              animate={running ? { scale: [1, 1.22, 1] } : undefined}
              transition={{ delay: reach(i), duration: 0.5, ease: 'easeOut' }}
            >
              <MapIcon name={st.icon} className="size-4" />
            </motion.span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-[14px] text-ink-3">{st.label}</span>
              <span className="block text-[16px] leading-[1.4] text-ink">
                {st.text}
                {st.tag}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p {...reveal(PATH_READY - 0.1, 'mt-2 text-[15px] leading-[1.4] text-ink-3')} data-testid="path-note">
        Para qué sirve, no una dependencia.
      </p>
    </>
  )
}

// ── Situation of every project (update screen, sprint preparation) ──────────

const sum = (counts: Record<MapState, number>[]) => counts.reduce((a, c) => ({ terminado: a.terminado + c.terminado, pendiente: a.pendiente + c.pendiente, confirmar: a.confirmar + c.confirmar }), { terminado: 0, pendiente: 0, confirmar: 0 })

/** The six projects at a glance, each opening its map. Shown before asking what changed. */
export function Situation() {
  const { s } = useProto()
  return (
    <section data-testid="situation" className="pl-quieto">
      <h2 className="mb-1 text-[15px] font-medium text-ink-3">Situación conocida · toca uno para ver su mapa</h2>
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
              <p className="truncate text-[16px] text-ink">{p.name}</p>
              <div className="mt-1.5">
                <StateBar counts={c} />
              </div>
              <p className="mt-1 text-[14px] text-ink-3">
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
