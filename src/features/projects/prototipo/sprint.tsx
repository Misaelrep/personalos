import { motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { changeStatus } from '../domain/operations'
import type { Task } from '../domain/types'
import { STAGE_LABEL } from '../ui/labels'
import { stageOf } from '../ui/view'
import { GAP, Sequence, useReveal, useSequence } from './aparicion'
import { AiTag, H1, KindTag, LocalTag, More, Primary, Secondary, go } from './kit'
import { needs } from './derive'
import { mapHref } from './mapa-modelo'
import { Orb, PillarNode, StarOrb } from './orbe'
import {
  KIND_LABEL,
  MONTHS,
  TONE_LABEL,
  approve,
  candidatesFor,
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
import { SEVERITY_LABEL, categoriesOf, monthOrientation, needText, reviewPlan, type Category, type MonthLoad, type OutsideDep, type Review, type Severity } from './revision'
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
        <Orb testId="scene-next" label="Ordenar en 90 días" hint="Diciembre, enero y febrero" onPress={() => {
            // The path always opens on the panorama with December selected.
            draft((x) => ({ ...x, month: 'dic' }))
            go(sceneHref(4))
          }}
        />
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

/**
 * December → January → February as three metal orbs on one line of light: the panorama of the
 * 90 days and the month selector. With `loads`, each month shows its estimated work and hours.
 */
export function Timeline({ month, onPick, loads, testId = 'timeline' }: { month: Month; onPick: (m: Month) => void; loads?: MonthLoad[]; testId?: string }) {
  const reveal = useReveal()
  return (
    <div className="relative" data-testid={testId} role="group" aria-label="Meses del sprint">
      <span aria-hidden {...reveal(0.05, 'pl-linea absolute top-[29px] right-[16.6%] left-[16.6%] h-[2px] rounded-full bg-[linear-gradient(90deg,rgb(214,206,240),rgb(150,176,226),rgb(226,190,200))]')} />
      <div className="relative grid grid-cols-3">
        {MONTHS.map((m, i) => {
          const on = m.key === month
          const l = loads?.find((x) => x.month === m.key)
          const over = l && l.known > l.capacity
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              aria-label={l ? `${m.label}: ${hours(l.known)} de trabajo estimado para ${hours(l.capacity)} disponibles` : m.label}
              onClick={() => onPick(m.key)}
              data-testid="timeline-month"
              className="hit flex min-h-11 flex-col items-center gap-1 py-0.5"
            >
              <span {...reveal(0.1 + i * GAP, 'grid h-[58px] place-items-center')}>
                <span className="pl-node grid place-items-center text-[15px] font-semibold text-[#2c3350] transition-[width,height] duration-300" data-on={on ? 'true' : 'false'} style={{ width: on ? 56 : 42, height: on ? 56 : 42 }}>
                  {m.short}
                </span>
              </span>
              <span className={`text-[16px] ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}>{m.label}</span>
              {l && (
                <span className={`tabular text-center text-[14px] leading-[1.35] ${over ? 'text-[#5f3a00]' : 'text-ink-3'}`} data-testid="timeline-load">
                  {hours(l.known)}
                  <br />
                  de {hours(l.capacity)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The one fact the plan needs and does not have: weekly availability. Asked once, in the scene
 * where the months are laid out; the same hours apply to the three months. Until it is answered
 * the plan keeps an explicit, editable assumption, never presented as confirmed.
 */
function HoursPicker({ onDone }: { onDone?: () => void }) {
  const { s, set, sp, b, patch, draft } = useSprint()
  const [pending, setPending] = useState<number | null>(null)
  const [other, setOther] = useState(false)
  const [value, setValue] = useState('')
  const edited = sp.actions.some((a) => a.from === 'tuya')
  const done = () => {
    setPending(null)
    setOther(false)
    onDone?.()
  }
  const reshape = (h: number) => {
    patch((x) => ({ ...proposeStrategy(s.data, h), northStar: x.northStar, northStarFrom: x.northStarFrom, pillars: x.pillars }))
    draft((x) => ({ ...x, hoursOk: true }))
    set((st) => ({ ...st, notice: `Recalculado con ${h} h por semana en los tres meses.` }))
    done()
  }
  const answer = (h: number) => {
    if (h === sp.hoursPerWeek) {
      draft((x) => ({ ...x, hoursOk: true }))
      set((st) => ({ ...st, notice: `Confirmado: ${h} h por semana.` }))
      done()
    } else if (edited) setPending(h)
    else reshape(h)
  }
  const typed = Number(value.replace(',', '.'))
  const valid = Number.isFinite(typed) && typed >= 1 && typed <= 60
  return (
    <section className="surface mt-4 rounded-[22px] px-4 py-4" data-testid="hours-question">
      <p className="text-[17px] leading-[1.45] text-ink">¿Cuánto tiempo quieres dedicar a estos proyectos cada semana?</p>
      <p className="mt-1 text-[15px] leading-[1.45] text-ink-3">Se aplica igual a diciembre, enero y febrero.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[3, 6, 10].map((h) => (
          <button key={h} type="button" aria-pressed={b.hoursOk && h === sp.hoursPerWeek} className={`${chip} ${b.hoursOk && h === sp.hoursPerWeek ? 'ring-2 ring-[var(--color-electric)]' : ''}`} onClick={() => answer(h)} data-testid="hours-choice">
            {h} h
          </button>
        ))}
      </div>
      {!other ? (
        <button type="button" className={`${chip} mt-2 w-full`} onClick={() => setOther(true)} data-testid="hours-other">
          Otra cantidad
        </button>
      ) : (
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) answer(Math.round(typed * 2) / 2)
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="block text-[15px] text-ink-3">Horas por semana</span>
            <input autoFocus inputMode="decimal" className={`${field} mt-1`} value={value} onChange={(e) => setValue(e.target.value)} data-testid="hours-other-input" aria-describedby="hours-other-help" />
          </label>
          <button type="submit" disabled={!valid} className={`${chip} shrink-0 disabled:opacity-45`} data-testid="hours-other-use">
            Usar
          </button>
        </form>
      )}
      {other && (
        <p id="hours-other-help" className="mt-1 text-[14px] text-ink-3">
          Entre 1 y 60 h.
        </p>
      )}
      {pending !== null && (
        <div className="mt-3" data-testid="hours-reshape">
          <p className="text-[16px] leading-[1.45] text-ink-2">Con {pending} h cambian las acciones propuestas de los tres meses y se pierden tus cambios en ellas.</p>
          <div className="mt-2 flex flex-col gap-2">
            <Secondary onClick={() => reshape(pending)}>Ajustar las acciones a {pending} h</Secondary>
            <button
              type="button"
              className="hit min-h-11 text-[16px] text-ink-2 underline underline-offset-4"
              onClick={() => {
                patch((x) => ({ ...x, hoursPerWeek: pending }))
                draft((x) => ({ ...x, hoursOk: true }))
                done()
              }}
            >
              Mantener mis acciones
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** The availability, said once: an assumption until answered, then the person's figure. */
function HoursLine({ review, onChange }: { review: Review; onChange: () => void }) {
  const { sp, b } = useSprint()
  const unest = review.loads.reduce((a, l) => a + l.unestimated, 0)
  return (
    <p className="mt-3 text-[16px] leading-[1.5] text-ink-2" data-testid="hours-line" data-assumed={b.hoursOk ? 'false' : 'true'}>
      {b.hoursOk ? `Con ${sp.hoursPerWeek} h por semana, las mismas en los tres meses.` : `Calculado con un supuesto de ${sp.hoursPerWeek} h por semana, sin confirmar.`}
      {unest > 0 && ` ${unest === 1 ? 'Una acción no tiene' : `${unest} acciones no tienen`} estimación: no la cuento.`}
      <LocalTag />
      {b.hoursOk && (
        <>
          {' '}
          <button type="button" className="hit inline-flex min-h-11 items-center text-[16px] text-electric underline underline-offset-4" onClick={onChange} data-testid="hours-change">
            Cambiar
          </button>
        </>
      )}
    </p>
  )
}

/** A task outside the sprint that a planned action needs: mandatory or one of several alternatives. Never added on its own. */
function OutsideRow({ dep }: { dep: OutsideDep }) {
  const { s, patch, draft } = useSprint()
  const month = MONTHS.find((m) => m.key === dep.month)!.label.toLowerCase()
  const include = (t: Task) => patch((x) => ({ ...x, actions: [...x.actions, { id: `${dep.pillarId}-${t.id}`, pillarId: dep.pillarId, taskId: t.id, month: dep.month, from: 'tuya' }] }))
  const keep = (on: boolean) => draft((x) => ({ ...x, dismissed: on ? [...x.dismissed, dep.key] : x.dismissed.filter((k) => k !== dep.key) }))
  return (
    <div className="mt-2 rounded-[18px] border border-[rgba(135,82,0,0.28)] bg-[#fbf3e4] px-3 py-3" data-testid="outside-dep" data-mode={dep.mode}>
      <p className="text-[16px] leading-[1.45] text-ink">
        {dep.mode === 'todas' ? (
          <>
            Necesita «{dep.tasks[0].title}», que no está en el sprint.
          </>
        ) : (
          <>Necesita una de estas, y ninguna está en el sprint: {dep.tasks.map((t) => `«${t.title}»`).join(' o ')}.</>
        )}
      </p>
      <p className="mt-1 text-[15px] font-medium text-[#5f3a00]" data-testid="outside-mode">
        {dep.mode === 'todas' ? 'Requisito obligatorio' : 'Alternativas: basta con una'}
      </p>
      {dep.tasks.map((t) => {
        const st = stageOf(s.data, t)
        const why = needs(s.data, t)
        return (
          <p key={t.id} className="mt-1 text-[15px] leading-[1.45] text-ink-2">
            {dep.tasks.length > 1 && `«${t.title}»: `}
            {STAGE_LABEL[st]}.{why && ` ${why}`}
            {st !== 'lista' && ' Incluirla no la desbloquea.'}
          </p>
        )
      })}
      {dep.kept ? (
        <p className="mt-2 text-[15px] leading-[1.45] text-ink-2" data-testid="outside-kept">
          La mantienes fuera: queda como reserva aceptada.{' '}
          <button type="button" className="hit inline-flex min-h-11 items-center text-electric underline underline-offset-4" onClick={() => keep(false)}>
            Deshacer
          </button>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dep.tasks.map((t) => (
            <button key={t.id} type="button" className={chip} data-testid="prereq-add" onClick={() => include(t)}>
              {dep.tasks.length > 1 ? `Incluir «${t.title}»` : `Incluirla en ${month}`}
            </button>
          ))}
          <button type="button" className="hit min-h-11 px-2 text-[16px] text-ink-2 underline underline-offset-4" data-testid="prereq-keep" onClick={() => keep(true)}>
            Mantenerla fuera
          </button>
        </div>
      )}
    </div>
  )
}

/** One expected result, opened: its actions, what each one needs, and what waits outside the sprint. */
function ResultDetail({ review, month, pillarId }: { review: Review; month: Month; pillarId: string }) {
  const { s, sp } = useSprint()
  const i = sp.pillars.findIndex((p) => p.id === pillarId)
  const items = review.check.months.find((m) => m.month === month)!.results.find((r) => r.pillarId === pillarId)?.items ?? []
  return (
    <div data-testid="result-detail">
      <p className="text-[15px] text-ink-3">
        Pilar {i + 1} · {sp.pillars[i].name}
      </p>
      {!items.length && <p className="mt-2 text-[16px] leading-[1.45] text-[#5f3a00]">Falta planificarlo: no hay ninguna acción para este resultado. Añádela en «Ver acciones del mes».</p>}
      {items.map((it) => {
        const why = it.kind === 'terminada' ? undefined : needs(s.data, it.task)
        return (
          <div key={it.action.id} className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="result-action">
            <a href={`#/tarea/${encodeURIComponent(it.task.id)}`} className={`hit block text-[17px] leading-[1.4] ${it.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink'}`} data-testid="result-action-open">
              {it.task.title}
            </a>
            <div className="mt-1">
              <KindTag kind={it.kind} label={KIND_LABEL[it.kind]} />
            </div>
            {why && <p className="mt-1 text-[15px] leading-[1.45] text-ink-2">{why}</p>}
            {review.outside
              .filter((o) => o.forTask.id === it.task.id)
              .map((o) => (
                <OutsideRow key={o.key} dep={o} />
              ))}
          </div>
        )
      })}
    </div>
  )
}

const useReview = () => {
  const { s, sp, b } = useSprint()
  return reviewPlan(s.data, sp, { hoursOk: b.hoursOk, kept: b.dismissed })
}

function Camino() {
  const { set, ctx, sp, b, draft } = useSprint()
  const reveal = useReveal()
  const review = useReview()
  const month = b.month
  const label = MONTHS.find((m) => m.key === month)!.label
  const mc = review.check.months.find((m) => m.month === month)!
  const count = mc.results.reduce((a, r) => a + r.items.length, 0)
  const [changing, setChanging] = useState(false)
  return (
    <div data-testid="scene-path">
      {/* First the panorama: the three months, December selected, each with its work and hours. */}
      <Timeline month={month} onPick={(m) => draft((x) => ({ ...x, month: m }))} loads={review.loads} />
      <div {...reveal(0.3)}>
        <HoursLine review={review} onChange={() => setChanging(true)} />
      </div>
      {(!b.hoursOk || changing) && (
        <div {...reveal(0.36)}>
          <HoursPicker onDone={() => setChanging(false)} />
        </div>
      )}

      {/* The month: its three results, each one opens on its own. */}
      <section className="mt-5" data-testid="month-results" aria-live="polite">
        <h2 {...reveal(0.42, 'text-[15px] font-medium text-ink-3')}>
          Al final de {label.toLowerCase()}
          <AiTag />
        </h2>
        <div {...reveal(0.48, 'mt-1')}>
          {sp.pillars.map((p, i) => (
            <More
              key={`${month}-${p.id}`}
              id={`camino:${month}:${p.id}`}
              testId="month-result"
              lead={
                <span className="self-start">
                  <PillarNode i={i} size={32} />
                </span>
              }
              title={<span className="pl-title block text-[20px] leading-[1.3]">{p.results[month]}</span>}
            >
              <ResultDetail review={review} month={month} pillarId={p.id} />
            </More>
          ))}
        </div>
        {/* One orientation for the month, instead of the same warning under every result. */}
        <p {...reveal(0.6, 'mt-3 border-l-2 border-[color-mix(in_srgb,var(--color-electric)_40%,transparent)] pl-3 text-[16px] leading-[1.5] text-ink-2')} data-testid="month-orientation">
          {monthOrientation(review, month, sp.pillars.length)}
        </p>
      </section>

      <section {...reveal(0.66, 'mt-3')}>
        <More key={month} id={`camino:${month}`} title="Ver acciones del mes" count={count} hint="Cambiar de mes, quitar, añadir o aclarar" testId="month-actions">
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

const SEVERITY_STYLE: Record<Severity, string> = {
  informativa: 'bg-[#e7e9ef] text-[#343c50]',
  decision: 'bg-[#fbf0dc] text-[#5f3a00]',
  corregir: 'bg-[#fbe6e6] text-[#7f1d1d]',
}
const SeverityTag = ({ s }: { s: Severity }) => (
  <span className={`inline-flex min-h-6 items-center rounded-full px-2 py-0.5 text-[14px] leading-[1.2] font-medium whitespace-nowrap ${SEVERITY_STYLE[s]}`} data-testid="severity">
    {SEVERITY_LABEL[s]}
  </span>
)

/** Which category of the review is open: one at a time, remembered while the prototype is open. */
let openCategory: Category['id'] | null = null

const actions = (n: number) => (n === 1 ? '1 acción' : `${n} acciones`)

/** Qué sucede · Por qué importa · Qué decisión puedo tomar. */
function Explain({ what, why, decide }: { what: ReactNode; why: ReactNode; decide: ReactNode }) {
  const row = (k: string, v: ReactNode, id: string) => (
    <div className="mt-2 first:mt-0" data-testid={`explain-${id}`}>
      <dt className="text-[15px] font-medium text-ink-3">{k}</dt>
      <dd className="text-[17px] leading-[1.45] text-ink">{v}</dd>
    </div>
  )
  return (
    <dl>
      {row('Qué sucede', what, 'what')}
      {row('Por qué importa', why, 'why')}
      {row('Qué decisión puedes tomar', decide, 'decide')}
    </dl>
  )
}

function CategoryBody({ c, review, toMonth }: { c: Category; review: Review; toMonth: (m: Month) => void }) {
  const { set, ctx, sp } = useSprint()
  const [asking, setAsking] = useState<string | null>(null)
  const label = (k: Month) => MONTHS.find((x) => x.key === k)!.label
  const pillar = (id?: string) => sp.pillars.find((p) => p.id === id)
  const byMonth = <T extends { month: Month }>(xs: T[]) => MONTHS.map((m) => ({ month: m.key, items: xs.filter((x) => x.month === m.key) })).filter((g) => g.items.length)
  const taskLink = (t: Task) => (
    <a href={`#/tarea/${encodeURIComponent(t.id)}`} className="hit block text-[17px] leading-[1.4] text-ink underline decoration-[var(--line)] underline-offset-4">
      {t.title}
    </a>
  )
  const monthHead = (m: Month) => <p className="mt-4 text-[15px] font-medium text-ink-3 first:mt-3">{label(m)}</p>

  if (c.id === 'horas')
    return (
      <>
        <Explain what={`Calculo con un supuesto de ${sp.hoursPerWeek} h por semana que no has confirmado.`} why="El reparto de los tres meses depende de esa cifra. Con menos tiempo, algún mes no cabría." decide="Responder aquí la pregunta, o aprobar aceptando el supuesto como reserva." />
        <HoursPicker />
      </>
    )

  if (c.id === 'plan')
    return (
      <>
        <Explain
          what={
            <span className="block">
              {review.gaps.map((g, i) => {
                const l = review.loads.find((x) => x.month === g.month)!
                const p = pillar(g.pillarId)
                return (
                  <span key={i} className="block" data-testid="gap">
                    {g.kind === 'sobrecarga'
                      ? `${label(g.month)}: ${hours(l.known)} de trabajo estimado para ${hours(l.capacity)} disponibles.`
                      : g.kind === 'sin-acciones'
                        ? `${label(g.month)}: «${p?.results[g.month]}» no tiene ninguna acción.`
                        : `${label(g.month)}: todas las acciones de «${p?.results[g.month]}» están bloqueadas.`}
                  </span>
                )
              })}
            </span>
          }
          why="Tal como está, ese resultado no se alcanzará en su mes."
          decide="Corregirlo en el mes: mover o quitar acciones, añadir una o cambiar tu disponibilidad. También puedes aprobar aceptándolo."
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {[...new Set(review.gaps.map((g) => g.month))].map((m) => (
            <button key={m} type="button" className={chip} onClick={() => toMonth(m)} data-testid="fix-month">
              Corregir {label(m).toLowerCase()}
            </button>
          ))}
        </div>
      </>
    )

  if (c.id === 'fuera') {
    const alt = review.outside.filter((o) => o.mode === 'alguna').length
    return (
      <>
        <Explain
          what={`${review.outside.length === 1 ? 'Una acción espera' : `${review.outside.length} acciones esperan`} a tareas que no están en el sprint.${alt ? ` En ${alt === 1 ? 'una' : alt} basta con una de varias alternativas.` : ''}`}
          why="Esas acciones no podrán empezar mientras lo que esperan no se termine. Nada se añade solo al sprint."
          decide="Incluir la tarea en el mes de la acción, o mantenerla fuera y aceptar que esa acción quizá no llegue."
        />
        {byMonth(review.outside).map((g) => (
          <div key={g.month}>
            {monthHead(g.month)}
            {g.items.map((o) => (
              <div key={o.key} className="mt-2" data-testid="outside-item">
                {taskLink(o.forTask)}
                <OutsideRow dep={o} />
              </div>
            ))}
          </div>
        ))}
      </>
    )
  }

  if (c.id === 'decisiones') {
    const has = (k: string) => review.decisions.filter((d) => d.causes.some((x) => x.kind === k)).length
    const kinds = [
      has('comprobar') && `${actions(has('comprobar'))} con una condición sin comprobar`,
      has('visto-bueno') && `${actions(has('visto-bueno'))} esperando tu visto bueno`,
      has('no-cumplido') && `${actions(has('no-cumplido'))} con una condición que marcaste como no cumplida`,
      has('descartada') && `${actions(has('descartada'))} que dependía de algo descartado`,
    ].filter(Boolean) as string[]
    const dec = review.decisions.filter((d) => d.month === 'dic').length
    return (
      <>
        <Explain
          what={`${kinds.join('; ')}.`}
          why={`Mientras no lo confirmes, esas acciones no cuentan como listas para empezar.${dec ? ` En diciembre son ${dec}.` : ''}`}
          decide="Confirmar en cada tarea si la condición se cumple o no. También puedes aprobar ya y dedicar a esto el principio de cada mes."
        />
        {byMonth(review.decisions).map((g) => (
          <div key={g.month}>
            {monthHead(g.month)}
            {g.items.map((d) => (
              <div key={d.task.id} className="border-b border-[var(--line)] py-2.5 last:border-b-0" data-testid="decision-item">
                {taskLink(d.task)}
                <p className="mt-0.5 text-[15px] leading-[1.45] text-ink-2">{needText(d)}</p>
              </div>
            ))}
          </div>
        ))}
      </>
    )
  }

  // estados
  const example = review.unclear[0]?.causes[0]
  return (
    <>
      <Explain
        what={`${review.unclear.length === 1 ? 'Una acción tiene' : `${review.unclear.length} acciones tienen`} en el dossier un estado que no está claro${example?.kind === 'estado' ? `, como «${example.literal}»` : ''}.`}
        why="El sprint no las da por empezadas ni por terminadas. Si alguna ya está hecha, el plan cuenta trabajo de más."
        decide="Decir en qué punto está cada una. Tu respuesta cambia solo esa tarea."
      />
      {byMonth(review.unclear).map((g) => (
        <div key={g.month}>
          {monthHead(g.month)}
          {g.items.map((d) => (
            <div key={d.task.id} className="border-b border-[var(--line)] py-2.5 last:border-b-0" data-testid="unclear-item">
              {taskLink(d.task)}
              <p className="mt-0.5 text-[15px] leading-[1.45] text-ink-2">{needText(d)}</p>
              {asking !== d.task.id ? (
                <button type="button" className="hit inline-flex min-h-11 items-center text-[16px] text-electric underline underline-offset-4" onClick={() => setAsking(d.task.id)} data-testid="clarify-open">
                  ¿En qué punto está?
                </button>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {WORK_CHOICES.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      className={chip}
                      data-testid="clarify-choice"
                      onClick={() => {
                        set((st) => ({ ...st, data: changeStatus(st.data, d.task.id, w.value, ctx()), notice: 'Anotado solo en esta tarea.' }))
                        setAsking(null)
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function Revisar() {
  const { set, sp, draft } = useSprint()
  const reveal = useReveal()
  const review = useReview()
  const cats = categoriesOf(review)
  const [open, setOpen] = useState<Category['id'] | null>(() => (cats.some((c) => c.id === openCategory) ? openCategory : null))
  const [shown, setShown] = useState<Month | null>(null)
  const [confirming, setConfirming] = useState(false)
  const toggle = (id: Category['id']) => {
    const next = open === id ? null : id
    openCategory = next
    setOpen(next)
  }
  const toMonth = (m: Month) => {
    draft((x) => ({ ...x, month: m }))
    go(sceneHref(4))
  }
  const fix = cats.filter((c) => c.severity === 'corregir')
  const count = (c: Category) => (c.id === 'horas' ? `${sp.hoursPerWeek} h sin confirmar` : c.id === 'plan' ? (c.count === 1 ? '1 punto' : `${c.count} puntos`) : actions(c.count))
  return (
    <div data-testid="scene-review">
      <div {...reveal(0)}>
        <H1>Tu estrategia está preparada</H1>
      </div>

      <div {...reveal(0.1, 'mt-5 flex items-center gap-4')}>
        <StarOrb size={52} />
        <p className="min-w-0 flex-1 text-[19px] leading-[1.45] font-medium text-ink" data-testid="summary-star">
          {sp.northStar}
        </p>
      </div>

      {/* The three pillars, compact, each with where it leads by the end of February. */}
      <ol {...reveal(0.2, 'mt-4')} data-testid="summary-pillars">
        {sp.pillars.map((p, i) => (
          <li key={p.id} className="flex gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0">
            <PillarNode i={i} size={28} />
            <div className="min-w-0">
              <p className="text-[18px] leading-[1.3] font-medium text-ink">{p.name}</p>
              <p className="mt-0.5 text-[15px] leading-[1.45] text-ink-2">Al final: {p.results.feb}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* The three months: work and hours at a glance; a tap shows that month's results. */}
      <div {...reveal(0.3, 'mt-3 grid grid-cols-3 gap-2')} data-testid="summary-months">
        {review.loads.map((l) => {
          const on = shown === l.month
          return (
            <button key={l.month} type="button" aria-expanded={on} onClick={() => setShown(on ? null : l.month)} className={`hit surface-quiet flex min-h-14 flex-col items-center justify-center rounded-[16px] px-1 py-2 ${on ? 'ring-2 ring-[var(--color-electric)]' : ''}`} data-testid="summary-month">
              <span className="text-[15px] font-semibold text-ink">{MONTHS.find((x) => x.key === l.month)!.short}</span>
              <span className={`tabular text-[15px] ${l.known > l.capacity ? 'text-[#5f3a00]' : 'text-ink-2'}`}>{hours(l.known)}</span>
              <span className="tabular text-[14px] text-ink-3">de {hours(l.capacity)}</span>
            </button>
          )
        })}
      </div>
      {shown ? (
        <ol className="mt-2" data-testid="summary-month-results">
          {sp.pillars.map((p, i) => (
            <li key={p.id} className="flex items-start gap-2.5 py-1.5">
              <span className="pl-node grid size-6 shrink-0 place-items-center text-[14px] font-semibold text-[#2c3350]" aria-hidden>
                {i + 1}
              </span>
              <span className="text-[17px] leading-[1.4] text-ink">{p.results[shown]}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p {...reveal(0.34, 'mt-1 text-[14px] text-ink-3')}>
          {review.hoursConfirmed ? 'Trabajo estimado y horas por mes.' : 'Trabajo estimado y horas por mes, con el supuesto sin confirmar.'} Toca un mes para ver sus resultados.
        </p>
      )}

      {/* One review, by kind of problem. Each category opens on its own; nothing is hidden or dropped. */}
      <section {...reveal(0.42, 'mt-6')} data-testid="review">
        <h2 className="pl-title text-[22px] leading-[1.3] text-ink">Qué conviene revisar antes de comenzar</h2>
        {cats.length ? (
          <>
            <p className="mt-1 text-[16px] leading-[1.45] text-ink-3">{cats.length === 1 ? 'Un tema. Ábrelo para ver qué hacer.' : `${cats.length} temas. Ábrelos de uno en uno.`}</p>
            <div className="mt-2">
              {cats.map((c) => (
                <div key={c.id} className="border-b border-[var(--line)] last:border-b-0" data-testid="review-category" data-kind={c.id} data-severity={c.severity}>
                  <button type="button" aria-expanded={open === c.id} onClick={() => toggle(c.id)} className="hit flex min-h-14 w-full items-center gap-3 py-3 text-left" data-testid="review-category-open">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] leading-[1.35] font-medium text-ink">{c.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SeverityTag s={c.severity} />
                        <span className="text-[15px] text-ink-3">{count(c)}</span>
                      </span>
                    </span>
                    <svg aria-hidden viewBox="0 0 16 16" className={`size-5 shrink-0 text-ink-3 transition-transform duration-200 ${open === c.id ? 'rotate-90' : ''}`}>
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {open === c.id && (
                    <div className="pl-open pb-4" data-testid="review-category-body">
                      <CategoryBody c={c} review={review} toMonth={toMonth} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-[17px] leading-[1.45] text-[#094d33]" data-testid="reserves-none">
            Nada pendiente: disponibilidad confirmada, cada resultado con acciones y nada esperando fuera del sprint.
          </p>
        )}
      </section>

      {/* The approval is explicit and says which pending reserves it accepts. */}
      <section {...reveal(0.5, 'mt-6')} data-testid="approval">
        {!confirming ? (
          <Primary testId="approve-start" onClick={() => setConfirming(true)}>
            Aprobar mi sprint
          </Primary>
        ) : (
          <div className="surface rounded-[22px] px-4 py-4" data-testid="approve-confirm">
            {cats.length ? (
              <>
                <p className="text-[17px] leading-[1.5] text-ink">Al aprobar, aceptas {cats.length === 1 ? 'esta reserva pendiente' : `estas ${cats.length} reservas pendientes`}:</p>
                <ul className="mt-2" data-testid="approve-reserves">
                  {cats.map((c) => (
                    <li key={c.id} className="border-b border-[var(--line)] py-2 last:border-b-0" data-testid="approve-reserve">
                      <p className="text-[16px] leading-[1.4] text-ink">{c.title}</p>
                      <div className="mt-1">
                        <SeverityTag s={c.severity} />
                      </div>
                    </li>
                  ))}
                </ul>
                {fix.length > 0 && <p className="mt-2 text-[16px] leading-[1.45] text-[#7f1d1d]" data-testid="approve-warning">Lo marcado «Corrige el plan» sigue sin corregir: tal como está, esas acciones o resultados no llegarán.</p>}
              </>
            ) : (
              <p className="text-[17px] leading-[1.5] text-ink">¿Apruebas este sprint? Desde ese momento será tu decisión, no una sugerencia.</p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <Primary
                testId="approve"
                onClick={() => {
                  set((st) => ({ ...st, sprint: approve(sp, `${st.today}T12:00:00-06:00`), notice: cats.length ? `Sprint aprobado con ${cats.length === 1 ? 'una reserva aceptada' : `${cats.length} reservas aceptadas`}.` : 'Sprint aprobado. Desde ahora es tu decisión.' }))
                  go('#/')
                }}
              >
                {cats.length ? 'Sí, aprobar con estas reservas' : 'Sí, aprobar mi sprint'}
              </Primary>
              <Secondary testId="approve-cancel" onClick={() => setConfirming(false)}>
                Todavía no
              </Secondary>
            </div>
          </div>
        )}
      </section>

      {/* Grok stays optional and out of the main flow. */}
      <section className="mt-6">
        <More id="revision:grok" title="Opinión de Grok" hint="Opcional y simulada; no cambia el plan" testId="grok">
          <GrokList sp={sp} />
        </More>
      </section>
    </div>
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
