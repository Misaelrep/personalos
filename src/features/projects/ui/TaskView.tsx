import { Inline, lit, plainText } from './inline'
import { Label } from '../../../components/ui/Label'
import type { RequirementState } from '../domain/derive'
import { displayRef } from '../domain/ids'
import type { ProjectsData } from '../domain/types'
import {
  APPROVAL_LABEL,
  CONDITION_LABEL,
  dateTime,
  REQUIREMENT_KIND_LABEL,
  REQUIREMENT_STATE_LABEL,
  shortHash,
  STAGE_HINT,
  VERIFICATION_LABEL,
  WORK_CLASS_LABEL,
} from './labels'
import { Card, Chip, Empty, Field, Mono, RowLink, Section, StageChip, Title, TopBar } from './parts'
import { taskHref } from './ProjectView'
import { taskDetail, type Track } from './view'

/** P4a · TAREA: everything known about one task, with where it came from. Read-only. */

const REQ_TONE: Record<RequirementState, 'plain' | 'muted' | 'warn'> = { cumplido: 'muted', pendiente: 'warn', 'por-verificar': 'plain', 'no-cumplido': 'warn' }

/** Executed · verified · approved: three separate facts, never merged. */
function TrackRow({ track }: { track: Track }) {
  const cells = [
    {
      label: 'Ejecutada',
      // «No» only from a class the person decided; an unclassified status is unknown, not «no».
      value: track.executed.state === 'si' ? 'Sí' : track.executed.state === 'sin-decidir' ? 'Sin dato' : 'No',
      on: track.executed.state === 'si',
      note:
        track.executed.state === 'sin-decidir'
          ? `«${plainText(track.executed.literal)}» sin clasificar`
          : `«${plainText(track.executed.literal)}» clasificado como ${WORK_CLASS_LABEL[track.executed.workClass!]}`,
    },
    { label: 'Verificada', value: VERIFICATION_LABEL[track.verified.state], on: track.verified.state === 'verificada', note: track.verified.literal ? `«${track.verified.literal}»` : 'el dossier no lo indica' },
    {
      label: 'Aprobada',
      value: APPROVAL_LABEL[track.approved.state],
      on: track.approved.state === 'aprobada',
      note: track.approved.literal ? `dossier: «${track.approved.literal}»` : 'sin decisión registrada',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="track">
      {cells.map((c) => (
        <div key={c.label} className={`rounded-[16px] border px-3 py-2.5 ${c.on ? 'border-[color-mix(in_srgb,var(--color-electric)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-electric)_7%,transparent)]' : 'border-[var(--line)] bg-[var(--surface-quiet)]'}`}>
          <div className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">{c.label}</div>
          <div className={`mt-1 text-[15px] font-medium ${c.on ? 'text-electric' : 'text-ink'}`}>{c.value}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug break-words text-ink-4">{c.note}</div>
        </div>
      ))}
    </div>
  )
}

export function TaskView({ data, taskId }: { data: ProjectsData; taskId: string }) {
  const d = taskDetail(data, taskId)
  if (!d) {
    return (
      <>
        <TopBar back="#/" backLabel="Proyectos" />
        <Empty>Esta tarea no existe en los datos guardados.</Empty>
      </>
    )
  }
  const { task: t, project } = d
  const back = project ? `#/proyecto/${encodeURIComponent(project.id)}` : '#/'
  const extra = Object.entries(t.extra ?? {})

  return (
    <>
      <TopBar back={back} backLabel={project?.name ?? 'Proyectos'} />
      <Title
        kicker={
          <div className="flex items-center gap-2.5">
            <Label>Tarea</Label>
            <Mono>{displayRef(t) ?? 'sin ID'}</Mono>
          </div>
        }
      >
        <span className="text-[24px]"><Inline text={t.title} /></span>
      </Title>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StageChip stage={d.stage} />
        <span className="text-[13px] text-ink-3">{STAGE_HINT[d.stage]}</span>
        {d.track.approved.returned && <Chip tone="warn">Devuelta</Chip>}
      </div>

      <TrackRow track={d.track} />

      <Section label="Hecho cuando…">
        {t.acceptance.length ? (
          <Card className="px-4 py-3">
            <ul className="flex flex-col gap-1.5 text-[15px] leading-[1.45] text-ink">
              {t.acceptance.map((a, i) => (
                <li key={i}><Inline text={a} /></li>
              ))}
            </ul>
          </Card>
        ) : (
          <Empty>Sin criterio de aceptación.</Empty>
        )}
      </Section>

      <Section label="Requisitos" count={t.requirements?.length ?? 0}>
        {!t.requirements?.length && !t.dependsOn.length ? (
          <Empty>Sin requisitos.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {(t.requirements ?? []).map((r) => {
              const st = d.blockers.requirements.find((x) => x.requirement.id === r.id)
              const state: RequirementState = st?.state ?? 'cumplido'
              return (
                <Card key={r.id} className="px-4 py-3" >
                  <div className="flex items-start justify-between gap-3" data-testid="requirement">
                    <p className="text-[15px] leading-[1.45] text-ink">«<Inline text={r.literal} />»</p>
                    <Chip tone={REQ_TONE[state]}>{REQUIREMENT_STATE_LABEL[state]}</Chip>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    {REQUIREMENT_KIND_LABEL[r.kind]} · {r.mode === 'alguna' ? 'basta una opción' : 'hacen falta todas'}
                    {r.reading && ` · leído como ${r.reading}`}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {r.options.map((o, i) => (
                      <li key={i} className="text-[14px] text-ink-2">
                        {o.kind === 'tarea' ? (
                          data.tasks.some((x) => x.id === o.taskId) ? (
                            <a className="text-electric underline-offset-2 hover:underline" href={`#/tarea/${encodeURIComponent(o.taskId)}`}>
                              {o.taskId.replace(/^src:/, '')}
                            </a>
                          ) : (
                            <span>{o.taskId.replace(/^src:/, '')} · no existe</span>
                          )
                        ) : (
                          <span>
                            <Inline text={o.literal} /> · <span className="text-ink-3">{CONDITION_LABEL[o.state]}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
            {t.dependsOn.length > 0 && (
              <Card className="px-4 py-3 text-[14px] text-ink-2">Depende también de: {t.dependsOn.map((id) => id.replace(/^src:/, '')).join(', ')}</Card>
            )}
          </div>
        )}
      </Section>

      <Section label="Responsable y delegación">
        <Card className="px-4 py-1">
          <Field label="Prioridad" missing="Sin asignar">
            {lit(t.priority)}
          </Field>
          <Field label="Responsable" missing="Sin asignar">
            {t.owner ? `${t.owner.name} · ${t.owner.kind}` : undefined}
          </Field>
          <Field label="Agente posible (dossier)" missing="El dossier no lo indica">
            {lit(t.delegation?.literal)}
          </Field>
          <Field label="Candidatos a delegación" missing="Ninguno decidido">
            {t.delegation?.candidates.length ? t.delegation.candidates.map((c) => c.name).join(', ') : undefined}
          </Field>
          <Field label="Siguiente acción" missing="Sin escribir">
            {lit(t.nextAction)}
          </Field>
        </Card>
      </Section>

      <Section label="Trabajo">
        <Card className="px-4 py-1">
          <Field label="Área">{lit(t.area)}</Field>
          <Field label="Entregable">{lit(t.deliverable)}</Field>
          <Field label="Tiempo humano (literal)">{t.estimate?.literal}</Field>
          {extra.map(([k, v]) => (
            <Field key={k} label={k}>
              {lit(String(v))}
            </Field>
          ))}
        </Card>
      </Section>

      <Section label="Evidencias" count={t.evidence.length}>
        {t.evidence.length === 0 ? (
          <Empty>Ninguna evidencia registrada.</Empty>
        ) : (
          <Card className="px-4 py-1">
            {t.evidence.map((e, i) => (
              <Field key={i} label={`${e.kind} · ${dateTime(e.addedAt)}`}>
                {e.url ? (
                  <a className="text-electric" href={e.url} target="_blank" rel="noreferrer">
                    {e.label}
                  </a>
                ) : (
                  e.label
                )}
              </Field>
            ))}
          </Card>
        )}
      </Section>

      {d.usedBy.length > 0 && (
        <Section label="La esperan" count={d.usedBy.length}>
          <Card className="overflow-hidden">
            {d.usedBy.map((u) => (
              <RowLink key={u.id} href={taskHref(u)}>
                <Mono>{displayRef(u)}</Mono>
                <p className="text-[15px] text-ink"><Inline text={u.title} /></p>
              </RowLink>
            ))}
          </Card>
        </Section>
      )}

      <Section label="Procedencia">
        <details className="surface-quiet rounded-[18px] px-4 py-3 text-[14px] text-ink-2" data-testid="provenance">
          <summary className="cursor-pointer select-none">{t.origin ? `${t.origin.dossier}${t.origin.location ? ` · ${t.origin.location}` : ''}` : 'Creada en ELYUM'}</summary>
          {t.origin && (
            <div className="mt-2">
              <Field label="Fuentes citadas">
                {t.sourceRefs ? (
                  <span className="flex flex-col gap-0.5">
                    <span><Inline text={t.sourceRefs.literal} /></span>
                    {d.sources.map(({ key, source }) => (
                      <span key={key} className="text-[13px] text-ink-3">
                        {key}: {source ? <Inline text={source.title} /> : 'no figura en la lista de fuentes del dossier'}
                      </span>
                    ))}
                  </span>
                ) : undefined}
              </Field>
              <Field label="Fila original">
                {t.origin.raw ? <code className="block overflow-x-auto font-mono text-[12px] leading-[1.5] whitespace-pre text-ink-3">{t.origin.raw}</code> : undefined}
              </Field>
              <Field label="Versión del dossier">{t.origin.dossierVersion}</Field>
              <Field label="Huella del archivo">{t.origin.dossierHash ? <Mono>{shortHash(t.origin.dossierHash)}</Mono> : undefined}</Field>
              <Field label="Importada">{dateTime(t.origin.importedAt)}</Field>
              <Field label="Lector">{t.origin.converter}</Field>
            </div>
          )}
        </details>
      </Section>
    </>
  )
}
