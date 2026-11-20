import { indexTasks, isClosed } from '../domain/derive'
import type { ProjectsData, Task } from '../domain/types'
import { explain, waitersOf } from '../ui/attention'
import { stageOf, type Stage } from '../ui/view'
import { areasOf, mapStateOf, type Area, type MapState } from './areas'
import { kindOf, type ActionKind } from './plan'

/**
 * PROTOTYPE · The smart project map: objective → key results → work blocks →
 * tasks. Three kinds of relation, never mixed and always labelled:
 *  - CONFIRMED: dependencies between tasks, as the dossier wrote them.
 *  - LOCAL CALCULATION: which block a task belongs to (areas.ts, by title).
 *  - SIMULATED AI: the key results and which blocks contribute to each.
 * A project without proposed results shows its blocks only: no link is
 * invented to fill the picture. Nothing here writes data.
 */

export type Icon = 'gota' | 'brote' | 'personas' | 'casa' | 'documento' | 'llama' | 'megafono' | 'conversacion' | 'herramienta' | 'carta' | 'grafico' | 'diana' | 'estrella' | 'carpeta' | 'lupa' | 'movil' | 'codigo' | 'cohete' | 'paleta'

interface ResultDef {
  id: string
  name: string
  /** What has to be true, and why it matters for the objective. */
  why: string
  icon: Icon
  /** Blocks (area ids) that contribute to it. A block may contribute to several results. */
  blocks: string[]
}

interface MapDef {
  /** Why the project matters (simulated AI): one sentence, no people, amounts or dates. */
  why: string
  results: ResultDef[]
  icons: Record<string, Icon>
  /** Simulated orientation per block: what the work usually involves. No people, amounts or dates. */
  implies: Record<string, string>
}

const DEFS: Record<string, MapDef> = {
  'Huerto comunitario': {
    why: 'Da al barrio un espacio cuidado entre todos: comida cercana, vecinos que se conocen y un lugar que no depende de una sola persona.',
    results: [
      { id: 'agua', name: 'El agua llega a las parcelas', why: 'Sin riego estable no hay cultivo posible: es la base de todo lo demás.', icon: 'gota', blocks: ['agua'] },
      { id: 'cosecha', name: 'Primera cosecha en marcha', why: 'Es la prueba visible de que el huerto funciona y lo que anima a seguir.', icon: 'brote', blocks: ['cultivo', 'agua'] },
      { id: 'vecinos', name: 'Vecinos que participan con reglas claras', why: 'El huerto solo dura si hay personas comprometidas y acuerdos que todos conocen.', icon: 'personas', blocks: ['personas', 'espacio'] },
    ],
    icons: { agua: 'gota', cultivo: 'brote', personas: 'personas', espacio: 'casa', otras: 'carpeta' },
    implies: {
      agua: 'Revisar lo que ya está instalado, hablar con quien gestiona el agua del huerto y anotar lo que falte antes de comprar nada.',
      cultivo: 'Decidir qué se planta y dónde, preparar la tierra y llevar un registro sencillo de lo que se hace.',
      personas: 'Hablar con los voluntarios, acordar normas por escrito y compartirlas donde todos las vean.',
      espacio: 'Ver qué necesita arreglo, reunir herramientas y materiales y dejar el espacio en orden.',
      otras: 'Leer la tarea en el dossier y decidir el siguiente paso concreto.',
    },
  },
  'Taller de cerámica': {
    why: 'Probar el curso con pocas personas evita invertir en materiales, horno y difusión antes de saber si funciona.',
    results: [
      { id: 'programa', name: 'Un programa probado', why: 'Saber qué se enseña en cada sesión es lo que permite ofrecer el curso con confianza.', icon: 'documento', blocks: ['programa', 'prueba'] },
      { id: 'material', name: 'Material y horno listos', why: 'Sin barro, esmaltes y horno reservado no se puede dar ni una sesión.', icon: 'llama', blocks: ['materiales'] },
      { id: 'inscritos', name: 'Personas inscritas', why: 'El curso existe cuando hay un grupo apuntado que quiere venir.', icon: 'megafono', blocks: ['inscripcion'] },
      { id: 'aprender', name: 'Saber qué mejorar', why: 'Lo que digan las primeras personas decide cómo será el curso definitivo.', icon: 'conversacion', blocks: ['prueba'] },
    ],
    icons: { programa: 'documento', materiales: 'llama', inscripcion: 'megafono', prueba: 'conversacion', otras: 'carpeta' },
    implies: {
      programa: 'Escribir o revisar el contenido de las sesiones y contrastarlo con alguien que ya enseñe cerámica.',
      materiales: 'Hacer la lista de lo necesario, pedir presupuestos y reservar el horno con antelación.',
      inscripcion: 'Preparar la información del curso, decidir cómo se apunta la gente y difundirlo.',
      prueba: 'Dar una sesión a pocas personas, observar qué cuesta y recoger su opinión.',
      otras: 'Leer la tarea en el dossier y decidir el siguiente paso concreto.',
    },
  },
  'Boletín del barrio': {
    why: 'Es el canal que mantiene informados a los vecinos y da visibilidad a lo que pasa en el barrio, incluidos el huerto y el taller.',
    results: [
      { id: 'llega', name: 'Un boletín que llega cada mes', why: 'La constancia es lo que hace que los vecinos lo esperen y lo abran.', icon: 'carta', blocks: ['herramientas', 'envio'] },
      { id: 'leido', name: 'Contenido que la gente lee', why: 'Si lo que se cuenta interesa, el boletín crece solo.', icon: 'documento', blocks: ['contenido', 'envio'] },
    ],
    icons: { herramientas: 'herramienta', contenido: 'documento', envio: 'grafico', otras: 'carpeta' },
    implies: {
      herramientas: 'Configurar la cuenta y la plantilla, y probar la suscripción como si fueras un vecino.',
      contenido: 'Reunir noticias y fotos, escribir textos cortos y revisarlos antes del envío.',
      envio: 'Fijar el día de envío y mirar después qué se abrió y qué no.',
      otras: 'Leer la tarea en el dossier y decidir el siguiente paso concreto.',
    },
  },
}

