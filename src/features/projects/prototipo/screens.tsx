import { useState } from 'react'
import { changeStatus } from '../domain/operations'
import { classifyStatus, decideApproval, setCondition, setOwner } from '../domain/ops'
import { displayRef } from '../domain/ids'
import { isClosed } from '../domain/derive'
import { workClassOf } from '../domain/vocabulary'
import type { ProjectsData, Task, WorkClass } from '../domain/types'
import { explain } from '../ui/attention'
import { STAGE_LABEL } from '../ui/labels'
import { byRef, stageOf, trackOf } from '../ui/view'
import { approved, continueHere, decisionsOf, needs, nextInProject, pillarsOf, planned } from './derive'
import { AiTag, Back, Box, H1, Kicker, More, Primary, Row, Secondary, Segmented, TextLink, go } from './kit'
import { MONTHS, SPRINT, daysUntil, monthOf, reviewPlan, type Month } from './plan'
import { shortDate, useProto } from './store'

/** PROTOTYPE · The screens. Each has one primary action; the rest is a link or closed until opened. */

const Section = ({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) => (
  <section className="mt-6" data-testid={testId}>
    <h2 className="mb-2 text-[13px] font-medium text-ink-3">{title}</h2>
    {children}
  </section>
)

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[14px] leading-[1.45] text-ink-3">{children}</p>

// ── Plan de 90 días ─────────────────────────────────────────────────────────

export function PlanView() {
  const { s } = useProto()
  const sp = s.sprint
  if (!approved(sp)) {
    return (
      <div data-testid="plan-empty">
        <Kicker>Plan de 90 días · {SPRINT.label}</Kicker>
        <div className="mt-2">
          <H1>Todavía no hay un plan aprobado</H1>
        </div>
        <p className="mt-3 text-[15px] leading-[1.5] text-ink-2">
          En seis pasos pones al día tus proyectos y eliges qué quieres conseguir, tres pilares y qué hacer cada mes. La IA propone; nada cuenta hasta que tú lo apruebas.
        </p>
        <div className="mt-6">
          {sp ? (
            <Primary testId="plan-continue" onClick={() => go(`#/plan/paso/${sp.step}`)}>
              Continuar el borrador · paso {sp.step} de 6
            </Primary>
          ) : (
            <Primary testId="plan-start" onClick={() => go('#/plan/paso/1')}>
              Preparar el plan
            </Primary>
          )}
        </div>
        <div className="mt-4 text-center">
          <TextLink href="#/proyectos">O consulta tus proyectos</TextLink>
        </div>
      </div>
    )
  }
  return <ActivePlan key={s.today} />
}

function ActivePlan() {
  const { s } = useProto()
  const sp = s.sprint!
  const now = monthOf(s.today)
  const [month, setMonth] = useState<Month>(now.month)
  const here = continueHere(s.data, sp, s.today)
  const rows = planned(s.data, sp, month)
  const obs = reviewPlan(s.data, sp)
  const startsIn = now.before ? daysUntil(s.today, SPRINT.start) : 0
  return (
    <div data-testid="plan-active">
      <Kicker>Plan de 90 días · {now.before ? `empieza en ${startsIn} días` : now.after ? 'terminado' : `${MONTHS.find((m) => m.key === now.month)!.label.toLowerCase()}, mes ${MONTHS.findIndex((m) => m.key === now.month) + 1} de 3`}</Kicker>
      <div className="mt-2" data-testid="north-star">
        <H1>{sp.northStar}</H1>
      </div>

      {here && (
        <Box tone="focus" className="mt-5" testId="continue-here">
          <p className="text-[12px] text-ink-3">Continúa aquí</p>
          <p className="mt-1 text-[16px] leading-[1.35] text-ink">{here.task.title}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {here.pillar.name}
            {here.stage !== 'lista' && ` · ${STAGE_LABEL[here.stage].toLowerCase()}`}
          </p>
          <div className="mt-3">
            <Primary testId="continue-open" onClick={() => go(`#/tarea/${encodeURIComponent(here.task.id)}`)}>
              Abrir
            </Primary>
          </div>
        </Box>
      )}

      <div className="mt-6">
        <Segmented
          testId="months"
          value={month}
          onChange={setMonth}
          options={MONTHS.map((m) => ({ value: m.key, label: m.key === now.month && !now.before && !now.after ? <span>{m.label} <span className="text-electric">•</span></span> : m.label }))}
        />
      </div>
      <div className="mt-2" data-testid="month-body">
        {sp.pillars.map((p) => {
          const mine = rows.filter((r) => r.pillar.id === p.id)
          return (
            <div key={p.id} className="border-b border-[var(--line)] py-3 last:border-b-0">
              <p className="text-[15px] font-medium text-ink">{p.name}</p>
              <p className="mt-0.5 text-[13px] leading-[1.4] text-ink-3">Al final del mes: {p.results[month]}</p>
              <div className="mt-1">
                {mine.map((r) => (
                  <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} done={r.stage === 'cerrada'} sub={r.stage !== 'lista' && r.stage !== 'cerrada' ? STAGE_LABEL[r.stage] : undefined} testId="plan-action" />
                ))}
                {!mine.length && <p className="py-2 text-[13px] text-ink-4">Sin acciones este mes.</p>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <More title="Observaciones de Grok" count={obs.length} testId="grok">
          <p className="mb-2 text-[12px] text-ink-4">
            Simuladas en este prototipo. Grok observa y sugiere; no cambia nada.
          </p>
          {obs.map((o, i) => (
            <p key={i} className="py-1.5 text-[14px] leading-[1.45] text-ink-2">
              {o.text}
              <AiTag who="Grok" />
            </p>
          ))}
        </More>
      </div>
      <p className="mt-6 text-center text-[13px] text-ink-4">
        Aprobado por ti el {shortDate(sp.approvedAt ?? s.today)} · <TextLink href="#/actualizar">Contar qué ha cambiado</TextLink>
      </p>
    </div>
  )
}

// ── Mis proyectos ───────────────────────────────────────────────────────────

export function ProjectsView() {
  const { s } = useProto()
  const sp = s.sprint
  const inPlan = s.data.projects.filter((p) => pillarsOf(sp, p.id).length)
  const outside = s.data.projects.filter((p) => !pillarsOf(sp, p.id).length)
  const row = (p: (typeof s.data.projects)[number]) => {
    const pillars = pillarsOf(sp, p.id)
    return (
      <Row
        key={p.id}
        href={`#/proyecto/${encodeURIComponent(p.id)}`}
        title={p.name}
        testId="project-row"
        sub={
          <>
            <span className="line-clamp-2">{p.objective ?? 'Propósito por definir'}</span>
            {pillars.length > 0 && <span className="mt-0.5 block text-electric">Aporta a «{pillars.map((x) => x.name).join('» y «')}»</span>}
          </>
        }
      />
    )
  }
  return (
    <div data-testid="projects">
      {approved(sp) ? (
        <>
          <Section title="En el plan de este trimestre">{inPlan.map(row)}</Section>
          <Section title="Fuera de este trimestre" testId="projects-outside">
            {outside.map(row)}
          </Section>
        </>
      ) : (
        <div className="mt-2">{s.data.projects.map(row)}</div>
      )}
      <div className="mt-8">
        <Primary testId="go-update" onClick={() => go('#/actualizar')}>
          Contar qué ha cambiado
        </Primary>
      </div>
    </div>
  )
}

// ── Un proyecto ─────────────────────────────────────────────────────────────

export function ProjectPage({ id }: { id: string }) {
  const { s } = useProto()
  const p = s.data.projects.find((x) => x.id === id)
  if (!p) return <Muted>Ese proyecto no existe en el prototipo.</Muted>
  const sp = s.sprint
  const pillars = pillarsOf(sp, p.id)
  const { month } = monthOf(s.today)
  const thisMonth = approved(sp) ? planned(s.data, sp, month).filter((r) => r.task.projectId === p.id) : []
  const decisions = decisionsOf(s.data, p.id, sp)
  const next = nextInProject(s.data, p.id, sp, s.today)
  const tasks = s.data.tasks.filter((t) => t.projectId === p.id).sort(byRef)
  const blocked = tasks.filter((t) => stageOf(s.data, t) === 'bloqueada')
  const history = s.data.history.filter((h) => h.entity === 'task' && tasks.some((t) => t.id === h.id)).slice(-8).reverse()
  const imp = [...(s.data.imports ?? [])].reverse().find((r) => r.projectId === p.id)
  return (
    <div data-testid="project">
      <Back href="#/proyectos" label="Mis proyectos" />
      <div className="mt-1">
        <H1>{p.name}</H1>
      </div>

      <Section title="Qué buscamos conseguir" testId="project-goal">
        <p className="text-[15px] leading-[1.5] text-ink">{p.objective ?? 'Objetivo por definir'}</p>
        {pillars.length > 0 && <p className="mt-1 text-[13px] text-electric">Aporta a «{pillars.map((x) => x.name).join('» y «')}»</p>}
      </Section>

      <Section title={`Este mes${approved(sp) ? ` · ${MONTHS.find((m) => m.key === month)!.label.toLowerCase()}` : ''}`} testId="project-month">
        {pillars.length > 0 ? (
          <>
            {pillars.map((x) => (
              <p key={x.id} className="text-[15px] leading-[1.45] text-ink">
                <span className="text-ink-3">Al final del mes: </span>
                {x.results[month]}
              </p>
            ))}
            {/* The next action has its own card below: listed once. */}
            {thisMonth
              .filter((r) => r.task.id !== next?.id)
              .map((r) => (
                <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} done={r.stage === 'cerrada'} sub={r.stage !== 'lista' && r.stage !== 'cerrada' ? STAGE_LABEL[r.stage] : undefined} />
              ))}
          </>
        ) : (
          <Muted>{!approved(sp) ? 'Se decide al aprobar el plan de 90 días.' : 'No participa en el plan de este trimestre.'}</Muted>
        )}
      </Section>

      {decisions.length > 0 && (
        <Section title="Necesita tu decisión" testId="project-decisions">
          {decisions.slice(0, 2).map((d) => (
            <Row key={d.text} href={`#/tarea/${encodeURIComponent(d.task.id)}`} title={d.text} />
          ))}
          {decisions.length > 2 && <p className="pt-1 text-[12.5px] text-ink-4">Y {decisions.length - 2} más, en «Todas las tareas».</p>}
        </Section>
      )}

      {next && (
        <Box tone="focus" className="mt-6" testId="project-next">
          <p className="text-[12px] text-ink-3">Siguiente acción</p>
          <p className="mt-1 text-[16px] leading-[1.35] text-ink">{next.title}</p>
          {stageOf(s.data, next) !== 'lista' && <p className="mt-0.5 text-[12.5px] text-ink-3">Antes: {STAGE_LABEL[stageOf(s.data, next)].toLowerCase()}</p>}
          <div className="mt-3">
            <Primary onClick={() => go(`#/tarea/${encodeURIComponent(next.id)}`)}>Abrir</Primary>
          </div>
        </Box>
      )}

      <div className="mt-6">
        <More title="Todas las tareas" count={tasks.length} testId="project-all">
          {tasks.map((t) => {
            const st = stageOf(s.data, t)
            return <Row key={t.id} href={`#/tarea/${encodeURIComponent(t.id)}`} title={t.title} done={st === 'cerrada'} sub={STAGE_LABEL[st]} />
          })}
        </More>
        {blocked.length > 0 && (
          <More title="Bloqueos y dependencias" count={blocked.length} testId="project-blocked">
            {blocked.map((t) => (
              <Row key={t.id} href={`#/tarea/${encodeURIComponent(t.id)}`} title={t.title} sub={needs(s.data, t)} />
            ))}
          </More>
        )}
        <More title="Documentación original" testId="project-source">
          <p className="text-[14px] leading-[1.5] text-ink-2">
            Dossier «{p.dossier}»{imp ? `, importado el ${shortDate(imp.at)}` : ''}. Se conserva tal cual: los títulos, estados e IDs originales siguen en cada tarea, en «Más información».
          </p>
        </More>
        <More title="Historial" count={history.length} testId="project-history">
          {history.length ? (
            history.map((h, i) => (
              <p key={i} className="py-1 text-[13px] leading-[1.4] text-ink-3">
                {shortDate(h.at)} · {tasks.find((t) => t.id === h.id)?.title} · {String(h.field)}: {String(h.to ?? '—')}
              </p>
            ))
          ) : (
            <Muted>Sin cambios todavía en este prototipo.</Muted>
          )}
        </More>
      </div>
    </div>
  )
}

// ── Una tarea ───────────────────────────────────────────────────────────────

const CLASS_CHOICES: { value: WorkClass; label: string }[] = [
  { value: 'pendiente', label: 'Sin empezar' },
  { value: 'en-curso', label: 'En curso' },
  { value: 'ejecutada', label: 'Hecha' },
  { value: 'descartada', label: 'No se hará' },
]

const TRACK_TEXT = {
  executed: { si: 'Hecha', no: 'Todavía no', 'sin-decidir': 'Por aclarar' },
}

export function TaskPage({ id }: { id: string }) {
  const { s, set, ctx } = useProto()
  const t = s.data.tasks.find((x) => x.id === id)
  const [cls, setCls] = useState<WorkClass>('pendiente')
  if (!t) return <Muted>Esa tarea no existe en el prototipo.</Muted>
  const p = s.data.projects.find((x) => x.id === t.projectId)!
  const ex = explain(s.data, t)
  const stage = ex.stage
  const wc = workClassOf(s.data, t)
  const need = needs(s.data, t)
  const track = trackOf(s.data, t)
  const apply = (f: (d: ProjectsData) => ProjectsData, notice: string) => set((x) => ({ ...x, data: f(x.data), notice }))
  const sameWord = s.data.tasks.filter((x) => x.projectId === t.projectId && x.status === t.status).length
  const waitFor = ex.causes.find((c) => c.kind === 'espera')
  const firstCheck = (() => {
    for (const r of t.requirements ?? []) {
      const i = r.options.findIndex((o) => o.kind === 'condicion' && o.state === 'por-verificar')
      if (i >= 0) return { r, i, literal: (r.options[i] as { literal: string }).literal }
    }
    return undefined
  })()
  const result = t.deliverable ?? t.acceptance[0]
  const estimate = t.estimate?.literal ?? (t.estimateHours ? `${t.estimateHours} h` : undefined)

  let action: React.ReactNode = null
  if (stage === 'lista') {
    action =
      wc === 'en-curso' ? (
        <Primary testId="task-done" onClick={() => apply((d) => changeStatus(d, t.id, 'Ejecutada', ctx()), 'Marcada como hecha. Ahora espera tu visto bueno.')}>
          Marcar como hecha
        </Primary>
      ) : (
        <div className="flex flex-col gap-2">
          <Primary testId="task-start" onClick={() => apply((d) => changeStatus(d, t.id, 'En curso', ctx()), 'Empezada.')}>
            Empezar
          </Primary>
          {t.owner?.kind !== 'agente' && t.delegation && (
            <Secondary testId="task-delegate" onClick={() => apply((d) => setOwner(d, t.id, { kind: 'agente', name: 'Agente' }, ctx()), 'Delegada. El resultado volverá para tu visto bueno.')}>
              Delegar
            </Secondary>
          )}
        </div>
      )
  } else if (stage === 'en-aprobacion') {
    action = (
      <div className="flex flex-col gap-2">
        <Primary testId="task-approve" onClick={() => apply((d) => decideApproval(d, t.id, 'aprobada', ctx()), 'Visto bueno dado.')}>
          Dar el visto bueno
        </Primary>
        <Secondary onClick={() => apply((d) => decideApproval(d, t.id, 'devuelta', ctx()), 'Devuelta para rehacer.')}>Devolver</Secondary>
      </div>
    )
  } else if (stage === 'por-clasificar') {
    action = (
      <div data-testid="task-classify">
        <p className="mb-2 text-[13.5px] leading-[1.45] text-ink-2">
          ¿Qué significa «{t.status}»? {sameWord > 1 ? `Se aplicará a las ${sameWord} tareas de este proyecto que la usan.` : 'Solo la usa esta tarea.'}
        </p>
        <Segmented value={cls} onChange={setCls} options={CLASS_CHOICES} />
        <div className="mt-3">
          <Primary testId="task-classify-save" onClick={() => apply((d) => classifyStatus(d, p.dossier, t.status, cls, ctx()), `«${t.status}» aclarado${sameWord > 1 ? ` en ${sameWord} tareas` : ''}.`)}>
            Aclarar
          </Primary>
        </div>
      </div>
    )
  } else if (stage === 'por-verificar' && firstCheck) {
    action = (
      <div data-testid="task-check">
        <p className="mb-2 text-[14px] text-ink-2">¿Se cumple «{firstCheck.literal}»?</p>
        <div className="flex flex-col gap-2">
          <Primary onClick={() => apply((d) => setCondition(d, t.id, firstCheck.r.id, firstCheck.i, 'cumplida', ctx()), 'Confirmado.')}>Sí, se cumple</Primary>
          <Secondary onClick={() => apply((d) => setCondition(d, t.id, firstCheck.r.id, firstCheck.i, 'no-cumplida', ctx()), 'Anotado: no se cumple.')}>Todavía no</Secondary>
        </div>
      </div>
    )
  } else if (stage === 'bloqueada' && waitFor?.kind === 'espera') {
    const w = waitFor.tasks.find((x) => !isClosed(s.data, x)) ?? waitFor.tasks[0]
    action = (
      <Primary testId="task-go-blocker" onClick={() => go(`#/tarea/${encodeURIComponent(w.id)}`)}>
        Ir a «{w.title}»
      </Primary>
    )
  }

  const lines: [string, string][] = []
  if (result) lines.push(['Resultado a entregar', result])
  if (stage !== 'cerrada') lines.push(['Para empezar', stage === 'lista' ? (wc === 'en-curso' ? 'Ya está en curso.' : 'Nada: puedes empezar ya.') : need ?? STAGE_LABEL[stage]])
  if (estimate) lines.push(['Tiempo estimado', estimate])

  return (
    <div data-testid="task">
      <Back href={`#/proyecto/${encodeURIComponent(p.id)}`} label={p.name} />
      <div className="mt-1">
        <H1>{t.title}</H1>
      </div>
      {stage === 'cerrada' && <p className="mt-2 text-[14px] text-ink-3">{wc === 'descartada' ? 'Descartada.' : 'Terminada y aprobada.'}</p>}
      {t.owner?.kind === 'agente' && stage !== 'cerrada' && <p className="mt-2 text-[13.5px] text-electric">Delegada a un agente.</p>}
      {lines.length > 0 && (
        <Box className="mt-4" testId="task-card">
          {lines.map(([k, v]) => (
            <div key={k} className="border-b border-[var(--line)] py-2 last:border-b-0">
              <p className="text-[12px] text-ink-3">{k}</p>
              <p className="mt-0.5 text-[14.5px] leading-[1.45] text-ink">{v}</p>
            </div>
          ))}
        </Box>
      )}
      {action && (
        <div className="mt-5" data-testid="task-action">
          {action}
        </div>
      )}
      <div className="mt-6">
        <More title="Más información" testId="task-more">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
            {displayRef(t) && (
              <>
                <dt className="text-ink-3">ID</dt>
                <dd className="text-ink">{displayRef(t)}</dd>
              </>
            )}
            <dt className="text-ink-3">Estado en el dossier</dt>
            <dd className="text-ink">«{t.status}»</dd>
            <dt className="text-ink-3">Ejecución</dt>
            <dd className="text-ink">{TRACK_TEXT.executed[track.executed.state]}</dd>
            <dt className="text-ink-3">Verificación</dt>
            <dd className="text-ink">{track.verified.state === 'sin-dato' ? 'Sin dato' : track.verified.state}</dd>
            <dt className="text-ink-3">Aprobación</dt>
            <dd className="text-ink">{{ 'sin-dato': 'Sin decidir', 'no-requiere': 'No requiere', pendiente: 'Pendiente', aprobada: 'Aprobada', devuelta: 'Devuelta' }[track.approved.state]}</dd>
            {ex.waiters.length > 0 && (
              <>
                <dt className="text-ink-3">La esperan</dt>
                <dd className="text-ink">{ex.waiters.length === 1 ? '1 tarea' : `${ex.waiters.length} tareas`}</dd>
              </>
            )}
            {t.acceptance.length > 1 && (
              <>
                <dt className="text-ink-3">Criterios</dt>
                <dd className="text-ink">{t.acceptance.join(' · ')}</dd>
              </>
            )}
            {t.delegation?.literal && (
              <>
                <dt className="text-ink-3">Delegación</dt>
                <dd className="text-ink">«{t.delegation.literal}»</dd>
              </>
            )}
            <dt className="text-ink-3">Origen</dt>
            <dd className="text-ink">{t.origin ? `Dossier «${t.origin.dossier}»` : 'Creada en ELYUM'}</dd>
          </dl>
        </More>
      </div>
    </div>
  )
}

export type { Task }
