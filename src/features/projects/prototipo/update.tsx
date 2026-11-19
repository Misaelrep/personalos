import { useState } from 'react'
import { isClosed } from '../domain/derive'
import type { ProjectsData } from '../domain/types'
import { AiTag, Back, H1, Primary, Secondary, TextLink, go } from './kit'
import { applyProposals, candidateActions, proposeChanges, type ChangeKind, type Proposal } from './plan'
import { useProto } from './store'

/**
 * PROTOTYPE · «Contar qué ha cambiado». The person writes in their own words;
 * the simulated AI proposes grouped changes; the person checks, corrects and
 * applies them. Nothing is deleted: a dropped task is marked «Descartada» and
 * every change adds a line to the history.
 */

const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export function exampleText(data: ProjectsData): string {
  const byName = (n: string) => data.projects.find((p) => p.name === n)
  // The plan's own suggestions: tasks that are not blocked, those that can be done now first.
  const ready = (n: string) => {
    const p = byName(n)
    return p ? candidateActions(data, p.id, 2) : []
  }
  const huerto = ready('Huerto comunitario')[0]
  const taller = ready('Taller de cerámica')[1] ?? ready('Taller de cerámica')[0]
  const recetas = data.tasks.find((t) => t.projectId === byName('Archivo de recetas')?.id && !isClosed(data, t))
  return [
    huerto && `Terminé de ${low(huerto.title)}.`,
    recetas && `Ya no voy a ${low(recetas.title)}.`,
    taller && `Para ${low(taller.title)} ahora necesito el horno grande del centro cívico.`,
    'En el boletín del barrio quiero añadir una sección de recetas de temporada.',
  ]
    .filter(Boolean)
    .join('\n')
}

const GROUP: Record<ChangeKind, string> = {
  hecha: 'Terminado',
  descartada: 'Ya no se hará',
  cambio: 'Cambia',
  nueva: 'Nuevo',
}
const EFFECT: Record<ChangeKind, string> = {
  hecha: 'Se marcará como hecha y aprobada.',
  descartada: 'Se marcará como descartada. No se borra.',
  cambio: 'Se anotará como siguiente paso de la tarea.',
  nueva: 'Se creará una tarea nueva, sin empezar.',
}

