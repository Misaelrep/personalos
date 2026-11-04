# P2-R1 · Integración con main — `proyectos/p2r1-integracion`

**Autorizado:** 03/11/2026 (Misael), solo D1: commits de integración, rama publicada y PR en borrador. Sin merge, sin cambios en `main`, sin despliegue, solo datos sintéticos.

Base: `main` = `10cc045` (P4c en producción). Se fusiona `4fe6671` (P2-R1 con H01–H04, F01–F04 y R13-01, este último verificado por Codex).

## Commits

1. Merge de `4fe6671` con los conflictos resueltos y los ajustes para que Recuperar no aparezca dentro de ELYUM.
2. Laboratorio operativo sintético de Codex ([P2R1-operativo-sintetico.md](P2R1-operativo-sintetico.md)).
3. Acceso HTTPS temporal desde el iPhone, solo desarrollo ([P2R1-acceso-iphone.md](P2R1-acceso-iphone.md)).

## Conflictos y resolución

- `scripts/check-scope.mjs`: se conservan los paquetes de P4c (`p4c`) y los de P2-R1 (`p2r1`, `p2r12`).
- `ui/ProjectsApp.tsx`: P4c había unificado la cabecera en `inner`, compartida dentro y fuera de ELYUM. Se mantiene esa estructura:
  - el aviso de recuperación pendiente (H04, `pending-recovery`) va dentro de `inner`, antes de los avisos, y se ve también dentro de ELYUM;
  - las filas «Recuperar» y «Prueba del iPhone» solo salen en la página de prueba (`!embedded`).

## Ajustes para ELYUM (P4c)

Recuperar sigue siendo una herramienta de prueba con su almacén separado hasta que se apruebe su integración operativa:

- dentro de ELYUM, `#/recuperar` no abre la pantalla Recuperar;
- `ExportView` recibe `embedded`; dentro de ELYUM no enlaza a Recuperar y dice que todavía no está disponible;
- `e2e/projects/integration.mjs` añade 3 comprobaciones de ambas cosas.

## Pruebas sobre el árbol final

typecheck y build correctos · `npm test` 733 + 2 omitidas · e2e `integration` 23/23, `restore` 78/78, `screens` 36/36, `operations` 26/26, `run` 28/28, `operational` 11/11, `operational-https` 15/15 · `check-scope p2r12` correcto · build con `VERCEL_ENV=production`: solo `index.html`, sin laboratorio ni `proyectos.html`.

No toca CORE, APRENDER, HOY, FOCUS, SEMANA, DAYSCAPE, `App.tsx`, `sections.ts`, `NavRail.tsx` ni `vite.config.ts`.
