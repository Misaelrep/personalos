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
import { approved, decisionsOf, focusNow, needs, nextInProject, pillarsOf, planned, type Focus } from './derive'
import { AiTag, Back, Box, H1, Kicker, KindTag, LocalTag, More, Primary, Row, Secondary, Segmented, TextLink, go } from './kit'
import { briefOf } from './contexto'
import { blockOfTask, mapHref, mapPathOf, projectMap, resultsOfTasks, taskNode } from './mapa-modelo'
import { KIND_LABEL, MONTHS, SPRINT, daysUntil, kindOf, monthOf, projectsOfPillar, type Month } from './plan'
import { GrokList, SCENES, Timeline, sceneHref } from './sprint'
import { Orb } from './orbe'
import { MapIcon } from './iconos'
import { Ilustracion } from './ilustraciones'
import { shortDate, useProto, type Proto } from './store'
import { GAP, Sequence, useReveal } from './aparicion'

/** PROTOTYPE · The screens. Each has one primary action; the rest is a link or closed until opened. */

const Section = ({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) => (
  <section className="mt-6" data-testid={testId}>
    <h2 className="mb-2 text-[15px] font-medium text-ink-3">{title}</h2>
    {children}
  </section>
)

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[16px] leading-[1.45] text-ink-3">{children}</p>

// ── Plan de 90 días ─────────────────────────────────────────────────────────

export function PlanView() {
  const { s } = useProto()
  const sp = s.sprint
  if (!approved(sp)) return <SprintInvite />
  // In order of importance: north star → this month's result → the next action; pillars and the full plan one tap away.
  return (
    <Sequence id="plan" length={0.9}>
      <ActivePlan key={s.today} />
    </Sequence>
  )
}

/** Without an approved sprint: one question and one orb. Updating the projects is not a first step: it lives in «Mis proyectos» and the maps. */
function SprintInvite() {
  const { s } = useProto()
  const draft = s.sprint && s.sprint.status !== 'aprobado' ? s.boceto : null
  return (
    <Sequence id="invitacion" length={0.7}>
      <Invite draft={draft} />
    </Sequence>
  )
}

function Invite({ draft }: { draft: Proto['boceto'] | null }) {
  const reveal = useReveal()
  return (
    <div data-testid="plan-empty">
      <div {...reveal(0)}>
        <Kicker>Plan de 90 días · 1 dic – 28 feb</Kicker>
      </div>
      <div {...reveal(0.08, 'mt-3')}>
        <H1>¿Qué quieres hacer posible durante los próximos 90 días?</H1>
      </div>
      <p {...reveal(0.2, 'mt-3 text-[17px] leading-[1.5] text-ink-2')}>Lo diseñamos paso a paso, una decisión cada vez. Nada cuenta hasta que lo apruebes.</p>
      <div {...reveal(0.3, 'mt-8')}>
        {draft ? (
          <Orb testId="plan-continue" size={104} label="Continuar mi sprint" hint={`Ibas por: ${SCENES[draft.scene - 1]}`} onPress={() => go(sceneHref(draft.scene))} />
        ) : (
          <Orb testId="plan-start" size={104} label="Diseñar mi sprint" onPress={() => go(sceneHref(1))} />
        )}
      </div>
    </div>
  )
}

/** The month chosen in «Resultados del mes», kept while the prototype is open: coming back from an action finds it. */
let exploreMonth: Month | null = null

const FOCUS_HEAD: Record<Focus['kind'], string> = {
  hacer: 'Qué necesitas hacer',
  'visto-bueno': 'Qué necesitas decidir',
  decidir: 'Qué necesitas decidir',
  preparar: 'Qué puedes decidir ya',
  esperar: 'Qué falta resolver primero',
  empieza: 'Lo primero, el 1 de diciembre',
  nada: 'Nada pendiente',
}
const FOCUS_ORB: Record<Focus['kind'], string> = {
  hacer: 'Abrir esta acción',
  'visto-bueno': 'Dar mi visto bueno',
  decidir: 'Tomar esta decisión',
  preparar: 'Tomar esta decisión',
  esperar: 'Ver qué espera',
  empieza: 'Ver esta acción',
  nada: 'Ver el plan completo',
}

function ActivePlan() {
  const { s, set } = useProto()
  const sp = s.sprint!
  const now = monthOf(s.today)
  const current = MONTHS.find((m) => m.key === now.month)!
  const [month, setMonthState] = useState<Month>(() => exploreMonth ?? now.month)
  const setMonth = (m: Month) => {
    exploreMonth = m
    setMonthState(m)
  }
  const [starOpen, setStarOpen] = useState(false)
  const [reopen, setReopen] = useState(false)
  const focus = focusNow(s.data, sp, s.today)
  const startsIn = now.before ? daysUntil(s.today, SPRINT.start) : 0
  const reveal = useReveal()
  const pillarIndex = (id: string) => sp.pillars.findIndex((p) => p.id === id)
  const actions = (key: Month, pillarId: string) => planned(s.data, sp, key).filter((r) => r.pillar.id === pillarId)
  const actionRows = (key: Month, pillarId: string) => {
    const mine = actions(key, pillarId)
    return mine.length ? (
      mine.map((r) => {
        const k = kindOf(r.stage)
        return <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} done={k === 'terminada'} sub={k !== 'terminada' ? <KindTag kind={k} label={KIND_LABEL[k]} /> : undefined} testId="plan-action" />
      })
    ) : (
      <p className="py-2 text-[16px] text-[#5f3a00]">Sin acciones este mes: falta planificarlo.</p>
    )
  }
  const it = focus.item
  const missing = it && focus.kind !== 'hacer' ? needs(s.data, it.task) : undefined
  return (
    <div data-testid="plan-active" className="flex flex-col">
      <div {...reveal(0)}>
        <Kicker>{now.before ? `Empieza el 1 de diciembre, en ${startsIn} días` : now.after ? 'Plan terminado' : `${current.label}, mes ${MONTHS.indexOf(current) + 1} de 3`}</Kicker>
      </div>

      {/* The north star, always at hand but compact: one tap shows it whole. */}
      <button type="button" aria-expanded={starOpen} onClick={() => setStarOpen(!starOpen)} {...reveal(0.04, 'hit surface-quiet mt-3 flex w-full items-start gap-3 rounded-[20px] px-3 py-2.5 text-left')} data-testid="north-star">
        <span className="pl-orb pl-orb-hero mt-0.5 grid size-8 shrink-0 place-items-center text-[#5634c4]" aria-hidden>
          <MapIcon name="estrella" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-[#5634c4]">Estrella polar</span>
          <span className={`text-[16px] leading-[1.45] text-ink ${starOpen ? 'block' : 'line-clamp-2'}`} data-testid="north-star-text">
            {sp.northStar}
          </span>
        </span>
      </button>

      {/* A · Este mes: the result being sought, in brief. */}
      <section {...reveal(0.12, 'mt-5')} data-testid="this-month">
        <h2 className="text-[15px] font-medium text-ink-3">{now.before ? 'Para diciembre' : `Este mes · ${current.label}`}</h2>
        <ol className="mt-1">
          {sp.pillars.map((p, pi) => (
            <li key={p.id} className="flex items-start gap-2.5 py-0.5" data-testid="this-month-result">
              <span className="pl-node mt-0.5 grid size-6 shrink-0 place-items-center text-[14px] font-semibold text-[#2c3350]" aria-label={`Pilar ${pi + 1}`}>
                {pi + 1}
              </span>
              <span className="text-[17px] leading-[1.4] text-ink">{p.results[now.month]}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* B · Continúa aquí: one action or decision, why it matters, what is missing, and the rule that chose it. */}
      <section {...reveal(0.24, 'surface mt-4 rounded-[24px] px-4 pt-4 pb-3 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-electric)_28%,transparent),0_24px_46px_-24px_rgba(58,130,246,0.4)]')} data-testid="continue-here" data-kind={focus.kind}>
        <h2 className="text-[15px] font-medium text-ink-3">
          Continúa aquí{it && <span className="font-normal"> · {FOCUS_HEAD[focus.kind].toLowerCase()}</span>}
        </h2>
        {it ? (
          <>
            <p className="mt-1 text-[20px] leading-[1.35] font-medium text-ink" data-testid="continue-title">
              {it.task.title} <KindTag kind={kindOf(it.stage)} label={KIND_LABEL[kindOf(it.stage)]} />
            </p>
            <dl className="mt-2 text-[16px] leading-[1.45]">
              <div data-testid="continue-why">
                <dt className="inline font-medium text-ink-3">Por qué importa: </dt>
                <dd className="inline text-ink">
                  acerca «{it.pillar.results[focus.month]}» (pilar {pillarIndex(it.pillar.id) + 1}).
                </dd>
              </div>
              {focus.kind !== 'hacer' && (
                <div className="mt-1" data-testid="continue-missing">
                  <dt className="inline font-medium text-ink-3">Qué falta: </dt>
                  <dd className="inline text-ink">{focus.kind === 'empieza' ? `que empiece el sprint.${missing ? ` ${missing}` : ''}` : (missing ?? 'nada más.')}</dd>
                </div>
              )}
            </dl>
            <div className="mt-2">
              <Orb testId="continue-open" label={FOCUS_ORB[focus.kind]} onPress={() => go(`#/tarea/${encodeURIComponent(it.task.id)}`)} />
            </div>
            <p className="mt-1 text-[14px] leading-[1.45] text-ink-3" data-testid="continue-rule">
              Por qué esta: {focus.rule.charAt(0).toLowerCase() + focus.rule.slice(1)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[17px] leading-[1.45] text-ink" data-testid="continue-rule">
            {focus.rule}
          </p>
        )}
      </section>

      {/* C · Explorar: everything else, one tap away and closed until asked for. */}
      <section {...reveal(0.36, 'mt-6')} data-testid="explore">
        <h2 className="text-[15px] font-medium text-ink-3">Explorar</h2>
        <More id="plan:resultados" testId="explore-results" title="Resultados del mes" hint="Elige un mes y abre un resultado">
          <Timeline month={month} onPick={setMonth} testId="plan-months" />
          <div className="mt-2" data-testid="month-body">
            {sp.pillars.map((p, pi) => (
              <More
                key={`${month}-${p.id}`}
                id={`plan:mes:${month}:${p.id}`}
                testId="month-result-item"
                lead={
                  <span className="pl-node grid size-8 shrink-0 place-items-center self-start text-[15px] font-medium text-[#3e4560]" aria-label={`Pilar ${pi + 1}`}>
                    {pi + 1}
                  </span>
                }
                title={<span className="block text-[19px] leading-[1.35] font-normal">{p.results[month]}</span>}
              >
                <p className="text-[15px] text-ink-3">
                  {p.name} · {actions(month, p.id).length === 1 ? '1 acción' : `${actions(month, p.id).length} acciones`}
                </p>
                {actionRows(month, p.id)}
              </More>
            ))}
          </div>
        </More>
        <More id="plan:pilares" testId="pillars" title="Mis tres pilares" hint="Su resultado en cada mes y sus mapas">
          {sp.pillars.map((p, pi) => (
            <div key={p.id} className="flex items-start gap-3 border-b border-[var(--line)] py-3 last:border-b-0" data-testid="pillar">
              <span className="pl-node grid size-8 shrink-0 place-items-center text-[15px] font-medium text-[#3e4560]" aria-hidden>
                {pi + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[19px] leading-[1.3] font-medium text-ink">{p.name}</h3>
                {s.boceto.purposes[p.id] && <p className="mt-1 text-[16px] leading-[1.45] text-ink-2">{s.boceto.purposes[p.id]}</p>}
                <ul className="mt-1">
                  {MONTHS.map((m) => (
                    <li key={m.key} className="text-[16px] leading-[1.5] text-ink-2">
                      <span className="text-ink-3">{m.short} · </span>
                      {p.results[m.key]}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[16px] leading-[1.6] text-ink-3" data-testid="pillar-projects">
                  Mapa de{' '}
                  {projectsOfPillar(s.data, sp, p.id).map((id, k) => (
                    <span key={id}>
                      {k > 0 && ' · '}
                      <a className="hit text-electric underline decoration-[color-mix(in_srgb,var(--color-electric)_35%,transparent)] underline-offset-4" href={mapHref(id)}>
                        {s.data.projects.find((x) => x.id === id)?.name}
                      </a>
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ))}
        </More>
        <More id="plan:completo" testId="plan-full" title="Plan completo" hint="Las acciones de los tres meses">
          {MONTHS.map((m) => {
            const all = planned(s.data, sp, m.key)
            return (
              <div key={m.key} className="mt-4 first:mt-0" data-testid="full-month">
                <p className="pl-title text-[19px] text-ink">
                  {m.label} <span className="text-[15px] font-normal text-ink-3">· {all.length === 1 ? '1 acción' : `${all.length} acciones`}</span>
                </p>
                {sp.pillars.map((p, pi) => (
                  <div key={p.id} className="mt-2 border-l-2 border-[var(--line)] pl-3" data-testid="full-pillar">
                    <p className="text-[15px] font-medium text-ink-3">
                      Pilar {pi + 1} · {p.name}
                    </p>
                    <p className="text-[17px] leading-[1.4] text-ink" data-testid="full-result">
                      {p.results[m.key]}
                    </p>
                    {actionRows(m.key, p.id)}
                  </div>
                ))}
              </div>
            )
          })}
        </More>
        <More id="plan:ajustar" testId="adjust" title="Ajustar estrategia" hint="Contar cambios, revisar el plan u opinión de Grok">
          <p className="text-[16px] leading-[1.5] text-ink-2">Aprobado por ti el {shortDate(sp.approvedAt ?? s.today)}.</p>
          <div className="mt-2">
            <TextLink href="#/actualizar" testId="adjust-update">
              Contar qué ha cambiado
            </TextLink>
          </div>
          <div className="mt-3" data-testid="adjust-reopen">
            {!reopen ? (
              <Secondary testId="adjust-reopen-start" onClick={() => setReopen(true)}>
                Revisar la estrategia
              </Secondary>
            ) : (
              <div className="surface rounded-[18px] px-3 py-3">
                <p className="text-[16px] leading-[1.45] text-ink">El sprint volverá a ser un borrador hasta que lo apruebes otra vez. Se conservan tu estrella polar, tus pilares y tus acciones.</p>
                <div className="mt-2 flex flex-col gap-2">
                  <Primary
                    testId="adjust-reopen-confirm"
                    onClick={() => {
                      set((st) => ({ ...st, sprint: { ...sp, status: 'borrador', approvedAt: undefined }, boceto: { ...st.boceto, scene: 4, reached: 5, hoursOk: true, month: now.month }, notice: 'El sprint vuelve a ser un borrador.' }))
                      go(sceneHref(4))
                    }}
                  >
                    Sí, revisarla
                  </Primary>
                  <Secondary onClick={() => setReopen(false)}>Todavía no</Secondary>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4">
            <GrokList sp={sp} />
          </div>
        </More>
      </section>
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
  // Compact: the name and what the project is for, and its map one tap away.
  const row = (p: (typeof s.data.projects)[number]) => (
    <div key={p.id} className="flex items-center gap-2 border-b border-[var(--line)] last:border-b-0 [&>div>a]:border-b-0">
      <div className="min-w-0 flex-1">
        <Row big href={`#/proyecto/${encodeURIComponent(p.id)}`} title={p.name} testId="project-row" sub={<span className="line-clamp-2">{p.objective ?? 'Propósito por definir'}</span>} />
      </div>
      <a href={mapHref(p.id)} aria-label={`Mapa de ${p.name}`} data-testid="project-row-map" className="hit pl-quieto flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-1 active:opacity-70">
        <span className="pl-orb grid size-11 place-items-center">
          <Ilustracion project={p.name} className="size-7" />
        </span>
        <span className="text-[14px] text-ink-3">Mapa</span>
      </a>
    </div>
  )
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
          Actualizar información
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
  const monthName = MONTHS.find((m) => m.key === month)!.label.toLowerCase()
  const monthActions = thisMonth.filter((r) => r.task.id !== next?.id)
  return (
    <div data-testid="project">
      <Back href="#/proyectos" label="Mis proyectos" />
      <div className="mt-1">
        <H1>{p.name}</H1>
      </div>

      <section className="mt-4" data-testid="project-goal">
        <h2 className="text-[15px] font-medium text-ink-3">Qué buscamos conseguir</h2>
        <p className="mt-1 text-[22px] leading-[1.35] text-ink">{p.objective ?? 'Objetivo por definir'}</p>
        {pillars.length > 0 && <p className="mt-1.5 text-[16px] text-ink-3">Aporta a «{pillars.map((x) => x.name).join('» y «')}»</p>}
      </section>

      {next && (
        <Box tone="focus" className="mt-5" testId="project-next">
          <p className="text-[15px] font-medium text-ink-3">Siguiente acción</p>
          <p className="mt-1 text-[20px] leading-[1.3] text-ink">{next.title}</p>
          {stageOf(s.data, next) !== 'lista' && <p className="mt-1 text-[16px] text-ink-3">Antes: {STAGE_LABEL[stageOf(s.data, next)].toLowerCase()}</p>}
          <div className="mt-3">
            <Primary onClick={() => go(`#/tarea/${encodeURIComponent(next.id)}`)}>Abrir</Primary>
          </div>
        </Box>
      )}

      {decisions.length > 0 && (
        <Section title="Necesita tu decisión" testId="project-decisions">
          {decisions.slice(0, 2).map((d) => (
            <Row key={d.text} href={`#/tarea/${encodeURIComponent(d.task.id)}`} title={d.text} />
          ))}
          {decisions.length > 2 && <p className="pt-1 text-[15px] text-ink-3">Y {decisions.length - 2} más, en «Todas las tareas».</p>}
        </Section>
      )}

      <div className="mt-6" data-testid="project-month">
        <Row href={mapHref(p.id)} title="Mapa del proyecto" sub={mapSummary(projectMap(s.data, p.id))} testId="project-map" />
        <More
          id={`proyecto:${p.id}:mes`}
          title={`Este mes${approved(sp) ? ` · ${monthName}` : ''}`}
          hint={pillars.length > 0 ? `${pillars.length === 1 ? 'Su resultado' : 'Sus resultados'} y ${monthActions.length === 1 ? '1 acción más' : `${monthActions.length} acciones más`}` : !approved(sp) ? 'Se decide al aprobar el plan de 90 días' : 'No participa en el plan de este trimestre'}
          testId="project-month-more"
        >
          {pillars.length > 0 ? (
            <>
              {pillars.map((x) => (
                <p key={x.id} className="text-[18px] leading-[1.45] text-ink">
                  <span className="text-ink-3">Al final del mes: </span>
                  {x.results[month]}
                </p>
              ))}
              {/* The next action has its own card above: listed once. */}
              {monthActions.map((r) => (
                <Row key={r.action.id} href={`#/tarea/${encodeURIComponent(r.task.id)}`} title={r.task.title} done={r.stage === 'cerrada'} sub={r.stage !== 'cerrada' ? <KindTag kind={kindOf(r.stage)} label={KIND_LABEL[kindOf(r.stage)]} /> : undefined} />
              ))}
            </>
          ) : (
            <Muted>{!approved(sp) ? 'Se decide al aprobar el plan de 90 días.' : 'No participa en el plan de este trimestre.'}</Muted>
          )}
        </More>
        <More id={`proyecto:${p.id}:todas`} title="Todas las tareas" count={tasks.length} testId="project-all">
          {tasks.map((t) => {
            const st = stageOf(s.data, t)
            return <Row key={t.id} href={`#/tarea/${encodeURIComponent(t.id)}`} title={t.title} done={st === 'cerrada'} sub={STAGE_LABEL[st]} />
          })}
        </More>
        {blocked.length > 0 && (
          <More id={`proyecto:${p.id}:bloqueos`} title="Bloqueos y dependencias" count={blocked.length} testId="project-blocked">
            {blocked.map((t) => (
              <Row key={t.id} href={`#/tarea/${encodeURIComponent(t.id)}`} title={t.title} sub={needs(s.data, t)} />
            ))}
          </More>
        )}
        <More id={`proyecto:${p.id}:docs`} title="Documentación original" testId="project-source">
          <p className="text-[16px] leading-[1.5] text-ink-2">
            Dossier «{p.dossier}»{imp ? `, importado el ${shortDate(imp.at)}` : ''}. Se conserva tal cual: los títulos, estados e IDs originales siguen en cada tarea, en «Documentación y seguimiento».
          </p>
        </More>
        <More id={`proyecto:${p.id}:historial`} title="Historial" count={history.length} testId="project-history">
          {history.length ? (
            history.map((h, i) => (
              <p key={i} className="py-1 text-[15px] leading-[1.45] text-ink-3">
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
      <p className="mt-1 text-[17px] leading-[1.5] text-ink" data-testid={testId}>
        {value}{' '}
        <button type="button" data-testid={`${testId}-edit`} onClick={() => { setText(value); setEditing(true) }} className="hit text-[15px] text-electric">
          Editar
        </button>
      </p>
    )
  return (
    <div className="mt-1" data-testid={`${testId}-editor`}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full rounded-xl border border-[var(--line)] bg-transparent p-2 text-[16px] leading-[1.45] text-ink" />
      <div className="mt-1 flex gap-4">
        <button type="button" data-testid={`${testId}-save`} onClick={() => { onSave(text.trim() || value); setEditing(false) }} className="hit text-[16px] text-electric">
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="hit text-[16px] text-ink-3">
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** One question of the ficha, always visible: a clear label, then the answer. */
function Item({ k, children, testId, at = 0 }: { k: React.ReactNode; children: React.ReactNode; testId?: string; at?: number }) {
  const reveal = useReveal()
  return (
    <div {...reveal(at, 'border-b border-[var(--line)] py-4 first:pt-1 last:border-b-0')} data-testid={testId}>
      <h2 className="text-[15px] font-medium text-ink-3">{k}</h2>
      {children}
    </div>
  )
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-[17px] leading-[1.5] text-ink">{children}</p>
const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-1.5 text-[15px] leading-[1.45] text-ink-3">{children}</p>

const TaskLinks = ({ tasks }: { tasks: Task[] }) => (
  <ul className="mt-1 space-y-1">
    {tasks.map((w) => (
      <li key={w.id}>
        <TextLink href={`#/tarea/${encodeURIComponent(w.id)}`}>{w.title}</TextLink>
      </li>
    ))}
  </ul>
)

/** «Queda hecho cuando …», without repeating the words when the dossier already starts with them. */
const doneWhen = (a: string[]) => {
  const text = a.join(' · ')
  return /^queda hecho/i.test(text) ? text : `Queda hecho cuando: ${text}`
}

const APPROVAL_TEXT = { 'sin-dato': 'Sin decidir', 'no-requiere': 'No requiere', pendiente: 'Pendiente de ti', aprobada: 'Aprobada', devuelta: 'Devuelta' } as const

/**
 * The ficha: what to do, why it matters, what it delivers and what stops it, then the action.
 * Everything else (what it implies, what comes before and after, documentation) is one tap away.
 * Each answer keeps its source: the dossier, a local calculation, or a simulated AI suggestion.
 */
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
  const estimate = t.estimate?.literal ?? (t.estimateHours ? `${t.estimateHours} h` : undefined)
  const path = mapPathOf(s.data, t.id)
  const fromMap = s.mapFrom?.endsWith(`/${encodeURIComponent(t.id)}`) ? s.mapFrom : undefined
  const mapLink = path && !fromMap ? mapHref(path.projectId, path.resultId, path.blockId, t.id) : undefined
  const m = projectMap(s.data, t.projectId)
  const results = resultsOfTasks(s.data, [t.id])
  const node = taskNode(s.data, t)
  const note = s.notes[t.id] ?? {}
  const brief = briefOf(s.data, t)
  const pending = (t.requirements ?? []).flatMap((r) => r.options.filter((o) => o.kind === 'condicion' && o.state !== 'cumplida').map((o) => (o as { literal: string }).literal))
  const save = (k: keyof Proto['notes'][string]) => (v: string) => set((x) => ({ ...x, notes: { ...x.notes, [t.id]: { ...x.notes[t.id], [k]: v } }, notice: 'Guardado solo en esta demostración.' }))
  const aiTag = (k: keyof Proto['notes'][string]) => (note[k] ? <span className="ml-1.5 text-[14px] font-normal text-ink-3">editado por ti</span> : <AiTag />)
  const open = stage !== 'cerrada' && stage !== 'en-aprobacion'
  const stops = open && stage !== 'lista' ? need ?? STAGE_LABEL[stage] : undefined
  void blockOfTask(m, t.id)

  // Once marked done, bring the deliverable and its evidence into view: they come before the approval.
  const showReview = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.querySelector('[data-testid=task-review]')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
      ),
    )

  let action: React.ReactNode = null
  if (stage === 'lista') {
    action =
      wc === 'en-curso' ? (
        <Primary
          testId="task-done"
          onClick={() => {
            apply((d) => changeStatus(d, t.id, 'Ejecutada', ctx()), 'Marcada como hecha. Ahora espera tu visto bueno.')
            showReview()
          }}
        >
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
        <p className="mb-2 text-[17px] leading-[1.45] text-ink">¿En qué punto está este trabajo?</p>
        <Segmented value={answer} onChange={setAnswer} options={WORK_CHOICES} />
        <p className="mt-2 text-[15px] leading-[1.45] text-ink-3">En el dossier figura como «{t.status}». Tu respuesta cambia solo esta tarea; el dossier no se toca.</p>
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
        <p className="mb-2 text-[17px] leading-[1.45] text-ink">¿Se cumple «{firstCheck.literal}»?</p>
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

  // Revealed in the order it has to be read; the action is on screen in under a second.
  const at = (i: number) => 0.1 + i * GAP
  const contributes = results.length > 0 ? `Contribuye a ${results.map((r) => `«${r.name}»`).join(' y ')}, a través de su bloque.` : 'Este proyecto aún no tiene resultados propuestos: no se inventa a cuál contribuye.'

  return (
    <div data-testid="task">
      <Sequence id={`ficha:${t.id}`} length={1}>
        {fromMap ? <Back href={fromMap} label="Volver al mapa" /> : <Back href={`#/proyecto/${encodeURIComponent(p.id)}`} label={p.name} />}
        <TaskTitle kicker={stage !== 'cerrada'} title={t.title} />
        {stage === 'cerrada' && <p className="mt-2 text-[17px] text-ink-3">{wc === 'descartada' ? 'Descartada.' : 'Terminada y aprobada.'}</p>}
        {t.owner?.kind === 'agente' && stage !== 'cerrada' && <p className="mt-2 text-[16px] text-electric">Delegada a un agente.</p>}

        {open ? (
          <div data-testid="task-context">
            {/* 1 · What to do, in plain words. */}
            <TaskReveal at={at(0)} className="mt-2" testId="ctx-do">
              <Editable value={note.hacer ?? brief.hacer} onSave={save('hacer')} testId="hacer" />
              <p className="mt-1 text-[14px] text-ink-3">
                Descripción {note.hacer ? 'editada por ti' : 'sugerida a partir del título'}
                {!note.hacer && <AiTag />}
              </p>
            </TaskReveal>
            <Box className="mt-4" testId="task-card">
              {/* 2 · Why it matters. */}
              <Item at={at(1)} k={<>Por qué importa{aiTag('porque')}</>} testId="ctx-why">
                <Editable value={note.porque ?? brief.porque} onSave={save('porque')} testId="porque" />
                <Note>
                  {contributes}
                  {mapLink && (
                    <>
                      {' '}
                      <TextLink href={mapLink} testId="task-to-map">
                        Ver en el mapa
                      </TextLink>
                    </>
                  )}
                </Note>
              </Item>
              {/* 3 · The expected result. */}
              <Item at={at(2)} k={t.deliverable || t.acceptance.length ? 'Resultado esperado · del dossier' : <>Resultado esperado{aiTag('deliver')}</>} testId="ctx-deliver">
                {t.deliverable || t.acceptance.length ? (
                  <>
                    {t.deliverable && <P>{t.deliverable}</P>}
                    {t.acceptance.length > 0 && <Note>{doneWhen(t.acceptance)}</Note>}
                  </>
                ) : (
                  <Editable value={note.deliver ?? 'El dossier no lo dice. Propuesta: escribe aquí qué quedará hecho cuando la termines.'} onSave={save('deliver')} testId="deliver" />
                )}
              </Item>
              {/* 4 · What stops it from starting, only when something does. */}
              {stops && (
                <Item at={at(3)} k={<>Qué impide comenzar<LocalTag /></>} testId="ctx-stops">
                  <P>{stops}</P>
                </Item>
              )}
            </Box>
          </div>
        ) : (
          <Box className="mt-4 scroll-mt-6" testId={stage === 'en-aprobacion' ? 'task-review' : 'task-card'}>
            {stage === 'en-aprobacion' ? (
              <>
                {/* Before asking for approval: what was due and the evidence that it was done. */}
                <Item at={at(0)} k="Entregable" testId="review-deliverable">
                  <P>{t.deliverable ?? 'El dossier no define un entregable.'}</P>
                  {t.acceptance.length > 0 && <Note>{doneWhen(t.acceptance)}</Note>}
                </Item>
                <Item at={at(1)} k="Evidencia" testId="review-evidence">
                  <P>{t.evidence.length ? t.evidence.map((e) => e.label).join(' · ') : 'No hay evidencia registrada. Revisa el entregable directamente o devuélvela pidiendo una.'}</P>
                </Item>
                <Item at={at(2)} k="Situación">
                  <P>Hecha · verificación: {track.verified.state === 'sin-dato' ? 'sin dato' : track.verified.state} · tu visto bueno: pendiente</P>
                </Item>
              </>
            ) : (
              <Item at={at(0)} k="Resultado entregado">
                <P>{t.deliverable ?? t.acceptance[0] ?? 'El dossier no lo describe.'}</P>
                {mapLink && (
                  <Note>
                    <TextLink href={mapLink} testId="task-to-map">
                      Ver en el mapa del proyecto
                    </TextLink>
                  </Note>
                )}
              </Item>
            )}
          </Box>
        )}

        {/* 5 · The action. */}
        {action && <TaskAction at={at(4)}>{action}</TaskAction>}

        {/* The rest, closed until needed. */}
        <TaskReveal at={at(5)} className="mt-6" testId="task-more">
          {open && (
            <More id={`ficha:${t.id}:implica`} title="Qué implica" hint="Los pasos que lleva" testId="more-implies">
              <div className="flex items-center gap-1 text-[14px] text-ink-3">Propuesta{aiTag('implies')}</div>
              <Editable value={note.implies ?? brief.implica} onSave={save('implies')} testId="implies" />
            </More>
          )}
          {open && (
            <More
              id={`ficha:${t.id}:antes`}
              title="Qué necesito antes"
              hint={node.waitsFor.length || pending.length ? `${node.waitsFor.length ? `${node.waitsFor.length} ${node.waitsFor.length === 1 ? 'tarea previa' : 'tareas previas'}` : ''}${node.waitsFor.length && pending.length ? ' · ' : ''}${pending.length ? `${pending.length} ${pending.length === 1 ? 'condición' : 'condiciones'} sin confirmar` : ''}` : 'Nada registrado'}
              testId="more-before"
            >
              <div className="flex items-center gap-1 text-[14px] text-ink-3">Del dossier<LocalTag /></div>
              {node.waitsFor.length > 0 && (
                <>
                  <P>{node.waitsFor.length === 1 ? 'Espera a esta tarea:' : `Espera a ${node.waitsFor.length} tareas:`}</P>
                  <TaskLinks tasks={node.waitsFor} />
                </>
              )}
              {pending.length > 0 && <P>Condiciones sin confirmar: {pending.map((x) => `«${x}»`).join(', ')}.</P>}
              {!node.waitsFor.length && !pending.length && <P>Ni tareas previas ni condiciones registradas.</P>}
            </More>
          )}
          <More id={`ficha:${t.id}:despues`} title="Qué permite hacer después" hint={node.unlocks.length ? `${node.unlocks.length} ${node.unlocks.length === 1 ? 'tarea la espera' : 'tareas la esperan'}` : 'Ninguna tarea la espera'} testId="more-after">
            <div className="flex items-center gap-1 text-[14px] text-ink-3">Del dossier<LocalTag /></div>
            {node.unlocks.length ? (
              <>
                <TaskLinks tasks={node.unlocks} />
                <Note>Podrían avanzar; puede que tengan otros requisitos.</Note>
              </>
            ) : (
              <P>Ninguna tarea registrada la espera.</P>
            )}
          </More>
          <More id={`ficha:${t.id}:docs`} title="Documentación y seguimiento" hint="Ejecución, verificación, aprobación y origen" testId="more-docs">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[16px] leading-[1.4]" data-testid="ctx-track">
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
              <dd className="text-ink">{APPROVAL_TEXT[track.approved.state]}</dd>
              {estimate && (
                <>
                  <dt className="text-ink-3">Tiempo estimado</dt>
                  <dd className="text-ink">{estimate}</dd>
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
        </TaskReveal>
      </Sequence>
    </div>
  )
}

function TaskReveal({ at, className = '', testId, children }: { at: number; className?: string; testId?: string; children: React.ReactNode }) {
  const reveal = useReveal()
  return (
    <div {...reveal(at, className)} data-testid={testId}>
      {children}
    </div>
  )
}

/** 1 · What to do: the title appears first. */
function TaskTitle({ kicker, title }: { kicker: boolean; title: string }) {
  const reveal = useReveal()
  return (
    <div {...reveal(0, 'mt-1')}>
      {kicker && <Kicker>Qué debo hacer</Kicker>}
      <H1>{title}</H1>
    </div>
  )
}

/** The action comes last, once the reasons are on screen; it can be used at any moment. */
function TaskAction({ at, children }: { at: number; children: React.ReactNode }) {
  const reveal = useReveal()
  return (
    <div {...reveal(at, 'mt-5')} data-testid="task-action">
      {children}
    </div>
  )
}

export type { Task }