export function UpdateFlow({ onDone, inWizard }: { onDone?: () => void; inWizard?: boolean }) {
  const { s, set, ctx } = useProto()
  const [text, setText] = useState('')
  const [props, setProps] = useState<Proposal[] | null>(null)
  const [applied, setApplied] = useState<number | null>(null)
  const patch = (id: string, f: Partial<Proposal>) => setProps((ps) => ps!.map((p) => (p.id === id ? { ...p, ...f } : p)))
  const accepted = props?.filter((p) => p.accepted).length ?? 0

  if (applied !== null)
    return (
      <div data-testid="update-done">
        <p className="text-[16px] leading-[1.45] text-ink">{applied === 1 ? 'Aplicado 1 cambio.' : `Aplicados ${applied} cambios.`}</p>
        <p className="mt-1 text-[14px] leading-[1.45] text-ink-3">Quedan en el historial de cada tarea. El dossier original no cambia y nada se ha borrado.</p>
        <div className="mt-5">
          <Primary onClick={() => (onDone ? onDone() : go('#/'))}>{inWizard ? 'Siguiente' : 'Volver al plan'}</Primary>
        </div>
      </div>
    )

  if (!props)
    return (
      <div data-testid="update-write">
        <textarea
          data-testid="update-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'Terminé…\nYa no voy a…\nCambió…\nQuiero añadir…'}
          className="w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[16px] leading-[1.45] text-ink placeholder:text-ink-4 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <button type="button" className="text-[14px] text-electric" data-testid="update-example" onClick={() => setText(exampleText(s.data))}>
            Usar un ejemplo
          </button>
          {inWizard && (
            <button type="button" className="text-[14px] text-ink-3" data-testid="update-skip" onClick={onDone}>
              Está al día, saltar
            </button>
          )}
        </div>
        <div className="mt-5">
          <Primary testId="update-propose" disabled={text.trim().length < 4} onClick={() => setProps(proposeChanges(s.data, text))}>
            Proponer cambios
          </Primary>
        </div>
        <p className="mt-3 text-center text-[12px] text-ink-4">La IA de este prototipo es simulada: nada sale de esta página.</p>
      </div>
    )

  const kinds = (['hecha', 'descartada', 'cambio', 'nueva'] as ChangeKind[]).filter((k) => props.some((p) => p.kind === k))
  return (
    <div data-testid="update-review">
      <p className="text-[14px] leading-[1.45] text-ink-3">
        Revisa cada propuesta. Puedes quitarla o cambiar la tarea. Solo se aplica lo que dejes marcado.
        <AiTag />
      </p>
      {kinds.map((k) => (
        <section key={k} className="mt-5">
          <h2 className="mb-1 text-[13px] font-medium text-ink-3">{GROUP[k]}</h2>
          {props
            .filter((p) => p.kind === k)
            .map((p) => {
              const project = s.data.projects.find((x) => x.id === p.projectId)
              const options = k === 'nueva' ? [] : s.data.tasks.filter((t) => !isClosed(s.data, t) && (!p.projectId || t.projectId === p.projectId))
              return (
                <div key={p.id} className="border-b border-[var(--line)] py-3 last:border-b-0" data-testid="proposal">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-electric)]" checked={p.accepted} disabled={k === 'nueva' ? !p.projectId : !p.taskId} onChange={(e) => patch(p.id, { accepted: e.target.checked })} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-[1.35] text-ink">{k === 'nueva' ? p.title : p.taskId ? p.title : 'No encontré la tarea'}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-ink-3">
                        {project ? `${project.name} · ` : ''}
                        {EFFECT[k]}
                      </span>
                      <span className="mt-1 block text-[12.5px] text-ink-4 italic">«{p.sentence}»</span>
                    </span>
                  </label>
                  {k === 'nueva' ? (
                    <select className="mt-2 ml-8 max-w-[calc(100%-2rem)] rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-3 py-1.5 text-[13px] text-ink-3" value={p.projectId ?? ''} onChange={(e) => patch(p.id, { projectId: e.target.value || undefined, accepted: Boolean(e.target.value) })}>
                      <option value="">Elegir proyecto</option>
                      {s.data.projects.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      data-testid="proposal-task"
                      className="mt-2 ml-8 max-w-[calc(100%-2rem)] rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-3 py-1.5 text-[13px] text-ink-3"
                      value=""
                      onChange={(e) => {
                        const t = s.data.tasks.find((x) => x.id === e.target.value)
                        patch(p.id, t ? { taskId: t.id, projectId: t.projectId, title: t.title, accepted: true } : { taskId: undefined, accepted: false })
                      }}
                    >
                      <option value="">{p.taskId ? 'Cambiar la tarea' : 'Elegir la tarea'}</option>
                      {(options.length ? options : s.data.tasks.filter((t) => !isClosed(s.data, t))).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  )}
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
          {accepted === 1 ? 'Aplicar 1 cambio' : `Aplicar ${accepted} cambios`}
        </Primary>
        <Secondary onClick={() => setProps(null)}>Volver a escribir</Secondary>
      </div>
    </div>
  )
}

export function UpdatePage() {
  return (
    <div data-testid="update">
      <Back href="#/" label="Plan de 90 días" />
      <div className="mt-1 mb-4">
        <H1>¿Qué ha cambiado?</H1>
        <p className="mt-2 text-[14.5px] leading-[1.45] text-ink-3">Escríbelo como se lo contarías a alguien: lo que terminaste, lo que cambió, lo que ya no harás y lo que quieres añadir.</p>
      </div>
      <UpdateFlow />
      <p className="mt-6 text-center">
        <TextLink href="#/proyectos">Ver mis proyectos</TextLink>
      </p>
    </div>
  )
}
