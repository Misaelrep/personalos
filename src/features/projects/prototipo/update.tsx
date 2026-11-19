import { useState } from 'react'
import { indexTasks, isClosed } from '../domain/derive'
import type { ProjectsData } from '../domain/types'
import { waitersOf } from '../ui/attention'
import { areasOf } from './areas'
import { AiTag, Back, H1, Primary, Secondary, TextLink, go } from './kit'
import { Situation } from './mapa'
import { applyProposals, proposeChanges, type ChangeKind, type Proposal } from './plan'
import { useProto } from './store'

/**
 * PROTOTYPE · «Contar qué ha cambiado». The person writes in their own words,
 * for everything, one project or one area; the simulated AI proposes grouped
 * changes, says why and which tasks they touch; the person checks, corrects
 * and confirms. Nothing is deleted: a dropped task is marked «Descartada» and
 * every change adds a line to the history.
 */

const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const FOLLOW_UP = /^(revisar|documentar|cerrar)\b/i

export interface Scope {
  projectId?: string
  areaId?: string
}

export function exampleText(data: ProjectsData, scope: Scope = {}): string {
  if (scope.projectId) {
    const pool = scope.areaId ? (areasOf(data, scope.projectId).find((a) => a.id === scope.areaId)?.tasks ?? []) : data.tasks.filter((t) => t.projectId === scope.projectId)
    const open = pool.filter((t) => !isClosed(data, t) && !FOLLOW_UP.test(t.title))
    return [open[0] && `Terminé de ${low(open[0].title)}.`, open[1] && `Para ${low(open[1].title)} ahora necesito la ayuda de un vecino.`].filter(Boolean).join('\n')
  }
  return [
    'Terminé de organizar los turnos de riego y de revisar la llave de paso.',
    'Ya no voy a ordenar las fotos de platos.',
    'Para reservar el horno ahora dependemos del centro cívico.',
    'En el boletín del barrio quiero añadir una sección de recetas de temporada.',
  ].join('\n')
}

const GROUP: Record<ChangeKind, string> = { hecha: 'Terminado', descartada: 'Ya no se hará', cambio: 'Cambia', nueva: 'Nuevo' }
const EFFECT: Record<ChangeKind, string> = {
  hecha: 'Quedarán como hechas. Tu visto bueno sigue siendo una decisión aparte: aparecerán como «Por revisar».',
  descartada: 'Quedarán como descartadas. No se borran: siguen en el proyecto y en su historial.',
  cambio: 'Tu frase se anota como siguiente paso de cada tarea. Su estado no cambia.',
  nueva: 'Se creará una tarea nueva, sin empezar.',
}

const field = 'w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[16px] leading-[1.45] text-ink placeholder:text-ink-4 focus:outline-none'

