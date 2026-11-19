import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { indexTasks } from '../domain/derive'
import { waitersOf } from '../ui/attention'
import { STAGE_LABEL } from '../ui/labels'
import { areasOf, type MapState } from './areas'
import { MapIcon } from './iconos'
import { AiTag, Back, KindTag, LocalTag, More, Primary, Secondary, StateBar, go } from './kit'
import { mapHref, projectMap, taskNode, type Block, type KeyResult, type ProjectMap, type TaskNode } from './mapa-modelo'
import { KIND_LABEL, projectsOfPillar, type ActionKind } from './plan'
import { useProto } from './store'
import { UpdateFlow, type Scope } from './update'

/**
 * PROTOTYPE · The smart project map, one component reached from Mis proyectos,
 * the update screen, sprint preparation and each task. Four levels on one
 * route (#/mapa/<project>/<result>/<block>/<task>), so the back button and the
 * task sheet always return to the exact point. Movement explains (lines drawn
 * from cause to purpose, zoom on the chosen branch) and can be turned down:
 * every level reads the same without it.
 */

// ── Lines between nodes ─────────────────────────────────────────────────────

export type LinkKind = 'contribucion' | 'agrupacion' | 'plan'
interface Link {
  from: string
  to: string
  kind: LinkKind
  dim?: boolean
  glow?: boolean
  delay?: number
}

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
    return () => ro.disconnect()
  }, [])
  return { box, els, reg, remeasure: () => bump((n) => n + 1) }
}

const STROKE: Record<LinkKind, { color: string; dash?: string; width: number }> = {
  contribucion: { color: 'color-mix(in srgb, var(--color-electric) 55%, transparent)', width: 1.6 },
  agrupacion: { color: 'var(--ink-4)', dash: '3 4', width: 1.3 },
  plan: { color: 'color-mix(in srgb, var(--color-violet) 60%, transparent)', dash: '1 4', width: 1.6 },
}

function Lines({ box, els, links, animate }: { box: React.RefObject<HTMLDivElement | null>; els: React.RefObject<Map<string, HTMLElement>>; links: Link[]; animate: boolean }) {
  const b = box.current?.getBoundingClientRect()
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
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {paths.map(({ l, d, rev }) => {
        const st = STROKE[l.kind]
        return (
          <g key={`${l.from}>${l.to}`} opacity={l.dim ? 0.25 : 1} style={{ transition: 'opacity .3s' }}>
            <motion.path
              d={d}
              fill="none"
              stroke={st.color}
              strokeWidth={st.width}
              strokeDasharray={st.dash}
              strokeLinecap="round"
              initial={animate ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: l.delay ?? 0, ease: 'easeOut' }}
            />
            {l.glow && (
              // The path from the work to its purpose: drawn once, from below to above.
              <motion.path d={rev} fill="none" stroke="var(--color-electric)" strokeWidth={2.4} strokeLinecap="round" initial={animate ? { pathLength: 0, opacity: 1 } : false} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.7, delay: l.delay ?? 0, ease: 'easeInOut' }} />
            )}
          </g>
        )
      })}
    </svg>
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
          <path d="M1 3h16" stroke={STROKE.contribucion.color} strokeWidth="1.6" />
        </svg>
        Aporta a (sugerencia IA)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden>
          <path d="M1 3h16" stroke="var(--ink-4)" strokeWidth="1.3" strokeDasharray="3 4" />
        </svg>
        Agrupación (cálculo local)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-ink-2">→</span> Dependencia confirmada (dossier)
      </span>
    </div>
  )
}

