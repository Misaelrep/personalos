# P4b · Operaciones y revisión semanal de PROYECTOS — `proyectos/p4b-operaciones`

**Autorizado:** 24/10/2026, tras validar P4a en el iPhone. Parte de `proyectos/p4a-pantallas`. Sigue en la página de prueba `proyectos.html`: **fuera de la navegación** (P4c), sin cambios en `vite.config.ts`, el CORE ni APRENDER. Sin merge.

Validación:

```
npm test && npm run build && node scripts/check-scope.mjs p4b origin/proyectos/p4a-pantallas && node e2e/projects/run.mjs && node e2e/projects/screens.mjs && node e2e/projects/operations.mjs
```

## Qué se puede hacer

| Dónde | Operación | Función |
|---|---|---|
| `#/semana` | Capacidad y límite de la semana, asumir y quitar compromisos (con horas opcionales), cerrar la revisión | `setWeekLimits`, `commit`, `uncommit`, `closeWeekReview` |
| `#/nuevo-proyecto` | Crear proyecto con nombre y objetivo; ID generado; nombres parecidos avisados y bloqueados hasta «es distinto» | `createProject`, `similarProjects` |
| IMPORTAR | Un dossier cuyo nombre se parece a un proyecto existente exige elegir: «Importar en X» o «Es otro proyecto» | `similarProjects` |
| TAREA · Decidir | Cambiar estado (palabras del dossier y, si faltan, las de ELYUM); clasificar una palabra sin clase; verificación; aprobar o devolver (motivo obligatorio) | `changeStatus`, `classifyStatus`, `setVerification`, `decideApproval` |
| TAREA · Requisitos | Condición cumplida / no cumplida / por verificar | `setCondition` |
| TAREA · Responsable | Sin asignar, yo, Claude Code, Codex; instrucción = siguiente acción | `setOwner`, `setNextAction` |
| TAREA · Evidencias | Nota o enlace (http/https), solo añadir | `addEvidence` |

Todas pasan por `session.change`: generación + Web Lock + relectura. El resultado siempre se ve (aviso inferior); un conflicto no escribe nada, relee y pide repetir.

## Reglas

- La revisión muestra **todos** los proyectos, pero solo propone lo que P1 considera listo; no exige tareas por proyecto. Avisa (no impide) si te pasas de horas o de límite, o si hay compromisos sin horas, bloqueados o cerrados.
- Los encargos a agentes aparecen aparte (proyecto y revisión) y no cuentan en tu carga ni en tus candidatas.
- «Ejecutada» no cierra: sin aprobación (o con «sin dato») la tarea espera tu decisión. Devolver la reabre con su motivo. Verificar es independiente de aprobar.
- Cambiar el estado no toca el literal original: queda en la procedencia (`origin.raw`) y en el historial. Una palabra de ELYUM se añade al vocabulario del proyecto solo al elegirla, con su propia línea en el historial.
- Nombre de la persona como responsable: «Misael» (fijo en `TaskActions.tsx`).

## Pruebas

- `p4b.test.ts`: 17 unitarias (crear proyecto y parecidos, vinculación, estados, requisitos, encargos, devolución/aprobación, revisión con seis proyectos, persistencia de cada operación y rechazo de una sesión desactualizada para cada una, solo lectura).
- `e2e/projects/operations.mjs`: 26 comprobaciones en Chromium a 390 px con una revisión semanal sintética completa. **Chromium no es Safari.**
- P4a (`screens.mjs`, 36) y P3 (`run.mjs`, 24) siguen pasando.

## Riesgos antes de P4c y de importar los proyectos reales

- **Recuperación:** sigue sin existir restauración desde una copia externa. Antes de usar PROYECTOS como registro principal hace falta implementarla y probarla.
- Safari y la app instalada tienen datos separados: hay que elegir uno como sitio de trabajo.
- Los seis backlogs reales necesitan clasificar sus palabras de estado (Wellness: E3–E15 sin decidir) antes de que aparezcan candidatas.
- Capacidad: no hay un valor por defecto; los 13 h + 2 h no se han confirmado.
- Sin crear ni editar tareas a mano (fuera del alcance), sin borrar, sin deshacer: un error se corrige con otra operación y queda en el historial.
- P4c tocará `App.tsx` y `sections.ts`, también tocados por APRENDER y P2-E.
