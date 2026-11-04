# P2-R1.2 · Correcciones H01–H04 de la auditoría de P2-R1 — `proyectos/p2r1-2-correcciones`

**Autorizado:** 02/11/2026 (Misael). Parte de `proyectos/p2r1-recuperacion` (`8c7ea4c`, el commit auditado). Mismo alcance que P2-R1: solo `src/features/projects/`, `e2e/projects/`, `docs/proyectos/` y `scripts/check-scope.mjs` (`node scripts/check-scope.mjs p2r12 8c7ea4c`). Sin merge, sin recuperación sobre el almacén operativo, sin P2-R global, sin tocar el CORE, APRENDER, HOY, FOCUS, SEMANA ni DAYSCAPE. Solo datos sintéticos.

Validación:

```
npm test && npm run build && node scripts/check-scope.mjs p2r12 8c7ea4c && node e2e/projects/run.mjs && node e2e/projects/screens.mjs && node e2e/projects/operations.mjs && node e2e/projects/restore.mjs
```

## H01 · Integridad de dependencias (`store/restore.ts`, `referenceCheck`)

Antes de validar, `buildRestore` busca en el resultado **todas** las referencias que apuntan a nada: `dependsOn`, requisitos de tipo tarea, compromisos semanales y notas semanales (`notes[].projectId`). Da igual el proyecto: las dependencias entre proyectos se tratan igual.

- **Nueva** (la rompería la recuperación) → la selección se rechaza **antes de escribir**, con una frase que dice qué tarea o qué semana queda afectada, a qué apunta y qué hacer: «recupera también «X»» o ««X» de la copia no tiene esa tarea (es posterior a la copia): recuperarlo la quitaría».
- **Histórica** (ya estaba rota) → se permite y se muestra como aviso «Ya estaba así antes de recuperar (se conserva)». Es histórica solo si la entidad que la contiene (la tarea o la semana) queda **exactamente** como estaba en el lado del que viene (aquí o en la copia) y allí ya estaba rota.
- Nunca se repara ni se elimina nada para pasar la comprobación.
- «Todo» deja exactamente la copia: lo que pudiera estar roto ya lo estaba en la copia, así que es histórico.
- Los avisos ya no se descartan: `Built` lleva `warnings` y la pantalla los enseña antes de confirmar.

## H02 · Selecciones combinadas (`RestoreUnit.choosable`, `RestoreView.tsx`)

- `selectable` sigue significando «se puede recuperar **sola**». `choosable` dice si se puede **marcar** (tiene algo que recuperar). Una unidad que no vale sola se puede marcar y la pantalla explica qué necesita.
- La selección entera se reconstruye y comprueba en cada cambio de casilla. Si no vale, no aparece el botón de confirmar (solo los motivos).
- «He revisado» vale solo para la selección exacta en la que se marcó: cualquier cambio de casillas o de «todo» la desmarca (corrige el H2 de la auditoría: un clic sustituía todo).

## H03 · Diario de recuperación (`store/journal.ts`, `readJournal`, `diagnoseJournal`, `dismissJournal`)

- Se valida **toda** la estructura: cada campo con su tipo, estado conocido, lo que cada estado necesita («completada» con generación resultante y huella del texto anterior; los cerrados con fecha de cierre), y el texto anterior contra su huella y como sobre legible.
- La huella del texto anterior se calcula antes de escribir: el diario está completo desde su primera escritura.
- Un diario incompleto o dañado es «ilegible»: **nunca** se lee como cerrado, bloquea recuperaciones y escrituras (H04) y se conserva tal cual.
- Vía de diagnóstico y recuperación en Recuperar: el motivo; «Guardar el diario tal cual» (descarga el texto exacto); y solo después «Lo he guardado: cerrarlo», que deja un diario cerrado con el texto dañado dentro (`damaged`) y, si sigue entero, el texto anterior para «Volver a lo de antes» con vista previa. Nada se borra; «Borrar el almacén de prueba» se desactiva mientras haya un diario abierto.
- Misma generación con otro contenido ya no es «sin escribir» (sonda H-gen de la auditoría): solo el texto exacto de antes lo demuestra. Además, si al escribir el texto guardado no es el que vio la vista previa, la recuperación se rechaza como conflicto sin escribir nada.

## H04 · Recuperación pendiente (`store/store.ts`, `store/session.ts`, pantallas)

- El almacén de PROYECTOS (P3) lee el diario **dentro de su bloqueo** antes de cada guardado. Si hay una recuperación abierta o un diario dañado → «recuperacion-pendiente», no se escribe nada. Vale para todas las pestañas y la app instalada. No es una interceptación global de `localStorage`: solo el almacén de PROYECTOS, sobre su propio diario (en el almacén de prueba, su diario con prefijo).
- Al abrir PROYECTOS, la sesión lo detecta (`pendingRecovery`), la pantalla lo avisa y no ofrece escrituras; otra pestaña lo detecta al cambiar el diario (evento `storage`).
- Nada se cierra solo: en Recuperar, «sin escribir» y «escrita sin cerrar» se comprueban otra vez y se cierran **cuando la persona lo pide**; «desconocida» y «dañado», con sus vías propias.
- En el almacén operativo no hay todavía pantalla para resolverla, porque recuperar sobre él sigue sin habilitar; si apareciera un diario allí, PROYECTOS queda en consulta y exportación.

## Pruebas

- `p2r1-2.test.ts` (23): sobre `8c7ea4c` fallaban 19 de las primeras 22; ahora pasan todas. Copia antigua que quitaría una tarea referenciada; dependencias y requisitos entre proyectos; semanas con sus proyectos (compromisos y notas); avisos históricos; todas las combinaciones sin referencias rotas nuevas; combinaciones válidas en conjunto; siete diarios dañados con formato correcto; diario cortado; diagnóstico y cierre; misma generación con otro contenido; interrupción seguida de edición; detección al abrir; conflicto entre pestañas; cambios concurrentes en los dos órdenes. Cada rechazo comprueba que el almacenamiento queda idéntico, byte a byte.
- `p2r1.test.ts`: tres pruebas ajustadas al nuevo comportamiento (el motivo de las semanas ahora nombra la tarea y qué recuperar; «desconocida» ya solo puede provocarla una escritura ajena al almacén, porque PROYECTOS no escribe con un diario abierto).
- `e2e/projects/restore.mjs` (56): pasos nuevos 3b (H02), 10 reescrito (H04, resolución explícita, edición en dos pestañas), 10b (H03) y 10c (PROYECTOS abierto con una recuperación pendiente).
- `e2e/projects/run.mjs` (P3): solo el test. Sincronización explícita entre pestañas (esperar a que cada pestaña vea la generación, con el tiempo esperado en el registro), comprobación de que ningún guardado correcto sale de la misma base, y `P3_LOG=archivo.jsonl` para registrar cada comprobación. La aplicación no cambia por esto.

Chromium no es WebKit: el comportamiento en el iPhone se confirma solo con la prueba física.
