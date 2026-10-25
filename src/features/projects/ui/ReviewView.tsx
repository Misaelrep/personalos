import { useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { cycleWeeks, weekStartOf } from '../domain/cycle'
import type { LoadWarning } from '../domain/derive'
import { displayRef } from '../domain/ids'
import { commit, setWeekLimits, uncommit } from '../domain/ops'
import { closeWeekReview } from '../domain/operations'
import type { ProjectsData, Task } from '../domain/types'
import { workClassOf } from '../domain/vocabulary'
import { Inline } from './inline'
import { dateTime, WORK_CLASS_LABEL } from './labels'
import { Banner, Card, Chip, Empty, Mono, Section, Title, TopBar } from './parts'
import { taskHref } from './ProjectView'
import { reviewWeekFor, weeklyReview } from './review'
import { useWrite } from './write'

/**
 * P4b · REVISIÓN SEMANAL (domingo). Every project is shown; the person
 * chooses a few real commitments against the capacity they declare. Nothing
 * is committed, activated or closed on its own.
 */

const now = () => new Date().toISOString()
const ctx = () => ({ now: now() })
const today = () => new Date().toLocaleDateString('sv-SE')
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const input = 'h-10 w-20 rounded-[12px] border border-[var(--line)] bg-[var(--surface-quiet)] px-2 text-[15px] text-ink tabular'

function warningText(w: LoadWarning, data: ProjectsData): string {
  const ref = (id: string) => {
    const t = data.tasks.find((x) => x.id === id)
    return t ? (displayRef(t) ?? t.title) : id
  }
  switch (w.kind) {
    case 'over-capacity':
      return `Has comprometido ${w.committedHours} h y declaraste ${w.capacityHours} h.`
    case 'over-wip':
      return `Tienes ${w.commitments} compromisos y tu límite es ${w.wipLimit}.`
    case 'unestimated':
      return `Sin horas estimadas: ${w.taskIds.map(ref).join(', ')}. La carga real puede ser mayor.`
    case 'blocked-commitment':
      return `Comprometidas pero bloqueadas: ${w.taskIds.map(ref).join(', ')}.`
    case 'closed-commitment':
      return `Comprometidas pero ya cerradas: ${w.taskIds.map(ref).join(', ')}.`
  }
}

function TaskRef({ t, data, aside }: { t: Task; data: ProjectsData; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0">
      <a href={taskHref(t)} className="min-w-0 flex-1">
        <Mono>{displayRef(t) ?? 'sin ID'}</Mono>
        <p className="text-[15px] leading-[1.4] text-ink">
          <Inline text={t.title} />
        </p>
        <p className="text-[12.5px] text-ink-4">
          {data.projects.find((p) => p.id === t.projectId)?.name} · «{t.status}» {workClassOf(data, t) ? WORK_CLASS_LABEL[workClassOf(data, t)!] : ''}
          {t.estimate && ` · ${t.estimate.literal}`}
        </p>
      </a>
      {aside}
    </div>
  )
}

function Candidate({ t, data, weekStart }: { t: Task; data: ProjectsData; weekStart: string }) {
  const { write, busy, writable } = useWrite()
  const [hours, setHours] = useState('')
  const h = hours.trim() === '' ? undefined : Number(hours.replace(',', '.'))
  const bad = h !== undefined && !(h > 0 && h <= 80)
  return (
    <TaskRef
      t={t}
      data={data}
      aside={
        writable && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <input aria-label="Horas" inputMode="decimal" placeholder="h" className={input} value={hours} onChange={(e) => setHours(e.target.value)} data-testid="commit-hours" />
            <Button variant="choice" className="h-9 min-w-0 px-3 text-[11px]" disabled={busy || bad} onClick={() => write(`Compromiso ${displayRef(t) ?? ''}`, (d) => commit(d, weekStart, t.id, ctx(), h))} data-testid="commit">
              Asumir
            </Button>
          </div>
        )
      }
    />
  )
}

