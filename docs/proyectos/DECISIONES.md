# PROYECTOS · decisiones aprobadas

Registro técnico de las decisiones tomadas durante la revisión del 23/10/2026.

- Solo contiene lo necesario para continuar el desarrollo.
- Los datos del usuario (nombres de proyectos, backlogs, dossiers) **no se guardan en este repositorio público**.

## Producto

- **Seis proyectos independientes.**
  - ATLAS es una referencia transversal, **no** un séptimo proyecto.
  - Los nombres y contenidos llegan por importación local, nunca en el código.
- **PROYECTOS tiene navegación propia**, fuera de APRENDER.
- **El núcleo actual se mantiene:** HOY, SEMANA y FOCUS no se rediseñan.
- **Relación inicial con HOY:** una próxima acción que la persona acepta voluntariamente. La app nunca cambia objetivos por su cuenta, y terminar un FOCUS no cierra tareas: queda como evidencia.
- **Los IDs originales de los dossiers se conservan** exactos e inmutables. Las tareas nuevas creadas en ELYUM reciben un ID interno generado; nadie escribe IDs.
- **Dimensiones separadas:** estado operativo, prioridad, responsable, dependencia, criterio de aceptación, evidencia y aprobación. Una tarea ejecutada puede seguir pendiente de aprobación humana.
- **Sin correspondencias automáticas** con las etiquetas de la rutina (`web`, `wellness`, `newsletter`…). La tabla existe con todo «sin asignar» hasta que se confirme, y la rutina no se modifica para PROYECTOS.
- **Proyectos sin bloques en la rutina:** tienen seguimiento y capacidad declarada. La revisión humana es los domingos; los encargos técnicos avanzan entre semana.
- **Ciclo:** del 26/10/2026 al 23/01/2027 (90 días, 13 semanas de lunes a domingo). Revisión semanal el domingo.
- **Revisión semanal en cinco grupos:**
  1. tareas existentes
  2. próximas acciones candidatas
  3. compromisos humanos de la semana
  4. encargos activos de agentes
  5. pendientes de aprobación

  Nada se activa automáticamente. El sistema ayuda a limitar el trabajo simultáneo y a respetar la capacidad.
- **Aprobación normalizada:** `no-requiere` · `pendiente` · `aprobada` · `devuelta`. El estado y la evidencia de aprobación originales se guardan aparte.
- **Estados originales:** no se normalizan automáticamente los ambiguos (p. ej. «en espera», «descartada»). Cada correspondencia la decide la persona.
- **Agentes** (Claude Code, Codex): sin escritura directa en los datos de ELYUM. Sus trabajos se registran y los verifica la persona.
- **Dispositivo principal:** el iPhone, con copias recuperables fuera de él.

## Datos y seguridad

- Los dossiers, backlogs y datos personales **nunca** entran en este repositorio (público) ni en los despliegues de prueba. Se cargan por importación local.
- **Copias de seguridad en SISTEMA** (P2):
  - incluyen CORE, APRENDER y PROYECTOS;
  - esquema versionado, integridad, exportación externa y restauración selectiva;
  - ningún conflicto se resuelve con sobrescritura silenciosa;
  - recuperación real probada en un entorno separado antes de usarla con datos importantes.
- **Errores de almacenamiento:** visibles, con mecanismos aislados y sin refactorizar el núcleo.

## Proceso

- **Ramas:**
  - `feature/proyectos` nace de `main`, con un paquete por rama.
  - Sin merge a `main`, despliegue a producción, rebase destructivo ni force push sin autorización.
  - Las ramas de APRENDER no se tocan.
- **Antes de cualquier integración:** diferencias, riesgos y resultados de regresión.
- **Push de ramas de desarrollo:** autorizado, siempre que los Preview estén protegidos y sin datos privados.
- **Paquetes autorizados:** P2 (copias) y P1 (modelo).
- **Aún no autorizados:**
  - P3 y siguientes;
  - fusiones;
  - producción;
  - importar datos reales;
  - cambios en la rutina;
  - pantallas fuera de estos paquetes.
