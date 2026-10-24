# PROYECTOS · documentación recuperable

Toda la documentación de PROYECTOS vive aquí, versionada en Git, para no depender de rutas temporales. Este repositorio es **público**: solo contiene documentación técnica y datos **sintéticos**.

Los materiales con datos personales no se guardan aquí y se entregan aparte:
- nombres de proyectos;
- dossiers;
- análisis de los dossiers.

## Ramas y commits

| Rama | Commit | Contenido | Estado |
|---|---|---|---|
| `feature/proyectos` | — | Tronco de PROYECTOS y esta documentación | Desarrollo |
| `proyectos/p2e-exportar` | `4509355` | P2-E · Exportar y verificar copias (sin restauración), desde `main` `dfc42a4` | Pendiente de la auditoría de Codex y de la prueba en el iPhone |
| `proyectos/p2-copias` | `e7233a7` | P2 · Copias de seguridad de ELYUM en SISTEMA (revisión 2) | **NO APTO** según la auditoría independiente (H01–H12). Restauración (P2-R) aplazada |
| `proyectos/p1-dominio` | `7982db3` | P1 · Modelo de datos de PROYECTOS | Validado con el dossier: conserva todo; necesita P1.1 (propuesta) |

Nada se ha fusionado a `main` ni desplegado a producción.

## Documentos

| Documento | Contenido |
|---|---|
| [`DECISIONES.md`](DECISIONES.md) | Decisiones de producto, datos y proceso aprobadas |
| [`entregas/2026-10-24-P2E-P1.md`](entregas/2026-10-24-P2E-P1.md) | Entrega de P2-E y de la validación de P1 (versión pública) |
| [`P1-propuesta-1.1.md`](P1-propuesta-1.1.md) | Cambios propuestos al modelo tras validarlo con el dossier (no aplicados) |
| [`P3-P4-propuesta.md`](P3-P4-propuesta.md) | Alcance propuesto de P3 (almacén e importación) y P4 (pantalla y revisión semanal) |
| [`X5A-propuesta.md`](X5A-propuesta.md) | Cuarentena de días ilegibles: diff acotado, garantías y pruebas (no implementada) |
| [`X2-alternativas.md`](X2-alternativas.md) | Detectar escrituras fallidas: alternativas y límites; H03 pendiente |
| P2-E: `P2E-exportacion.md`, `P2E-prueba-iphone.md`, `P2E-auditoria-codex.md` | En la rama `proyectos/p2e-exportar`, con su registro y capturas en `evidencias/2026-10-24-p2e/` |
| [`P2-plan-correccion-auditoria.md`](P2-plan-correccion-auditoria.md) | Plan de corrección tras la auditoría de Codex: matriz H01–H12, excepciones del núcleo X1–X5, límites del navegador, arquitectura de restauración, recuperación, pruebas adversariales, paquete P2-E, secuencia y esfuerzo |
| [`entregas/2026-10-23-P2-revision-2.md`](entregas/2026-10-23-P2-revision-2.md) | Revisión 2 de P2: mitigaciones, pruebas, estado de las verificaciones |
| [`entregas/2026-10-23-P1-P2.md`](entregas/2026-10-23-P1-P2.md) | Informe de entrega de P1 y P2: archivos, modelo, pruebas, demostración, riesgos y recomendación |
| [`P2-prueba-fisica.md`](P2-prueba-fisica.md) | Procedimiento de prueba en el iPhone (Safari y app instalada desde el Preview, solo datos sintéticos) |
| [`P2-auditoria-codex.md`](P2-auditoria-codex.md) | Handoff de la auditoría independiente de P2, sin cambios de código |
| [`P1-validacion-dossier.md`](P1-validacion-dossier.md) | Método de validación del modelo con un dossier real |
| `CHANGELOG.md` y `P1-modelo.md` | En sus ramas de paquete: `proyectos/p2-copias` y `proyectos/p1-dominio` |

## Pruebas y evidencias

| Archivo | Contenido |
|---|---|
| `pruebas/copia-sintetica-v1.json` | Copia de ELYUM **sintética** (huella `7484d68b`) para la prueba física |
| `pruebas/demo-restauracion.cjs` | Demostración automatizada (Playwright) de exportar, restaurar, rechazar una copia alterada, conflictos, fallo a mitad y almacenamiento lleno |
| `evidencias/2026-10-23-p2/` | Registro de la demostración y capturas resumidas (revisión 1) |
| `evidencias/2026-10-23-p2-rev2/` | Revisión 2: prueba con dos pestañas reales (9/9), demostración completa repetida (18/18) |

## Validación rápida de cualquier rama

```
npm ci && npm test && npx tsc -b && npm run build
node scripts/check-scope.mjs p1   # o p2 / p2e, en su rama
npm run test:e2e                  # solo en proyectos/p2e-exportar
```