const DEFAULT_ICONS: Record<string, Icon> = { partida: 'lupa', contenido: 'documento', construccion: 'codigo', saber: 'lupa', ordenar: 'carpeta', encontrar: 'lupa', base: 'codigo', funciones: 'herramienta', pantallas: 'movil', publicar: 'cohete', otras: 'carpeta' }

export interface Block extends Area {
  icon: Icon
  /** Results it contributes to (simulated AI). */
  results: string[]
  implies: string
  counts: Record<MapState, number>
}

export interface KeyResult {
  id: string
  name: string
  why: string
  icon: Icon
  blocks: string[]
  /** Tasks of its blocks: done / total. Never «achieved» by itself. */
  done: number
  total: number
}

export interface ProjectMap {
  projectId: string
  name: string
  objective?: string
  /** Why the project matters (simulated AI); absent when nothing was proposed. */
  why?: string
  results: KeyResult[]
  blocks: Block[]
  /** True when the AI has not proposed results for this project: only blocks are shown. */
  noResults: boolean
}

export function projectMap(data: ProjectsData, projectId: string): ProjectMap {
  const project = data.projects.find((p) => p.id === projectId)
  const def = project ? DEFS[project.name] : undefined
  const areas = areasOf(data, projectId)
  const blocks: Block[] = areas.map((a) => ({
    ...a,
    icon: def?.icons[a.id] ?? DEFAULT_ICONS[a.id] ?? 'carpeta',
    results: def ? def.results.filter((r) => r.blocks.includes(a.id)).map((r) => r.id) : [],
    implies: def?.implies[a.id] ?? 'Leer las tareas en el dossier y decidir el siguiente paso concreto.',
  }))
  const index = indexTasks(data)
  const results: KeyResult[] = (def?.results ?? []).map((r) => {
    const tasks = blocks.filter((b) => r.blocks.includes(b.id)).flatMap((b) => b.tasks)
    return { ...r, done: tasks.filter((t) => stageOf(data, t, index) === 'cerrada').length, total: tasks.length }
  })
  return { projectId, name: project?.name ?? '', ...(project?.objective ? { objective: project.objective } : {}), ...(def ? { why: def.why } : {}), results, blocks, noResults: results.length === 0 }
}

export const blockOfTask = (m: ProjectMap, taskId: string) => m.blocks.find((b) => b.tasks.some((t) => t.id === taskId))

/** Results a set of tasks touches, through their blocks. */
export function resultsOfTasks(data: ProjectsData, taskIds: string[]): KeyResult[] {
  const out = new Map<string, KeyResult>()
  for (const id of taskIds) {
    const t = data.tasks.find((x) => x.id === id)
    if (!t) continue
    const m = projectMap(data, t.projectId)
    const b = blockOfTask(m, id)
    for (const r of m.results) if (b && r.blocks.includes(b.id)) out.set(`${t.projectId}:${r.id}`, r)
  }
  return [...out.values()]
}

/** A task as the map shows it: its kind, what it waits for and what may move after it (confirmed dependencies only). */
export interface TaskNode {
  task: Task
  stage: Stage
  kind: ActionKind
  state: MapState
  waitsFor: Task[]
  unlocks: Task[]
}

export function taskNode(data: ProjectsData, t: Task, index = indexTasks(data), waiters = waitersOf(data, index)): TaskNode {
  const ex = explain(data, t, index, waiters)
  const waitsFor = ex.causes.flatMap((c) => (c.kind === 'espera' ? c.tasks : []))
  return { task: t, stage: ex.stage, kind: kindOf(ex.stage), state: mapStateOf(ex.stage), waitsFor, unlocks: (waiters.get(t.id) ?? []).filter((w) => !isClosed(data, w)) }
}

/** The first result a task's block contributes to, for opening the map at that task. */
export function mapPathOf(data: ProjectsData, taskId: string): { projectId: string; resultId: string; blockId: string } | undefined {
  const t = data.tasks.find((x) => x.id === taskId)
  if (!t) return undefined
  const m = projectMap(data, t.projectId)
  const b = blockOfTask(m, taskId)
  if (!b) return undefined
  return { projectId: t.projectId, resultId: b.results[0] ?? '-', blockId: b.id }
}

export const mapHref = (projectId: string, resultId?: string, blockId?: string, taskId?: string) =>
  `#/mapa/${encodeURIComponent(projectId)}${resultId ? `/${resultId}` : ''}${blockId ? `/${blockId}` : ''}${taskId ? `/${encodeURIComponent(taskId)}` : ''}`

/** Simulated orientation for a task: from its block, never inventing people, amounts or dates. */
export const impliesOf = (data: ProjectsData, taskId: string): string | undefined => {
  const t = data.tasks.find((x) => x.id === taskId)
  return t ? blockOfTask(projectMap(data, t.projectId), taskId)?.implies : undefined
}
