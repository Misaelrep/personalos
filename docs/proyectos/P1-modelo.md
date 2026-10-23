# P1 · Modelo de datos de PROYECTOS — `proyectos/p1-dominio`

**Responsable:** Claude Code (implementación). **Aprobación:** Misael.

**Alcance aprobado:** dominio puro en `src/features/projects/domain/`.
- Sin pantallas ni almacenamiento.
- Sin navegación.
- Sin tocar HOY, FOCUS, SEMANA ni APRENDER.

Nada lo importa todavía, así que el bundle de producción no cambia. Validación:

```
npm test && npm run build && node scripts/check-scope.mjs p1
```

## Principios

1. **Lo que viene de un dossier se conserva tal como estaba escrito.**
   - El ID original va en `sourceId`, literal e inmutable.
   - El estado, la prioridad y la aprobación se guardan con sus palabras.
   - El registro crudo y su procedencia van en `origin`; los campos desconocidos, en `extra`.
   - La app añade una **capa de normalización** (`Vocabulary`) para trabajar con esos valores. Nunca los sustituye.
2. **Tres dimensiones separadas:** estado operativo, prioridad y aprobación humana. Una tarea `ejecutada` con aprobación `pendiente` **no está terminada** y no desbloquea a quien depende de ella.
3. **Ninguna correspondencia con la rutina se infiere.** Un proyecto solo recibe horas de rutina mediante un `RoutineLink` **confirmado**; sin él, recibe 0. Los proyectos sin bloques en la rutina trabajan con la capacidad que se declara el domingo.

## Archivos

| Archivo | Contenido |
|---|---|
| `types.ts` | Modelo de datos (ver abajo) |
| `ids.ts` | `src:<ID original>` para lo importado; `new:<uuid>` generado para lo creado en ELYUM (nadie escribe IDs); informe de prefijos; duplicados |
| `vocabulary.ts` | Normalización: estado → clase de trabajo, prioridad → rango, aprobación → estado. Una palabra desconocida es error, nunca suposición |
| `schema.ts` | Validación de datos externos: errores (detienen) y avisos (se conservan y muestran: dependencia a un ID inexistente, ciclo de dependencias) |
| `derive.ts` | Terminada / pendiente de aprobación / devuelta / cerrada / bloqueada; próxima acción; la semana en cinco grupos; carga frente a capacidad y límite de trabajo simultáneo (avisa, no impide) |
| `capacity.ts` | Minutos de rutina por etiqueta con el mismo resolutor que HOY; capacidad solo por correspondencias confirmadas; tabla de correspondencias, todas «sin asignar» por defecto |
| `cycle.ts` | Ciclo 26/10/2026 → 23/01/2027 (90 días, 13 semanas de lunes a domingo; la última acaba en sábado) |
| `ops.ts` | Cambios que hace la persona, puros y con historial. Ninguno toca `sourceId`, `origin` ni la aprobación original; ninguno cambia un estado por su cuenta (FOCUS es evidencia) |
| `../projects.test.ts` | 24 tests con datos **sintéticos** (los IDs imitan la forma de los reales: PUB, EDI, SYS, COM, M…) |

## Modelo

**Clases de trabajo** (`WorkClass`, internas):

| Clase | Significado |
|---|---|
| `pendiente` | Sin empezar |
| `en-curso` | En marcha |
| `en-espera` | Detenida por algo externo |
| `ejecutada` | Hecha técnicamente |
| `descartada` | No se hará |

Cada estado literal de un dossier se asigna a una clase **por decisión humana** antes de importar.

**Aprobación** (`ApprovalState`, normalizada): `no-requiere` · `pendiente` · `aprobada` · `devuelta`. Además, `Approval.original` guarda la aprobación del dossier literal: valor, quién, cuándo y evidencia.

**Tarea** (`Task`), cada aspecto en su campo:

| Campo | Contenido |
|---|---|
| `id` | Interno |
| `sourceId` | ID original |
| `ref` | Referencia legible opcional |
| `status` | Literal del dossier |
| `priority` | Literal del dossier |
| `owner` | `humano` o `agente`, con nombre |
| `dependsOn` | Tareas de las que depende |
| `acceptance` | Criterios de aceptación |
| `evidence` | Enlaces, notas o sesiones de FOCUS |
| `approval` | Aprobación normalizada y original |
| `nextAction` | Próxima acción |
| `estimateHours` | Estimación |
| `atlasRefs` | Referencias ATLAS |
| `origin` | Procedencia |
| `extra` | Campos del dossier sin mapear |

**Otras entidades:**
- `Project`, `Milestone`.
- `AtlasRef`: ATLAS como referencia transversal, sin estados.
- `RoutineLink`: correspondencia con la rutina, con estado `propuesta` o `confirmada`.
- `WeekPlan`: compromisos humanos, capacidad declarada, límite de trabajo simultáneo, notas y decisiones.
- `HistoryEntry`: historial que solo se amplía.
- `Cycle`.

**La semana de un proyecto** (`projectWeek`), en cinco grupos distintos:
1. Tareas existentes (backlog abierto).
2. Próximas acciones candidatas.
3. Compromisos humanos de la semana.
4. Encargos activos de agentes (Claude Code, Codex).
5. Pendientes de aprobación.

Nada se compromete automáticamente.

## Pendiente

- Validar el modelo contra el **dossier de muestra de Sistema de Comunicación Wellness** (PUB, EDI, SYS, COM) cuando llegue. Criterio de P1: representarlo sin pérdida.
- El conversor de dossiers es P3 (no autorizado todavía).
