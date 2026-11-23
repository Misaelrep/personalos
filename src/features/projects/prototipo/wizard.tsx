import { useEffect, useMemo, useState } from 'react'
import { Sequence, useStagger } from './aparicion'
import { indexTasks } from '../domain/derive'
import { stageOf } from '../ui/view'
import { AiTag, Box, H1, Kicker, KindTag, LocalTag, More, Primary, Secondary, Segmented, go } from './kit'
import { Situation } from './mapa'
import { mapHref } from './mapa-modelo'
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
  kindOf,
  projectsOfPillar,
  proposeStrategy,
  suggestNorthStars,
  type Month,
  type Sprint,
} from './plan'
import { useProto } from './store'
import { UpdateFlow } from './update'

/**
 * PROTOTYPE · Planning in three moments — update reality, design the strategy,
 * review and approve — over the same six-step method: each part (north star,
 * pillars, actions, months) can still be reviewed on its own. The strategy
 * starts as a complete SIMULATED proposal to edit, never as a blank page.
 */

const MOMENTS = ['Actualizar mi realidad', 'Diseñar mi estrategia', 'Revisar y aprobar']
const PARTS: Record<number, string> = { 2: 'Estrella polar', 3: 'Pilares y resultados', 4: 'Acciones', 5: 'Reparto por mes' }
const input = 'w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[18px] leading-[1.4] text-ink focus:outline-none'
type Patch = (f: (x: Sprint) => Sprint) => void

function usePlan() {
  const { s, set } = useProto()
  const sp = s.sprint ?? emptySprint()
  const patch: Patch = (f) => set((st) => ({ ...st, sprint: f(st.sprint ?? emptySprint()) }))
  return { s, set, sp, patch }
}

