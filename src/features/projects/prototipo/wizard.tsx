import { useEffect, useMemo, useState } from 'react'
import { indexTasks } from '../domain/derive'
import { stageOf } from '../ui/view'
import { AiTag, Box, H1, Kicker, KindTag, LocalTag, Primary, Secondary, Segmented, go } from './kit'
import { Situation } from './mapa'
import { mapHref } from './mapa-modelo'
import {
  KIND_LABEL,
  MONTHS,
  SPRINT,
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
const input = 'w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[16px] leading-[1.4] text-ink focus:outline-none'
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
          className="hit h-10 text-[13.5px] text-ink-3"
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
export function Moment({ n }: { n: number }) {
  const { s, sp, patch } = usePlan()
  const m = Math.min(3, Math.max(1, n))
  useEffect(() => {
    if (s.sprint?.status === 'aprobado') return
    if (!s.sprint || s.sprint.step !== m) patch((x) => ({ ...x, step: m }))
    // The proposal is prepared once, the first time the strategy is opened.
    if (m >= 2 && !(s.sprint?.pillars.length ?? 0)) patch((x) => ({ ...proposeStrategy(s.data, x.hoursPerWeek), step: m }))
  }, [m])
  return (
    <div data-testid="wizard" data-moment={m}>
      <Header n={m} kicker={`Momento ${m} de 3 · ${SPRINT.label}`} title={MOMENTS[m - 1]} />
      {m === 1 && (
        <>
          <p className="mb-4 text-[14.5px] leading-[1.45] text-ink-3">Mira cómo están tus proyectos y cuenta lo que haya cambiado. Así la propuesta parte de hoy.</p>
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
  return (
    <div data-testid="strategy">
      <p className="text-[14px] leading-[1.45] text-ink-3">
        Una propuesta completa para que la edites, hecha con tus proyectos, sus dependencias y tu tiempo.
        <AiTag />
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-[13px] text-ink-3">Tiempo para estos proyectos, por semana</p>
        <Segmented testId="hours" value={String(hoursChoice)} onChange={(v) => setHours(Number(v))} options={['3', '6', '10'].map((h) => ({ value: h, label: `${h} h` }))} />
        {hoursChoice !== sp.hoursPerWeek && (
          <div className="mt-2">
            <Secondary testId="redo" onClick={() => patch((x) => ({ ...proposeStrategy(s.data, hoursChoice), step: x.step }))}>
              Rehacer la propuesta con {hoursChoice} h (se pierden tus cambios)
            </Secondary>
          </div>
        )}
      </div>

      <Box className="mt-5" testId="strategy-north">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-ink-3">Lo que quieres conseguir</p>
          <a href="#/plan/paso/2" className="text-[13px] text-electric">
            Editar
          </a>
        </div>
        <p className="mt-1 text-[16px] leading-[1.4] text-ink">
          {sp.northStar}
          {sp.northStarFrom === 'ia' && <AiTag />}
        </p>
      </Box>

      {sp.pillars.map((p, i) => {
        const acts = sp.actions.filter((a) => a.pillarId === p.id)
        return (
          <section key={p.id} className="mt-5" data-testid="strategy-pillar">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12px] text-ink-3">Pilar {i + 1}</p>
              <a href="#/plan/paso/3" className="text-[13px] text-electric">
                Editar
              </a>
            </div>
            <p className="text-[16px] leading-[1.35] font-medium text-ink">
              {p.name}
              {p.from === 'ia' && <AiTag />}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-[1.6] text-ink-3" data-testid="pillar-maps">
              {projectsOfPillar(s.data, sp, p.id).length === 0
                ? 'De ningún proyecto todavía'
                : <>De {projectsOfPillar(s.data, sp, p.id).map((id, k) => (
                    <span key={id}>{k > 0 && ', '}<a href={mapHref(id)} className="text-electric">{name(id)}</a></span>
                  ))}{' '}· toca uno para ver su mapa</>}
            </p>
            {MONTHS.map((m) => {
              const mine = acts.filter((a) => a.month === m.key)
              return (
                <div key={m.key} className="mt-2 border-l-2 border-[var(--line)] pl-3">
                  <p className="text-[13px] text-ink-2">
                    <span className="text-ink-3">{m.short} · </span>
                    {p.results[m.key]}
                  </p>
                  {mine.map((a) => (
                    <p key={a.id} className="mt-0.5 text-[13px] leading-[1.4] text-ink-3">
                      · {index.get(a.taskId)?.title}
                    </p>
                  ))}
                  {!mine.length && <p className="mt-0.5 text-[12.5px] text-[#a86a00]">Sin acciones</p>}
                </div>
              )
            })}
          </section>
        )
      })}

      <section className="mt-6" data-testid="strategy-parts">
        <p className="mb-1 text-[13px] text-ink-3">Revisar un apartado por separado</p>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4, 5].map((n) => (
            <a key={n} href={`#/plan/paso/${n}`} className="inline-flex h-9 items-center rounded-full border border-[var(--line)] px-3 text-[13px] text-ink">
              {PARTS[n]}
            </a>
          ))}
        </div>
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
  return (
    <div data-testid="review">
      <p className="text-[14px] leading-[1.45] text-ink-3">
        Lo que pasará cada mes, con lo que hace falta para lograrlo.
        <LocalTag />
      </p>

      {prereqs.length > 0 && (
        <section className="mt-5" data-testid="prereqs">
          <h2 className="mb-1 text-[13px] font-medium text-ink-3">Requisitos fuera del plan</h2>
          {prereqs.map((r) => {
            const month = MONTHS.find((m) => m.key === r.month)!
            const pid = sp.actions.find((a) => a.taskId === r.forTask.id)!.pillarId
            return (
              <Box key={r.task.id} tone="quiet" className="mb-2">
                <p className="text-[14px] leading-[1.45] text-ink">
                  «{r.forTask.title}» espera a «{r.task.title}», que no está en el plan. Sin ella no podrá empezar.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <Secondary testId="prereq-add" onClick={() => patch((x) => ({ ...x, actions: [...x.actions, { id: `${pid}-${r.task.id}`, pillarId: pid, taskId: r.task.id, month: r.month, from: 'tuya' }] }))}>
                    Incorporarla en {month.label.toLowerCase()}
                  </Secondary>
                  <button type="button" className="text-[13.5px] text-ink-3" onClick={() => setDismissed((d) => [...d, r.task.id])}>
                    No por ahora
                  </button>
                </div>
              </Box>
            )
          })}
        </section>
      )}

      {check.months.map((m) => {
        const month = MONTHS.find((x) => x.key === m.month)!
        return (
          <section key={m.month} className="mt-6" data-testid="review-month">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-medium text-ink">{month.label}</h2>
              <p className={`text-[12px] ${m.load > m.capacity ? 'text-[#a86a00]' : 'text-ink-3'}`}>
                {hours(m.load)} de {hours(m.capacity)}
              </p>
            </div>
            {m.unestimated > 0 && <p className="text-[11.5px] text-ink-4">{m.unestimated} sin estimación, contadas como 2 h.</p>}
            {m.results.map((r) => (
              <div key={r.pillarId} className="mt-3 border-l-2 border-[var(--line)] pl-3">
                <p className="text-[12px] text-ink-3">{pillar(r.pillarId).name}</p>
                <p className="text-[14.5px] leading-[1.4] text-ink">{r.result}</p>
                {r.items.map((it) => (
                  <a key={it.action.id} href={`#/tarea/${encodeURIComponent(it.task.id)}`} className="mt-1.5 flex items-start justify-between gap-2" data-testid="review-item">
                    <span className={`text-[13.5px] leading-[1.4] ${it.kind === 'terminada' ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{it.task.title}</span>
                    <KindTag kind={it.kind} label={KIND_LABEL[it.kind]} />
                  </a>
                ))}
                {r.note && (
                  <p className="mt-1.5 text-[12.5px] leading-[1.4] text-[#a86a00]" data-testid="review-note">
                    {r.note}
                  </p>
                )}
              </div>
            ))}
          </section>
        )
      })}

      <section className="mt-7" data-testid="grok">
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
        <a href="#/plan/2" className="text-[14px] text-ink-3">
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
      <h2 className="text-[13px] font-medium text-ink-3">
        Grok, asesor opcional
        <AiTag who="Grok" />
      </h2>
      {obs.length ? (
        obs.map((o, i) => (
          <p key={i} className="py-1.5 text-[14px] leading-[1.45] text-ink-2">
            <span className="text-ink-3">{TONE_LABEL[o.tone]}: </span>
            {o.text}
          </p>
        ))
      ) : (
        <p className="py-1.5 text-[14px] text-ink-3">No ve riesgos, desviaciones ni sobrecarga.</p>
      )}
      <p className="mt-1 text-[12px] text-ink-4">Es una simulación. Grok observa; no cambia el plan ni decide por ti.</p>
    </div>
  )
}

/** One part of the plan on its own: #/plan/paso/2…5. */
export function Part({ step }: { step: number }) {
  const { sp, patch } = usePlan()
  const n = Math.min(5, Math.max(2, step))
  return (
    <div data-testid="wizard-part" data-step={n}>
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
      <p className="mb-2 text-[14px] text-ink-3">Una frase: lo que quieres que sea verdad el 28 de febrero.</p>
      <textarea data-testid="north-star-input" rows={3} className={input} value={sp.northStar} onChange={(e) => patch((x) => ({ ...x, northStar: e.target.value, northStarFrom: 'tuya' }))} />
      <p className="mt-4 mb-1 text-[13px] text-ink-3">Otras ideas</p>
      {ideas.map((t, i) => (
        <button key={i} type="button" data-testid="north-star-idea" className="hit block w-full border-b border-[var(--line)] py-2.5 text-left text-[14.5px] leading-[1.4] text-ink-2 last:border-b-0" onClick={() => patch((x) => ({ ...x, northStar: t, northStarFrom: 'ia' }))}>
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
      <p className="mb-2 text-[14px] text-ink-3">Tres pilares, con el nombre que quieras. Cada uno puede reunir acciones de varios proyectos.</p>
      {sp.pillars.map((p, i) => (
        <section key={p.id} className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="pillar-edit">
          <label className="block">
            <span className="text-[12px] text-ink-3">
              Pilar {i + 1}
              {p.from === 'ia' && <AiTag />}
            </span>
            <input className={`${input} mt-1`} value={p.name} onChange={(e) => set(p.id, (q) => ({ ...q, name: e.target.value }))} />
          </label>
          {MONTHS.map((m) => (
            <label key={m.key} className="mt-2 block">
              <span className="text-[12px] text-ink-3">Al final de {m.label.toLowerCase()}</span>
              <input className={`${input} text-[15px]`} value={p.results[m.key]} onChange={(e) => set(p.id, (q) => ({ ...q, results: { ...q.results, [m.key]: e.target.value } }))} />
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
      <p className="mb-2 text-[14px] text-ink-3">Las acciones de cada pilar, de cualquier proyecto. Quita las que no quieras y añade otras.</p>
      {sp.pillars.map((p) => {
        const mine = sp.actions.filter((a) => a.pillarId === p.id)
        const ideas = candidatesFor(s.data, sp, p.id, 4)
        return (
          <section key={p.id} className="mt-5">
            <h2 className="text-[15px] font-medium text-ink">{p.name}</h2>
            {mine.map((a) => {
              const t = index.get(a.taskId)
              if (!t) return null
              const kind = kindOf(stageOf(s.data, t, index))
              return (
                <label key={a.id} className="flex items-start gap-3 border-b border-[var(--line)] py-2.5" data-testid="action-row">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-electric)]" checked onChange={() => patch((x) => ({ ...x, actions: x.actions.filter((y) => y.id !== a.id) }))} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] leading-[1.4] text-ink">{t.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                      {name(t.projectId)}
                      <KindTag kind={kind} label={KIND_LABEL[kind]} />
                    </span>
                    {a.from === 'ia' && a.reason && (
                      <span className="mt-0.5 block text-[12px] text-ink-4">
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
                <p className="text-[12px] text-ink-3">
                  Podrías añadir
                  <AiTag />
                </p>
                {ideas.map((t) => (
                  <label key={t.id} className="flex items-start gap-3 py-2">
                    <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-electric)]" checked={false} onChange={() => add(p.id, t.id, 'ia')} />
                    <span className="text-[14px] leading-[1.4] text-ink-2">
                      {t.title} <span className="text-ink-4">· {name(t.projectId)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <select className="mt-2 max-w-full rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-3 py-1.5 text-[13px] text-ink-3" value="" onChange={(e) => e.target.value && add(p.id, e.target.value, 'tuya')} data-testid="action-add">
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
      <p className="mb-2 text-[14px] text-ink-3">El mes de cada acción. Lo que espera a otra acción debería ir en el mismo mes o después.</p>
      {sp.pillars.map((p) => (
        <section key={p.id} className="mt-4">
          <h2 className="text-[15px] font-medium text-ink">{p.name}</h2>
          {sp.actions
            .filter((a) => a.pillarId === p.id)
            .map((a) => (
              <div key={a.id} className="border-b border-[var(--line)] py-2.5" data-testid="month-action">
                <p className="mb-1.5 text-[14px] leading-[1.4] text-ink">{title(a.taskId)}</p>
                <Segmented value={a.month} onChange={(m: Month) => patch((x) => ({ ...x, actions: x.actions.map((y) => (y.id === a.id ? { ...y, month: m } : y)) }))} options={MONTHS.map((m) => ({ value: m.key, label: m.short }))} />
              </div>
            ))}
        </section>
      ))}
    </div>
  )
}
