import { Label } from '../../../components/ui/Label'
import type { ProjectsData } from '../domain/types'
import { dateTime, STAGE_LABEL } from './labels'
import { Card, Empty, Section, StageChip, Title } from './parts'
import { overview, type ProjectSummary, type Stage } from './view'

/** P4a · PROYECTOS: every project at a glance. Read-only. */

const SHOWN: Stage[] = ['lista', 'por-verificar', 'bloqueada', 'por-clasificar', 'en-aprobacion']

function StageCounts({ s }: { s: ProjectSummary }) {
  const shown = SHOWN.filter((st) => s.stages[st] > 0)
  if (!shown.length) return <p className="text-[13px] text-ink-3">Sin tareas abiertas</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((st) => (
        <span key={st} className="inline-flex items-center gap-1.5">
          <StageChip stage={st} />
          <span className="tabular -ml-0.5 mr-1 text-[13px] text-ink-2">{s.stages[st]}</span>
        </span>
      ))}
    </div>
  )
}

export function Overview({ data }: { data: ProjectsData }) {
  const { summaries, totals } = overview(data)
  return (
    <>
      <Title kicker={<Label>Proyectos</Label>} sub={summaries.length ? `Ciclo ${data.cycle.start} → ${data.cycle.end}` : undefined}>
        {summaries.length ? `${summaries.length} ${summaries.length === 1 ? 'proyecto' : 'proyectos'}` : 'Aún no hay proyectos'}
      </Title>

      {summaries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {(['lista', 'bloqueada', 'en-aprobacion'] as Stage[]).map((st) => (
            <div key={st} className="surface-quiet rounded-[18px] px-3.5 py-3">
              <div className="tabular font-display text-[24px] leading-none text-ink">{totals[st]}</div>
              <div className="mt-1.5 text-[12px] leading-tight text-ink-3">{STAGE_LABEL[st]}</div>
            </div>
          ))}
        </div>
      )}

      <Section label="Proyectos" count={summaries.length}>
        {summaries.length === 0 ? (
          <Empty>Importa un dossier para empezar. En esta página de prueba, usa solo el dossier sintético.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {summaries.map((s) => (
              <a key={s.project.id} href={`#/proyecto/${encodeURIComponent(s.project.id)}`} data-testid="project-card" className="block active:scale-[0.995] transition-transform">
                <Card className="px-5 py-4.5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-[19px] leading-snug font-medium text-ink">{s.project.name}</h2>
                    <span className="tabular mt-1 shrink-0 text-[13px] text-ink-3">
                      {s.open}/{s.tasks.length} abiertas
                    </span>
                  </div>
                  {s.project.objective && <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.45] text-ink-2">{s.project.objective}</p>}
                  <div className="mt-3.5">
                    <StageCounts s={s} />
                  </div>
                  <p className="mt-3 text-[12px] text-ink-4">
                    {s.candidates.length ? `${s.candidates.length} candidatas a siguiente acción` : 'Ninguna tarea lista todavía'}
                    {s.lastImport && ` · importado ${dateTime(s.lastImport.at)}`}
                  </p>
                </Card>
              </a>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
