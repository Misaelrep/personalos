import type { ProjectsData, Task } from '../domain/types'
import { blockOfTask, projectMap } from './mapa-modelo'

/**
 * PROTOTYPE · Context for a task, so it can be started without researching
 * what it means. Two sources, never mixed:
 *  - DOSSIER (confirmed): title, deliverable, acceptance, estimate, requirements, dependencies.
 *  - SIMULATED AI: «qué hacer», «por qué importa» and «qué implica». Short,
 *    editable, and without people's names, amounts, times, requirements or
 *    dependencies the dossier does not have. Roles («quien gestiona el agua») are fine.
 * Hand-written for the two demo projects with key results; a rule by verb for the rest.
 */

export interface Brief {
  hacer: string
  porque: string
  implica: string
}

const WRITTEN: Record<string, Brief> = {
  // Huerto comunitario
  'HUE-01': { hacer: 'Repartir quién riega cada día y dejarlo escrito donde todos lo vean.', porque: 'Sin turnos, el riego depende de la buena voluntad del día y las plantas sufren.', implica: 'Preguntar disponibilidad a los voluntarios, proponer un calendario, acordarlo y publicarlo en el cartel o el grupo.' },
  'HUE-02': { hacer: 'Comprobar que la llave de paso abre, cierra y no pierde agua.', porque: 'Es el punto del que depende todo el riego: si falla, no llega agua a ninguna parcela.', implica: 'Ir al huerto, abrir y cerrar la llave, mirar si gotea y anotar qué falta. Si hay que cambiar piezas, hablar antes con quien gestiona el agua.' },
  'HUE-03': { hacer: 'Comprar las semillas que se van a plantar este invierno.', porque: 'Sin semillas no hay primera cosecha.', implica: 'Partir de la decisión de qué parcelas se cultivan, hacer la lista, comparar dónde comprarlas y guardar el tique.' },
  'HUE-04': { hacer: 'Montar o poner en marcha el compost del huerto.', porque: 'Mejora la tierra de los bancales y aprovecha los restos del propio huerto.', implica: 'Elegir el sitio, preparar el recipiente, explicar a los voluntarios qué se puede echar y qué no.' },
  'HUE-05': { hacer: 'Decidir qué parcelas se cultivan esta temporada y cuáles descansan.', porque: 'Ordena el trabajo: semillas, riego y voluntarios dependen de esta elección.', implica: 'Mirar el estado de cada parcela, valorar cuántas se pueden cuidar de verdad y dejar la decisión por escrito.' },
  'HUE-06': { hacer: 'Tener una lista de las personas que quieren ayudar y cómo contactarlas.', porque: 'Es la base para repartir turnos y convocar reuniones.', implica: 'Reunir los nombres que ya hay, preguntar en el barrio, pedir permiso para guardar el contacto y mantener la lista en un solo sitio.' },
  'HUE-07': { hacer: 'Escribir las normas básicas de uso del huerto.', porque: 'Los acuerdos claros evitan conflictos y hacen que el huerto no dependa de una sola persona.', implica: 'Recoger lo que ya se hace, proponer un borrador corto, comentarlo en la reunión y publicar la versión acordada.' },
  'HUE-08': { hacer: 'Pintar el cartel que identifica el huerto en la entrada.', porque: 'Hace visible el proyecto y ayuda a que nuevos vecinos se acerquen.', implica: 'Decidir el texto, conseguir pintura y tabla, pintarlo y colocarlo.' },
  'HUE-09': { hacer: 'Dejar la caseta de herramientas en condiciones de uso.', porque: 'Las herramientas guardadas y en orden ahorran tiempo en cada turno.', implica: 'Revisar puerta y cerradura, tirar lo roto, ordenar lo útil y anotar lo que falte.' },
  'HUE-10': { hacer: 'Pedir el permiso necesario para usar el agua del huerto.', porque: 'Sin permiso el riego puede pararse en cualquier momento.', implica: 'Averiguar a quién se pide, preparar la solicitud con lo que exijan, enviarla y guardar la respuesta.' },
  'HUE-11': { hacer: 'Medir las parcelas y apuntar sus medidas.', porque: 'Permite calcular semillas, riego y reparto entre voluntarios con datos reales.', implica: 'Llevar cinta métrica, medir cada parcela, dibujar un plano sencillo y guardarlo junto al resto del proyecto.' },
  'HUE-12': { hacer: 'Plantar los primeros bancales.', porque: 'Es el primer paso visible hacia la cosecha.', implica: 'Preparar la tierra, sembrar según lo decidido, regar y anotar qué se plantó y dónde.' },
  'HUE-13': { hacer: 'Instalar el riego por goteo en las parcelas.', porque: 'Reparte el agua de forma estable y reduce el trabajo de cada turno.', implica: 'Revisar qué material hay, montar las líneas, probar que llega agua a todas las parcelas y anotar cómo se abre y se cierra.' },
  'HUE-14': { hacer: 'Convocar la primera reunión de voluntarios.', porque: 'Es donde se acuerdan normas y turnos entre todos.', implica: 'Elegir fecha y lugar, avisar a la lista de voluntarios, preparar los temas y apuntar los acuerdos.' },
  'HUE-15': { hacer: 'Repartir las llaves del huerto a quien las necesite.', porque: 'Que cada turno pueda entrar sin depender de una sola persona.', implica: 'Decidir quién tiene llave, hacer copias si hace falta y anotar a quién se entregó cada una.' },
  'HUE-16': { hacer: 'Anotar qué se recogió en la primera cosecha.', porque: 'Deja constancia de que el huerto funciona y sirve para mejorar la siguiente temporada.', implica: 'Pesar o contar lo recogido, apuntarlo por parcela y compartirlo con los voluntarios.' },
  // Taller de cerámica
  'CER-01': { hacer: 'Elegir la duración del curso entre las dos opciones que se barajan.', porque: 'El número de sesiones condiciona el programa, los materiales y el precio.', implica: 'Comparar qué cabe en cada opción, pensar en el grupo al que va dirigido y dejar la decisión por escrito.' },
  'CER-02': { hacer: 'Escribir qué se hace en cada sesión del curso.', porque: 'Es el corazón del curso: sin programa no se puede probar ni anunciar.', implica: 'Definir el objetivo de cada sesión, las técnicas, el material necesario y lo que se llevará cada persona.' },
  'CER-03': { hacer: 'Revisar las primeras sesiones del programa.', porque: 'Detectar a tiempo lo que no encaja antes de probarlo con alumnos.', implica: 'Leer cada sesión, comprobar que el tiempo alcanza y anotar cambios. Puede ayudar contrastarlo con alguien que ya enseñe cerámica.' },
  'CER-04': { hacer: 'Rehacer la sesión de esmaltado.', porque: 'Es la sesión más delicada: materiales caros y resultados que dependen del horno.', implica: 'Simplificar los pasos, decidir qué esmaltes se usan y prever qué pasa con las piezas entre sesiones.' },
  'CER-05': { hacer: 'Hacer la lista de materiales que necesita el curso.', porque: 'Sin ella no se puede pedir presupuesto ni calcular el precio.', implica: 'Partir del programa, sesión por sesión, y apuntar barro, esmaltes, herramientas y lo que aporta cada persona.' },
  'CER-06': { hacer: 'Pedir presupuesto de arcilla y esmaltes.', porque: 'Permite saber cuánto cuesta el curso antes de fijar el precio.', implica: 'Enviar la lista de materiales a varios proveedores, comparar condiciones y plazos de entrega y guardar las respuestas.' },
  'CER-07': { hacer: 'Diseñar la ficha con la que la gente se apunta al curso.', porque: 'Es la puerta de entrada de las personas inscritas.', implica: 'Decidir qué datos se piden y por qué, cómo se envía y dónde se guardan las respuestas.' },
  'CER-08': { hacer: 'Redactar el consentimiento que firman quienes participan.', porque: 'Deja claro qué se hace en el taller y cómo se usan sus datos e imágenes.', implica: 'Escribir un texto breve y claro; si hay dudas legales, consultarlas antes de usarlo.' },
  'CER-09': { hacer: 'Elegir el horario del curso.', porque: 'Determina quién puede venir y cuándo se reserva el horno.', implica: 'Ver la disponibilidad del espacio y del horno, pensar en el público y proponer un horario.' },
  'CER-10': { hacer: 'Reservar el horno para las sesiones que lo necesitan.', porque: 'Sin horno no hay piezas terminadas.', implica: 'Confirmar con quien gestiona el horno los días y las condiciones de uso, y dejar la reserva por escrito.' },
  'CER-11': { hacer: 'Dar la primera sesión a un grupo muy pequeño a modo de prueba.', porque: 'Es la forma más barata de saber qué funciona antes del curso completo.', implica: 'Preparar el material de la sesión, darla, observar qué cuesta y pedir opinión al terminar.' },
  'CER-12': { hacer: 'Preparar la encuesta para el final del curso.', porque: 'Lo que digan las primeras personas decide cómo será el curso definitivo.', implica: 'Escribir pocas preguntas, fáciles de responder, sobre contenido, ritmo y materiales.' },
  'CER-13': { hacer: 'Fotografiar piezas de ejemplo para enseñar el curso.', porque: 'Una imagen explica mejor que un texto lo que se aprende.', implica: 'Elegir piezas, buscar buena luz y un fondo neutro, y guardar las fotos con permiso de quien las hizo.' },
  'CER-14': { hacer: 'Fijar el precio del curso.', porque: 'Tiene que cubrir los costes y resultar razonable para quien se apunta.', implica: 'Sumar materiales, horno y espacio a partir de los presupuestos, compararlo con otros cursos y decidir.' },
  'CER-15': { hacer: 'Publicar el anuncio del curso.', porque: 'El curso existe cuando hay gente que se entera y se apunta.', implica: 'Redactar el anuncio con fechas, precio y ficha de inscripción, y difundirlo por los canales que ya tienes, como el boletín del barrio.' },
  'CER-16': { hacer: 'Reunir las preguntas que suelen surgir en cada sesión.', porque: 'Ayuda a preparar respuestas y a mejorar el programa.', implica: 'Anotar las dudas de la prueba, agruparlas por sesión y añadir la respuesta breve.' },
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const objectOf = (title: string) => title.replace(/^\S+\s+/, '')

/** The original task a «Revisar / Documentar / Probar / Cerrar X» refers to, when there is one. */
function baseOf(data: ProjectsData, t: Task): Task | undefined {
  const obj = objectOf(t.title).toLowerCase()
  return data.tasks.find((x) => x.projectId === t.projectId && x.id !== t.id && objectOf(x.title).toLowerCase() === obj && !/^(Revisar|Documentar|Probar|Cerrar)\b/.test(x.title))
}

const FOLLOW: Record<string, (obj: string, base?: string) => Omit<Brief, 'porque'> & { porque: (base?: string) => string }> = {
  Revisar: (obj) => ({ hacer: `Comprobar que ${obj} quedó como se esperaba y anotar lo que haya que corregir.`, implica: 'Mirar el resultado, compararlo con lo que se pedía, apuntar los ajustes y decidir si se da por bueno.', porque: (b) => (b ? `Asegura que «${b}» sirve antes de construir encima.` : 'Asegura que el trabajo sirve antes de construir encima.') }),
  Documentar: (obj) => ({ hacer: `Dejar por escrito ${obj}, para que otra persona lo entienda sin preguntarte.`, implica: 'Escribir lo esencial con un ejemplo, guardarlo junto al resto del proyecto y avisar de dónde está.', porque: (b) => (b ? `Lo hecho en «${b}» no se pierde ni depende de tu memoria.` : 'Lo hecho no se pierde ni depende de tu memoria.') }),
  Probar: (obj) => ({ hacer: `Probar ${obj} en condiciones reales y anotar qué falla.`, implica: 'Seguir los pasos como lo haría quien lo va a usar, apuntar cada fallo y repetir la prueba tras corregir.', porque: (b) => (b ? `Confirma que «${b}» funciona fuera del papel.` : 'Confirma que funciona fuera del papel.') }),
  Cerrar: (obj) => ({ hacer: `Dar por terminado ${obj} y dejar recogido lo pendiente.`, implica: 'Revisar que no queda nada abierto, anotar lo que pasa a otra tarea y archivar lo que ya no se usa.', porque: () => 'Cerrar bien evita que el trabajo vuelva a abrirse sin querer.' }),
}

const VERB: Record<string, string> = {
  Decidir: 'Reunir las opciones, valorar pros y contras con lo que ya sabes y dejar la decisión por escrito.',
  Elegir: 'Comparar las opciones disponibles con un criterio sencillo y anotar cuál se elige y por qué.',
  Identificar: 'Buscar dónde está lo que se necesita, preguntar a quien pueda saberlo y apuntar lo encontrado.',
  Averiguar: 'Buscar dónde está lo que se necesita, preguntar a quien pueda saberlo y apuntar lo encontrado.',
  Definir: 'Proponer una primera versión, contrastarla con quien vaya a usarla y fijarla por escrito.',
  Montar: 'Preparar las piezas necesarias, montarlas siguiendo lo decidido y comprobar que funciona.',
  Crear: 'Hacer una primera versión sencilla, probarla y ajustarla.',
  Añadir: 'Incorporarlo a lo que ya existe sin romperlo y comprobar que todo sigue funcionando.',
  Preparar: 'Reunir lo necesario y dejarlo listo para el siguiente paso.',
  Hacer: 'Recorrerlo con calma y apuntarlo todo en un solo sitio, sin cambiar nada todavía.',
  Comparar: 'Poner las versiones una al lado de otra y anotar en qué se diferencian.',
  Comprobar: 'Seguir los pasos como lo haría quien lo usa y anotar si funciona o no.',
  Unificar: 'Elegir una forma común, aplicarla en todo y anotar el criterio.',
  Ordenar: 'Elegir un criterio sencillo, aplicarlo y explicar dónde queda cada cosa.',
  Programar: 'Escribir el código de la parte indicada, probarlo y dejar anotado cómo se usa.',
  Diseñar: 'Esbozar la propuesta, enseñarla a quien la vaya a usar y ajustarla antes de construir.',
  Escribir: 'Redactar una primera versión breve y revisarla antes de darla por buena.',
  Unir: 'Juntar las partes, comprobar que encajan y corregir lo que no.',
  Confirmar: 'Comprobar que está en orden y dejar constancia de ello.',
  Reunir: 'Pedir o buscar el material, juntarlo en un solo sitio y descartar lo que no sirve.',
  Pedir: 'Averiguar a quién se pide, enviar la petición con lo necesario y guardar la respuesta.',
  Medir: 'Elegir qué se mide, recoger los datos y anotar qué se concluye.',
  Fijar: 'Proponer una opción concreta, comprobar que es viable y comunicarla.',
}

export function briefOf(data: ProjectsData, t: Task): Brief {
  const src = t.sourceId ?? ''
  if (WRITTEN[src]) return WRITTEN[src]
  const verb = t.title.split(/\s+/)[0]
  const obj = lc(objectOf(t.title))
  const block = blockOfTask(projectMap(data, t.projectId), t.id)
  const blockWhy = block ? `Forma parte de «${block.name}»: ${lc(block.purpose).replace(/\.$/, '')}.` : 'Forma parte del proyecto.'
  const follow = FOLLOW[verb]
  if (follow) {
    const base = baseOf(data, t)
    const f = follow(obj, base?.title)
    return { hacer: f.hacer, implica: f.implica, porque: f.porque(base?.title) }
  }
  return { hacer: `${t.title}.`, implica: VERB[verb] ?? (block?.implies ?? 'Leer la tarea en el dossier y decidir el siguiente paso concreto.'), porque: blockWhy }
}