export function UpdateFlow({ onDone, inWizard, scope = {}, doneLabel }: { onDone?: () => void; inWizard?: boolean; scope?: Scope; doneLabel?: string }) {
  const { s, set, ctx } = useProto()
  const [text, setText] = useState('')
  const [props, setProps] = useState<Proposal[] | null>(null)
  const [applied, setApplied] = useState<number | null>(null)
  const patch = (id: string, f: Partial<Proposal>) => setProps((ps) => ps!.map((p) => (p.id === id ? { ...p, ...f } : p)))
  const accepted = props?.filter((p) => p.accepted).length ?? 0
  const index = indexTasks(s.data)
  const waiters = waitersOf(s.data, index)

  if (applied !== null)
    return (
      <div data-testid="update-done">
        <p className="text-[16px] leading-[1.45] text-ink">{applied === 1 ? 'Aplicado 1 cambio.' : `Aplicados ${applied} cambios.`}</p>
        <p className="mt-1 text-[14px] leading-[1.45] text-ink-3">Quedan en el historial de cada tarea. El dossier original no cambia y nada se ha borrado.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Primary onClick={() => (onDone ? onDone() : go('#/'))}>{inWizard ? 'Siguiente' : (doneLabel ?? 'Volver al plan')}</Primary>
          {!inWizard && (
            <Secondary
              onClick={() => {
                setApplied(null)
                setProps(null)
                setText('')
              }}
            >
              Contar algo más
            </Secondary>
          )}
        </div>
      </div>
    )

  if (!props)
    return (
      <div data-testid="update-write">
        <textarea data-testid="update-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={'Terminé…\nYa no voy a…\nCambió…\nQuiero añadir…'} className={field} />
        <div className="mt-2 flex items-center justify-between">
          <button type="button" className="text-[14px] text-electric" data-testid="update-example" onClick={() => setText(exampleText(s.data, scope))}>
            Usar un ejemplo
          </button>
          {inWizard && (
            <button type="button" className="text-[14px] text-ink-3" data-testid="update-skip" onClick={onDone}>
              Está al día, seguir
            </button>
          )}
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.4] text-ink-4">No hace falta nombrar tareas ni IDs: «todo lo del riego», «lo del horno»… Puedes contar varias cosas a la vez.</p>
        <div className="mt-4">
          <Primary testId="update-propose" disabled={text.trim().length < 4} onClick={() => setProps(proposeChanges(s.data, text, scope))}>
            Ver qué cambiaría
          </Primary>
        </div>
      </div>
    )

  const kinds = (['hecha', 'descartada', 'cambio', 'nueva'] as ChangeKind[]).filter((k) => props.some((p) => p.kind === k))
  const taskName = (id: string, withProject: boolean) => {
    const t = index.get(id)
    if (!t) return id
    return withProject ? `${t.title} · ${s.data.projects.find((p) => p.id === t.projectId)?.name}` : t.title
  }
  return (
    <div data-testid="update-review">
      <p className="text-[14px] leading-[1.45] text-ink-3">
        Esto es lo que entendí. Quita lo que no sea, o corrige las tareas. Nada se aplica hasta que lo confirmes.
        <AiTag />
      </p>
      {kinds.map((k) => (
        <section key={k} className="mt-5">
          <h2 className="mb-1 text-[13px] font-medium text-ink-3">{GROUP[k]}</h2>
          {props
            .filter((p) => p.kind === k)
            .map((p) => {
              const mixed = new Set(p.matched.map((id) => index.get(id)?.projectId)).size > 1
              const extra = s.data.tasks.filter((t) => !isClosed(s.data, t) && !p.matched.includes(t.id) && (!p.projectId || t.projectId === p.projectId))
              const freed = [...new Set(p.taskIds.flatMap((id) => (waiters.get(id) ?? []).map((w) => w.id)))].filter((id) => !p.taskIds.includes(id))
              return (
                <div key={p.id} className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="proposal">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" data-testid="proposal-accept" className="mt-0.5 size-5 shrink-0 accent-[var(--color-electric)]" checked={p.accepted} disabled={k === 'nueva' ? !p.projectId : !p.taskIds.length} onChange={(e) => patch(p.id, { accepted: e.target.checked })} />
                    <span className="text-[14.5px] leading-[1.4] text-ink italic">«{p.sentence}»</span>
                  </label>
                  <div className="mt-2 ml-8 space-y-1.5 text-[13px] leading-[1.45]">
                    <p className="text-ink-2">
                      <span className="text-ink-3">Qué cambia: </span>
                      {EFFECT[k]}
                    </p>
                    <p className="text-ink-2">
                      <span className="text-ink-3">Por qué: </span>
                      {p.why}
                    </p>
                    {k === 'nueva' ? (
                      <>
                        <input aria-label="Título de la tarea nueva" className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[15px] text-ink" value={p.title} onChange={(e) => patch(p.id, { title: e.target.value })} />
                        <select className="max-w-full rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-3 py-1.5 text-[13px] text-ink-3" value={p.projectId ?? ''} onChange={(e) => patch(p.id, { projectId: e.target.value || undefined, accepted: Boolean(e.target.value) })}>
                          <option value="">Elegir proyecto</option>
                          {s.data.projects.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <div data-testid="proposal-tasks">
                        <p className="text-ink-3">{p.matched.length ? `Tareas afectadas (${p.taskIds.length} de ${p.matched.length})` : 'Ninguna tarea encontrada'}</p>
                        {p.matched.map((id) => (
                          <label key={id} className="mt-1 flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-4 shrink-0 accent-[var(--color-electric)]"
                              checked={p.taskIds.includes(id)}
                              onChange={(e) => {
                                const taskIds = e.target.checked ? [...p.taskIds, id] : p.taskIds.filter((x) => x !== id)
                                patch(p.id, { taskIds, accepted: taskIds.length > 0 && p.accepted })
                              }}
                            />
                            <span className="text-ink">{taskName(id, mixed)}</span>
                          </label>
                        ))}
                        {freed.length > 0 && (k === 'hecha' || k === 'descartada') && (
                          <p className="mt-1.5 text-ink-3">
                            {k === 'hecha' ? `Además, ${freed.length === 1 ? '1 tarea dejará' : `${freed.length} tareas dejarán`} de esperarlas.` : `${freed.length === 1 ? '1 tarea las esperaba' : `${freed.length} tareas las esperaban`}: tendrás que decidir qué pasa con ${freed.length === 1 ? 'ella' : 'ellas'}.`}
                          </p>
                        )}
                        <select
                          data-testid="proposal-add"
                          className="mt-2 max-w-full rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-3 py-1.5 text-[13px] text-ink-3"
                          value=""
                          onChange={(e) => {
                            const t = index.get(e.target.value)
                            if (t) patch(p.id, { matched: [...p.matched, t.id], taskIds: [...p.taskIds, t.id], projectId: p.projectId ?? t.projectId, accepted: true })
                          }}
                        >
                          <option value="">{p.matched.length ? 'Añadir otra tarea' : 'Elegir la tarea'}</option>
                          {extra.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        </section>
      ))}
      <div className="mt-6 flex flex-col gap-2">
        <Primary
          testId="update-apply"
          disabled={!accepted}
          onClick={() => {
            set((x) => ({ ...x, data: applyProposals(x.data, props, ctx) }))
            setApplied(accepted)
          }}
        >
          {accepted === 1 ? 'Confirmar 1 cambio' : `Confirmar ${accepted} cambios`}
        </Primary>
        <Secondary onClick={() => setProps(null)}>Volver a escribir</Secondary>
      </div>
    </div>
  )
}

export function UpdatePage({ projectId }: { projectId?: string }) {
  const { s } = useProto()
  const p = projectId ? s.data.projects.find((x) => x.id === projectId) : undefined
  return (
    <div data-testid="update">
      <Back href={p ? `#/mapa/${encodeURIComponent(p.id)}` : '#/'} label={p ? 'Mapa del proyecto' : 'Plan de 90 días'} />
      <div className="mt-1 mb-4">
        <H1>{p ? `¿Qué ha cambiado en ${p.name}?` : '¿Qué ha cambiado?'}</H1>
      </div>
      {!p && (
        <div className="mb-6">
          <Situation />
        </div>
      )}
      <UpdateFlow scope={p ? { projectId: p.id } : {}} {...(p ? { onDone: () => go(`#/mapa/${encodeURIComponent(p.id)}`), doneLabel: 'Volver al mapa' } : {})} />
      {!p && (
        <p className="mt-6 text-center">
          <TextLink href="#/proyectos">Ver mis proyectos</TextLink>
        </p>
      )}
    </div>
  )
}
