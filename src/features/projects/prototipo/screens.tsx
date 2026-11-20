import { useState } from 'react'
import { changeStatus } from '../domain/operations'
import { decideApproval, setCondition, setOwner } from '../domain/ops'
import { displayRef } from '../domain/ids'
import { isClosed } from '../domain/derive'
import { workClassOf } from '../domain/vocabulary'
import type { ProjectsData, Task } from '../domain/types'
import { explain } from '../ui/attention'
import { STAGE_LABEL } from '../ui/labels'
import { byRef, stageOf, trackOf } from '../ui/view'
import { approved, continueHere, decisionsOf, needs, nextInProject, pillarsOf, planned } from './derive'
import { AiTag, Back, Box, H1, Kicker, KindTag, LocalTag, More, Primary, Row, Secondary, Segmented, TextLink, go } from './kit'
import { briefOf } from './contexto'
import { blockOfTask, mapHref, mapPathOf, projectMap, resultsOfTasks, taskNode } from './mapa-modelo'
import { KIND_LABEL, MONTHS, SPRINT, daysUntil, kindOf, monthOf, projectsOfPillar, type Month } from './plan'
import { GrokList } from './wizard'
import { MapIcon } from './iconos'
import { Ilustracion } from './ilustraciones'
import { shortDate, useProto, type Proto } from './store'

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
          En tres momentos: pones al día tus proyectos, editas una propuesta completa de estrategia y la apruebas. La IA propone; nada cuenta hasta que tú lo apruebas.
        </p>
        <div className="mt-6">
          {sp ? (
            <Primary testId="plan-continue" onClick={() => go(`#/plan/${sp.step}`)}>
              Continuar el borrador · momento {sp.step} de 3
            </Primary>
          ) : (
            <Primary testId="plan-start" onClick={() => go('#/plan/1')}>
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
  const startsIn = now.before ? daysUntil(s.today, SPRINT.start) : 0
  // Before the start: what December needs from the person, so the first day is not lost.
  const prep = now.before ? planned(s.data, sp, 'dic').filter((r) => kindOf(r.stage) === 'decision') : []
  return (
    <div data-testid="plan-active">
      <Kicker>Plan de 90 días · {now.before ? `empieza el 1 de diciembre, en ${startsIn} días` : now.after ? 'terminado' : `${MONTHS.find((m) => m.key === now.month)!.label.toLowerCase()}, mes ${MONTHS.findIndex((m) => m.key === now.month) + 1} de 3`}</Kicker>
      {/* 1 · The north star: the one sentence everything answers to. Largest, with its own luminous orb. */}
      <section className="surface relative mt-3 overflow-hidden rounded-[26px] px-4 pt-3.5 pb-4" data-testid="north-star">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[#6d4fd8] uppercase">Estrella polar</p>
        <div className="mt-2.5 flex items-center gap-3.5">
          <div className="pl-hero shrink-0">
            <span className="pl-halo" data-i="1" aria-hidden />
            <span className="pl-halo" data-i="2" aria-hidden />
            <span className="pl-orb pl-orb-hero grid size-[58px] place-items-center text-[#6d4fd8]" aria-hidden>
              <MapIcon name="estrella" className="size-7" />
            </span>
          </div>
          <h1 className="font-display text-[22px] leading-[1.18] font-medium tracking-[-0.02em] text-balance text-ink">{sp.northStar}</h1>
        </div>
      </section>
      {/* The light that runs from the star down to the pillars. */}
      <span aria-hidden className="mx-auto block h-5 w-px bg-[linear-gradient(180deg,rgba(167,139,250,0.9),rgba(58,130,246,0.5))]" />

      {prep.length > 0 ? (
        <Box tone="focus" className="mt-5" testId="before-start">
          <p className="text-[12px] text-ink-3">Antes de empezar</p>
          <p className="mt-1 text-[15px] leading-[1.4] text-ink">
            {prep.length === 1 ? 'Una acción de diciembre necesita' : `${prep.length} acciones de diciembre necesitan`} antes una decisión tuya. Resolverlas ahora deja libre el primer día.
          </p>
          <div className="mt-2">
            {prep.slice(0, 3).map((r) => (
              <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} sub={STAGE_LABEL[r.stage]} />
            ))}
          </div>
          <div className="mt-3">
            <Primary testId="before-start-open" onClick={() => go(`#/tarea/${encodeURIComponent(prep[0].task.id)}`)}>
              Resolver la primera
            </Primary>
          </div>
        </Box>
      ) : (
        here && (
          <Box tone="focus" className="mt-5" testId="continue-here">
            <p className="text-[12px] text-ink-3">{now.before ? 'Lo primero, el 1 de diciembre' : 'Continúa aquí'}</p>
            <p className="mt-1 text-[16px] leading-[1.35] text-ink">{here.task.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
              {here.pillar.name}
              <KindTag kind={kindOf(here.stage)} label={KIND_LABEL[kindOf(here.stage)]} />
            </p>
            <div className="mt-3">
              <Primary testId="continue-open" onClick={() => go(`#/tarea/${encodeURIComponent(here.task.id)}`)}>
                Abrir
              </Primary>
            </div>
          </Box>
        )
      )}

      <div className="mt-6">
        <Segmented
          testId="months"
          value={month}
          onChange={setMonth}
          options={MONTHS.map((m) => ({ value: m.key, label: m.key === now.month && !now.before && !now.after ? <span>{m.label} <span className="text-electric">•</span></span> : m.label }))}
        />
      </div>
      <div className="mt-3 space-y-3" data-testid="month-body">
        {sp.pillars.map((p, pi) => {
          const mine = rows.filter((r) => r.pillar.id === p.id)
          return (
            <section key={p.id} className="surface-quiet rounded-[22px] px-4 pt-3.5 pb-2.5" data-testid="pillar">
              {/* 2 · A pillar: its number, its name, and the projects that feed it. */}
              <div className="flex items-start gap-3">
                <span className="pl-node mt-0.5 grid size-8 shrink-0 place-items-center text-[13px] font-medium text-[#4b5270]" aria-hidden>
                  {pi + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-ink-3 uppercase">Pilar {pi + 1}</p>
                  <h2 className="font-display text-[18px] leading-[1.2] font-medium tracking-[-0.015em] text-ink">{p.name}</h2>
                  <p className="mt-1 text-[12px] leading-[1.6] text-ink-4" data-testid="pillar-projects">
                    Mapa de{' '}
                    {projectsOfPillar(s.data, sp, p.id).map((id, k) => (
                      <span key={id}>
                        {k > 0 && ' · '}
                        <a className="text-electric" href={mapHref(id)}>
                          {s.data.projects.find((x) => x.id === id)?.name}
                        </a>
                      </span>
                    ))}
                  </p>
                </div>
              </div>
              {/* 3 · The monthly result: set apart as a milestone the actions lead to. */}
              <div className="mt-3 rounded-[16px] bg-[linear-gradient(135deg,rgba(var(--pl-lavender),0.4),rgba(var(--pl-blue),0.3)_55%,rgba(var(--pl-pink),0.3))] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(255,255,255,0.6)]" data-testid="month-result">
                <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] text-ink-3 uppercase">
                  <span aria-hidden className="size-1.5 rotate-45 bg-[#8b6fe0]" />
                  Al final de {MONTHS.find((m) => m.key === month)!.label.toLowerCase()}
                </p>
                <p className="mt-0.5 text-[14px] leading-[1.4] text-ink">{p.results[month]}</p>
              </div>
              <div className="mt-1.5">
                {mine.map((r) => {
                  const k = kindOf(r.stage)
                  return <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} done={k === 'terminada'} right={k !== 'terminada' ? <KindTag kind={k} label={KIND_LABEL[k]} /> : undefined} testId="plan-action" />
                })}
                {!mine.length && <p className="py-2 text-[13px] text-[#a86a00]">Sin acciones este mes: falta planificarlo.</p>}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-4">
        <More title="Grok, asesor opcional" testId="grok">
          <GrokList sp={sp} />
        </More>
      </div>
      <p className="mt-6 text-center text-[13px] text-ink-4">
        Aprobado por ti el {shortDate(sp.approvedAt ?? s.today)} · <TextLink href="#/actualizar">Contar qué ha cambiado</TextLink>
      </p>
    </div>
  )
}

const mapSummary = (m: ReturnType<typeof projectMap>) =>
  m.noResults ? `${m.blocks.length} bloques de trabajo · por qué existe cada tarea` : `${m.results.length} resultados clave · ${m.blocks.length} bloques · por qué existe cada tarea`

// ── Mis proyectos ───────────────────────────────────────────────────────────

export function ProjectsView() {
  const { s } = useProto()
  const sp = s.sprint
  const inPlan = s.data.projects.filter((p) => pillarsOf(s.data, sp, p.id).length)
  const outside = s.data.projects.filter((p) => !pillarsOf(s.data, sp, p.id).length)
  const row = (p: (typeof s.data.projects)[number]) => {
    const pillars = pillarsOf(s.data, sp, p.id)
    return (
      <div key={p.id} className="flex items-center gap-2 border-b border-[var(--line)] last:border-b-0 [&>div>a]:border-b-0">
        <div className="min-w-0 flex-1">
      <Row
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
        </div>
        <a href={mapHref(p.id)} aria-label={`Mapa de ${p.name}`} data-testid="project-row-map" className="hit pl-quieto flex shrink-0 flex-col items-center gap-0.5 active:opacity-70">
          <span className="pl-orb grid size-10 place-items-center">
            <Ilustracion project={p.name} className="size-6" />
          </span>
          <span className="text-[10.5px] text-ink-3">Mapa</span>
        </a>
      </div>
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
  const pillars = pillarsOf(s.data, sp, p.id)
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
                <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} done={r.stage === 'cerrada'} right={r.stage !== 'cerrada' ? <KindTag kind={kindOf(r.stage)} label={KIND_LABEL[kindOf(r.stage)]} /> : undefined} />
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
        <Row href={mapHref(p.id)} title="Mapa del proyecto" sub={mapSummary(projectMap(s.data, p.id))} testId="project-map" />
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

/** A concrete question about the work instead of «what does this dossier word mean». Answers set THIS task's status only. */
const WORK_CHOICES: { value: string; label: string }[] = [
  { value: 'Pendiente', label: 'Sin empezar' },
  { value: 'En curso', label: 'Empezado' },
  { value: 'Ejecutada', label: 'Terminado' },
  { value: 'Descartada', label: 'No se hará' },
]

const TRACK_TEXT = {
  executed: { si: 'Hecha', no: 'Todavía no', 'sin-decidir': 'Por aclarar' },
}

/** Free text the AI proposed: tagged, editable, kept only in memory. */
function Editable({ value, onSave, testId }: { value: string; onSave: (v: string) => void; testId: string }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  if (!editing)
    return (
      <p className="mt-0.5 text-[14.5px] leading-[1.45] text-ink" data-testid={testId}>
        {value}{' '}
        <button type="button" data-testid={`${testId}-edit`} onClick={() => { setText(value); setEditing(true) }} className="hit text-[13px] text-electric">
          Editar
        </button>
      </p>
    )
  return (
    <div className="mt-1" data-testid={`${testId}-editor`}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full rounded-xl border border-[var(--line)] bg-transparent p-2 text-[14.5px] leading-[1.45] text-ink" />
      <div className="mt-1 flex gap-4">
        <button type="button" data-testid={`${testId}-save`} onClick={() => { onSave(text.trim() || value); setEditing(false) }} className="hit text-[14px] text-electric">
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="hit text-[14px] text-ink-3">
          Cancelar
        </button>
      </div>
    </div>
  )
}

const Item = ({ k, children, testId }: { k: React.ReactNode; children: React.ReactNode; testId?: string }) => (
  <div className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid={testId}>
    <p className="text-[12px] text-ink-3">{k}</p>
    {children}
  </div>
)
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-0.5 text-[14.5px] leading-[1.5] text-ink">{children}</p>

const TaskLinks = ({ tasks }: { tasks: Task[] }) => (
  <ul className="mt-1 space-y-0.5">
    {tasks.map((w) => (
      <li key={w.id}>
        <TextLink href={`#/tarea/${encodeURIComponent(w.id)}`}>{w.title}</TextLink>
      </li>
    ))}
  </ul>
)

/**
 * The questions a task must answer before starting it, each with its source:
 * the dossier (confirmed), a local calculation, or a simulated AI suggestion
 * that can be edited and never invents people, amounts, times or requirements.
 */
function TaskContext({ t, need, mapLink }: { t: Task; need: string; mapLink?: string }) {
  const { s, set } = useProto()
  const m = projectMap(s.data, t.projectId)
  const block = blockOfTask(m, t.id)
  const results = resultsOfTasks(s.data, [t.id])
  const node = taskNode(s.data, t)
  const note = s.notes[t.id] ?? {}
  const brief = briefOf(s.data, t)
  const track = trackOf(s.data, t)
  const pending = (t.requirements ?? []).flatMap((r) => r.options.filter((o) => o.kind === 'condicion' && o.state !== 'cumplida').map((o) => (o as { literal: string }).literal))
  const estimate = t.estimate?.literal ?? (t.estimateHours ? `${t.estimateHours} h` : undefined)
  const save = (k: keyof Proto['notes'][string]) => (v: string) => set((x) => ({ ...x, notes: { ...x.notes, [t.id]: { ...x.notes[t.id], [k]: v } }, notice: 'Guardado solo en esta demostración.' }))
  const aiTag = (k: keyof Proto['notes'][string]) => (note[k] ? <span className="ml-1.5 text-[11px] text-ink-4">editado por ti</span> : <AiTag />)
  return (
    <div data-testid="task-context">
      <div className="mt-2" data-testid="ctx-do">
        <Editable value={note.hacer ?? brief.hacer} onSave={save('hacer')} testId="hacer" />
        <p className="mt-0.5 text-[11px] text-ink-4">Descripción {note.hacer ? 'editada por ti' : 'sugerida a partir del título'}{!note.hacer && <AiTag />}</p>
      </div>

      {/* Where it sits: the same chain as on the map, small. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="ctx-chain">
        {block && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,255,255,0.7)] px-2.5 py-1 text-ink-2">
            <MapIcon name={block.icon} className="size-3.5" />
            {block.name}
          </span>
        )}
        {results.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 text-ink-2">
            <span aria-hidden className="h-px w-3 bg-[linear-gradient(90deg,#a78bfa,#3a82f6)]" />
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,255,255,0.7)] px-2.5 py-1">
              <MapIcon name={r.icon} className="size-3.5" />
              {r.name}
            </span>
          </span>
        ))}
        {mapLink && (
          <TextLink href={mapLink} testId="task-to-map">
            Ver en el mapa
          </TextLink>
        )}
      </div>

      <Box className="mt-4" testId="task-card">
        <Item k={<>Por qué importa{aiTag('porque')}</>} testId="ctx-why">
          <Editable value={note.porque ?? brief.porque} onSave={save('porque')} testId="porque" />
          {results.length > 0 ? (
            <p className="mt-1 text-[12.5px] leading-[1.4] text-ink-3">Contribuye a {results.map((r) => `«${r.name}»`).join(' y ')}, a través de su bloque.</p>
          ) : (
            <p className="mt-1 text-[12.5px] leading-[1.4] text-ink-3">Este proyecto aún no tiene resultados propuestos: no se inventa a cuál contribuye.</p>
          )}
        </Item>
        <Item k={<>Qué implica{aiTag('implies')}</>} testId="ctx-implies">
          <Editable value={note.implies ?? brief.implica} onSave={save('implies')} testId="implies" />
        </Item>
        <Item k={t.deliverable || t.acceptance.length ? 'Qué debo conseguir · del dossier' : <>Qué debo conseguir{aiTag('deliver')}</>} testId="ctx-deliver">
          {t.deliverable || t.acceptance.length ? (
            <>
              {t.deliverable && <P>{t.deliverable}</P>}
              {t.acceptance.length > 0 && <p className="mt-1 text-[13px] leading-[1.45] text-ink-2">{t.acceptance.join(' · ')}</p>}
            </>
          ) : (
            <Editable value={note.deliver ?? 'El dossier no lo dice. Propuesta: escribe aquí qué quedará hecho cuando la termines.'} onSave={save('deliver')} testId="deliver" />
          )}
        </Item>
        <Item k={<>Qué necesito antes de empezar<LocalTag /></>} testId="ctx-before">
          <P>{need}</P>
          {node.waitsFor.length > 0 && <TaskLinks tasks={node.waitsFor} />}
          {pending.length > 0 && <p className="mt-1 text-[12.5px] leading-[1.4] text-ink-3">Condiciones del dossier sin confirmar: {pending.map((x) => `«${x}»`).join(', ')}.</p>}
        </Item>
        <Item k={<>Qué permite hacer después<LocalTag /></>} testId="ctx-after">
          {node.unlocks.length ? (
            <>
              <P>{node.unlocks.length === 1 ? 'Esta tarea la espera:' : `La esperan ${node.unlocks.length} tareas:`}</P>
              <TaskLinks tasks={node.unlocks} />
              <p className="mt-1 text-[12px] text-ink-4">Podrían avanzar; puede que tengan otros requisitos.</p>
            </>
          ) : (
            <P>Ninguna tarea registrada la espera.</P>
          )}
        </Item>
        {estimate && (
          <Item k="Tiempo estimado · del dossier">
            <P>{estimate}</P>
          </Item>
        )}
      </Box>

      {/* Execution, verification and approval stay three separate things. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11.5px] leading-[1.3]" data-testid="ctx-track">
        {[
          ['Ejecución', TRACK_TEXT.executed[track.executed.state]],
          ['Verificación', track.verified.state === 'sin-dato' ? 'Sin dato' : track.verified.state],
          ['Aprobación', { 'sin-dato': 'Sin decidir', 'no-requiere': 'No requiere', pendiente: 'Pendiente', aprobada: 'Aprobada', devuelta: 'Devuelta' }[track.approved.state]],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-[rgba(255,255,255,0.6)] px-1.5 py-1.5">
            <p className="text-ink-4">{k}</p>
            <p className="mt-0.5 text-ink-2">{v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TaskPage({ id }: { id: string }) {
  const { s, set, ctx } = useProto()
  const t = s.data.tasks.find((x) => x.id === id)
  const [answer, setAnswer] = useState('Pendiente')
  if (!t) return <Muted>Esa tarea no existe en el prototipo.</Muted>
  const p = s.data.projects.find((x) => x.id === t.projectId)!
  const ex = explain(s.data, t)
  const stage = ex.stage
  const wc = workClassOf(s.data, t)
  const need = needs(s.data, t)
  const track = trackOf(s.data, t)
  const apply = (f: (d: ProjectsData) => ProjectsData, notice: string) => set((x) => ({ ...x, data: f(x.data), notice }))
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
  const path = mapPathOf(s.data, t.id)
  const fromMap = s.mapFrom?.endsWith(`/${encodeURIComponent(t.id)}`) ? s.mapFrom : undefined
  const mapLink = path && !fromMap ? mapHref(path.projectId, path.resultId, path.blockId, t.id) : undefined

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
        <p className="mb-2 text-[15px] leading-[1.45] text-ink">¿En qué punto está este trabajo?</p>
        <Segmented value={answer} onChange={setAnswer} options={WORK_CHOICES} />
        <p className="mt-2 text-[12px] leading-[1.4] text-ink-4">En el dossier figura como «{t.status}». Tu respuesta cambia solo esta tarea; el dossier no se toca.</p>
        <div className="mt-3">
          <Primary testId="task-classify-save" onClick={() => apply((d) => changeStatus(d, t.id, answer, ctx()), answer === 'Ejecutada' ? 'Anotada como hecha. Tu visto bueno es aparte.' : 'Anotado.')}>
            Guardar
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
  if (stage === 'en-aprobacion') {
    // Everything needed to judge the work, in one place: what was due, when it counts as done, and the evidence.
    if (t.deliverable) lines.push(['Entregable', t.deliverable])
    if (t.acceptance.length) lines.push(['Queda hecho cuando', t.acceptance.join(' · ')])
    lines.push(['Evidencia', t.evidence.length ? t.evidence.map((e) => e.label).join(' · ') : 'No hay evidencia registrada. Revisa el entregable directamente o devuélvela pidiendo una.'])
    lines.push(['Situación', `Ejecución: hecha · Verificación: ${track.verified.state === 'sin-dato' ? 'sin dato' : track.verified.state} · Aprobación: pendiente de ti`])
  } else if (result) lines.push(['Resultado a entregar', result])
  if (stage !== 'cerrada' && stage !== 'en-aprobacion') lines.push(['Para empezar', stage === 'lista' ? (wc === 'en-curso' ? 'Ya está en curso.' : 'Nada: puedes empezar ya.') : need ?? STAGE_LABEL[stage]])
  if (estimate) lines.push(['Tiempo estimado', estimate])

  return (
    <div data-testid="task">
      {fromMap ? <Back href={fromMap} label="Volver al mapa" /> : <Back href={`#/proyecto/${encodeURIComponent(p.id)}`} label={p.name} />}
      <div className="mt-1">
        {stage !== 'cerrada' && <Kicker>Qué debo hacer</Kicker>}
        <H1>{t.title}</H1>
      </div>
      {mapLink && (stage === 'cerrada' || stage === 'en-aprobacion') && (
        <p className="mt-2">
          <TextLink href={mapLink} testId="task-to-map">
            Ver en el mapa del proyecto
          </TextLink>
        </p>
      )}
      {stage === 'cerrada' && <p className="mt-2 text-[14px] text-ink-3">{wc === 'descartada' ? 'Descartada.' : 'Terminada y aprobada.'}</p>}
      {t.owner?.kind === 'agente' && stage !== 'cerrada' && <p className="mt-2 text-[13.5px] text-electric">Delegada a un agente.</p>}
      {stage !== 'cerrada' && stage !== 'en-aprobacion' ? (
        <TaskContext t={t} mapLink={mapLink} need={stage === 'lista' ? (wc === 'en-curso' ? 'Ya está en curso.' : 'Nada: puedes empezar ya.') : need ?? STAGE_LABEL[stage]} />
      ) : lines.length > 0 && (
        <Box className="mt-4" testId={stage === 'en-aprobacion' ? 'task-review' : 'task-card'}>
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
