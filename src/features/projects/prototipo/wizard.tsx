import { useEffect, useMemo } from 'react'
import { AiTag, Box, H1, Kicker, Primary, Segmented, go } from './kit'
import { MONTHS, SPRINT, candidateActions, emptySprint, reviewPlan, suggestNorthStars, suggestPillars, type Month, type Pillar, type Sprint } from './plan'
import { useProto } from './store'
import { UpdateFlow } from './update'

/**
 * PROTOTYPE · Six steps to a 90-day plan. The draft lives in memory and the
 * person can leave at any step and come back. AI proposals carry their tag
 * until the person approves the whole plan in step 6.
 */

const TITLES = ['Poner al día tus proyectos', '¿Qué quieres conseguir?', 'Elige tres pilares', 'Acciones de cada pilar', 'Repartir por mes', 'Revisar y aprobar']

const input = 'w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[16px] leading-[1.4] text-ink focus:outline-none'

export function Wizard({ step }: { step: number }) {
  const { s, set } = useProto()
  const sp = s.sprint ?? emptySprint()
  const n = Math.min(6, Math.max(1, step))
  const patch = (f: (x: Sprint) => Sprint) => set((st) => ({ ...st, sprint: f(st.sprint ?? emptySprint()) }))
  useEffect(() => {
    if (s.sprint?.status === 'aprobado') return
    if (!s.sprint || s.sprint.step !== n) patch((x) => ({ ...x, step: n }))
  }, [n])
  const nextOk = n === 2 ? sp.northStar.trim().length > 3 : n === 3 ? sp.pillars.length === 3 && sp.pillars.every((p) => p.name.trim()) : n === 4 ? sp.pillars.every((p) => sp.actions.some((a) => a.pillarId === p.id)) : true
  const save = () => {
    set((st) => ({ ...st, notice: `Borrador guardado en el paso ${n} de 6.` }))
    go('#/')
  }

  return (
    <div data-testid="wizard" data-step={n}>
      <div className="flex items-center justify-between">
        <Kicker>
          Paso {n} de 6 · {SPRINT.label}
        </Kicker>
        <button type="button" className="hit h-10 text-[13.5px] text-ink-3" data-testid="wizard-save" onClick={save}>
          Guardar y salir
        </button>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {TITLES.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < n ? 'bg-[var(--color-electric)]' : 'bg-[var(--line)]'}`} />
        ))}
      </div>
      <div className="mt-4 mb-4">
        <H1>{TITLES[n - 1]}</H1>
      </div>

      {n === 1 && (
        <>
          <p className="mb-4 text-[14.5px] leading-[1.45] text-ink-3">Antes de planear, cuenta qué terminaste, qué cambió o qué ya no harás. Así el plan parte de cómo están las cosas hoy.</p>
          <UpdateFlow inWizard onDone={() => go('#/plan/paso/2')} />
        </>
      )}
      {n === 2 && <StepNorthStar sp={sp} patch={patch} />}
      {n === 3 && <StepPillars sp={sp} patch={patch} />}
      {n === 4 && <StepActions sp={sp} patch={patch} />}
      {n === 5 && <StepMonths sp={sp} patch={patch} />}
      {n === 6 && <StepReview sp={sp} />}

      {n > 1 && n < 6 && (
        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 mt-6 bg-[linear-gradient(to_top,var(--color-soft)_60%,transparent)] pt-4 pb-1">
          <Primary testId="wizard-next" disabled={!nextOk} onClick={() => go(`#/plan/paso/${n + 1}`)}>
            Siguiente
          </Primary>
        </div>
      )}
      {n > 1 && (
        <p className="mt-3 text-center">
          <a href={`#/plan/paso/${n - 1}`} className="text-[14px] text-ink-3">
            Paso anterior
          </a>
        </p>
      )}
    </div>
  )
}

type StepProps = { sp: Sprint; patch: (f: (x: Sprint) => Sprint) => void }

