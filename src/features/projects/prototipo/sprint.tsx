import { motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { changeStatus } from '../domain/operations'
import { indexTasks } from '../domain/derive'
import type { Task } from '../domain/types'
import { stageOf } from '../ui/view'
import { GAP, Sequence, useReveal, useSequence } from './aparicion'
import { AiTag, H1, KindTag, LocalTag, More, Primary, Secondary, go } from './kit'
import { mapHref } from './mapa-modelo'
import { Orb, PillarNode, StarOrb } from './orbe'
import {
  KIND_LABEL,
  MONTHS,
  TONE_LABEL,
  approve,
  candidatesFor,
  checkPlan,
  emptySprint,
  grokReview,
  hours,
  projectsOfPillar,
  proposeStrategy,
  suggestNorthStars,
  type Month,
  type PlannedItem,
  type Sprint,
} from './plan'
import { useProto, type Boceto } from './store'

/**
 * PROTOTYPE · Designing the sprint as a visual conversation: one screen, one intention, one main
 * decision. Five scenes — Descubrir, Estrella polar, Tres pilares, Mi camino de 90 días, Revisar y
 * aprobar — over the same plan (plan.ts, unchanged). The idea becomes a north star (the orb grows),
 * the star opens into three paths, the paths are laid along December → January → February.
 *
 * Rules kept from the method:
 *  - The AI proposes (simulated, always marked); nothing counts until the explicit approval.
 *  - Only a missing fact that the plan needs is asked for (weekly hours, a task whose state is
 *    unclear), right where it matters; meanwhile the draft carries it as a visible reserve.
 *  - States, relations and requirements are never invented or marked as met.
 *  - The draft lives in memory while the prototype is open: going back keeps everything.
 */

export const SCENES = ['Descubrir', 'Estrella polar', 'Tres pilares', 'Mi camino de 90 días', 'Revisar y aprobar']
export const sceneHref = (n: number) => `#/sprint/${n}`

function useSprint() {
  const { s, set, ctx } = useProto()
  const sp = s.sprint ?? emptySprint()
  const b = s.boceto
  const patch = (f: (x: Sprint) => Sprint) => set((st) => ({ ...st, sprint: f(st.sprint ?? emptySprint()) }))
  const draft = (f: (x: Boceto) => Boceto) => set((st) => ({ ...st, boceto: f(st.boceto) }))
  return { s, set, ctx, sp, b, patch, draft }
}

const field = 'w-full rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[18px] leading-[1.45] text-ink focus:outline-2 focus:outline-[var(--color-electric)]'
const chip = 'hit inline-flex min-h-11 items-center justify-center rounded-full border border-[rgba(255,255,255,0.85)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(236,238,245,0.75))] px-4 text-[16px] font-medium text-ink shadow-[inset_0_1px_0_#fff,0_6px_14px_-10px_rgba(30,34,60,0.45),0_0_0_1px_rgba(120,128,156,0.14)]'
const amber = 'rounded-[22px] border border-[rgba(135,82,0,0.28)] bg-[#fbf3e4] px-4 py-4'

/** «Escrita por ti»: the north star the person wrote (not a decision yet: that is the approval). */
const MineTag = () => <span className="ml-1.5 inline-flex min-h-6 items-center rounded-full bg-[#dff1e8] px-2 py-0.5 align-middle text-[14px] leading-[1.2] font-medium whitespace-nowrap text-[#094d33]">Escrita por ti</span>

// ── The scene frame ─────────────────────────────────────────────────────────

/** #/sprint/1…5 */
export function Scene({ n }: { n: number }) {
  const k = Math.min(5, Math.max(1, n))
  const { s, set, draft } = useSprint()
  const ready = k === 1 || (s.sprint?.pillars.length ?? 0) > 0
  useEffect(() => {
    if (s.sprint?.status === 'aprobado') return
    draft((x) => ({ ...x, scene: k, reached: Math.max(x.reached, k) }))
    // A scene past the first opened directly gets the proposal it needs, with the person's own words if any.
    if (k >= 2 && !(s.sprint?.pillars.length ?? 0))
      set((st) => {
        const mine = st.boceto.intent.trim()
        const base = proposeStrategy(st.data, st.sprint?.hoursPerWeek ?? 6)
        return { ...st, sprint: mine ? { ...base, northStar: mine, northStarFrom: 'tuya' } : base }
      })
  }, [k])
  if (s.sprint?.status === 'aprobado')
    return (
      <div data-testid="scene-approved">
        <H1>Tu sprint ya está aprobado</H1>
        <div className="mt-6">
          <Primary onClick={() => go('#/')}>Ver mi plan de 90 días</Primary>
        </div>
      </div>
    )
  if (!ready) return null
  return (
    <Sequence id={`escena:${k}`} length={1}>
      <div data-testid="scene" data-scene={k}>
        <SceneHeader k={k} />
        {k === 1 && <Descubrir />}
        {k === 2 && <EstrellaPolar />}
        {k === 3 && <TresPilares />}
        {k === 4 && <Camino />}
        {k === 5 && <Revisar />}
      </div>
    </Sequence>
  )
}

function SceneHeader({ k }: { k: number }) {
  const { b, set } = useSprint()
  return (
    <header className="mb-4" data-testid="scene-header">
      <div className="flex items-center justify-between gap-3">
        <a href={k > 1 ? sceneHref(k - 1) : '#/'} className="hit -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[16px] text-ink-3" data-testid="scene-back" aria-label={k > 1 ? `Volver a ${SCENES[k - 2]}` : 'Volver al plan de 90 días'}>
          <svg aria-hidden viewBox="0 0 16 16" className="size-4">
            <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Anterior
        </a>
        <button
          type="button"
          className="hit -mr-2 inline-flex min-h-11 items-center rounded-full px-2 text-[16px] whitespace-nowrap text-ink-3"
          data-testid="scene-save"
          onClick={() => {
            set((st) => ({ ...st, notice: 'Borrador guardado mientras el prototipo esté abierto.' }))
            go('#/')
          }}
        >
          Guardar y salir
        </button>
      </div>
      {/* Where I am, and every scene already reached one tap away. */}
      <nav aria-label="Escenas del diseño" className="mt-1 flex gap-1" data-testid="scene-progress">
        {SCENES.map((name, i) => {
          const n = i + 1
          const can = n <= b.reached && n !== k
          return (
            <button key={name} type="button" disabled={!can} aria-current={n === k ? 'step' : undefined} aria-label={`Escena ${n}: ${name}`} onClick={() => go(sceneHref(n))} className="hit flex min-h-11 flex-1 items-center disabled:cursor-default">
              <span className={`h-1.5 w-full rounded-full ${n === k ? 'bg-[var(--color-electric)]' : n <= b.reached ? 'bg-[color-mix(in_srgb,var(--color-electric)_35%,transparent)]' : 'bg-[var(--line)]'}`} />
            </button>
          )
        })}
      </nav>
      <p className="text-[14px] font-medium tracking-[0.02em] text-ink-3 uppercase" data-testid="scene-kicker">
        {k} de 5 · {SCENES[k - 1]}
      </p>
    </header>
  )
}

// ── 1 · Descubrir ───────────────────────────────────────────────────────────

function Descubrir() {
  const { b, draft, set } = useSprint()
  const reveal = useReveal()
  const mine = b.intent.trim()
  const next = () => {
    set((st) => {
      const base = st.sprint?.pillars.length ? st.sprint : proposeStrategy(st.data, st.sprint?.hoursPerWeek ?? 6)
      const words = st.boceto.intent.trim()
      const sprint: Sprint = words
        ? { ...base, northStar: words, northStarFrom: 'tuya' }
        : base.northStarFrom === 'tuya'
          ? { ...base, northStar: suggestNorthStars(st.data)[st.boceto.idea % 3], northStarFrom: 'ia' }
          : base
      return { ...st, sprint }
    })
    go(sceneHref(2))
  }
  return (
    <div data-testid="scene-discover">
      <div {...reveal(0, 'pl-orb-enter flex justify-center pt-1 pb-3')}>
        <StarOrb size={64} seed />
      </div>
      <div {...reveal(0.08)}>
        <H1>Imagina que ya es 28 de febrero.</H1>
      </div>
      <p {...reveal(0.2, 'mt-3 text-[19px] leading-[1.45] text-ink-2')}>¿Qué te gustaría que fuera verdad gracias a tus proyectos?</p>
      <div {...reveal(0.3, 'mt-4')}>
        <label htmlFor="intent" className="sr-only">
          Tu dirección para los próximos 90 días
        </label>
        <textarea id="intent" data-testid="intent" rows={4} className={field} value={b.intent} placeholder="Por ejemplo: que el huerto esté abierto y los vecinos lo cuiden." onChange={(e) => draft((x) => ({ ...x, intent: e.target.value }))} />
        <p className="mt-2 text-[15px] leading-[1.45] text-ink-3">Una frase basta. Si aún no lo tienes claro, te propongo una.</p>
      </div>
      <div {...reveal(0.4, 'mt-5')}>
        <Orb testId="scene-next" label={mine ? 'Esta es mi dirección' : 'Proponme una dirección'} hint={mine ? 'Se convierte en tu estrella polar' : 'Una sugerencia simulada de la IA, para editar'} onPress={next} />
      </div>
    </div>
  )
}

// ── 2 · Estrella polar ──────────────────────────────────────────────────────

/** Why each simulated proposal matters (same order as suggestNorthStars). */
const WHY = [
  'Reúne en una dirección lo que ya está en marcha. Cada mes se notará fuera de tu lista: en el huerto, en el taller y en el buzón de los vecinos.',
  'Pone a prueba con personas reales lo que ya tiene objetivo, antes de abrir frentes nuevos.',
  'Menos frentes a la vez: una cosa terminada pesa más que seis empezadas.',
]

function EstrellaPolar() {
  const { s, sp, b, patch, draft } = useSprint()
  const ideas = useMemo(() => suggestNorthStars(s.data), [s.data])
  const [editing, setEditing] = useState(false)
  const reveal = useReveal()
  const mine = sp.northStarFrom === 'tuya'
  const other = () => {
    const i = (b.idea + 1) % ideas.length
    draft((x) => ({ ...x, idea: i }))
    patch((x) => ({ ...x, northStar: ideas[i], northStarFrom: 'ia' }))
    setEditing(false)
  }
  return (
    <div data-testid="scene-star">
      <div className="flex justify-center pt-2 pb-5">
        <StarOrb size={124} halo />
      </div>
      <div {...reveal(0.12)}>
        {editing ? (
          <div data-testid="north-star-edit">
            <label htmlFor="north" className="mb-1 block text-[15px] text-ink-3">
              Tu estrella polar
            </label>
            <textarea id="north" rows={4} className={field} value={sp.northStar} onChange={(e) => patch((x) => ({ ...x, northStar: e.target.value, northStarFrom: 'tuya' }))} />
            <div className="mt-2 flex justify-end">
              <button type="button" className={chip} onClick={() => setEditing(false)}>
                Listo
              </button>
            </div>
          </div>
        ) : (
          <p className="pl-title text-center text-[24px] leading-[1.35] text-ink text-balance" data-testid="north-star">
            {sp.northStar}
          </p>
        )}
        <p className="mt-2 text-center">{mine ? <MineTag /> : <AiTag />}</p>
      </div>
      {!editing && (
        <div {...reveal(0.22, 'mt-3 flex flex-wrap justify-center gap-2')}>
          <button type="button" className={chip} data-testid="north-star-edit-open" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button type="button" className={chip} data-testid="north-star-other" onClick={other}>
            Otra propuesta
          </button>
        </div>
      )}
      <section {...reveal(0.32, 'surface-quiet mt-5 rounded-[22px] px-4 py-4')} data-testid="star-why">
        <h2 className="text-[15px] font-medium text-ink-3">Por qué importa</h2>
        <p className="mt-1 text-[17px] leading-[1.5] text-ink-2">{mine ? 'La has escrito tú. Todo el sprint se ordena para acercarte a ella.' : WHY[b.idea % WHY.length]}</p>
        <h2 className="mt-4 text-[15px] font-medium text-ink-3">
          Cómo sabremos que se ha conseguido
          <AiTag />
        </h2>
        <ul className="mt-1" data-testid="star-signs">
          {sp.pillars.map((p) => (
            <li key={p.id} className="flex gap-2 py-1 text-[17px] leading-[1.45] text-ink-2">
              <span aria-hidden>·</span>
              <span>{p.results.feb}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[15px] text-ink-3">El 28 de febrero.</p>
      </section>
      <div {...reveal(0.44, 'mt-6')}>
        <Orb testId="scene-next" label="Abrir tres caminos" hint="La estrella polar se divide en tres pilares" onPress={() => go(sceneHref(3))} />
      </div>
    </div>
  )
}

// ── 3 · Tres pilares ────────────────────────────────────────────────────────

/** The simulated purpose of each proposed pillar (the person can rewrite it). */
const PURPOSE: Record<string, string> = {
  p1: 'Que el huerto pase de proyecto a lugar: con agua, normas y vecinos que lo cuidan.',
  p2: 'Comprobar con personas reales que el curso funciona antes de abrir inscripciones.',
  p3: 'Que el barrio se entere cada mes de lo que pasa en el huerto y en el taller.',
}

/** The north star opening into three paths: lines of light grow from the orb to each pillar. */
function Branches() {
  const { sp } = useSprint()
  const { running } = useSequence()
  const reveal = useReveal()
  return (
    <div className="mx-auto w-full max-w-[380px]" data-testid="pillar-branches" aria-hidden>
      <div className="flex justify-center">
        <StarOrb size={64} />
      </div>
      <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="-mt-1 block h-[64px] w-full">
        <defs>
          <linearGradient id="pl-camino-luz" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(214,206,240)" />
            <stop offset="0.55" stopColor="rgb(150,176,226)" />
            <stop offset="1" stopColor="rgb(226,190,200)" />
          </linearGradient>
        </defs>
        {[50, 150, 250].map((x, i) => (
          <motion.path key={x} d={`M150 0 C150 34 ${x} 26 ${x} 64`} className="pl-camino" vectorEffect="non-scaling-stroke" initial={running ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ delay: 0.12 + i * GAP, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
        ))}
      </svg>
      <div className="grid grid-cols-3 justify-items-center">
        {sp.pillars.map((p, i) => (
          <span key={p.id} {...reveal(0.4 + i * GAP)}>
            <PillarNode i={i} size={44} on />
          </span>
        ))}
      </div>
    </div>
  )
}

function TresPilares() {
  const { s, sp, b, patch, draft } = useSprint()
  const [open, setOpen] = useState<string | null>(null)
  const reveal = useReveal()
  const name = (id: string) => s.data.projects.find((p) => p.id === id)?.name ?? id
  const setPillar = (id: string, f: (p: Sprint['pillars'][number]) => Sprint['pillars'][number]) => patch((x) => ({ ...x, pillars: x.pillars.map((q) => (q.id === id ? { ...f(q), from: 'tuya' } : q)) }))
  return (
    <div data-testid="scene-pillars">
      <Branches />
      <p {...reveal(0.6, 'mt-5 text-[17px] leading-[1.5] text-ink-2')}>
        Tu estrella polar, en tres caminos. Abre uno para verlo o cambiarlo.
        {sp.pillars.some((p) => p.from === 'ia') && <AiTag />}
      </p>
      <ol className="mt-2" data-testid="pillar-paths">
        {sp.pillars.map((p, i) => {
          const projects = projectsOfPillar(s.data, sp, p.id)
          const acts = sp.actions.filter((a) => a.pillarId === p.id).length
          const isOpen = open === p.id
          const purpose = b.purposes[p.id] ?? PURPOSE[p.id] ?? ''
          return (
            <li key={p.id} {...reveal(0.66 + i * GAP, 'border-b border-[var(--line)] last:border-b-0')} data-testid="pillar-path">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)} className="hit flex min-h-14 w-full items-start gap-3 py-3 text-left" data-testid="pillar-toggle">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--line)] text-[15px] font-semibold text-ink" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="pl-title block text-[20px] leading-[1.3] text-ink">{p.name}</span>
                  <span className="mt-1 block text-[16px] leading-[1.45] text-ink-2">{purpose}</span>
                </span>
                <svg aria-hidden viewBox="0 0 16 16" className={`mt-1 size-5 shrink-0 text-ink-3 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                  <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="pb-4 pl-11" data-testid="pillar-edit">
                  <label className="block">
                    <span className="text-[15px] text-ink-3">Nombre del pilar</span>
                    <input className={`${field} mt-1`} value={p.name} onChange={(e) => setPillar(p.id, (q) => ({ ...q, name: e.target.value }))} />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-[15px] text-ink-3">Para qué sirve</span>
                    <textarea rows={3} className={`${field} mt-1`} value={purpose} onChange={(e) => draft((x) => ({ ...x, purposes: { ...x.purposes, [p.id]: e.target.value } }))} />
                  </label>
                  <p className="mt-3 text-[16px] leading-[1.5] text-ink-2" data-testid="pillar-projects">
                    {projects.length ? `Reúne ${projects.length === 1 ? 'un proyecto' : `${projects.length} proyectos`}` : 'De ningún proyecto todavía'} · {acts} {acts === 1 ? 'acción' : 'acciones'}
                  </p>
                  {projects.length > 0 && (
                    <p className="mt-1 text-[16px] leading-[1.6] text-ink-3">
                      Ver el mapa de{' '}
                      {projects.map((id, k) => (
                        <span key={id}>
                          {k > 0 && ', '}
                          <a href={mapHref(id)} className="hit text-electric underline underline-offset-4">
                            {name(id)}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="mt-2 text-[15px] leading-[1.45] text-ink-3">Sus resultados y acciones se ordenan en la escena siguiente.</p>
                </motion.div>
              )}
            </li>
          )
        })}
      </ol>
      <p {...reveal(1, 'mt-3 text-[15px] leading-[1.45] text-ink-3')}>En este prototipo la IA simulada propone siempre estos tres caminos, escribas lo que escribas.</p>
      <div {...reveal(0.5, 'mt-5')}>
        <Orb testId="scene-next" label="Ordenar en 90 días" hint="Diciembre, enero y febrero" onPress={() => go(sceneHref(4))} />
      </div>
    </div>
  )
}

// ── 4 · Mi camino de 90 días ────────────────────────────────────────────────

const WORK_CHOICES = [
  { value: 'Pendiente', label: 'Sin empezar' },
  { value: 'En curso', label: 'Empezado' },
  { value: 'Ejecutada', label: 'Terminado' },
  { value: 'Descartada', label: 'No se hará' },
]

/** December → January → February as three metal nodes on one line of light. */
function Timeline({ month, onPick }: { month: Month; onPick: (m: Month) => void }) {
  const reveal = useReveal()
  return (
    <div className="relative" data-testid="timeline" role="group" aria-label="Meses del sprint">
      <span aria-hidden {...reveal(0.05, 'pl-linea absolute top-[29px] right-[16.6%] left-[16.6%] h-[2px] rounded-full bg-[linear-gradient(90deg,rgb(214,206,240),rgb(150,176,226),rgb(226,190,200))]')} />
      <div className="relative grid grid-cols-3">
        {MONTHS.map((m, i) => {
          const on = m.key === month
          return (
            <button key={m.key} type="button" aria-pressed={on} onClick={() => onPick(m.key)} data-testid="timeline-month" className="hit flex min-h-11 flex-col items-center gap-1.5 py-0.5">
              <span {...reveal(0.1 + i * GAP, 'grid h-[58px] place-items-center')}>
                <span className="pl-node grid place-items-center text-[15px] font-semibold text-[#2c3350] transition-[width,height] duration-300" data-on={on ? 'true' : 'false'} style={{ width: on ? 56 : 42, height: on ? 56 : 42 }}>
                  {m.short}
                </span>
              </span>
              <span className={`text-[16px] ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Camino() {
  const { s, set, ctx, sp, b, patch, draft } = useSprint()
  const reveal = useReveal()
  const check = checkPlan(s.data, sp)
  const month = b.month
  const label = MONTHS.find((m) => m.key === month)!.label
  const mc = check.months.find((m) => m.month === month)!
  const over = mc.load > mc.capacity
  const prereqs = check.prerequisites.filter((p) => p.month === month && !b.dismissed.includes(p.task.id))
  const count = mc.results.reduce((a, r) => a + r.items.length, 0)
  const [askHours, setAskHours] = useState(false)
  const [pendingHours, setPendingHours] = useState<number | null>(null)
  const edited = sp.actions.some((a) => a.from === 'tuya')
  const reshape = (h: number) => {
    patch((x) => ({ ...proposeStrategy(s.data, h), northStar: x.northStar, northStarFrom: x.northStarFrom, pillars: x.pillars }))
    draft((x) => ({ ...x, hoursOk: true }))
    set((st) => ({ ...st, notice: `Acciones ajustadas a ${h} h por semana.` }))
    setPendingHours(null)
    setAskHours(false)
  }
  const answerHours = (h: number) => {
    if (h === sp.hoursPerWeek) {
      draft((x) => ({ ...x, hoursOk: true }))
      setAskHours(false)
    } else if (edited) setPendingHours(h)
    else reshape(h)
  }
  const showQuestion = !b.hoursOk || askHours
  return (
    <div data-testid="scene-path">
      <Timeline month={month} onPick={(m) => draft((x) => ({ ...x, month: m }))} />

      <section className="mt-4" data-testid="month-results" aria-live="polite">
        <h2 {...reveal(0.3, 'text-[15px] font-medium text-ink-3')}>
          Al final de {label.toLowerCase()}
          <AiTag />
        </h2>
        <ol>
          {sp.pillars.map((p, i) => {
            const note = mc.results.find((r) => r.pillarId === p.id)?.note
            return (
              <li key={p.id} {...reveal(0.36 + i * GAP, 'flex gap-3 border-b border-[var(--line)] py-3 last:border-b-0')} data-testid="month-result">
                <span className="mt-0.5">
                  <PillarNode i={i} size={32} />
                </span>
                <div className="min-w-0">
                  <p className="pl-title text-[22px] leading-[1.3] text-ink">{p.results[month]}</p>
                  <p className="mt-0.5 text-[15px] leading-[1.4] text-ink-3">{p.name}</p>
                  {note && <p className="mt-1 text-[16px] leading-[1.45] text-[#5f3a00]">{note}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <p {...reveal(0.7, `mt-3 text-[16px] leading-[1.5] ${over ? 'text-[#5f3a00]' : 'text-ink-2'}`)} data-testid="month-load">
        {label}: {hours(mc.load)} de trabajo para {hours(mc.capacity)} disponibles
        {mc.unestimated > 0 && ` · ${mc.unestimated} sin estimar, cuento 2 h cada una`}
        <LocalTag />
        {b.hoursOk && !askHours && (
          <>
            {' '}
            <button type="button" className="hit inline-flex min-h-11 items-center text-[16px] text-electric underline underline-offset-4" onClick={() => setAskHours(true)} data-testid="hours-change">
              Cambiar horas
            </button>
          </>
        )}
      </p>

      {/* The one fact the plan needs and does not have: asked here, nothing else. */}
      {showQuestion && (
        <section {...reveal(0.76, 'surface mt-4 rounded-[22px] px-4 py-4')} data-testid="hours-question">
          <p className="text-[17px] leading-[1.45] text-ink">Solo me falta un dato: ¿cuántas horas a la semana tienes para estos proyectos?</p>
          {!b.hoursOk && <p className="mt-1 text-[15px] leading-[1.45] text-ink-3">Mientras no lo digas, calculo con {sp.hoursPerWeek} h y lo dejo como reserva.</p>}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[3, 6, 10].map((h) => (
              <button key={h} type="button" className={`${chip} ${h === sp.hoursPerWeek ? 'ring-2 ring-[var(--color-electric)]' : ''}`} onClick={() => answerHours(h)} data-testid="hours-choice">
                {h} h
              </button>
            ))}
          </div>
          {pendingHours !== null && (
            <div className="mt-3" data-testid="hours-reshape">
              <p className="text-[16px] leading-[1.45] text-ink-2">Con {pendingHours} h cambian las acciones propuestas y se pierden tus cambios en ellas.</p>
              <div className="mt-2 flex flex-col gap-2">
                <Secondary onClick={() => reshape(pendingHours)}>Ajustar las acciones a {pendingHours} h</Secondary>
                <button
                  type="button"
                  className="hit min-h-11 text-[16px] text-ink-2 underline underline-offset-4"
                  onClick={() => {
                    patch((x) => ({ ...x, hoursPerWeek: pendingHours }))
                    draft((x) => ({ ...x, hoursOk: true }))
                    setPendingHours(null)
                    setAskHours(false)
                  }}
                >
                  Mantener mis acciones
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {prereqs.length > 0 && (
        <section {...reveal(0.8, `${amber} mt-4`)} data-testid="month-prereqs">
          <h3 className="text-[17px] font-medium text-[#5f3a00]">Falta algo para empezar en {label.toLowerCase()}</h3>
          {prereqs.map((r) => {
            const pid = sp.actions.find((a) => a.taskId === r.forTask.id)!.pillarId
            return (
              <div key={r.task.id} className="border-t border-[rgba(135,82,0,0.18)] py-3 first:border-t-0" data-testid="month-prereq">
                <p className="text-[17px] leading-[1.45] text-ink">
                  «{r.forTask.title}» espera a «{r.task.title}», que no está en el sprint.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" className={chip} data-testid="prereq-add" onClick={() => patch((x) => ({ ...x, actions: [...x.actions, { id: `${pid}-${r.task.id}`, pillarId: pid, taskId: r.task.id, month: r.month, from: 'tuya' }] }))}>
                    Incluirla en {label.toLowerCase()}
                  </button>
                  <button type="button" className="hit min-h-11 px-2 text-[16px] text-ink-2 underline underline-offset-4" onClick={() => draft((x) => ({ ...x, dismissed: [...x.dismissed, r.task.id] }))}>
                    No por ahora
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      )}

      <section {...reveal(0.84, 'mt-4')}>
        <More key={month} id={`camino:${month}`} title={`Acciones de ${label.toLowerCase()}`} count={count} hint="Cambiar de mes, quitar o añadir" testId="month-actions">
          {sp.pillars.map((p) => {
            const items = mc.results.find((r) => r.pillarId === p.id)?.items ?? []
            return (
              <div key={p.id} className="mt-3 first:mt-0" data-testid="month-pillar">
                <p className="text-[15px] font-medium text-ink-3">{p.name}</p>
                {items.map((it) => (
                  <ActionRow key={it.action.id} it={it} onClarify={(t, v) => set((st) => ({ ...st, data: changeStatus(st.data, t.id, v, ctx()), notice: 'Anotado solo en esta tarea.' }))} />
                ))}
                {!items.length && <p className="py-2 text-[16px] text-[#5f3a00]">Sin acciones este mes</p>}
                <AddAction pillarId={p.id} month={month} />
              </div>
            )
          })}
        </More>
      </section>

      <div {...reveal(0.5, 'mt-5')}>
        <Orb testId="scene-next" label="Revisar mi sprint" hint="Una síntesis antes de aprobar" onPress={() => go(sceneHref(5))} />
      </div>
    </div>
  )
}

function ActionRow({ it, onClarify }: { it: PlannedItem; onClarify: (t: Task, value: string) => void }) {
  const { s, patch } = useSprint()
  const [ask, setAsk] = useState(false)
  const project = s.data.projects.find((p) => p.id === it.task.projectId)?.name
  const unclear = stageOf(s.data, it.task) === 'por-clasificar'
  return (
    <div className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="path-action">
      <a href={`#/tarea/${encodeURIComponent(it.task.id)}`} className={`hit block text-[17px] leading-[1.4] ${it.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink'}`}>
        {it.task.title}
      </a>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <KindTag kind={it.kind} label={KIND_LABEL[it.kind]} />
        <span className="text-[15px] text-ink-3">{project}</span>
      </div>
      {unclear && (
        <div className="mt-2" data-testid="clarify">
          {!ask ? (
            <button type="button" className="hit inline-flex min-h-11 items-center text-left text-[16px] text-electric underline underline-offset-4" onClick={() => setAsk(true)} data-testid="clarify-open">
              Su estado está por aclarar · ¿en qué punto está?
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {WORK_CHOICES.map((c) => (
                <button key={c.value} type="button" className={chip} onClick={() => onClarify(it.task, c.value)} data-testid="clarify-choice">
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Mes de esta acción">
        {MONTHS.map((m) => {
          const on = m.key === it.action.month
          return (
            <button key={m.key} type="button" aria-pressed={on} onClick={() => !on && patch((x) => ({ ...x, actions: x.actions.map((a) => (a.id === it.action.id ? { ...a, month: m.key, from: 'tuya' } : a)) }))} className={`hit inline-flex min-h-11 min-w-12 items-center justify-center rounded-full px-3 text-[15px] ${on ? 'bg-[var(--color-pearl)] font-semibold text-ink shadow-[0_1px_3px_rgba(8,26,50,0.16),0_0_0_1px_rgba(120,128,156,0.2)]' : 'text-ink-3'}`}>
              {m.short}
            </button>
          )
        })}
        <button type="button" className="hit ml-auto inline-flex min-h-11 items-center px-2 text-[15px] text-ink-3 underline underline-offset-4" onClick={() => patch((x) => ({ ...x, actions: x.actions.filter((a) => a.id !== it.action.id) }))} data-testid="action-remove">
          Quitar
        </button>
      </div>
    </div>
  )
}

function AddAction({ pillarId, month }: { pillarId: string; month: Month }) {
  const { s, sp, patch } = useSprint()
  const [open, setOpen] = useState(false)
  const ideas = open ? candidatesFor(s.data, sp, pillarId, 3) : []
  const project = (t: Task) => s.data.projects.find((p) => p.id === t.projectId)?.name
  return (
    <div className="mt-1">
      <button type="button" aria-expanded={open} className="hit inline-flex min-h-11 items-center text-[16px] text-electric underline underline-offset-4" onClick={() => setOpen(!open)} data-testid="action-add-open">
        {open ? 'Cerrar sugerencias' : 'Añadir una acción'}
      </button>
      {open && (
        <div className="mt-1" data-testid="action-add">
          <p className="text-[15px] text-ink-3">
            Podrías añadir
            <AiTag />
          </p>
          {ideas.map((t) => (
            <button key={t.id} type="button" className="hit flex min-h-11 w-full items-start gap-2 py-2 text-left" onClick={() => patch((x) => ({ ...x, actions: [...x.actions, { id: `${pillarId}-${t.id}`, pillarId, taskId: t.id, month, from: 'tuya' }] }))} data-testid="action-add-item">
              <span className="text-[18px] leading-[1.2] font-medium text-electric" aria-hidden>
                +
              </span>
              <span className="text-[16px] leading-[1.45] text-ink-2">
                {t.title} <span className="text-ink-3">· {project(t)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 5 · Revisar y aprobar ───────────────────────────────────────────────────

function Revisar() {
  const { s, set, sp, b, draft } = useSprint()
  const reveal = useReveal()
  const [grok, setGrok] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const check = checkPlan(s.data, sp)
  const index = indexTasks(s.data)
  const pillar = (id: string) => sp.pillars.find((p) => p.id === id)!
  const label = (k: Month) => MONTHS.find((x) => x.key === k)!.label
  const over = check.months.filter((m) => m.load > m.capacity)
  // «Needs N decisions first» is grouped per month (one line, not one per result); other notes stay as they are.
  const decides = /^Necesita antes/
  const notes = check.months.flatMap((m) => m.results.filter((r) => r.note && !decides.test(r.note)).map((r) => ({ month: m.month, pillarId: r.pillarId, note: r.note! })))
  const many = (note: string) => (/^Necesita antes una /.test(note) ? 1 : Number(note.match(/^Necesita antes (\d+)/)?.[1] ?? 0))
  const waiting = check.months
    .map((m) => {
      const results = m.results.filter((r) => r.note && decides.test(r.note))
      return { month: m.month, results: results.length, decisions: results.reduce((a, r) => a + many(r.note!), 0) }
    })
    .filter((w) => w.results > 0)
  const prereqs = check.prerequisites.filter((p) => !b.dismissed.includes(p.task.id))
  const unclear = sp.actions.filter((a) => {
    const t = index.get(a.taskId)
    return t && stageOf(s.data, t, index) === 'por-clasificar'
  })
  const toMonth = (m: Month) => {
    draft((x) => ({ ...x, month: m }))
    go(sceneHref(4))
  }
  const reserves: { key: string; text: ReactNode; action?: ReactNode }[] = [
    ...(!b.hoursOk ? [{ key: 'horas', text: `Horas por semana sin confirmar: calculo con ${sp.hoursPerWeek} h.`, action: <ResLink onClick={() => toMonth(b.month)}>Confirmarlas</ResLink> }] : []),
    ...over.map((m) => ({ key: `over-${m.month}`, text: `${label(m.month)}: ${hours(m.load)} de trabajo para ${hours(m.capacity)} disponibles.`, action: <ResLink onClick={() => toMonth(m.month)}>Ajustar {label(m.month).toLowerCase()}</ResLink> })),
    ...notes.map((n) => ({ key: `note-${n.month}-${n.pillarId}`, text: `${label(n.month)} · ${pillar(n.pillarId).name}: ${n.note}` })),
    ...waiting.map((w) => ({
      key: `dec-${w.month}`,
      text: `${label(w.month)}: ${w.results === 1 ? 'un resultado necesita' : `${w.results} de ${sp.pillars.length} resultados necesitan`} antes ${w.decisions === 1 ? 'una decisión tuya' : `${w.decisions} decisiones tuyas`}.`,
      action: <ResLink onClick={() => toMonth(w.month)}>Ver {label(w.month).toLowerCase()}</ResLink>,
    })),
    ...(prereqs.length ? [{ key: 'req', text: `${prereqs.length === 1 ? 'Una acción espera' : `${prereqs.length} acciones esperan`} a tareas que no están en el sprint.`, action: <ResLink onClick={() => toMonth(prereqs[0].month)}>Resolverlo</ResLink> }] : []),
    ...(unclear.length ? [{ key: 'unclear', text: `${unclear.length === 1 ? 'Una acción tiene' : `${unclear.length} acciones tienen`} el estado por aclarar. El sprint no las da por empezadas.` }] : []),
  ]
  return (
    <div data-testid="scene-review">
      <div {...reveal(0, 'flex items-center gap-4')}>
        <StarOrb size={60} />
        <p className="pl-title min-w-0 flex-1 text-[22px] leading-[1.35] text-ink" data-testid="summary-star">
          {sp.northStar}
        </p>
      </div>

      <ol {...reveal(0.14, 'mt-5')} data-testid="summary-pillars">
        {sp.pillars.map((p, i) => (
          <li key={p.id} className="flex gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
            <PillarNode i={i} size={32} />
            <div className="min-w-0">
              <p className="pl-title text-[19px] leading-[1.3] text-ink">{p.name}</p>
              <p className="mt-0.5 text-[16px] leading-[1.45] text-ink-2">En febrero: {p.results.feb}</p>
            </div>
          </li>
        ))}
      </ol>

      <div {...reveal(0.26, 'mt-3 grid grid-cols-3 gap-2')} data-testid="summary-months">
        {check.months.map((m) => (
          <button key={m.month} type="button" onClick={() => toMonth(m.month)} className="hit surface-quiet flex min-h-14 flex-col items-center justify-center rounded-[16px] px-1 py-2">
            <span className="text-[15px] font-semibold text-ink">{MONTHS.find((x) => x.key === m.month)!.short}</span>
            <span className={`tabular text-[15px] ${m.load > m.capacity ? 'text-[#5f3a00]' : 'text-ink-2'}`}>{Math.round(m.load / 60)} h</span>
            <span className="tabular text-[14px] text-ink-3">de {Math.round(m.capacity / 60)}</span>
          </button>
        ))}
      </div>
      <p {...reveal(0.3, 'mt-1 text-[14px] text-ink-3')}>
        Horas de trabajo y disponibles por mes
        <LocalTag />
      </p>

      {/* What can make the sprint unviable stays in view, before the approval. */}
      {reserves.length ? (
        <section {...reveal(0.38, `${amber} mt-5`)} data-testid="reserves">
          <h2 className="text-[17px] font-medium text-[#5f3a00]">Antes de aprobar, ten en cuenta</h2>
          {reserves.map((r) => (
            <div key={r.key} className="border-t border-[rgba(135,82,0,0.18)] py-3 first:border-t-0" data-testid="reserve">
              <p className="text-[17px] leading-[1.45] text-ink">{r.text}</p>
              {r.action}
            </div>
          ))}
        </section>
      ) : (
        <p {...reveal(0.38, 'mt-5 text-[17px] text-[#094d33]')} data-testid="reserves-none">
          Sin reservas: horas confirmadas, ningún mes sobrecargado y nada esperando fuera del sprint.
        </p>
      )}

      <section {...reveal(0.46, 'mt-4')}>
        <More id="revision:detalle" title="Ver el detalle por mes" hint="Resultados y acciones de cada mes" testId="summary-detail">
          {check.months.map((m) => (
            <div key={m.month} className="mt-4 first:mt-0" data-testid="detail-month">
              <p className="pl-title text-[19px] text-ink">{label(m.month)}</p>
              {m.results.map((r) => (
                <div key={r.pillarId} className="mt-2 border-l-2 border-[var(--line)] pl-3">
                  <p className="text-[15px] font-medium text-ink-3">{pillar(r.pillarId).name}</p>
                  <p className="text-[17px] leading-[1.4] text-ink">{r.result}</p>
                  {r.items.map((it) => (
                    <p key={it.action.id} className="mt-1 text-[16px] leading-[1.45] text-ink-2">
                      · {it.task.title}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </More>
      </section>

      <section {...reveal(0.54, 'mt-5')} data-testid="grok">
        {!grok ? (
          <Secondary testId="ask-grok" onClick={() => setGrok(true)}>
            Pedir la opinión de Grok (opcional)
          </Secondary>
        ) : (
          <GrokList sp={sp} />
        )}
      </section>

      {/* The approval is explicit: a clear button, then a confirmation that says what it means. */}
      <section {...reveal(0.6, 'mt-6')} data-testid="approval">
        {!confirming ? (
          <Primary testId="approve-start" onClick={() => setConfirming(true)}>
            Aprobar mi sprint
          </Primary>
        ) : (
          <div className="surface rounded-[22px] px-4 py-4" data-testid="approve-confirm">
            <p className="text-[17px] leading-[1.5] text-ink">
              ¿Apruebas este sprint{reserves.length ? ` con ${reserves.length === 1 ? 'una reserva' : `${reserves.length} reservas`}` : ''}? Desde ese momento será tu decisión, no una sugerencia.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Primary
                testId="approve"
                onClick={() => {
                  set((st) => ({ ...st, sprint: approve(sp, `${st.today}T12:00:00-06:00`), notice: 'Sprint aprobado. Desde ahora es tu decisión.' }))
                  go('#/')
                }}
              >
                Sí, aprobar mi sprint
              </Primary>
              <Secondary testId="approve-cancel" onClick={() => setConfirming(false)}>
                Todavía no
              </Secondary>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function ResLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="hit mt-1 inline-flex min-h-11 items-center text-[16px] font-medium text-electric underline underline-offset-4">
      {children}
    </button>
  )
}

export function GrokList({ sp }: { sp: Sprint }) {
  const { s } = useProto()
  const obs = grokReview(s.data, sp, s.today)
  return (
    <div data-testid="grok-list">
      <h2 className="text-[15px] font-medium text-ink-3">
        Grok, asesor opcional
        <AiTag who="Grok" />
      </h2>
      {obs.length ? (
        obs.map((o, i) => (
          <p key={i} className="py-1.5 text-[16px] leading-[1.45] text-ink-2">
            <span className="text-ink-3">{TONE_LABEL[o.tone]}: </span>
            {o.text}
          </p>
        ))
      ) : (
        <p className="py-1.5 text-[16px] text-ink-3">No ve riesgos, desviaciones ni sobrecarga.</p>
      )}
      <p className="mt-1 text-[14px] text-ink-3">Es una simulación. Grok observa; no cambia el plan ni decide por ti.</p>
    </div>
  )
}
