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
| `proyectos/p2-copias` | `97a1f9d` | P2 · Copias de seguridad de ELYUM en SISTEMA | Candidato; pendiente de prueba física y auditoría |
| `proyectos/p1-dominio` | `7982db3` | P1 · Modelo de datos de PROYECTOS | Candidato; pendiente de validar con el dossier de muestra |

Nada se ha fusionado a `main` ni desplegado a producción.

## Documentos

| Documento | Contenido |
|---|---|
| [`DECISIONES.md`](DECISIONES.md) | Decisiones de producto, datos y proceso aprobadas |
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
| `evidencias/2026-10-23-p2/` | Registro de la demostración y capturas resumidas |

## Validación rápida de cualquier rama

```
npm ci && npm test && npx tsc -b && npm run build
node scripts/check-scope.mjs p1   # o p2, en su rama
```
