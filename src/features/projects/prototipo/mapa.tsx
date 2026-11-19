import { indexTasks } from '../domain/derive'
import { STAGE_LABEL } from '../ui/labels'
import { stageOf } from '../ui/view'
import { MAP_LABEL, areasOf, mapStateOf, type Area, type MapState } from './areas'
import { Back, H1, Kicker, LocalTag, More, Primary, Row, StateBar, go } from './kit'
import { useProto } from './store'
import { UpdateFlow } from './update'

/**
 * PROTOTYPE · «Mapa del proyecto»: the project as a few work areas, each
 * opened on its own. A panoramic view, not a dependency diagram. Reached from
 * the project and from «¿Qué ha cambiado?»; it never asks to walk every area.
 */

const sum = (a: Area[]) => a.reduce((acc, x) => ({ terminado: acc.terminado + x.counts.terminado, pendiente: acc.pendiente + x.counts.pendiente, confirmar: acc.confirmar + x.counts.confirmar }), { terminado: 0, pendiente: 0, confirmar: 0 })

const countsText = (c: Record<MapState, number>) => {
  const total = c.terminado + c.pendiente + c.confirmar
  const parts = [`${c.terminado} de ${total} terminadas`]
  if (c.confirmar) parts.push(`${c.confirmar} por confirmar`)
  return parts.join(' · ')
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-ink-3" /> Terminado
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-[#e0a43a]" /> Por confirmar
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-[color-mix(in_srgb,var(--color-electric)_45%,transparent)]" /> Pendiente
      </span>
    </p>
  )
}

/** The six projects at a glance, each opening its map. Shown before asking what changed. */
export function Situation() {
  const { s } = useProto()
  return (
    <section data-testid="situation">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-ink-3">Situación conocida</h2>
        <Legend />
      </div>
      {s.data.projects.map((p) => {
        const areas = areasOf(s.data, p.id)
        const c = sum(areas)
        return (
          <a key={p.id} href={`#/mapa/${encodeURIComponent(p.id)}`} className="hit flex items-center gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0" data-testid="situation-row">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[14.5px] text-ink">{p.name}</p>
                <p className="shrink-0 text-[11.5px] text-ink-4">{areas.length} áreas</p>
              </div>
              <div className="mt-1.5">
                <StateBar counts={c} />
              </div>
              <p className="mt-1 text-[12px] text-ink-3">{countsText(c)}</p>
            </div>
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-4">
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )
      })}
    </section>
  )
}

export function MapPage({ projectId }: { projectId: string }) {
  const { s } = useProto()
  const p = s.data.projects.find((x) => x.id === projectId)
  if (!p) return <p className="text-ink-3">Ese proyecto no existe en el prototipo.</p>
  const areas = areasOf(s.data, p.id)
  return (
    <div data-testid="map">
      <Back href={`#/proyecto/${encodeURIComponent(p.id)}`} label={p.name} />
      <div className="mt-1">
        <Kicker>{p.name}</Kicker>
        <div className="mt-1">
          <H1>Mapa del proyecto</H1>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-[1.45] text-ink-3">
        Sus tareas agrupadas por finalidad. Abre solo el área que te interese.
        <LocalTag />
      </p>
      <div className="mt-3">
        <Legend />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5" data-testid="map-areas">
        {areas.map((a) => (
          <a key={a.id} href={`#/mapa/${encodeURIComponent(p.id)}/${a.id}`} className="hit surface flex min-h-[112px] flex-col rounded-[16px] px-3 py-2.5 active:opacity-70" data-testid="map-area">
            <p className="text-[14px] leading-[1.25] font-medium text-ink">{a.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.35] text-ink-3">{a.purpose}</p>
            <div className="mt-auto pt-2">
              <StateBar counts={a.counts} />
              <p className="mt-1 text-[11.5px] text-ink-3">
                {a.counts.terminado}/{a.tasks.length}
                {a.counts.confirmar ? ` · ${a.counts.confirmar} por confirmar` : ''}
              </p>
            </div>
          </a>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-[1.4] text-ink-4">Agrupar no cambia nada: las tareas, sus IDs y sus dependencias siguen como estaban.</p>
      <div className="mt-6">
        <Primary testId="map-update" onClick={() => go(`#/actualizar/${encodeURIComponent(p.id)}`)}>
          Contar qué ha cambiado en este proyecto
        </Primary>
      </div>
    </div>
  )
}

const ORDER: MapState[] = ['confirmar', 'pendiente', 'terminado']

export function AreaPage({ projectId, areaId }: { projectId: string; areaId: string }) {
  const { s } = useProto()
  const p = s.data.projects.find((x) => x.id === projectId)
  const a = p ? areasOf(s.data, p.id).find((x) => x.id === areaId) : undefined
  if (!p || !a) return <p className="text-ink-3">Esa área no existe en el prototipo.</p>
  const index = indexTasks(s.data)
  const groups = ORDER.map((st) => ({ st, tasks: a.tasks.filter((t) => mapStateOf(stageOf(s.data, t, index)) === st) })).filter((g) => g.tasks.length)
  return (
    <div data-testid="area">
      <Back href={`#/mapa/${encodeURIComponent(p.id)}`} label="Mapa del proyecto" />
      <div className="mt-1">
        <Kicker>{p.name}</Kicker>
        <div className="mt-1">
          <H1>{a.name}</H1>
        </div>
        <p className="mt-1 text-[14px] text-ink-3">{a.purpose}</p>
      </div>
      <div className="mt-3">
        <StateBar counts={a.counts} />
      </div>
      {groups.map((g) => {
        const rows = g.tasks.map((t) => {
          const st = stageOf(s.data, t, index)
          return <Row key={t.id} href={`#/tarea/${encodeURIComponent(t.id)}`} title={t.title} done={st === 'cerrada'} sub={st === 'cerrada' ? undefined : STAGE_LABEL[st]} />
        })
        return g.st === 'terminado' ? (
          <div key={g.st} className="mt-4">
            <More title={MAP_LABEL.terminado} count={g.tasks.length}>
              {rows}
            </More>
          </div>
        ) : (
          <section key={g.st} className="mt-5" data-testid={`area-${g.st}`}>
            <h2 className="mb-1 text-[13px] font-medium text-ink-3">
              {MAP_LABEL[g.st]} <span className="tabular text-ink-4">{g.tasks.length}</span>
            </h2>
            {rows}
          </section>
        )
      })}
      <section className="mt-7" data-testid="area-update">
        <h2 className="mb-2 text-[15px] font-medium text-ink">¿Qué ha cambiado en esta área?</h2>
        <UpdateFlow scope={{ projectId: p.id, areaId: a.id }} onDone={() => go(`#/mapa/${encodeURIComponent(p.id)}/${a.id}`)} doneLabel="Volver al área" />
      </section>
    </div>
  )
}
