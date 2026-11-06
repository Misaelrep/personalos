---
type: estado
title: PROYECTOS — estado y reglas
topic: proyectos
timestamp: 2026-11-06
---

# PROYECTOS — estado y reglas

Lee esto antes de trabajar en PROYECTOS. Actualízalo cuando cambie una rama, una decisión o un pendiente.

## Qué es

PROYECTOS es un módulo de ELYUM (PWA en React + TypeScript + Vite) para seguir la ejecución de varios proyectos durante un ciclo de 90 días (26-oct-2026 a 23-ene-2027). Vive en `src/features/projects/`. Tiene una página de prueba propia, `proyectos.html`, que es la segunda entrada de `vite.config.ts`.

- Datos: `localStorage`, claves `elyum:projects:v1:data` y copias previas `prev:1..3`. Cada escritura sube una generación y va protegida con Web Locks; sin Web Locks, solo lectura.
- Pruebas: Vitest (`src/**/*.test.ts`) y e2e con Playwright/Chromium en `e2e/projects/`. `scripts/check-scope.mjs` comprueba que cada paquete solo toca sus archivos.
- Validación final de cada paquete: prueba física del dueño en su iPhone.

## Qué hay en `main` (06/11/2026, `main` = `7a52221`)

Todo PROYECTOS ya está en `main`, fusionado por pull requests:

| PR | Rama | Qué trae |
|---|---|---|
| #1 | `proyectos/rsc-harness` | Kit rsc para Claude y Codex (`02-DOCS/`, `.claude/`, `AGENTS.md`) |
| #2 | `proyectos/p4c-navegacion` | P1.1 + P3 + P4a + P4b + P4c: PROYECTOS como sección de ELYUM |
| #3 | `proyectos/p2r1-integracion` | P2-R1 con sus correcciones (P2-R1.2 H01–H04, P2-R1.3 F01–F04, P2-R1.3.1 R13-01) |
| #4 | `proyectos/recuperar-operativo` | P2-R1.4: Recuperar dentro de PROYECTOS; herramientas de prueba fuera del build de producción |
| #5 | `proyectos/importar-dependencias` | Dependencias explícitas al importar (IDs de una letra, rangos, «Ninguna para») |

**Abierto:** #6 `proyectos/importar-abreviaturas` (dependencias abreviadas), en borrador y sin merge.

Detalle de cada paquete en `docs/proyectos/`. Respaldo anterior a Recuperar: `respaldo/main-antes-de-recuperar` = `77656f9`.

Ramas que no se usan: `proyectos/p2-copias` (no apta), `proyectos/p4c-preparacion` (sustituida), `proyectos/p2r1-1-duplicados` (F1 sobre una base antigua, no aplicada). Las ramas de paquete ya fusionadas (`p1-1-modelo`, `p3-almacen`, `p4a-pantallas`, `p4b-operaciones`, `p2r1-recuperacion`) son solo historia.

## Reglas

- Responder en español.
- Trabajar siempre en un worktree o rama aparte. Un paquete por rama: no combinar paquetes.
- Sin merge a `main`, sin deploy a producción y sin force push, salvo aprobación explícita.
- **El repo es público:** nunca subir dossiers, datos reales ni datos personales. Solo datos sintéticos en tests, capturas y Previews.
- No tocar HOY, FOCUS, SEMANA, DAYSCAPE ni APRENDER. No tocar `feature/aprender-sunset-final` ni `proyectos/p2e-exportar`.
- Cada fase necesita autorización explícita.
- No crear un botón «Reiniciar entorno».
- No inventar estados, prioridades, responsables ni aprobaciones: conservar el texto de origen y usar «sin decidir».
- Sin auditorías generales de ELYUM: solo de lo que toca PROYECTOS.

## Pendientes

- Revisar y decidir el PR #6.
- Importar los proyectos reales sigue requiriendo autorización por proyecto, y hay que exportar después de cada importación. Los dossiers reales nunca entran al repo.
- P2-E (`4509355`) choca con `main` en `App.tsx` y `sections.ts`: se resuelve aparte.
- Antes de dar por cerrado cualquier pendiente antiguo (F1 sobre una copia anterior al reinicio, un solo sitio de datos en iOS), compruébalo en `docs/proyectos/` y con el dueño.