function StepNorthStar({ sp, patch }: StepProps) {
  const { s } = useProto()
  const ideas = useMemo(() => suggestNorthStars(s.data), [s.data])
  return (
    <div data-testid="step-north-star">
      <p className="mb-2 text-[14px] text-ink-3">Una frase: lo que quieres que sea verdad el 28 de febrero.</p>
      <textarea data-testid="north-star-input" rows={3} className={input} value={sp.northStar} onChange={(e) => patch((x) => ({ ...x, northStar: e.target.value, northStarFrom: 'tuya' }))} placeholder="Escríbela tú o parte de una idea" />
      {sp.northStarFrom === 'ia' && sp.northStar && (
        <p className="mt-1 text-[12px] text-ink-4">
          Viene de una sugerencia. Cámbiala si no dice exactamente lo que quieres.
          <AiTag />
        </p>
      )}
      <p className="mt-4 mb-1 text-[13px] text-ink-3">Ideas para empezar</p>
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
  const { s } = useProto()
  const ideas = useMemo(() => suggestPillars(s.data), [s.data])
  const chosen = (id: string) => sp.pillars.find((p) => p.id === id)
  const toggle = (p: Pillar) =>
    patch((x) => {
      if (x.pillars.some((q) => q.id === p.id)) return { ...x, pillars: x.pillars.filter((q) => q.id !== p.id), actions: x.actions.filter((a) => a.pillarId !== p.id) }
      return x.pillars.length >= 3 ? x : { ...x, pillars: [...x.pillars, p] }
    })
  const name = (id: string) => (v: string) => patch((x) => ({ ...x, pillars: x.pillars.map((q) => (q.id === id ? { ...q, name: v, from: 'tuya' } : q)) }))
  return (
    <div data-testid="step-pillars">
      <p className="mb-2 text-[14px] text-ink-3">
        Exactamente tres. Elegidos: <span className="tabular text-ink">{sp.pillars.length}</span> de 3. Los proyectos que no entren siguen en «Mis proyectos».
      </p>
      {ideas.map((p) => {
        const c = chosen(p.id)
        const projects = p.projectIds.map((id) => s.data.projects.find((x) => x.id === id)?.name).join(', ')
        return (
          <div key={p.id} className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="pillar-idea">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-electric)]" checked={!!c} disabled={!c && sp.pillars.length >= 3} onChange={() => toggle(p)} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">
                  {c ? c.name : p.name}
                  {(!c || c.from === 'ia') && <AiTag />}
                </span>
                <span className="block text-[12.5px] text-ink-3">{projects}</span>
              </span>
            </label>
            {c && <input aria-label="Nombre del pilar" className={`${input} mt-2 ml-8 w-[calc(100%-2rem)] text-[15px]`} value={c.name} onChange={(e) => name(p.id)(e.target.value)} />}
          </div>
        )
      })}
    </div>
  )
}

