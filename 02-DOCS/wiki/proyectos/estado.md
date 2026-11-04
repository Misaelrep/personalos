---
type: estado
title: PROYECTOS — estado y reglas
topic: proyectos
timestamp: 2026-11-02
---

# PROYECTOS — estado y reglas

Lee esto antes de trabajar en PROYECTOS. Actualízalo cuando cambie una rama, una decisión o un pendiente.

## Qué es

PROYECTOS es un módulo de ELYUM (PWA en React + TypeScript + Vite) para seguir la ejecución de varios proyectos durante un ciclo de 90 días (26-oct-2026 a 23-ene-2027). Vive en `src/features/projects/`. Tiene una página de prueba propia, `proyectos.html`, que es la segunda entrada de `vite.config.ts`.

- Datos: `localStorage`, claves `elyum:projects:v1:data` y copias previas `prev:1..3`. Cada escritura sube una generación y va protegida con Web Locks; sin Web Locks, solo lectura.
- Pruebas: Vitest (`src/**/*.test.ts`) y e2e con Playwright/Chromium en `e2e/projects/`. `scripts/check-scope.mjs` comprueba que cada paquete solo toca sus archivos.
- Validación final de cada paquete: prueba física del dueño en su iPhone.

## Ramas (ninguna fusionada en `main`)

`main` = `62be277` y **todavía no contiene código de PROYECTOS**.

| Paquete | Rama | Commit | Estado |
|---|---|---|---|
| P1.1 modelo | `proyectos/p1-1-modelo` | `f786f80` | Aprobado |
| P3 almacén e importación | `proyectos/p3-almacen` | `441b200` | Aprobado (alcance limitado) |
| P4a pantallas | `proyectos/p4a-pantallas` | `04d5927` | Aprobado en iPhone |
| P4b operaciones | `proyectos/p4b-operaciones` | `ccae16e` | Aprobado en iPhone |
| P2-R1 recuperación desde copia | `proyectos/p2r1-recuperacion` | `8c7ea4c` | Aprobado en iPhone; fuera de producción |
| P4c navegación (main + P1–P4b + barra) | `proyectos/p4c-navegacion` | `5e3cc1e` | Listo, sin merge |
| P2-R1.4 Recuperar dentro de PROYECTOS | `proyectos/recuperar-operativo` | ver PR en borrador | En revisión; sin merge |

Ramas que no se usan: `proyectos/p2-copias` (no apta), `proyectos/p4c-preparacion` (sustituida), `proyectos/p2r1-1-duplicados` (F1 sobre una base antigua, no aplicada).

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

## Estado a 04/11/2026

- En producción (`main` = `77656f9`): P4c (PROYECTOS en el menú de ELYUM) y P2-R1 (motor de Recuperar y bloqueo por diario sobre las claves reales). Recuperar no se ofrecía dentro de ELYUM.
- `proyectos/recuperar-operativo` (P2-R1.4) abre Recuperar dentro de PROYECTOS sobre su propio almacén, sin tocar el motor. Ver `docs/proyectos/P2R1-4-recuperar-operativo.md`. Respaldo: `respaldo/main-antes-de-recuperar` = `77656f9`.
- Importar los proyectos reales sigue sin autorizar.

## Pendientes (lista histórica; ver el estado de arriba)

1. Corregir los hallazgos de la auditoría independiente de P2-R1 (`8c7ea4c`): H1 requisitos rotos que se escriben y avisos descartados; H2 la casilla «He revisado» no se reinicia al cambiar la selección; H3 el diario guarda el estado anterior completo (~5× los datos); H4 `inspectJournal` decide «sin escribir» solo por la generación; H5 test de P3 intermitente (defecto del test).
2. Rehacer F1 sobre `8c7ea4c`: avisar, en vez de bloquear por nombre, cuando una copia es anterior a un reinicio.
3. P2-R1.2: activar el destino real (`elyum:projects:v1:*`) con una prueba mínima con datos sintéticos.
4. Elegir un solo sitio de datos en iOS (recomendado: la app instalada; Safari no comparte almacenamiento con ella).
5. Con autorización: importar los proyectos reales uno a uno, exportando después de cada uno.
6. Con autorización: merge de P4c y del resto en `main`. Antes, ocultar las herramientas de prueba en modo `embedded`.
7. P2-E (`4509355`) choca con `main` en `App.tsx` y `sections.ts`: se resuelve aparte.