function Header({ n, title, kicker }: { n: number; title: string; kicker: string }) {
  const { set } = useProto()
  return (
    <>
      <div className="flex items-center justify-between">
        <Kicker>{kicker}</Kicker>
        <button
          type="button"
          className="hit min-h-11 shrink-0 text-[16px] whitespace-nowrap text-ink-3"
          data-testid="wizard-save"
          onClick={() => {
            set((st) => ({ ...st, notice: 'Borrador guardado. Puedes seguir cuando quieras.' }))
            go('#/')
          }}
        >
          Guardar y salir
        </button>
      </div>
      {n > 0 && (
        <div className="mt-2 flex gap-1" aria-hidden>
          {MOMENTS.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i < n ? 'bg-[var(--color-electric)]' : 'bg-[var(--line)]'}`} />
          ))}
        </div>
      )}
      <div className="mt-4 mb-4">
        <H1>{title}</H1>
      </div>
    </>
  )
}

/** The three moments: #/plan/1, #/plan/2, #/plan/3. */
/** Planning: each section comes in after the previous one (not extra steps; everything can be used at once). */
export function Moment({ n }: { n: number }) {
  return (
    <Sequence id={`momento:${n}`} length={1.1}>
      <MomentBody n={n} />
    </Sequence>
  )
}

function MomentBody({ n }: { n: number }) {
  const stagger = useStagger()
  const { s, sp, patch } = usePlan()
  const m = Math.min(3, Math.max(1, n))
  useEffect(() => {
    if (s.sprint?.status === 'aprobado') return
    if (!s.sprint || s.sprint.step !== m) patch((x) => ({ ...x, step: m }))
    // The proposal is prepared once, the first time the strategy is opened.
    if (m >= 2 && !(s.sprint?.pillars.length ?? 0)) patch((x) => ({ ...proposeStrategy(s.data, x.hoursPerWeek), step: m }))
  }, [m])
  return (
    <div data-testid="wizard" data-moment={m} className={stagger}>
      <Header n={m} kicker={`Momento ${m} de 3`} title={MOMENTS[m - 1]} />
      {m === 1 && (
        <>
          <p className="mb-4 text-[16px] leading-[1.45] text-ink-3">Mira cómo están tus proyectos y cuenta lo que haya cambiado. Así la propuesta parte de hoy.</p>
          <div className="mb-6">
            <Situation />
          </div>
          <UpdateFlow inWizard onDone={() => go('#/plan/2')} />
        </>
      )}
      {m === 2 && sp.pillars.length > 0 && <Strategy sp={sp} patch={patch} />}
      {m === 3 && sp.pillars.length > 0 && <Review sp={sp} patch={patch} />}
    </div>
  )
}

function Strategy({ sp, patch }: { sp: Sprint; patch: Patch }) {
  const { s } = useProto()
  const [hoursChoice, setHours] = useState(sp.hoursPerWeek)
  const index = indexTasks(s.data)
  const name = (id: string) => s.data.projects.find((p) => p.id === id)?.name
  const stagger = useStagger()
  return (
    <div data-testid="strategy" className={stagger}>
      <p className="text-[17px] leading-[1.5] text-ink-2">
        Una propuesta completa para que la edites: tu estrella polar y tres pilares. Abre un pilar para ver sus resultados y acciones de cada mes.
        <AiTag />
      </p>

      {/* The summary: the north star and the three pillars. */}
      <Box className="mt-5" testId="strategy-north">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-[#5634c4]">Estrella polar</p>
          <a href="#/plan/paso/2" className="hit inline-flex min-h-11 items-center text-[16px] text-electric underline underline-offset-4">
            Editar
          </a>
        </div>
        <p className="mt-1 text-[22px] leading-[1.35] text-ink">
          {sp.northStar}
          {sp.northStarFrom === 'ia' && <AiTag />}
        </p>
      </Box>

      <section className="mt-5" data-testid="strategy-pillars">
        <h2 className="text-[15px] font-medium text-ink-3">Tres pilares</h2>
        {sp.pillars.map((p, i) => {
          const acts = sp.actions.filter((a) => a.pillarId === p.id)
          const projects = projectsOfPillar(s.data, sp, p.id)
          return (
            <More
              key={p.id}
              id={`estrategia:${p.id}`}
              testId="strategy-pillar"
              lead={<span className="pl-node grid size-8 shrink-0 place-items-center self-start text-[15px] font-medium text-[#3e4560]" aria-label={`Pilar ${i + 1}`}>{i + 1}</span>}
              title={
                <>
                  {p.name}
                  {p.from === 'ia' && <AiTag />}
                </>
              }
              hint={`${acts.length} ${acts.length === 1 ? 'acción' : 'acciones'} · ${projects.length ? projects.map(name).join(', ') : 'de ningún proyecto todavía'}`}
            >
              <p className="text-[16px] leading-[1.6] text-ink-3" data-testid="pillar-maps">
                {projects.length === 0 ? 'De ningún proyecto todavía.' : (
                  <>
                    Mapa de{' '}
                    {projects.map((id, k) => (
                      <span key={id}>
                        {k > 0 && ', '}
                        <a href={mapHref(id)} className="hit text-electric underline underline-offset-4">
                          {name(id)}
                        </a>
                      </span>
                    ))}
                  </>
                )}
              </p>
              {MONTHS.map((m) => {
                const mine = acts.filter((a) => a.month === m.key)
                return (
                  <div key={m.key} className="mt-3 border-l-2 border-[var(--line)] pl-3" data-testid="strategy-month">
                    <p className="text-[15px] font-medium text-ink-3">Al final de {m.label.toLowerCase()}</p>
                    <p className="text-[18px] leading-[1.4] text-ink">{p.results[m.key]}</p>
                    {mine.map((a) => (
                      <p key={a.id} className="mt-1 text-[16px] leading-[1.45] text-ink-2">
                        · {index.get(a.taskId)?.title}
                      </p>
                    ))}
                    {!mine.length && <p className="mt-1 text-[16px] text-[#5f3a00]">Sin acciones</p>}
                  </div>
                )
              })}
              <div className="mt-3 flex flex-wrap gap-x-5">
                {[3, 4, 5].map((n) => (
                  <a key={n} href={`#/plan/paso/${n}`} className="hit inline-flex min-h-11 items-center text-[16px] text-electric underline underline-offset-4">
                    Editar {PARTS[n].toLowerCase()}
                  </a>
                ))}
              </div>
            </More>
          )
        })}
      </section>

      <section className="mt-4" data-testid="strategy-more">
        <More id="estrategia:tiempo" title="Tiempo por semana" hint={`${sp.hoursPerWeek} h para estos proyectos`} testId="strategy-hours">
          <Segmented testId="hours" value={String(hoursChoice)} onChange={(v) => setHours(Number(v))} options={['3', '6', '10'].map((h) => ({ value: h, label: `${h} h` }))} />
          {hoursChoice !== sp.hoursPerWeek && (
            <div className="mt-3">
              <Secondary testId="redo" onClick={() => patch((x) => ({ ...proposeStrategy(s.data, hoursChoice), step: x.step }))}>
                Rehacer la propuesta con {hoursChoice} h (se pierden tus cambios)
              </Secondary>
            </div>
          )}
        </More>
        <More id="estrategia:apartados" title="Revisar un apartado por separado" hint="Estrella polar, pilares, acciones o meses" testId="strategy-parts">
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4, 5].map((n) => (
              <a key={n} href={`#/plan/paso/${n}`} className="hit inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-4 text-[16px] text-ink">
                {PARTS[n]}
              </a>
            ))}
          </div>
        </More>
      </section>

      <div className="mt-6">
        <Primary testId="to-review" onClick={() => go('#/plan/3')}>
          Revisar y aprobar
        </Primary>
      </div>
    </div>
  )
}

