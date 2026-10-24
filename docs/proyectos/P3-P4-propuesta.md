# P3 y P4 · Alcance propuesto para PROYECTOS

**Estado:** propuesta. **No autorizada.** No se empieza ninguno sin tu aprobación. No dependen de P2-R (restauración del núcleo).

Parte de lo aprendido:
- validar P1 con un dossier real ([`P1-propuesta-1.1.md`](P1-propuesta-1.1.md));
- la auditoría de P2 (H01–H12): sobrescrituras silenciosas, escrituras concurrentes, errores silenciados, datos ilegibles.

## P3 · Almacén de PROYECTOS e importación de dossiers (sin pantallas de trabajo)

### Alcance

1. **P1.1:** los cambios del modelo que apruebes (recomendados: M1, M3–M7, M10, M11; M8 aplazado).
2. **Almacén propio**, `elyum:projects:v1:*`. Solo PROYECTOS escribe esas claves y ninguna versión anterior de ELYUM las conoce, así que H03 no le afecta.

   | Riesgo | Medida |
   |---|---|
   | Sobrescritura silenciosa | Cada guardado lleva una **generación**. Antes de escribir se relee: si la generación cambió (otra pestaña o la app instalada), **no se escribe**, se recarga y se muestra el conflicto |
   | Carreras entre pestañas | La relectura y la escritura se hacen dentro de un **Web Lock** (`navigator.locks`, Safari 15.4+). Sin Web Locks, PROYECTOS abre **en solo lectura** en lugar de arriesgarse. **No se da por hecho que esté libre de problemas de concurrencia**: se prueba con dos pestañas reales y se documenta lo que queda |
   | Error de escritura | **Nunca se silencia**: aviso persistente y el cambio queda marcado como no guardado |
   | Datos ilegibles o de versión futura | Validación al cargar (`validateProjectsData`). Si fallan, PROYECTOS **no escribe nada** y ofrece exportarlos tal cual (P2-E ya los copia) |
   | Error humano | Historial de solo añadir (ya en P1) y las **3 últimas versiones** guardadas antes de cada escritura (`…:prev:1..3`), dentro del límite de tamaño |

3. **Copia y recuperación de PROYECTOS:**
   - las exportaciones P2-E ya incluyen PROYECTOS;
   - un **recordatorio de exportar** en la revisión del domingo, con la fecha de la última copia verificada;
   - el **dossier original** sigue siendo la fuente para reimportar;
   - **P2-R1, restaurar solo PROYECTOS** desde una copia v2 (vista previa, conflictos explícitos, generación y Web Lock): se propone aquí, pero **requiere su propia autorización**, porque es una restauración.
4. **Importación de dossiers en el dispositivo:**
   - eliges el archivo, que se lee en el teléfono y nunca sale de él;
   - se muestran el inventario y los literales sin clasificar;
   - nada se importa hasta que **tú** decides cada correspondencia (o la marcas «sin decidir», con M1);
   - una **reimportación** compara por ID original: nuevas, cambiadas e iguales. Si un cambio hecho en ELYUM choca con el dossier, sale como **conflicto explícito**, nunca como sobrescritura;
   - formato inicial: tablas Markdown como las del dossier validado, con correspondencia de columnas por dossier.
5. **Pruebas:**
   - unitarias con dossiers **sintéticos**;
   - e2e con dos pestañas reales, cuota llena, datos corruptos, versión futura, ida y vuelta y reimportación;
   - controles negativos;
   - auditoría de Codex.

### Fuera de P3

Pantallas de trabajo, cambios en HOY, FOCUS, SEMANA, APRENDER o la rutina, y cualquier dato real en el repositorio o en un Preview.

### Núcleo

Ninguno, salvo un punto de entrada para la importación. Se propone dentro de SISTEMA, que ya existe. Si hiciera falta una sección nueva, se presentaría con el formato de seis puntos.

**Estimación:** 14–20 h de desarrollo + 3–5 h de auditoría.

## P4 · Pantalla PROYECTOS y revisión semanal

### Alcance

1. **Sección PROYECTOS:** una entrada nueva en `sections.ts` y `App.tsx`, por el mismo camino que SISTEMA. **Requiere aprobación** (núcleo).
2. **Vista por proyecto** (los seis):
   - tareas con sus **tres dimensiones** separadas (trabajo, prioridad, aprobación), más verificación si se aprueba M2;
   - bloqueos y requisitos sin cumplir;
   - candidatas a siguiente acción;
   - grupo «por clasificar».
3. **ATLAS** como panel de referencia transversal, sin estados. **No** es un séptimo proyecto.
4. **Revisión del domingo:**
   - las cinco distinciones de la semana (`projectWeek`);
   - capacidad declarada y horas de rutina **solo** por correspondencias confirmadas;
   - compromisos humanos y límite de trabajo simultáneo, con aviso pero sin impedirlo;
   - notas y decisiones;
   - **cola de aprobaciones** («ejecutada + aprobación pendiente» no es terminada);
   - recordatorio de exportar.
5. **Operaciones de P1** (`ops.ts`) con historial: estado, aprobación, evidencia (enlace o nota), siguiente acción, responsable, compromisos.
6. **Correspondencias con la rutina:** proponer y confirmar, como dato. **No modifica la rutina.**

### Fuera de P4

Enlazar FOCUS como evidencia automática (toca el núcleo: P5, si se aprueba) e importar datos reales sin tu autorización.

**Estimación:** 16–24 h de desarrollo + 3–5 h de auditoría + tu revisión del diseño.

## Orden recomendado

1. Decisiones de P1.1 (correspondencias del dossier y cambios del modelo).
2. Cierre de P2-E: auditoría de Codex, prueba en el iPhone y autorización.
3. P3 (con P2-R1 si lo autorizas).
4. P4.
5. X5-A en paralelo, si lo apruebas.

P2-R (restauración del núcleo) queda fuera de este camino.
