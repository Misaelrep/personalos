# P1 · Validación del modelo con un dossier real (método)

**Objetivo:** comprobar que el modelo de PROYECTOS (`src/features/projects/domain/`) puede representar **sin pérdida** todos los elementos del dossier de muestra:
- tipos de tareas
- estados
- prioridades
- aprobaciones
- dependencias
- criterios de aceptación
- evidencias
- responsables
- hitos

El dossier es **privado**. Ni él ni sus resultados detallados entran en este repositorio público. Aquí solo queda el método. El informe con contenido real se entrega a Misael fuera del repositorio.

## Procedimiento

1. **Recepción.** El dossier se guarda solo en el área temporal de la sesión, fuera del repositorio, y se calcula su SHA-256 para la procedencia.
2. **Inventario literal, sin interpretar.** Para cada registro:
   - ID original y su prefijo
   - tipo
   - estado tal como está escrito
   - prioridad
   - responsable
   - dependencias escritas
   - aprobación (valor, quién, cuándo)
   - evidencias
   - criterios de aceptación
   - campos adicionales
3. **Correspondencia con el modelo, campo a campo.**
   - Cada elemento debe tener sitio en un campo del modelo.
   - Lo que no encaje va a `extra` y se señala.
   - Si algo no cabe ni siquiera en `extra` sin perder significado, se propone un cambio del modelo. **No se aplica sin aprobación.**
4. **Vocabulario.** Se listan **todos** los valores distintos de estado, prioridad y aprobación, con sus apariciones. Para cada uno:
   - **Correspondencia propuesta** a una clase técnica (`pendiente`, `en-curso`, `en-espera`, `ejecutada`, `descartada`) o a un estado de aprobación (`no-requiere`, `pendiente`, `aprobada`, `devuelta`).
   - **Clasificación:** *inequívoca* o *requiere decisión*.
   - **Ninguna correspondencia se aplica automáticamente.** En particular, «en espera», «bloqueada», «descartada», «pausada» o «en revisión» y similares se marcan siempre como *requiere decisión*.
5. **Prueba de ida y vuelta.**
   - Conversión manual a un `ProjectsData` en memoria (fuera del repositorio).
   - `validateProjectsData` sin errores.
   - Del modelo se reconstruye cada registro y se compara con el original: IDs, estados literales, aprobaciones originales, dependencias y texto crudo en `origin.raw`.
   - Cualquier diferencia es una pérdida y se informa.
6. **Informe** (privado, para Misael):
   - conteos
   - prefijos
   - tabla de vocabulario con propuestas y decisiones pendientes
   - lista de pérdidas o elementos en `extra`
   - cambios del modelo propuestos, si los hay

Lo **único** que se lleva al repositorio son cambios genéricos del modelo que se aprueben, con tests de datos sintéticos.

## Lo que no se hace

- No se importa nada en ninguna app ni Preview.
- No se escribe el conversor (P3, no autorizado).
- No se normaliza ningún estado ambiguo sin decisión.
