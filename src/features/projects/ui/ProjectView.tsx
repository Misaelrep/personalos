import { Inline } from './inline'
import { Label } from '../../../components/ui/Label'
import { indexTasks, type Blockers } from '../domain/derive'
import { displayRef } from '../domain/ids'
import type { ProjectsData, Task } from '../domain/types'
import { dateTime, REQUIREMENT_STATE_LABEL, shortHash, STAGE_HINT, STAGE_LABEL } from './labels'
import { Card, Empty, Field, Mono, RowLink, Section, StageChip, Title, TopBar } from './parts'
import { BLOCK_SUMMARY_TEXT, causeText, explain, projectAttention, situationText, waitersOf } from './attention'
import { projectSummary, STAGES, stageOf } from './view'

/**
 * P4a · PROYECTO: objective, milestones, next actions, blockers and tasks. Read-only.
 * E1: first the situation and what needs the person; then what can be done now; the
 * rest (why tasks cannot move, rules, milestones, every task, origin) below.
 */

export const taskHref = (t: Task) => `#/tarea/${encodeURIComponent(t.id)}`

function TaskLine({ t, data, note }: { t: Task; data: ProjectsData; note?: string }) {
  return (
    <RowLink href={taskHref(t)} testId="task-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Mono>{displayRef(t) ?? 'sin ID'}</Mono>
          <p className="mt-0.5 text-[15px] leading-[1.4] text-ink"><Inline text={t.title} /></p>
          {note && <p className="mt-1 text-[13px] leading-[1.45] text-ink-3"><Inline text={note} /></p>}
        </div>
        <StageChip stage={stageOf(data, t)} />
      </div>
    </RowLink>
  )
}

/** What a blocked task waits for, in one line: the tasks it waits for, and conditions in the dossier's own words. */
export function blockerText(b: Blockers): string {
  const parts = [...b.waiting.map((t) => `espera ${displayRef(t) ?? t.title}`), ...b.unknown.map((id) => `${id} no existe`)]
  for (const r of b.requirements) {
    const open = r.options.filter((o) => o.state !== 'cumplido')
    const tasks = open.flatMap((o) => (o.option.kind === 'tarea' ? [o.task ? (displayRef(o.task) ?? o.task.title) : `${o.option.taskId.replace(/^src:/, '')} (no existe)`] : []))
    const conditions = open.flatMap((o) => (o.option.kind === 'condicion' ? [`«${o.option.literal}» ${REQUIREMENT_STATE_LABEL[o.state].toLowerCase()}`] : []))
    const joiner = r.requirement.mode === 'alguna' ? ' o ' : ', '
    parts.push([tasks.length ? `espera ${tasks.join(joiner)}` : '', ...conditions].filter(Boolean).join(r.requirement.mode === 'alguna' ? ' o ' : ' · '))
  }
  return parts.filter(Boolean).join(' · ')
}

