# P1.1 · Cambios propuestos al modelo tras validarlo con un dossier real

**Estado:** propuesta. **No aplicada.** Requiere aprobación.

La validación se hizo en privado con el dossier de muestra. El informe con su contenido se entregó aparte y no está en este repositorio. Aquí solo quedan las conclusiones **genéricas**, sin datos del dossier.

## Resultado

- **Conservación: completa.** Todos los identificadores, tareas, estados literales, criterios de aceptación, dependencias escritas, referencias a fuentes y el texto íntegro sobreviven a la ida y vuelta modelo → JSON → `validateProjectsData` → reconstrucción, sin una sola diferencia.
- La comprobación falla, como debe, ante 6 alteraciones de control:
  - un estado cambiado;
  - una tarea eliminada;
  - un campo borrado;
  - una fila cruda alterada;
  - un registro auxiliar eliminado;
  - un ID duplicado.
- **Pero el modelo actual obligaría a inventar:**
  1. una **clase de trabajo** para cada estado literal, porque el validador lo exige. Muchos literales del dossier describen **qué evidencia existe**, no en qué punto está el trabajo;
  2. un **estado de aprobación** para cada tarea, aunque el dossier no lo indique.
- **Mucha información solo cabe en `extra`**, donde se conserva pero la app no puede usarla:
  - área;
  - entregable;
  - estimaciones en rango;
  - posibles agentes;
  - fuentes;
  - registros auxiliares que no son tareas.
- **Las dependencias reales no son solo IDs.** Hay alternativas («A o B»), rangos condicionales, abreviaturas y requisitos externos. Con solo `dependsOn`, la app recomendaría como siguiente acción tareas que en el dossier dependen de condiciones sin cumplir.

## Cambios propuestos

| # | Cambio | Riesgo |
|---|---|---|
| M1 | Clase de trabajo **«sin decidir»** para un literal aún no clasificado: la tarea es válida, aparece «por clasificar» y no cuenta como candidata ni como terminada | Bajo |
| M2 | **Verificación** como cuarta dimensión opcional (verificada / sin verificar / no consta), separada de trabajo y aprobación | Medio |
| M3 | **Requisitos estructurados** junto a `dependsOn`: `{literal, tipo: tarea·alternativa·condicional·externo·recurso, ids[], cumplido?}`. Un requisito sin cumplir impide que la tarea sea candidata, y se muestra | Medio |
| M4 | Campos `area` y `deliverable` | Bajo |
| M5 | Estimación literal con rango y periodicidad opcionales; `estimateHours` sigue para los compromisos semanales | Bajo |
| M6 | `delegation` (posibles agentes) separado de `owner` (responsable) | Bajo |
| M7 | Registro de fuentes por dossier y referencias por tarea | Bajo |
| M8 | Entidad para registros que no son tareas (por ejemplo, piezas con varias dimensiones de estado). **Recomendado aplazar** | Alto |
| M9 | Reglas del proyecto, por ejemplo un límite de trabajo simultáneo, solo con aviso | Bajo |
| M10 | Alcance de una aprobación (qué se aprobó) y aprobaciones parciales | Bajo |
| M11 | Aprobación «sin dato» para lo importado sin aprobación declarada | Bajo |

Todos se probarían solo con datos sintéticos, en `proyectos/p1-dominio`.