function Review({ sp, patch }: { sp: Sprint; patch: Patch }) {
  const { s, set } = useProto()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [grok, setGrok] = useState(false)
  const check = checkPlan(s.data, sp)
  const pillar = (id: string) => sp.pillars.find((p) => p.id === id)!
  const prereqs = check.prerequisites.filter((p) => !dismissed.includes(p.task.id))
  const stagger = useStagger()
  const label = (k: Month) => MONTHS.find((x) => x.key === k)!.label
  // What can make the sprint unviable stays in view: missing prerequisites, overloaded months, incoherent pillars.
  const over = check.months.filter((m) => m.load > m.capacity)
  const notes = check.months.flatMap((m) => m.results.filter((r) => r.note).map((r) => ({ month: m.month, pillarId: r.pillarId, note: r.note! })))
  const risks = prereqs.length + over.length + notes.length
  return (
    <div data-testid="review" className={stagger}>
      <p className="text-[17px] leading-[1.5] text-ink-2">
        Lo que pasará cada mes. Abre un mes para ver sus acciones.
        <LocalTag />
      </p>

      {risks > 0 ? (
        <section className="mt-5 rounded-[22px] border border-[rgba(135,82,0,0.28)] bg-[#fbf3e4] px-4 py-4" data-testid="viability">
          <h2 className="mb-1 text-[17px] font-medium text-[#5f3a00]">Antes de aprobar, revisa esto</h2>
          {over.map((m) => (
            <p key={m.month} className="border-t border-[rgba(135,82,0,0.18)] py-3 text-[17px] leading-[1.45] text-ink first:border-t-0" data-testid="review-overload">
              {label(m.month)}: {hours(m.load)} de trabajo para {hours(m.capacity)} disponibles.
            </p>
          ))}
          {notes.map((n) => (
            <p key={`${n.month}-${n.pillarId}`} className="border-t border-[rgba(135,82,0,0.18)] py-3 text-[17px] leading-[1.45] text-ink first:border-t-0" data-testid="review-note">
              <span className="text-[#5f3a00]">
                {label(n.month)} · {pillar(n.pillarId).name}:{' '}
              </span>
              {n.note}
            </p>
          ))}
          {prereqs.length > 0 && (
            <div className="border-t border-[rgba(135,82,0,0.18)] first:border-t-0" data-testid="prereqs">
            <More id="revision:requisitos" title={prereqs.length === 1 ? 'Una acción espera a una tarea que no está en el plan' : `${prereqs.length} acciones esperan a tareas que no están en el plan`} hint="Sin ellas no podrán empezar. Ábrelo para incorporarlas o dejarlas.">
              {prereqs.map((r) => {
                const month = MONTHS.find((m) => m.key === r.month)!
                const pid = sp.actions.find((a) => a.taskId === r.forTask.id)!.pillarId
                return (
                  <div key={r.task.id} className="border-t border-[rgba(135,82,0,0.18)] py-3 first:border-t-0">
                    <p className="text-[17px] leading-[1.45] text-ink">
                      «{r.forTask.title}» espera a «{r.task.title}», que no está en el plan. Sin ella no podrá empezar.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Secondary testId="prereq-add" onClick={() => patch((x) => ({ ...x, actions: [...x.actions, { id: `${pid}-${r.task.id}`, pillarId: pid, taskId: r.task.id, month: r.month, from: 'tuya' }] }))}>
                        Incorporarla en {month.label.toLowerCase()}
                      </Secondary>
                      <button type="button" className="hit min-h-11 text-[16px] text-ink-2 underline underline-offset-4" onClick={() => setDismissed((d) => [...d, r.task.id])}>
                        No por ahora
                      </button>
                    </div>
                  </div>
                )
              })}
            </More>
            </div>
          )}
        </section>
      ) : (
        <p className="mt-5 text-[17px] text-[#094d33]" data-testid="viability-ok">
          No hay requisitos pendientes, meses sobrecargados ni pilares incoherentes.
        </p>
      )}

      <section className="mt-5" data-testid="review-months">
        {check.months.map((m) => {
          const actions = m.results.reduce((a, r) => a + r.items.length, 0)
          return (
            <More
              key={m.month}
              id={`revision:${m.month}`}
              big
              testId="review-month"
              title={label(m.month)}
              hint={
                <>
                  <span className={m.load > m.capacity ? 'text-[#5f3a00]' : ''}>
                    {hours(m.load)} de {hours(m.capacity)}
                  </span>{' '}
                  · {actions} {actions === 1 ? 'acción' : 'acciones'}
                  {m.unestimated > 0 && ` · ${m.unestimated} sin estimar (2 h cada una)`}
                </>
              }
            >
              {m.results.map((r) => (
                <div key={r.pillarId} className="mt-3 border-l-2 border-[var(--line)] pl-3 first:mt-0">
                  <p className="text-[15px] font-medium text-ink-3">{pillar(r.pillarId).name}</p>
                  <p className="text-[18px] leading-[1.4] text-ink">{r.result}</p>
                  {r.items.map((it) => (
                    <a key={it.action.id} href={`#/tarea/${encodeURIComponent(it.task.id)}`} className="hit mt-1 flex min-h-11 flex-col items-start gap-1 py-1.5" data-testid="review-item">
                      <span className={`text-[16px] leading-[1.45] ${it.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{it.task.title}</span>
                      <KindTag kind={it.kind} label={KIND_LABEL[it.kind]} />
                    </a>
                  ))}
                </div>
              ))}
            </More>
          )
        })}
      </section>

      <section className="mt-6" data-testid="grok">
        {!grok ? (
          <Secondary testId="ask-grok" onClick={() => setGrok(true)}>
            Pedir opinión a Grok (opcional)
          </Secondary>
        ) : (
          <GrokList sp={sp} />
        )}
      </section>

      <div className="mt-6">
        <Primary
          testId="approve"
          onClick={() => {
            set((st) => ({ ...st, sprint: approve(sp, `${st.today}T12:00:00-06:00`), notice: 'Plan aprobado. Desde ahora es tu decisión, no una sugerencia.' }))
            go('#/')
          }}
        >
          Aprobar el plan
        </Primary>
      </div>
      <p className="mt-3 text-center">
        <a href="#/plan/2" className="hit inline-flex min-h-11 items-center text-[16px] text-ink-2 underline underline-offset-4">
          Volver a la estrategia
        </a>
      </p>
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
      <p className="mt-1 text-[14px] text-ink-4">Es una simulación. Grok observa; no cambia el plan ni decide por ti.</p>
    </div>
  )
}

/** One part of the plan on its own: #/plan/paso/2…5. */
export function Part({ step }: { step: number }) {
  return (
    <Sequence id={`apartado:${step}`} length={1.1}>
      <PartBody step={step} />
    </Sequence>
  )
}

function PartBody({ step }: { step: number }) {
  const stagger = useStagger()
  const { sp, patch } = usePlan()
  const n = Math.min(5, Math.max(2, step))
  return (
    <div data-testid="wizard-part" data-step={n} className={stagger}>
      <Header n={0} kicker="Revisar un apartado" title={PARTS[n]} />
      {n === 2 && <StepNorthStar sp={sp} patch={patch} />}
      {n === 3 && <StepPillars sp={sp} patch={patch} />}
      {n === 4 && <StepActions sp={sp} patch={patch} />}
      {n === 5 && <StepMonths sp={sp} patch={patch} />}
      {/* In the flow, not fixed: a fixed button always covers part of a long list on a small screen. */}
      <div className="mt-6">
        <Primary testId="part-done" onClick={() => go('#/plan/2')}>
          Listo
        </Primary>
      </div>
    </div>
  )
}

type StepProps = { sp: Sprint; patch: Patch }

function StepNorthStar({ sp, patch }: StepProps) {
  const { s } = useProto()
  const ideas = useMemo(() => suggestNorthStars(s.data), [s.data])
  return (
    <div data-testid="step-north-star">
      <p className="mb-2 text-[16px] text-ink-3">Una frase: lo que quieres que sea verdad el 28 de febrero.</p>
      <textarea data-testid="north-star-input" rows={3} className={input} value={sp.northStar} onChange={(e) => patch((x) => ({ ...x, northStar: e.target.value, northStarFrom: 'tuya' }))} />
      <p className="mt-4 mb-1 text-[15px] text-ink-3">Otras ideas</p>
      {ideas.map((t, i) => (
        <button key={i} type="button" data-testid="north-star-idea" className="hit block w-full border-b border-[var(--line)] py-2.5 text-left text-[16px] leading-[1.4] text-ink-2 last:border-b-0" onClick={() => patch((x) => ({ ...x, northStar: t, northStarFrom: 'ia' }))}>
          {t}
          <AiTag />
        </button>
      ))}
    </div>
  )
}

function StepPillars({ sp, patch }: StepProps) {
  const set = (id: string, f: (p: Sprint['pillars'][number]) => Sprint['pillars'][number]) => patch((x) => ({ ...x, pillars: x.pillars.map((q) => (q.id === id ? { ...f(q), from: 'tuya' } : q)) }))
  return (
    <div data-testid="step-pillars">
      <p className="mb-2 text-[16px] text-ink-3">Tres pilares, con el nombre que quieras. Cada uno puede reunir acciones de varios proyectos.</p>
      {sp.pillars.map((p, i) => (
        <section key={p.id} className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="pillar-edit">
          <label className="block">
            <span className="text-[14px] text-ink-3">
              Pilar {i + 1}
              {p.from === 'ia' && <AiTag />}
            </span>
            <input className={`${input} mt-1`} value={p.name} onChange={(e) => set(p.id, (q) => ({ ...q, name: e.target.value }))} />
          </label>
          {MONTHS.map((m) => (
            <label key={m.key} className="mt-2 block">
              <span className="text-[14px] text-ink-3">Al final de {m.label.toLowerCase()}</span>
              <input className={`${input} text-[17px]`} value={p.results[m.key]} onChange={(e) => set(p.id, (q) => ({ ...q, results: { ...q.results, [m.key]: e.target.value } }))} />
            </label>
          ))}
        </section>
      ))}
    </div>
  )
}

function StepActions({ sp, patch }: StepProps) {
  const { s } = useProto()
  const index = indexTasks(s.data)
  const name = (id: string) => s.data.projects.find((p) => p.id === id)?.name
  const inPlan = new Set(sp.actions.map((a) => a.taskId))
  const add = (pillarId: string, taskId: string, from: 'ia' | 'tuya') => patch((x) => ({ ...x, actions: [...x.actions, { id: `${pillarId}-${taskId}`, pillarId, taskId, month: 'dic', from }] }))
  return (
    <div data-testid="step-actions">
      <p className="mb-2 text-[16px] text-ink-3">Las acciones de cada pilar, de cualquier proyecto. Quita las que no quieras y añade otras.</p>
      {sp.pillars.map((p) => {
        const mine = sp.actions.filter((a) => a.pillarId === p.id)
        const ideas = candidatesFor(s.data, sp, p.id, 4)
        return (
          <section key={p.id} className="mt-5">
            <h2 className="text-[17px] font-medium text-ink">{p.name}</h2>
            {mine.map((a) => {
              const t = index.get(a.taskId)
              if (!t) return null
              const kind = kindOf(stageOf(s.data, t, index))
              return (
                <label key={a.id} className="flex items-start gap-3 border-b border-[var(--line)] py-2.5" data-testid="action-row">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-electric)]" checked onChange={() => patch((x) => ({ ...x, actions: x.actions.filter((y) => y.id !== a.id) }))} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] leading-[1.4] text-ink">{t.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-3">
                      {name(t.projectId)}
                      <KindTag kind={kind} label={KIND_LABEL[kind]} />
                    </span>
                    {a.from === 'ia' && a.reason && (
                      <span className="mt-0.5 block text-[14px] text-ink-4">
                        {a.reason}
                        <AiTag />
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
            {ideas.length > 0 && (
              <div className="mt-2">
                <p className="text-[14px] text-ink-3">
                  Podrías añadir
                  <AiTag />
                </p>
                {ideas.map((t) => (
                  <label key={t.id} className="flex items-start gap-3 py-2">
                    <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-electric)]" checked={false} onChange={() => add(p.id, t.id, 'ia')} />
                    <span className="text-[16px] leading-[1.4] text-ink-2">
                      {t.title} <span className="text-ink-4">· {name(t.projectId)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <select className="mt-2 max-w-full min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-3 py-1.5 text-[16px] text-ink-2" value="" onChange={(e) => e.target.value && add(p.id, e.target.value, 'tuya')} data-testid="action-add">
              <option value="">Añadir de cualquier proyecto</option>
              {s.data.projects.map((pr) => (
                <optgroup key={pr.id} label={pr.name}>
                  {s.data.tasks
                    .filter((t) => t.projectId === pr.id && !inPlan.has(t.id) && stageOf(s.data, t, index) !== 'cerrada')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </section>
        )
      })}
    </div>
  )
}

function StepMonths({ sp, patch }: StepProps) {
  const { s } = useProto()
  const title = (id: string) => s.data.tasks.find((t) => t.id === id)?.title ?? id
  return (
    <div data-testid="step-months">
      <p className="mb-2 text-[16px] text-ink-3">El mes de cada acción. Lo que espera a otra acción debería ir en el mismo mes o después.</p>
      {sp.pillars.map((p) => (
        <section key={p.id} className="mt-4">
          <h2 className="text-[17px] font-medium text-ink">{p.name}</h2>
          {sp.actions
            .filter((a) => a.pillarId === p.id)
            .map((a) => (
              <div key={a.id} className="border-b border-[var(--line)] py-2.5" data-testid="month-action">
                <p className="mb-1.5 text-[16px] leading-[1.4] text-ink">{title(a.taskId)}</p>
                <Segmented value={a.month} onChange={(m: Month) => patch((x) => ({ ...x, actions: x.actions.map((y) => (y.id === a.id ? { ...y, month: m } : y)) }))} options={MONTHS.map((m) => ({ value: m.key, label: m.short }))} />
              </div>
            ))}
        </section>
      ))}
    </div>
  )
}