export function ProjectView({ data, projectId }: { data: ProjectsData; projectId: string }) {
  const s = projectSummary(data, projectId)
  if (!s) {
    return (
      <>
        <TopBar back="#/" backLabel="Proyectos" />
        <Empty>Este proyecto no existe en los datos guardados.</Empty>
      </>
    )
  }
  const { project } = s
  const a = projectAttention(data, project)
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const decide = a.words.length + a.checks.length + a.approvals.length
  // Only what the engine says can move (readiness «lista»). A written next action never makes a blocked task ready.
  const ready = a.ready
  const cannotMove = s.blocked.map(({ task }) => ({ task, ex: explain(data, task, index, waiters) }))

  return (
    <>
      <TopBar back="#/" backLabel="Proyectos" />
      <Title kicker={<Label>Proyecto</Label>} sub={project.objective?.trim() ? <Inline text={project.objective} /> : <span className="italic text-ink-4">Objetivo por definir</span>}>
        <Inline text={project.name} />
      </Title>

      <Card className="px-4 py-3.5" testId="stage-strip">
        <p className="text-[15px] font-medium leading-[1.4] text-ink">{situationText(a)}</p>
        <p className="mt-1 text-[13px] leading-[1.45] text-ink-3">
          {a.total === 0
            ? 'Puedes crear tareas o importar su dossier.'
            : [
                `${a.closed} de ${a.total} cerradas`,
                a.ready.length && `${a.ready.length} ${STAGE_LABEL.lista.toLowerCase()}`,
                s.stages['por-clasificar'] && `${s.stages['por-clasificar']} con ${STAGE_LABEL['por-clasificar'].toLowerCase()}`,
                s.stages['por-verificar'] && `${s.stages['por-verificar']} en las que ${STAGE_LABEL['por-verificar'].toLowerCase()}`,
                s.stages.bloqueada && `${s.stages.bloqueada} no pueden avanzar todavía`,
                s.stages['en-aprobacion'] && `${s.stages['en-aprobacion']} esperan tu visto bueno`,
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </Card>

      <Section label="Necesita tu decisión">
        {decide === 0 ? (
          <Empty>Nada en este proyecto espera una decisión tuya ahora.</Empty>
        ) : (
          <Card className="overflow-hidden" testId="project-decide">
            {a.approvals.map((t) => (
              <TaskLine key={t.id} t={t} data={data} note="Está hecha; falta tu visto bueno." />
            ))}
            {a.words.map((w) => (
              <RowLink key={`w:${w.literal}`} href={taskHref(w.tasks[0])} testId="decide-word">
                <p className="text-[15px] leading-[1.4] text-ink">
                  Aclarar qué significa «<Inline text={w.literal} />»
                </p>
                <p className="mt-1 text-[13px] leading-[1.45] text-ink-3">
                  {w.tasks.length === 1 ? 'Lo usa 1 tarea' : `Lo usan ${w.tasks.length} tareas`}
                  {w.waiting > 0 && ` · ${w.waiting === 1 ? '1 tarea espera' : `${w.waiting} tareas esperan`} directamente por ellas`}. Se aclara una vez para todas.
                </p>
              </RowLink>
            ))}
            {a.checks.map((c) => (
              <RowLink key={`c:${c.literal}`} href={taskHref(c.tasks[0])} testId="decide-check">
                <p className="text-[15px] leading-[1.4] text-ink">
                  Comprobar «<Inline text={c.literal} />»
                </p>
                <p className="mt-1 text-[13px] leading-[1.45] text-ink-3">
                  {c.tasks.length === 1 ? 'Lo pide 1 tarea' : `Lo piden ${c.tasks.length} tareas`}. Nadie lo ha confirmado todavía.
                </p>
              </RowLink>
            ))}
          </Card>
        )}
      </Section>

      <Section label="Se puede hacer ya" count={ready.length}>
        {ready.length === 0 ? (
          <Empty>
            Ninguna todavía.
            {decide > 0 ? ' Primero hace falta lo que está en «Necesita tu decisión».' : s.blocked.length ? ' Las demás no pueden avanzar todavía (abajo verás por qué).' : ''}
          </Empty>
        ) : (
          <Card className="overflow-hidden" testId="project-ready">
            {ready.map((t) => {
              const n = waiters.get(t.id)?.length ?? 0
              const note = t.nextAction?.trim()
                ? [`Siguiente acción: ${t.nextAction}`]
                : [t.estimate?.literal && `Tiempo según el dossier: ${t.estimate.literal}`]
              return <TaskLine key={t.id} t={t} data={data} note={[...note, n && `${n === 1 ? '1 tarea espera' : `${n} tareas esperan`} por ella`].filter(Boolean).join(' · ') || undefined} />
            })}
          </Card>
        )}
      </Section>

      {s.agents.length > 0 && (
        <Section label="Encargos a agentes" count={s.agents.length}>
          <Card className="overflow-hidden">
            {s.agents.map((t) => (
              <TaskLine key={t.id} t={t} data={data} note={`${t.owner!.name}${t.nextAction ? ` · ${t.nextAction}` : ' · sin instrucción escrita'}`} />
            ))}
          </Card>
        </Section>
      )}

      {cannotMove.length > 0 && (
        <Section label="No puede avanzar todavía" count={cannotMove.length}>
          <details className="surface-quiet rounded-[18px]" data-testid="project-blocked">
            <summary className="hit flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 select-none [&::-webkit-details-marker]:hidden">
              <span className="text-[14px] leading-[1.45] text-ink-2" data-testid="blocked-summary">{BLOCK_SUMMARY_TEXT[a.blockedBy ?? 'varias']}</span>
              <span className="shrink-0 text-[13px] text-electric">Ver por qué</span>
            </summary>
            <div className="border-t border-[var(--line)]">
              {cannotMove.map(({ task, ex }) => (
                <TaskLine key={task.id} t={task} data={data} note={ex.causes.map(causeText).join(' ')} />
              ))}
            </div>
          </details>
        </Section>
      )}

      {project.rules && project.rules.length > 0 && (
        <Section label="Reglas del dossier">
          <Card className="px-4 py-1">
            {project.rules.map((r, i) => (
              <Field key={i} label={r.limit !== undefined ? `Límite informativo · ${r.limit}` : 'Regla informativa'}>
                <Inline text={r.literal} />
              </Field>
            ))}
          </Card>
        </Section>
      )}

      <Section label="Hitos" count={s.milestones.length}>
        {s.milestones.length === 0 ? (
          <Empty>El dossier no define hitos.</Empty>
        ) : (
          <Card className="px-4 py-1">
            {s.milestones.map((m) => (
              <Field key={m.id} label={m.dueLiteral ?? m.due ?? 'Sin fecha'}>
                <Inline text={m.title} />
                {m.acceptance.length > 0 && <span className="mt-1 block text-[13px] text-ink-3">{m.acceptance.join(' · ')}</span>}
              </Field>
            ))}
          </Card>
        )}
      </Section>

      <Section label="Todas las tareas" count={s.tasks.length}>
        {s.tasks.length === 0 ? (
          <Empty>Este proyecto no tiene tareas.</Empty>
        ) : (
          <details className="surface-quiet rounded-[18px]" data-testid="project-tasks">
            <summary className="hit flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 select-none [&::-webkit-details-marker]:hidden">
              <span className="text-[14px] leading-[1.45] text-ink-2">Con su ID, agrupadas por situación.</span>
              <span className="shrink-0 text-[13px] text-electric">Ver todas</span>
            </summary>
            <div className="flex flex-col gap-5 px-2 pb-3">
              {STAGES.filter((st) => s.stages[st] > 0).map((st) => (
                <div key={st}>
                  <p className="mb-2 px-1 text-[13px] text-ink-3">
                    <span className="text-ink-2">{STAGE_LABEL[st]}</span> · {STAGE_HINT[st]}
                  </p>
                  <Card className="overflow-hidden">
                    {s.tasks
                      .filter((t) => stageOf(data, t) === st)
                      .map((t) => (
                        <TaskLine key={t.id} t={t} data={data} />
                      ))}
                  </Card>
                </div>
              ))}
            </div>
          </details>
        )}
      </Section>

      <Section label="Origen">
        <details className="surface-quiet rounded-[18px] px-4 py-3 text-[14px] text-ink-2">
          <summary className="cursor-pointer select-none text-ink-2">Dossier · {project.dossier}</summary>
          <div className="mt-2">
            <Field label="Última importación">{s.lastImport ? dateTime(s.lastImport.at) : undefined}</Field>
            <Field label="Huella del archivo">{s.lastImport ? <Mono>{shortHash(s.lastImport.dossierHash)}</Mono> : undefined}</Field>
            <Field label="Fuentes del dossier">{String(s.sources)}</Field>
            <Field label="Registros que no son tareas (referencias)">{String(s.references)}</Field>
          </div>
        </details>
      </Section>
    </>
  )
}
