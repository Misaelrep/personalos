import { indexTasks } from '../domain/derive'
import type { ProjectsData, Task } from '../domain/types'
import { stageOf, type Stage } from '../ui/view'

/**
 * PROTOTYPE · «Mapa del proyecto». Work areas grouped by purpose from the task
 * titles: a LOCAL calculation, shown as such. It never writes anything: the
 * tasks, their IDs and their dependencies stay exactly as they are. A task
 * goes to the first area whose words its title contains; the rest go to
 * «Otras tareas», so no task is ever left out.
 */

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

interface AreaRule {
  id: string
  name: string
  /** What the area is for, in one line. */
  purpose: string
  words: string[]
}

/** Rules for the six INVENTED projects of the prototype, by project name. */
const RULES: Record<string, AreaRule[]> = {
  'Huerto comunitario': [
    { id: 'agua', name: 'Agua y riego', purpose: 'Que el huerto tenga agua y turnos para regarlo', words: ['riego', 'agua', 'llave de paso', 'goteo'] },
    { id: 'cultivo', name: 'Parcelas y cultivo', purpose: 'Qué se planta, dónde y cómo', words: ['parcela', 'semilla', 'compost', 'bancal', 'cosecha'] },
    { id: 'personas', name: 'Voluntarios y normas', purpose: 'Quién participa y con qué reglas', words: ['voluntario', 'normas', 'reunion', 'llaves'] },
    { id: 'espacio', name: 'Espacio común', purpose: 'Lo que se ve y se comparte', words: ['cartel', 'caseta'] },
  ],
  'Taller de cerámica': [
    { id: 'prueba', name: 'Prueba y opinión', purpose: 'Probar el curso con personas reales y aprender de ello', words: ['probar la sesion', 'dos personas', 'encuesta'] },
    { id: 'programa', name: 'Programa del curso', purpose: 'Qué se enseña en cada sesión', words: ['programa', 'sesion', 'esmaltado', 'preguntas', '6 u 8'] },
    { id: 'materiales', name: 'Materiales y horno', purpose: 'Lo necesario para trabajar el barro', words: ['materiales', 'arcilla', 'horno'] },
    { id: 'inscripcion', name: 'Inscripción y difusión', purpose: 'Que la gente se entere y se apunte', words: ['inscripcion', 'consentimiento', 'horario', 'precio', 'anuncio', 'piezas'] },
  ],
  'Boletín del barrio': [
    { id: 'herramientas', name: 'Herramientas', purpose: 'Cuenta, plantilla y suscripción funcionando', words: ['cuenta', 'plantilla', 'formulario', 'enlace', 'suscripcion'] },
    { id: 'contenido', name: 'Contenido', purpose: 'Qué se cuenta en cada envío', words: ['texto', 'noticias', 'piezas', 'fotos'] },
    { id: 'envio', name: 'Envío y resultados', purpose: 'Cuándo se envía y qué pasa después', words: ['fecha', 'aperturas', 'envio'] },
  ],
  'Web de la tienda': [
    { id: 'partida', name: 'Decisiones de partida', purpose: 'Qué web se hace y con qué', words: ['catalogo', 'tecnologia', 'datos minimos', 'que productos'] },
    { id: 'contenido', name: 'Fotos y textos', purpose: 'El material que la web enseña', words: ['fotos', 'textos legales', 'contacto'] },
    { id: 'construccion', name: 'Construcción', purpose: 'Las páginas y cómo se usan', words: ['pagina', 'listado', 'busqueda', 'filtros', 'movil'] },
  ],
  'Archivo de recetas': [
    { id: 'saber', name: 'Saber qué hay', purpose: 'Dónde está todo y en qué estado', words: ['donde estan', 'inventario', 'copias', 'estructura', 'copia de seguridad'] },
    { id: 'ordenar', name: 'Ordenar', purpose: 'Un solo criterio para todas las recetas', words: ['etiquetas', 'fusionan', 'duplicadas', 'plantilla'] },
    { id: 'encontrar', name: 'Encontrar', purpose: 'Llegar rápido a una receta', words: ['busquedas', 'indice', 'fotos'] },
  ],
  'App de hábitos': [
    { id: 'base', name: 'Base técnica', purpose: 'Que el código y los datos estén sanos', words: ['repositorio', 'guardar en el dispositivo', 'pruebas de registro'] },
    { id: 'funciones', name: 'Funciones', purpose: 'Registrar hábitos y mantener rachas', words: ['registro de habitos', 'rachas'] },
    { id: 'pantallas', name: 'Pantallas', purpose: 'Lo que se ve y se toca', words: ['pantalla', 'recordatorio', 'accesibilidad', 'partes'] },
    { id: 'publicar', name: 'Probar y publicar', purpose: 'Que funcione en el iPhone cada día', words: ['iphone', 'version estable'] },
  ],
}

/** How the map shows a task: done, pending, or waiting for the person to confirm something. */
export type MapState = 'terminado' | 'pendiente' | 'confirmar'
export const mapStateOf = (stage: Stage): MapState => (stage === 'cerrada' ? 'terminado' : stage === 'por-clasificar' || stage === 'por-verificar' || stage === 'en-aprobacion' ? 'confirmar' : 'pendiente')
export const MAP_LABEL: Record<MapState, string> = { terminado: 'Terminado', pendiente: 'Pendiente', confirmar: 'Necesita confirmación' }

export interface Area {
  id: string
  name: string
  purpose: string
  tasks: Task[]
  counts: Record<MapState, number>
}

export function areasOf(data: ProjectsData, projectId: string): Area[] {
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return []
  const index = indexTasks(data)
  const rules = RULES[project.name] ?? []
  const areas: Area[] = [...rules, { id: 'otras', name: 'Otras tareas', purpose: 'Lo que no encaja en las demás áreas', words: [] }].map((r) => ({
    id: r.id,
    name: r.name,
    purpose: r.purpose,
    tasks: [],
    counts: { terminado: 0, pendiente: 0, confirmar: 0 },
  }))
  for (const t of data.tasks.filter((x) => x.projectId === projectId)) {
    const title = norm(t.title)
    const i = rules.findIndex((r) => r.words.some((w) => title.includes(w)))
    const a = areas[i >= 0 ? i : areas.length - 1]
    a.tasks.push(t)
    a.counts[mapStateOf(stageOf(data, t, index))]++
  }
  return areas.filter((a) => a.tasks.length)
}

export const areaOf = (data: ProjectsData, projectId: string, areaId: string) => areasOf(data, projectId).find((a) => a.id === areaId)

/** An area named in a sentence («todo lo del riego», «el área de contenido»). */
export function areaInSentence(data: ProjectsData, sentence: string, projectId?: string): { projectId: string; area: Area } | undefined {
  const s = norm(sentence)
  for (const p of data.projects) {
    if (projectId && p.id !== projectId) continue
    for (const a of areasOf(data, p.id)) {
      if (a.id === 'otras') continue
      const words = norm(a.name)
        .split(/\s+/)
        .filter((w) => w.length > 3)
      if (/\b(todo|toda|todas|todos|area)\b/.test(s) && words.some((w) => s.includes(w))) return { projectId: p.id, area: a }
    }
  }
  return undefined
}
