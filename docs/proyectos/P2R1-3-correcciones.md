# P2-R1.3 · Correcciones F01–F04 de la segunda auditoría (`98f99cf`) — `proyectos/p2r1-3-correcciones`

**Autorizado:** 02/11/2026 (Misael). Parte de `proyectos/p2r1-2-correcciones` (`98f99cf`). Mismo alcance que P2-R1 (`node scripts/check-scope.mjs p2r12 98f99cf`). Sin merge, sin recuperación sobre el almacén operativo, sin CORE ni APRENDER, sin funciones nuevas. Solo datos sintéticos. La pantalla Recuperar sigue escribiendo solo en `elyum:prueba-p2r1:*`.

## F01 · Procedencia efectiva (`store/restore.ts`, `referenceCheck`)

Cada referencia rota del resultado se juzga **solo contra el lado del que viene su contenedor**:

- Tarea de un proyecto recuperado, o «todo», o semanas elegidas → viene de la copia.
- Cualquier otra tarea o las semanas no elegidas → vienen de aquí.

Es histórica (se conserva y se avisa) solo si ya estaba rota en ese lado con el contenedor idéntico. Además, si viene de la copia y ese contenedor existe aquí, también tenía que estar rota aquí: **ninguna relación válida aquí se rompe**, tampoco con «todo». Todo lo demás se rechaza antes de escribir, nombrando la tarea, la relación (dependencia o requisito) y la tarea a la que apunta.

## F02 · Una sola política del diario (`store/journal.ts`, `assessJournal`)

`assessJournal` decide para todo: Recuperar, el cierre, y la autorización de **cada** guardado de PROYECTOS, dentro del bloqueo del almacén. Comprueba estructura, estado, formato, generaciones, la huella del texto anterior y que ese texto sea un sobre legible. Un error al leer el diario es «ilegible», nunca «no hay diario». Con un diario abierto, dañado o ilegible no se escribe nada.

## F03 · Diarios de `8c7ea4c` (`closedJournal`)

Todo cierre (comprobar y cerrar, cerrar a mano, cerrar un diario dañado) pasa por `closedJournal`: calcula la huella del texto anterior si falta y valida el diario resultante con la misma política **antes** de escribirlo. Si no saldría válido, no se escribe y se dice.

## F04 · Exportar no es guardar (`ui/files.ts`, `RestoreView.tsx`)

`saveJsonFile` devuelve `entregado` (por compartir o por descarga), `cancelado` o `error`. Para cerrar un diario dañado hace falta: entrega pedida del texto exacto que hay ahora en el diario **y** la casilla «He comprobado que el archivo está guardado», porque la app no puede comprobarlo. Cancelar la hoja de compartir no habilita nada.

## Cuota al cerrar

Si no hay espacio para cerrar el diario, el diario queda intacto, las escrituras siguen bloqueadas y la pantalla muestra un error que no desaparece hasta un cierre correcto, con la vía segura (exportar, liberar espacio de otros sitios, reintentar). Nunca se borra para hacer sitio. `dismissJournal` devuelve un resultado (`{ ok }` o motivo y mensaje) en lugar de `true`/`false`.

## P3 (`e2e/projects/run.mjs`, solo el test)

- Prueba 2: B intenta escribir **sin espera** y se registra la generación que veía. Si se aceptara sobre la generación 0 sería una pérdida real y la prueba falla.
- Prueba 3: las generaciones de cada guardado aceptado van al registro.
- Prueba 4: señal explícita dentro del callback del Web Lock antes de seguir, comprobación con `navigator.locks.query()` de que el guardado de B está en cola, y de que nada se escribe mientras.
- `P3_LOG=archivo.jsonl` guarda cada comprobación con sus datos.

## Pruebas

- `p2r1-3.test.ts` (13): sobre `98f99cf` fallaban 12; ahora pasan todas. Incluye las reproducciones de Codex (F01 y F02) como regresión.
- `p2r1.test.ts` y `p2r1-2.test.ts`: una línea cada una, porque `dismissJournal` devuelve ahora un resultado.
- `e2e/projects/restore.mjs` (64): 10b ampliado (compartir cancelado, confirmación, cuota al cerrar) y 10d nuevo (F02 y F03 en el navegador).