function Bubble({ icon, tone = 'quiet', size = 'md' }: { icon: Parameters<typeof MapIcon>[0]['name']; tone?: 'quiet' | 'strong'; size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${size === 'lg' ? 'size-12' : 'size-9'} ${tone === 'strong' ? 'bg-[var(--control)] text-[var(--control-ink)]' : 'bg-[color-mix(in_srgb,var(--color-electric)_12%,transparent)] text-electric'}`}>
      <MapIcon name={icon} className={size === 'lg' ? 'size-6' : 'size-5'} />
    </span>
  )
}

const pct = (r: KeyResult) => (r.total ? r.done / r.total : 0)

/** A bottom sheet for updating from any node, so the map stays exactly where it was. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(8,26,50,0.28)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="map-sheet">
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
      <div data-testid="smart-map" data-level={level}>
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

/** Scene 1: the purpose and what produces it, in one screen. */
function Panorama({ m, onUpdate }: { m: ProjectMap; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const { box, els, reg, remeasure } = useNodes()
  const first = s.motion === 'completo' && !s.introSeen.includes(m.projectId)
  const [intro, setIntro] = useState(first)
  useEffect(() => {
    if (!intro) return
    const id = setTimeout(() => {
      setIntro(false)
      set((x) => ({ ...x, introSeen: [...x.introSeen, m.projectId] }))
    }, 2800)
    return () => clearTimeout(id)
  }, [intro])
  useEffect(() => {
    const id = setTimeout(remeasure, 50)
    return () => clearTimeout(id)
  }, [])
  const sp = s.sprint
  const inPlan = sp && sp.pillars.some((pl) => projectsOfPillar(s.data, sp, pl.id).includes(m.projectId))
  const star = inPlan && sp?.northStar ? sp.northStar : undefined
  const nodes = m.noResults ? m.blocks.map((b) => ({ key: `b-${b.id}`, kind: 'agrupacion' as const, b })) : m.results.map((r) => ({ key: `r-${r.id}`, kind: 'contribucion' as const, r }))
  const links: Link[] = [...(star ? [{ from: 'star', to: 'obj', kind: 'plan' as const, delay: 0.1 }] : []), ...nodes.map((n, i) => ({ from: 'obj', to: n.key, kind: n.kind, delay: intro ? 0.35 + i * 0.18 : 0, glow: intro && n.kind === 'contribucion' }))]
  const skip = () => {
    setIntro(false)
    set((x) => ({ ...x, introSeen: [...x.introSeen, m.projectId] }))
  }
  // Always animate to the final state, so skipping mid-way never leaves a node half drawn.
  const appear = (i: number) => ({ initial: intro ? { opacity: 0, y: 8, scale: 0.96 } : false, animate: { opacity: 1, y: 0, scale: 1 }, transition: intro ? { delay: 0.25 + i * 0.18, duration: 0.35 } : { duration: 0.15 } }) as const
  return (
    <div className="mt-4" data-testid="map-panorama">
      <div ref={box} className="relative">
        <Lines box={box} els={els} links={links} animate={intro} />
        {star && (
          <div ref={reg('star')} className="relative mx-auto mb-6 flex max-w-[92%] items-start gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--color-violet)_10%,transparent)] px-3 py-2" data-testid="map-star">
            <span className="mt-0.5 text-[#6d4fd8]">
              <MapIcon name="estrella" className="size-4" />
            </span>
            <p className="text-[12.5px] leading-[1.4] text-ink-2">
              <span className="text-ink-3">Estrella polar del trimestre: </span>
              {star}
            </p>
          </div>
        )}
        <motion.div layoutId={`obj-${m.projectId}`} ref={reg('obj')} className="surface relative mx-auto flex max-w-[96%] items-start gap-3 rounded-[20px] px-4 py-3.5" data-testid="map-objective">
          <motion.span animate={intro ? { scale: [1, 1.06, 1] } : undefined} transition={{ delay: 2.0, duration: 0.6 }}>
            <Bubble icon="diana" tone="strong" size="lg" />
          </motion.span>
          <div className="min-w-0">
            <p className="text-[12px] text-ink-3">Qué busca este proyecto</p>
            <p className="mt-0.5 text-[15.5px] leading-[1.4] text-ink">{m.objective ?? 'Objetivo por definir'}</p>
          </div>
        </motion.div>
        <div className="relative mt-9 grid grid-cols-2 gap-2.5">
          {nodes.map((n, i) =>
            'r' in n && n.r ? (
              <motion.button
                key={n.key}
                type="button"
                layoutId={n.key}
                ref={reg(n.key)}
                {...appear(i)}
                onClick={() => go(mapHref(m.projectId, n.r.id))}
                className={`hit surface flex min-h-[124px] flex-col items-start rounded-[18px] px-3 py-3 text-left active:opacity-70 ${nodes.length % 2 === 1 && i === nodes.length - 1 ? 'col-span-2 mx-auto w-[calc(50%-0.3rem)]' : ''}`}
                data-testid="map-result"
              >
                <Bubble icon={n.r.icon} />
                <p className="mt-2 text-[14px] leading-[1.3] font-medium text-ink">{n.r.name}</p>
                <div className="mt-auto w-full pt-2">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--line)]">
                    <span className="block h-full bg-ink-3" style={{ width: `${pct(n.r) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {n.r.done} de {n.r.total} tareas hechas
                  </p>
                </div>
              </motion.button>
            ) : 'b' in n && n.b ? (
              <motion.button key={n.key} type="button" layoutId={n.key} ref={reg(n.key)} {...appear(i)} onClick={() => go(mapHref(m.projectId, '-', n.b.id))} className="hit surface flex min-h-[112px] flex-col items-start rounded-[18px] px-3 py-3 text-left active:opacity-70" data-testid="map-block">
                <Bubble icon={n.b.icon} />
                <p className="mt-2 text-[14px] leading-[1.3] font-medium text-ink">{n.b.name}</p>
                <div className="mt-auto w-full pt-2">
                  <StateBar counts={n.b.counts} />
                </div>
              </motion.button>
            ) : null,
          )}
        </div>
      </div>
      {intro && (
        <div className="mt-3 text-center">
          <button type="button" className="hit h-9 rounded-full px-3 text-[13px] text-ink-3" onClick={skip} data-testid="intro-skip">
            Omitir animación
          </button>
        </div>
      )}
      <p className="mt-4 text-[12.5px] leading-[1.45] text-ink-3">
        {m.noResults ? (
          <>
            Todavía no hay resultados clave propuestos para este proyecto: ves sus bloques de trabajo, agrupados por finalidad.
            <LocalTag />
          </>
        ) : (
          <>
            Resultados clave deducidos de las tareas del proyecto. Toca uno para ver qué trabajo lo produce.
            <AiTag />
          </>
        )}
      </p>
      <div className="mt-5">
        <Primary testId="map-update-project" onClick={() => onUpdate('¿Qué ha cambiado en el proyecto?', { projectId: m.projectId })}>
          Actualizar este proyecto
        </Primary>
      </div>
    </div>
  )
}