function StepActions({ sp, patch }: StepProps) {
  const { s } = useProto()
  return (
    <div data-testid="step-actions">
      <p className="mb-2 text-[14px] text-ink-3">Elige qué tareas mueven cada pilar. Las marcadas como sugerencia son las que pueden empezar ya o liberan a otras; tú decides.</p>
      {sp.pillars.map((p) => {
        const cands = p.projectIds.flatMap((id) => candidateActions(s.data, id, 6))
        const suggested = new Set(cands.slice(0, 3).map((t) => t.id))
        const mine = sp.actions.filter((a) => a.pillarId === p.id)
        return (
          <section key={p.id} className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-medium text-ink">{p.name}</h2>
              <button
                type="button"
                className="shrink-0 text-[13px] text-electric"
                data-testid="accept-suggested"
                onClick={() =>
                  patch((x) => {
                    const have = new Set(x.actions.map((a) => a.taskId))
                    const add = [...suggested].filter((id) => !have.has(id)).map((taskId, i) => ({ id: `${p.id}-${taskId}`, pillarId: p.id, taskId, month: MONTHS[Math.min(2, mine.length + i)].key, from: 'ia' as const }))
                    return { ...x, actions: [...x.actions, ...add] }
                  })
                }
              >
                Marcar sugeridas
              </button>
            </div>
            {cands.map((t) => {
              const on = mine.some((a) => a.taskId === t.id)
              return (
                <label key={t.id} className="flex items-start gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-[var(--color-electric)]"
                    checked={on}
                    onChange={() =>
                      patch((x) =>
                        on ? { ...x, actions: x.actions.filter((a) => !(a.pillarId === p.id && a.taskId === t.id)) } : { ...x, actions: [...x.actions, { id: `${p.id}-${t.id}`, pillarId: p.id, taskId: t.id, month: MONTHS[Math.min(2, mine.length)].key, from: 'tuya' }] },
                      )
                    }
                  />
                  <span className="text-[14.5px] leading-[1.4] text-ink">
                    {t.title}
                    {suggested.has(t.id) && <AiTag />}
                  </span>
                </label>
              )
            })}
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
      <p className="mb-2 text-[14px] text-ink-3">Cada acción en un mes, y qué debería ser verdad al terminar cada mes. Lo propuesto se puede cambiar.</p>
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
          <details className="group py-2">
            <summary className="hit cursor-pointer list-none py-1 text-[13.5px] text-electric [&::-webkit-details-marker]:hidden">Resultado esperado cada mes</summary>
            {MONTHS.map((m) => (
              <label key={m.key} className="mt-2 block">
                <span className="text-[12px] text-ink-3">{m.label}</span>
                <input className={`${input} text-[15px]`} value={p.results[m.key]} onChange={(e) => patch((x) => ({ ...x, pillars: x.pillars.map((q) => (q.id === p.id ? { ...q, results: { ...q.results, [m.key]: e.target.value } } : q)) }))} />
              </label>
            ))}
          </details>
        </section>
      ))}
    </div>
  )
}

function StepReview({ sp }: { sp: Sprint }) {
  const { s, set } = useProto()
  const obs = reviewPlan(s.data, sp)
  const per = (m: Month) => sp.actions.filter((a) => a.month === m).length
  const approve = () => {
    set((st) => ({
      ...st,
      sprint: { ...sp, status: 'aprobado', step: 6, northStarFrom: 'tuya', pillars: sp.pillars.map((p) => ({ ...p, from: 'tuya' })), actions: sp.actions.map((a) => ({ ...a, from: 'tuya' })), approvedAt: `${st.today}T12:00:00-06:00` },
      notice: 'Plan aprobado. Desde ahora es tu decisión, no una sugerencia.',
    }))
    go('#/')
  }
  return (
    <div data-testid="step-review">
      <Box>
        <p className="text-[12px] text-ink-3">Lo que quieres conseguir</p>
        <p className="mt-0.5 text-[15.5px] leading-[1.4] text-ink">{sp.northStar}</p>
        <p className="mt-3 text-[12px] text-ink-3">Pilares</p>
        {sp.pillars.map((p) => (
          <p key={p.id} className="mt-0.5 text-[14.5px] text-ink">
            {p.name} <span className="text-ink-4">· {sp.actions.filter((a) => a.pillarId === p.id).length} acciones</span>
          </p>
        ))}
        <p className="mt-3 text-[12px] text-ink-3">Por mes</p>
        <p className="mt-0.5 text-[14.5px] text-ink">{MONTHS.map((m) => `${m.label} ${per(m.key)}`).join(' · ')}</p>
      </Box>
      {obs.length > 0 && (
        <section className="mt-5" data-testid="review-grok">
          <h2 className="mb-1 text-[13px] font-medium text-ink-3">Observaciones antes de aprobar</h2>
          {obs.map((o, i) => (
            <p key={i} className="py-1.5 text-[14px] leading-[1.45] text-ink-2">
              {o.text}
              <AiTag who="Grok" />
            </p>
          ))}
          <p className="mt-1 text-[12px] text-ink-4">Grok está simulado aquí. Sus observaciones no cambian el plan.</p>
        </section>
      )}
      <div className="mt-6">
        <Primary testId="approve" onClick={approve}>
          Aprobar el plan
        </Primary>
      </div>
    </div>
  )
}
