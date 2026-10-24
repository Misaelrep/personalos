# P3 · Almacén e importación de PROYECTOS — `proyectos/p3-almacen`

**Responsable:** Claude Code. **Autorizado:** 24/10/2026, con alcance limitado. **Sin pantallas de trabajo** (P4) ni cambios en la navegación, el CORE o APRENDER. Nada de la app importa este código todavía: el bundle de producción no cambia.

Validación:

```
npm test && npm run build && node scripts/check-scope.mjs p3 && node e2e/projects/run.mjs
```

## Piezas

| Archivo | Qué hace |
|---|---|
| `import/bundle.ts` | **Formato intermedio** `elyum-dossier/1`: tareas, fuentes y registros que no son tareas, todo literal y con su lugar (sección, línea, texto exacto). Un bundle no decide nada |
| `import/markdown.ts` | Tablas Markdown con su ruta de títulos; filas exactas; `\|` escapado; ignora bloques de código; BOM y CRLF |
| `import/readers.ts` | Lectores por **formato de dossier**. Hoy solo `tablas-md/wellness-1` (columnas con nombre). Un archivo que ningún lector reconoce se rechaza entero. UTF-8 estricto y huella SHA-256 de los bytes |
| `import/requirements.ts` | Texto de dependencia → requisitos de P1.1 (M3). Solo **añade** restricciones: lo dudoso queda «por verificar» |
| `import/plan.ts` | `planImport` (vista previa: nuevas, iguales, cambiadas, conflictos, ya no están, literales nuevos) y `applyImport` (tras confirmar). El resultado se valida; si no es válido no se importa nada |
| `store/store.ts` | Almacén propio `elyum:projects:v1:*` con generación, Web Lock, 3 versiones previas y relectura |
| `store/export.ts` | Copia verificable: el texto guardado byte a byte + huella + resumen. **Sin restauración** desde archivo (requiere autorización) |
| `store/session.ts` | Una sesión abierta: cambiar, previsualizar, confirmar; el último error siempre visible |
| `e2e/projects/` | Banco de pruebas en navegador real (no es la pantalla de P4) |

## Reglas de importación

- Lo que decide la persona va en `ImportDecisions`: proyecto destino, clase de cada estado (lo no decidido queda `sin-decidir`), estados de aprobación (lo no decidido queda `sin-dato`), rangos de prioridad (sin rango, la prioridad se conserva como texto) y reglas informativas.
- Responsables, prioridad, horas y candidatos de delegación **nunca** se rellenan al importar.
- Los registros que no son tareas (piezas, inventario, pasos) entran como **referencias** con sus celdas literales. M8 sigue aplazado.
- Un ID repetido en el dossier, o que ya pertenece a otro proyecto, detiene la importación. No se renombra.
- **Reimportación.** Cada tarea guarda lo que la importación derivó (`origin.snapshot`). Se comparan tres valores por campo:
  - cambió solo el dossier → «cambiada», se aplica al confirmar;
  - cambió solo ELYUM → se conserva;
  - cambiaron los dos → **conflicto** visible; por defecto se conserva ELYUM, salvo que la persona elija el dossier.
  - Una condición ya respondida en ELYUM convierte un cambio del texto de dependencia en conflicto.
  - Una tarea que ya no está en el dossier se lista y **no se borra**.
  - Responsable, decisión de aprobación, evidencias, siguiente acción y verificación no se tocan nunca.

## Reglas del almacén

| Riesgo | Medida | Prueba |
|---|---|---|
| Sobrescritura por otra pestaña o la app instalada | Cada guardado indica su generación; dentro del Web Lock se relee y, si cambió, **no se escribe** | Unitaria + navegador (pestaña desactualizada, carrera de 50 cambios sin pérdidas) |
| Navegador sin Web Locks | **Solo lectura**; nunca escribe sin bloqueo | Unitaria + navegador sin `navigator.locks` |
| Bloqueo retenido | Espera 5 s y rechaza visiblemente; al cerrar una pestaña, el navegador libera su bloqueo | Navegador |
| Sin espacio u otro error de escritura | Se devuelve y se muestra; el dato guardado queda como estaba | Unitaria + navegador con el almacenamiento lleno |
| Escritura que no se conserva | Se relee lo escrito antes de darlo por bueno | Unitaria |
| Datos corruptos, alterados o de versión futura | Huella SHA-256 y validación al cargar; se abren como tales, **nunca se sobrescriben** y se exportan tal cual | Unitaria + navegador |
| Error humano | Historial de solo añadir y 3 versiones previas recuperables (`recover`), sin perder la actual | Unitaria |

**Límites conocidos.**
- Las versiones previas están en el mismo almacenamiento: si el navegador lo borra, se pierden con los datos. Solo una exportación guardada fuera protege de eso.
- Probado en Chromium. Safari en iPhone ofrece Web Locks desde iOS 15.4; **no se ha probado todavía en un iPhone real**. Si faltaran, PROYECTOS abre en solo lectura (probado).
- En iPhone, la app instalada y Safari tienen almacenamientos **distintos**: los datos importados en uno no aparecen en el otro.