/** Scene 2: one result, close up; its work blocks unfold below. */
function ResultView({ m, resultId, onUpdate }: { m: ProjectMap; resultId: string; onUpdate: OnUpdate }) {
  const { s, set } = useProto()
  const { box, els, reg, remeasure } = useNodes()
  const r = m.results.find((x) => x.id === resultId)
  useEffect(() => {
    const id = setTimeout(remeasure, 380)
    return () => clearTimeout(id)
  }, [resultId])
  if (!r) return <p className="mt-4 text-ink-3">Ese resultado no existe en el prototipo.</p>
  const blocks = m.blocks.filter((b) => r.blocks.includes(b.id))
  const key = `${m.projectId}:${r.id}`
  const confirmed = s.confirmed.includes(key)
  const links: Link[] = [{ from: 'obj', to: `r-${r.id}`, kind: 'contribucion' }, ...blocks.map((b, i) => ({ from: `r-${r.id}`, to: `b-${b.id}`, kind: 'contribucion' as const, delay: 0.2 + i * 0.12 }))]
  return (
    <div className="mt-3" data-testid="map-result-view">
      <button type="button" className="hit inline-flex h-9 items-center gap-1 rounded-full bg-[var(--line)] px-3 text-[13px] text-ink-2" onClick={() => go(mapHref(m.projectId))} data-testid="to-panorama">
        <MapIcon name="diana" className="size-4" /> Vista panorámica
      </button>
      <div ref={box} className="relative mt-3">
        <Lines box={box} els={els} links={links} animate={s.motion === 'completo'} />
        <motion.div layoutId={`obj-${m.projectId}`} ref={reg('obj')} className="relative mx-auto w-fit max-w-[80%] rounded-full bg-[var(--surface-quiet)] px-3 py-1.5 text-[12px] leading-[1.35] text-ink-3 opacity-80">
          <span className="line-clamp-1">{m.objective ?? 'Objetivo por definir'}</span>
        </motion.div>
        <motion.div layoutId={`r-${r.id}`} ref={reg(`r-${r.id}`)} className="surface relative mt-6 rounded-[20px] border border-[color-mix(in_srgb,var(--color-electric)_30%,transparent)] px-4 py-3.5" data-testid="result-card">
          <div className="flex items-start gap-3">
            <Bubble icon={r.icon} size="lg" />
            <div className="min-w-0">
              <p className="text-[17px] leading-[1.3] font-medium text-ink">{r.name}</p>
              <p className="mt-1 text-[13.5px] leading-[1.45] text-ink-2">
                {r.why}
                {!confirmed && <AiTag />}
              </p>
            </div>
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.4] text-ink-3">
            {r.done} de {r.total} tareas de sus bloques están hechas. Terminar tareas no significa que el resultado se haya alcanzado: eso lo confirmas tú.
          </p>
          <div className="mt-2">
            {confirmed ? (
              <p className="text-[12.5px] text-[#167a53]">Confirmaste este resultado como parte del proyecto.</p>
            ) : (
              <button type="button" className="text-[13px] text-electric" data-testid="confirm-result" onClick={() => set((x) => ({ ...x, confirmed: [...x.confirmed, key], notice: 'Resultado confirmado. Ya no es una sugerencia.' }))}>
                Confirmar que este resultado es parte del proyecto
              </button>
            )}
          </div>
        </motion.div>
        <motion.div className="relative mt-8 grid grid-cols-2 gap-2.5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}>
          {blocks.map((b) => (
            <BlockTile key={b.id} m={m} b={b} r={r} reg={reg} />
          ))}
        </motion.div>
      </div>
      <div className="mt-5">
        <Legend />
      </div>
      <OtherResults m={m} current={r.id} />
      <div className="mt-5">
        <Secondary testId="map-update-result" onClick={() => onUpdate(`¿Qué ha cambiado en «${r.name}»?`, { projectId: m.projectId, taskIds: blocks.flatMap((b) => b.tasks.map((t) => t.id)) })}>
          Actualizar este resultado
        </Secondary>
      </div>
    </div>
  )
}

