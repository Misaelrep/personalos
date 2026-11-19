import type { ReactNode } from 'react'
import { Inline } from './inline'
import { Label } from '../../../components/ui/Label'
import { displayRef } from '../domain/ids'
import type { ProjectsData, Task } from '../domain/types'
import { attention, cycleWeek, situationText, type CheckToMake, type WordToClarify } from './attention'
import { Card, Empty, RowLink, Section, StageChip, Title } from './parts'

/**
 * PROYECTOS · E1: where to put your attention. Read-only.
 * First what needs a decision of yours, then what can be done now, then every
 * project in one line. Each task appears in one block only; the full detail
 * opens on demand. Nothing here is a priority: projects keep their order.
 */

const taskHref = (t: Task) => `#/tarea/${encodeURIComponent(t.id)}`
const projectHref = (id: string) => `#/proyecto/${encodeURIComponent(id)}`
const today = () => new Date().toLocaleDateString('sv-SE')
const tareas = (n: number) => `${n} ${n === 1 ? 'tarea' : 'tareas'}`

/** A block that shows one plain line and opens to the detail. */
function Expand({ title, hint, count, testId, children }: { title: string; hint: string; count: number; testId: string; children: ReactNode }) {
  return (
    <details className="group border-b border-[var(--line)] last:border-b-0" data-testid={testId}>
      <summary className="hit flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 select-none active:bg-[var(--line)] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-ink">{title}</p>
          <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-3">{hint}</p>
        </div>
        <span className="tabular mt-0.5 text-[15px] font-medium text-ink">{count}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-90">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  )
}

/** Groups (words or conditions) under the name of their project. Each row opens the first task that has it. */
function ByProject<G extends WordToClarify | CheckToMake>({ groups, line }: { groups: G[]; line: (g: G) => ReactNode }) {
  const projects = [...new Set(groups.map((g) => g.project))]
  return (
    <div className="flex flex-col">
      {projects.map((p) => (
        <div key={p.id}>
          <p className="px-4 pt-2 pb-1 text-[12px] tracking-[0.04em] text-ink-3"><Inline text={p.name} /></p>
          {groups
            .filter((g) => g.project === p)
            .map((g) => (
              <RowLink key={g.literal} href={taskHref(g.tasks[0])} testId="attention-item">
                {line(g)}
              </RowLink>
            ))}
        </div>
      ))}
    </div>
  )
}

export function Overview({ data, embedded = false }: { data: ProjectsData; embedded?: boolean }) {
  const a = attention(data)
  const week = cycleWeek(data.cycle, today())
  const words = a.words.reduce((n, w) => n + w.tasks.length, 0)
  const checks = new Set(a.checks.flatMap((c) => c.tasks.map((t) => t.id))).size
  const readyIds = new Set(a.ready.map((r) => r.task.id))
  const unlockers = a.unlockers.filter((u) => !readyIds.has(u.task.id))
  const waitingFor = new Map(a.unlockers.map((u) => [u.task.id, u.waiters.length]))
  const decide = words + checks + a.approvals.length

  return (
    <>
      <Title
        kicker={<Label>Proyectos</Label>}
        sub={a.projects.length ? `${a.projects.length} ${a.projects.length === 1 ? 'proyecto' : 'proyectos'}${week ? ` · semana ${week.week} de ${week.of} del ciclo` : ''}` : undefined}
      >
        {a.projects.length ? 'Dónde poner tu atención' : 'Aún no hay proyectos'}
      </Title>

      {a.projects.length === 0 ? (
        <Empty>{embedded ? 'Crea un proyecto o importa un dossier para empezar.' : 'Importa un dossier para empezar. En esta página de prueba, usa solo el dossier sintético.'}</Empty>
      ) : (
        <>
          <Section label="Necesita tu decisión">
            {decide === 0 ? (
              <Empty>Nada espera una decisión tuya ahora.</Empty>
            ) : (
              <Card className="overflow-hidden" testId="attention-decide">
                {a.approvals.length > 0 && (
                  <Expand title="Espera tu visto bueno" hint="Están hechas; falta que las apruebes o las devuelvas." count={a.approvals.length} testId="attention-approvals">
                    {a.approvals.map((t) => (
                      <RowLink key={t.id} href={taskHref(t)} testId="attention-item">
                        <p className="text-[15px] leading-[1.4] text-ink"><Inline text={t.title} /></p>
                        <p className="mt-0.5 text-[12.5px] text-ink-3">{displayRef(t) ?? 'sin ID'}</p>
                      </RowLink>
                    ))}
                  </Expand>
                )}
                {words > 0 && (
                  <Expand
                    title="Estado por aclarar"
                    hint={`El dossier usa ${a.words.length === 1 ? 'una palabra' : `${a.words.length} palabras`} que todavía no has aclarado. Aclarar una vale para todas las tareas del proyecto que la usan.`}
                    count={words}
                    testId="attention-words"
                  >
                    <ByProject
                      groups={a.words}
                      line={(w) => (
                        <p className="text-[15px] leading-[1.4] text-ink">
                          «<Inline text={w.literal} />» <span className="text-[13px] text-ink-3">· {tareas(w.tasks.length)}</span>
                        </p>
                      )}
                    />
                  </Expand>
                )}
                {checks > 0 && (
                  <Expand title="Falta comprobar algo" hint="El dossier pide algo que nadie ha confirmado: un acceso, un dato, un material." count={checks} testId="attention-checks">
                    <ByProject
                      groups={a.checks}
                      line={(c) => (
                        <p className="text-[15px] leading-[1.4] text-ink">
                          «<Inline text={c.literal} />» <span className="text-[13px] text-ink-3">· {tareas(c.tasks.length)}</span>
                        </p>
                      )}
                    />
                  </Expand>
                )}
              </Card>
            )}
          </Section>

          <Section label="Se puede hacer ya" count={a.ready.length}>
            {a.ready.length === 0 ? (
              <Empty>Ninguna tarea se puede hacer todavía. Lo que lo impide está arriba, en «Necesita tu decisión», y en cada proyecto.</Empty>
            ) : (
              <Card className="overflow-hidden" testId="attention-ready">
                {a.ready.map(({ task: t, project }) => (
                  <RowLink key={t.id} href={taskHref(t)} testId="attention-item">
                    <p className="text-[15px] leading-[1.4] text-ink"><Inline text={t.title} /></p>
                    <p className="mt-0.5 text-[12.5px] leading-[1.45] text-ink-3">
                      <Inline text={project.name} />
                      {t.estimate?.literal && ` · ${t.estimate.literal}`}
                      {waitingFor.get(t.id) && ` · ${tareas(waitingFor.get(t.id)!)} esperan por ella`}
                    </p>
                  </RowLink>
                ))}
              </Card>
            )}
          </Section>

          <Section label="Tus proyectos" count={a.projects.length}>
            <Card className="overflow-hidden">
              {a.projects.map((p) => (
                <RowLink key={p.project.id} href={projectHref(p.project.id)} testId="project-card">
                  <p className="font-display text-[17px] leading-snug font-medium text-ink"><Inline text={p.project.name} /></p>
                  <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-3">{situationText(p)}</p>
                </RowLink>
              ))}
            </Card>
            {a.counts.bloqueada > 0 && (
              <p className="mt-2 px-1 text-[13px] leading-[1.45] text-ink-3">
                {a.counts.bloqueada === 1 ? '1 tarea no puede avanzar todavía' : `${a.counts.bloqueada} tareas no pueden avanzar todavía`}. Al abrir cada proyecto verás por qué.
              </p>
            )}
          </Section>

          {unlockers.length > 0 && (
            <section className="mt-8">
              <details className="surface-quiet rounded-[18px]" data-testid="attention-unlock">
                <summary className="hit flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 select-none [&::-webkit-details-marker]:hidden">
                  <span className="text-[14px] text-ink-2">Lo que podría desbloquear más trabajo</span>
                  <span className="text-[13px] text-electric">Ver</span>
                </summary>
                <p className="px-4 pb-2 text-[13px] leading-[1.5] text-ink-3">
                  Tareas por las que esperan directamente varias tareas abiertas. No es una prioridad: eso lo decides tú. Resolver una no garantiza que las que esperan queden listas, porque pueden tener otros requisitos.
                </p>
                <div className="border-t border-[var(--line)]">
                  {unlockers.map((u) => (
                    <RowLink key={u.task.id} href={taskHref(u.task)} testId="attention-item">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] leading-[1.4] text-ink"><Inline text={u.task.title} /></p>
                          <p className="mt-0.5 text-[12.5px] text-ink-3">
                            <Inline text={u.project.name} /> · {tareas(u.waiters.length)} esperan por ella
                          </p>
                        </div>
                        <StageChip stage={u.stage} />
                      </div>
                    </RowLink>
                  ))}
                </div>
              </details>
            </section>
          )}
        </>
      )}
    </>
  )
}
