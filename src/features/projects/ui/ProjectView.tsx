import { Inline } from './inline'
import { Label } from '../../../components/ui/Label'
import type { Blockers } from '../domain/derive'
import { displayRef } from '../domain/ids'
import type { ProjectsData, Task } from '../domain/types'
import { dateTime, REQUIREMENT_STATE_LABEL, shortHash, STAGE_HINT, STAGE_LABEL } from './labels'
import { Card, Empty, Field, Mono, RowLink, Section, StageChip, Title, TopBar } from './parts'
import { projectSummary, STAGES, stageOf } from './view'

/** P4a · PROYECTO: objective, milestones, next actions, blockers and tasks. Read-only. */

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
  const notReady = [
    s.stages['por-clasificar'] && `${s.stages['por-clasificar']} sin clasificar`,
    s.stages.bloqueada && `${s.stages.bloqueada} bloqueadas`,
    s.stages['por-verificar'] && `${s.stages['por-verificar']} por verificar`,
  ].filter(Boolean)

  return (
    <>
      <TopBar back="#/" backLabel="Proyectos" />
      <Title kicker={<Label>Proyecto</Label>} sub={project.objective !== undefined ? <Inline text={project.objective} /> : <span className="italic text-ink-4">El dossier no indica objetivo.</span>}>
        <Inline text={project.name} />
      </Title>

      <div className="grid grid-cols-3 gap-2" data-testid="stage-strip">
        {STAGES.map((st) => (
          <div key={st} className="surface-quiet rounded-[16px] px-3 py-2.5">
            <div className="tabular font-display text-[20px] leading-none text-ink">{s.stages[st]}</div>
            <div className="mt-1 text-[11.5px] leading-tight text-ink-3">{STAGE_LABEL[st]}</div>
          </div>
        ))}
      </div>

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

      <Section label="Siguientes acciones" count={s.nextActions.length + s.candidates.length}>
        {s.nextActions.length === 0 && s.candidates.length === 0 ? (
          <Empty>
            Ninguna tarea está lista todavía{notReady.length ? `: ${notReady.join(', ')}` : ''}. Una tarea es candidata cuando su estado tiene clase y no le queda ningún requisito pendiente ni por verificar.
          </Empty>
        ) : (
          <Card className="overflow-hidden">
            {s.nextActions.map((t) => (
              <TaskLine key={t.id} t={t} data={data} note={`Siguiente acción: ${t.nextAction}`} />
            ))}
            {s.candidates
              .filter((t) => !s.nextActions.includes(t))
              .map((t) => (
                <TaskLine key={t.id} t={t} data={data} note="Candidata · sin siguiente acción escrita" />
              ))}
          </Card>
        )}
      </Section>

      <Section label="Bloqueos" count={s.blocked.length}>
        {s.blocked.length === 0 ? (
          <Empty>Nada bloqueado.</Empty>
        ) : (
          <Card className="overflow-hidden">
            {s.blocked.map(({ task, blockers }) => (
              <TaskLine key={task.id} t={task} data={data} note={blockerText(blockers)} />
            ))}
          </Card>
        )}
      </Section>

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

      <Section label="Tareas" count={s.tasks.length}>
        <div className="flex flex-col gap-5">
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
          {s.tasks.length === 0 && <Empty>Este proyecto no tiene tareas.</Empty>}
        </div>
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