function BlockTile({ m, b, r, reg }: { m: ProjectMap; b: Block; r?: KeyResult; reg: (k: string) => (el: HTMLElement | null) => void }) {
  const others = b.results.filter((id) => id !== r?.id).map((id) => m.results.find((x) => x.id === id)?.name)
  const c = b.counts
  return (
    <motion.button type="button" layoutId={`b-${b.id}`} ref={reg(`b-${b.id}`)} onClick={() => go(mapHref(m.projectId, r?.id ?? '-', b.id))} className="hit surface flex min-h-[124px] flex-col items-start rounded-[18px] px-3 py-3 text-left active:opacity-70" data-testid="map-block">
      <Bubble icon={b.icon} />
      <p className="mt-2 text-[14px] leading-[1.3] font-medium text-ink">{b.name}</p>
      {others.length > 0 && <p className="mt-0.5 text-[11px] leading-[1.35] text-ink-3">También aporta a «{others.join('», «')}»</p>}
      <div className="mt-auto w-full pt-2">
        <StateBar counts={c} />
        <p className="mt-1 text-[11px] text-ink-3">
          {c.terminado}/{b.tasks.length}
          {c.confirmar ? ` · ${c.confirmar} por confirmar` : ''}
        </p>
      </div>
    </motion.button>
  )
}

function OtherResults({ m, current }: { m: ProjectMap; current: string }) {
  const rest = m.results.filter((x) => x.id !== current)
  if (!rest.length) return null
  return (
    <div className="mt-4" data-testid="other-results">
      <p className="mb-1.5 text-[12px] text-ink-4">Otros resultados</p>
      <div className="flex flex-wrap gap-2">
        {rest.map((x) => (
          <button key={x.id} type="button" onClick={() => go(mapHref(m.projectId, x.id))} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[12.5px] text-ink-3 opacity-80">
            <MapIcon name={x.icon} className="size-4" />
            {x.name}
          </button>
        ))}
      </div>
    </div>
  )
}