export function ReviewView({ data }: { data: ProjectsData }) {
  const { write, busy, writable } = useWrite()
  const weeks = cycleWeeks(data.cycle)
  const [weekN, setWeekN] = useState(() => reviewWeekFor(data, today()).n)
  const week = weeks.find((w) => w.n === weekN) ?? weeks[0]
  const weekStart = weekStartOf(week.start)
  const r = weeklyReview(data, week)
  const [cap, setCap] = useState('')
  const [lim, setLim] = useState('')
  const capN = cap.trim() === '' ? undefined : Number(cap.replace(',', '.'))
  const limN = lim.trim() === '' ? undefined : Number(lim)
  const limitsBad = (capN !== undefined && !(capN >= 0 && capN <= 100)) || (limN !== undefined && !(Number.isInteger(limN) && limN >= 1 && limN <= 30))

  return (
    <>
      <TopBar
        back="#/"
        backLabel="Proyectos"
        right={
          <div className="flex items-center gap-1">
            <button type="button" className="hit size-10 rounded-full text-ink-3 disabled:opacity-30" disabled={weekN <= 1} onClick={() => setWeekN(weekN - 1)} aria-label="Semana anterior">
              ‹
            </button>
            <span className="tabular text-[13px] text-ink-3">
              Semana {week.n}/{weeks.length}
            </span>
            <button type="button" className="hit size-10 rounded-full text-ink-3 disabled:opacity-30" disabled={weekN >= weeks.length} onClick={() => setWeekN(weekN + 1)} aria-label="Semana siguiente">
              ›
            </button>
          </div>
        }
      />
      <Title kicker={<Label>Revisión semanal</Label>} sub="Elige pocos compromisos reales. Lo que no asumas sigue en su proyecto.">
        {day(week.start)} – {day(week.end)}
      </Title>

      <Section label="Capacidad de la semana">
        <Card className="px-4 py-4" >
          <div className="grid grid-cols-2 gap-3" data-testid="load">
            <div>
              <div className="tabular font-display text-[24px] leading-none text-ink">
                {r.load.committedHours} h<span className="text-[15px] text-ink-3"> / {r.load.capacityHours ?? '—'} h</span>
              </div>
              <div className="mt-1 text-[12px] text-ink-3">{r.hoursLeft !== undefined ? (r.hoursLeft >= 0 ? `Quedan ${r.hoursLeft} h` : `${-r.hoursLeft} h por encima`) : 'Capacidad sin declarar'}</div>
            </div>
            <div>
              <div className="tabular font-display text-[24px] leading-none text-ink">
                {r.load.commitments}
                <span className="text-[15px] text-ink-3"> / {r.load.wipLimit ?? '—'}</span>
              </div>
              <div className="mt-1 text-[12px] text-ink-3">{r.slotsLeft !== undefined ? (r.slotsLeft >= 0 ? `Caben ${r.slotsLeft} más` : `${-r.slotsLeft} por encima del límite`) : 'Límite sin declarar'}</div>
            </div>
          </div>
          {writable && (
            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
              <label className="text-[12px] text-ink-3">
                Horas para proyectos
                <input inputMode="decimal" className={`${input} mt-1 block`} placeholder={r.load.capacityHours?.toString() ?? 'h'} value={cap} onChange={(e) => setCap(e.target.value)} data-testid="capacity" />
              </label>
              <label className="text-[12px] text-ink-3">
                Máx. compromisos
                <input inputMode="numeric" className={`${input} mt-1 block`} placeholder={r.load.wipLimit?.toString() ?? 'n'} value={lim} onChange={(e) => setLim(e.target.value)} data-testid="wip" />
              </label>
              <Button
                variant="choice"
                className="h-10 min-w-0 px-4 text-[11.5px]"
                disabled={busy || limitsBad || (capN === undefined && limN === undefined)}
                data-testid="limits-save"
                onClick={async () => {
                  const ok = await write('Capacidad', (d) => setWeekLimits(d, weekStart, { ...(capN !== undefined ? { humanCapacityHours: capN } : {}), ...(limN !== undefined ? { wipLimit: limN } : {}) }, ctx()))
                  if (ok) {
                    setCap('')
                    setLim('')
                  }
                }}
              >
                Guardar
              </Button>
            </div>
          )}
          <p className="mt-3 text-[12px] leading-[1.5] text-ink-4">Solo cuentan tus compromisos. Los encargos a agentes no suman a tu carga.</p>
        </Card>
        {r.load.warnings.length > 0 && (
          <div className="mt-3 flex flex-col gap-2" data-testid="warnings">
            {r.load.warnings.map((w, i) => (
              <Banner key={i} tone="warn">
                {warningText(w, data)}
              </Banner>
            ))}
          </div>
        )}
      </Section>

      <Section label="Tus compromisos" count={r.commitments.length}>
        {r.commitments.length === 0 ? (
          <Empty>Ninguno todavía. Asume tareas desde los proyectos de abajo.</Empty>
        ) : (
          <Card className="overflow-hidden" >
            <div data-testid="commitments">
              {r.commitments.map(({ task, estimateHours }) => (
                <TaskRef
                  key={task.id}
                  t={task}
                  data={data}
                  aside={
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="tabular text-[13px] text-ink-2">{estimateHours !== undefined ? `${estimateHours} h` : 'sin horas'}</span>
                      {writable && (
                        <Button variant="secondary" className="h-8 px-2.5 text-[12px]" disabled={busy} onClick={() => write(`Quitado ${displayRef(task) ?? ''}`, (d) => uncommit(d, weekStart, task.id, ctx()))} data-testid="uncommit">
                          Quitar
                        </Button>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          </Card>
        )}
      </Section>

      <Section label="Proyectos" count={r.projects.length}>
        <div className="flex flex-col gap-3" data-testid="review-projects">
          {r.projects.map((pr) => (
            <Card key={pr.project.id} className="overflow-hidden">
              <a href={`#/proyecto/${encodeURIComponent(pr.project.id)}`} className="block px-4 pt-3.5 pb-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-[17px] font-medium text-ink">
                    <Inline text={pr.project.name} />
                  </h3>
                  <span className="tabular text-[12.5px] text-ink-3">{pl(pr.open, 'abierta', 'abiertas')}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip tone="muted">{pl(pr.candidates.length, 'lista', 'listas')}</Chip>
                  {pr.commitments.length > 0 && <Chip>{pl(pr.commitments.length, 'asumida', 'asumidas')}</Chip>}
                  {pr.blocked > 0 && <Chip tone="warn">{pl(pr.blocked, 'bloqueada', 'bloqueadas')}</Chip>}
                  {pr.toVerify > 0 && <Chip tone="muted">{pr.toVerify} por verificar</Chip>}
                  {pr.unclassified > 0 && <Chip tone="muted">{pr.unclassified} sin clasificar</Chip>}
                </div>
              </a>
              {pr.candidates.length > 0 ? (
                <div className="border-t border-[var(--line)]" data-testid="candidates">
                  {pr.candidates.map((t) => (
                    <Candidate key={t.id} t={t} data={data} weekStart={weekStart} />
                  ))}
                </div>
              ) : (
                <p className="border-t border-[var(--line)] px-4 py-3 text-[13px] text-ink-4">
                  {pr.open === 0 ? 'Sin tareas abiertas.' : 'Ninguna lista: revisa sus bloqueos, requisitos o estados sin clasificar.'}
                </p>
              )}
            </Card>
          ))}
          {r.projects.length === 0 && <Empty>No hay proyectos.</Empty>}
        </div>
      </Section>

      <Section label="Encargos a agentes" count={r.agents.length}>
        {r.agents.length === 0 ? (
          <Empty>Ningún encargo abierto.</Empty>
        ) : (
          <Card className="overflow-hidden">
            <div data-testid="agents">
              {r.agents.map((t) => (
                <TaskRef key={t.id} t={t} data={data} aside={<Chip>{t.owner!.name}</Chip>} />
              ))}
            </div>
          </Card>
        )}
      </Section>

      <Section label="Esperan tu aprobación" count={r.awaiting.length}>
        {r.awaiting.length === 0 ? (
          <Empty>Nada pendiente de aprobar.</Empty>
        ) : (
          <Card className="overflow-hidden">
            <div data-testid="awaiting">
              {r.awaiting.map((t) => (
                <TaskRef key={t.id} t={t} data={data} />
              ))}
            </div>
          </Card>
        )}
      </Section>

      <div className="mt-8 border-t border-[var(--line)] pt-6">
        {r.plan?.closedAt && <p className="mb-3 text-center text-[13px] text-ink-3">Revisión cerrada {dateTime(r.plan.closedAt)}. Puedes seguir ajustando.</p>}
        {writable && (
          <Button className="w-full" disabled={busy} onClick={() => write('Revisión cerrada', (d) => closeWeekReview(d, weekStart, ctx()))} data-testid="close-review">
            {r.plan?.closedAt ? 'Volver a cerrar la revisión' : 'Cerrar la revisión'}
          </Button>
        )}
      </div>
    </>
  )
}