const GROUPS: { kind: ActionKind; title: string }[] = [
  { kind: 'decision', title: 'Necesitan tu decisión' },
  { kind: 'ejecutable', title: 'Puedes hacerlas' },
  { kind: 'revision', title: 'Por revisar' },
  { kind: 'bloqueada', title: 'Dependen de otras' },
]

/** Scene 3: a block's tasks, and the path from one task up to the project's purpose. */
function BlockView({ m, resultId, blockId, taskId, onUpdate }: { m: ProjectMap; resultId: string; blockId: string; taskId?: string; onUpdate: OnUpdate }) {
  const { s } = useProto()
  const b = m.blocks.find((x) => x.id === blockId)
  const r = m.results.find((x) => x.id === resultId)
  if (!b) return <p className="mt-4 text-ink-3">Ese bloque no existe en el prototipo.</p>
  const index = indexTasks(s.data)
  const waiters = waitersOf(s.data, index)
  const nodes = b.tasks.map((t) => taskNode(s.data, t, index, waiters))
  const done = nodes.filter((n) => n.kind === 'terminada')
  return (
    <div className="mt-3" data-testid="map-block-view">
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <button type="button" className="hit inline-flex h-9 items-center gap-1 rounded-full bg-[var(--line)] px-3 text-ink-2" onClick={() => go(mapHref(m.projectId))} data-testid="to-panorama">
          <MapIcon name="diana" className="size-4" /> Panorama
        </button>
        {r && (
          <>
            <span className="text-ink-4">›</span>
            <button type="button" className="hit inline-flex h-9 items-center gap-1 rounded-full bg-[var(--line)] px-3 text-ink-2" onClick={() => go(mapHref(m.projectId, r.id))} data-testid="to-result">
              <MapIcon name={r.icon} className="size-4" /> <span className="max-w-[46vw] truncate">{r.name}</span>
            </button>
          </>
        )}
      </div>
      <motion.div layoutId={`b-${b.id}`} className="surface mt-3 rounded-[20px] px-4 py-3.5" data-testid="block-card">
        <div className="flex items-start gap-3">
          <Bubble icon={b.icon} size="lg" />
          <div className="min-w-0">
            <p className="text-[17px] leading-[1.3] font-medium text-ink">{b.name}</p>
            <p className="mt-0.5 text-[13.5px] leading-[1.4] text-ink-3">{b.purpose}</p>
          </div>
        </div>
        <div className="mt-3">
          <StateBar counts={b.counts} />
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.4] text-ink-4">
          Tareas agrupadas por su título. Agrupar no cambia tareas, IDs ni dependencias.
          <LocalTag />
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.25 }}>
        {GROUPS.map((g) => {
          const list = nodes.filter((n) => n.kind === g.kind)
          if (!list.length) return null
          return (
            <section key={g.kind} className="mt-5" data-testid={`block-${g.kind}`}>
              <h2 className="mb-1 flex items-center gap-2 text-[13px] font-medium text-ink-3">
                <span className={`size-2 rounded-full ${DOT[g.kind]}`} />
                {g.title} <span className="tabular text-ink-4">{list.length}</span>
              </h2>
              {list.map((n) => (
                <TaskItem key={n.task.id} m={m} b={b} r={r} n={n} open={n.task.id === taskId} onUpdate={onUpdate} />
              ))}
            </section>
          )
        })}
        {done.length > 0 && (
          <div className="mt-4">
            <More title="Terminadas" count={done.length}>
              {done.map((n) => (
                <TaskItem key={n.task.id} m={m} b={b} r={r} n={n} open={n.task.id === taskId} onUpdate={onUpdate} />
              ))}
            </More>
          </div>
        )}
      </motion.div>
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
  return (
    <div ref={ref} className={`border-b border-[var(--line)] last:border-b-0 ${open ? 'rounded-[16px] border-transparent bg-[color-mix(in_srgb,var(--color-electric)_6%,transparent)] px-3' : ''}`} data-testid="map-task">
      <button type="button" className="hit flex w-full items-center gap-3 py-2.5 text-left" onClick={() => go(open ? mapHref(m.projectId, r?.id ?? '-', b.id) : here)} aria-expanded={open}>
        <span className={`size-2.5 shrink-0 rounded-full ${DOT[n.kind]}`} />
        <span className={`min-w-0 flex-1 text-[14.5px] leading-[1.35] ${n.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink'}`}>{n.task.title}</span>
        {n.unlocks.length > 0 && n.kind !== 'terminada' && <span className="shrink-0 text-[11px] text-ink-3">libera {n.unlocks.length}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden" data-testid="task-path">
            <PathUp n={n} b={b} results={results} objective={m.objective} />
            {(n.waitsFor.length > 0 || n.unlocks.length > 0) && (
              <div className="mt-3 space-y-2 text-[13px] leading-[1.4]" data-testid="task-deps">
                {n.waitsFor.length > 0 && (
                  <p className="text-ink-2">
                    <span className="text-ink-3">Antes necesita → </span>
                    {n.waitsFor.map((w, i) => (
                      <span key={w.id}>
                        {i > 0 && ', '}«{w.title}»
                      </span>
                    ))}
                  </p>
                )}
                {n.unlocks.length > 0 && (
                  <p className="text-ink-2">
                    <span className="text-ink-3">{n.kind === 'terminada' ? 'Ahora pueden avanzar → ' : 'Al terminarla podrían avanzar → '}</span>
                    {n.unlocks.map((w, i) => (
                      <span key={w.id}>
                        {i > 0 && ', '}«{w.title}»
                      </span>
                    ))}
                    {n.kind !== 'terminada' && <span className="text-ink-4"> (si no esperan también a otra cosa)</span>}
                  </p>
                )}
                <p className="text-[11px] text-ink-4">Dependencias confirmadas en el dossier.</p>
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

/** The chain from a task to the project's purpose, drawn step by step. */
function PathUp({ n, b, results, objective }: { n: TaskNode; b: Block; results: KeyResult[]; objective?: string }) {
  const steps: { icon: Parameters<typeof MapIcon>[0]['name']; label: string; text: string; tag?: ReactNode }[] = [
    { icon: 'herramienta', label: 'Esta tarea', text: STAGE_LABEL[n.stage] === 'Cerrada' ? 'Terminada' : KIND_LABEL[n.kind] },
    { icon: b.icon, label: 'Bloque', text: b.name, tag: <LocalTag /> },
    ...(results.length ? [{ icon: results[0].icon, label: results.length > 1 ? 'Resultados' : 'Resultado', text: results.map((r) => r.name).join(' · '), tag: <AiTag /> }] : []),
    { icon: 'diana' as const, label: 'Objetivo', text: objective ?? 'Objetivo por definir' },
  ]
  return (
    <ol className="relative mt-1 ml-1" aria-label="Para qué sirve esta tarea">
      {steps.map((st, i) => (
        <motion.li key={i} className="relative flex items-start gap-3 pb-3 last:pb-0" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.14, duration: 0.25 }}>
          {i < steps.length - 1 && (
            <motion.span aria-hidden className="absolute top-7 left-[13px] w-[2px] origin-top rounded-full bg-[var(--color-electric)]" style={{ height: 'calc(100% - 1.75rem + 0.25rem)' }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.15 + i * 0.14, duration: 0.25 }} />
          )}
          <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-[var(--control)] text-[var(--control-ink)]' : 'bg-[color-mix(in_srgb,var(--color-electric)_14%,transparent)] text-electric'}`}>
            <MapIcon name={st.icon} className="size-4" />
          </span>
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
    <section data-testid="situation">
      <h2 className="mb-1 text-[13px] font-medium text-ink-3">Situación conocida · toca uno para ver su mapa</h2>
      {s.data.projects.map((p) => {
        const areas = areasOf(s.data, p.id)
        const c = sum(areas.map((a) => a.counts))
        const total = c.terminado + c.pendiente + c.confirmar
        return (
          <a key={p.id} href={mapHref(p.id)} className="hit flex items-center gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0" data-testid="situation-row">
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
