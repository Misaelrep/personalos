# P2-R1 · Recuperar PROYECTOS desde una copia exportada — `proyectos/p2r1-recuperacion`

**Autorizado:** 25/10/2026. Parte de `proyectos/p4b-operaciones` (`ccae16e`). Solo PROYECTOS: no usa ni incorpora código de la restauración global P2-R, ni toca el CORE, APRENDER o la navegación. Sin merge.

**Destino en este paquete: solo el almacén de prueba separado** (`elyum:prueba-p2r1:*`). Recuperar sobre los datos de PROYECTOS del dispositivo queda pendiente de la auditoría independiente (Codex) y de la prueba física en el iPhone.

Validación:

```
npm test && npm run build && node scripts/check-scope.mjs p2r1 origin/proyectos/p4b-operaciones && node e2e/projects/run.mjs && node e2e/projects/screens.mjs && node e2e/projects/operations.mjs && node e2e/projects/restore.mjs
```

## Pasos (`store/restore.ts`)

| Paso | Función | Escribe |
|---|---|---|
| Leer la copia: JSON, formato `elyum-projects-export/1`, huella del texto guardado, huella interna del sobre, resumen, esquema, versión | `readBackup` | No |
| Comparar con lo local por unidades: cada proyecto (tareas, hitos, referencias, fuentes, vocabulario, vínculos de rutina) y las revisiones semanales | `planRestore` | No |
| Construir el resultado de lo elegido y validarlo; una elección que no valida se rechaza con el motivo | `buildRestore` | No |
| Escribir: bloqueo propio de recuperación (una a la vez) + bloqueo y generación del almacén de P3; diario antes de tocar los datos; relectura con un almacén nuevo | `performRestore` | Sí |
| Al abrir: averiguar qué pasó con una recuperación sin cerrar y cerrarla si está claro | `inspectJournal`, `settleJournal` | Solo el diario |
| Lo de antes como copia, recuperable por los mismos pasos | `journalAsCopy` | No |

## Reglas

- **Por defecto no se recupera nada.** Lo local se conserva; lo que solo está aquí nunca se toca en una recuperación selectiva.
- **Selectiva** por proyecto o semanas, solo si el resultado valida y no rompe nada compartido (p. ej. un vocabulario de dossier usado por otro proyecto local). El historial nunca se reemplaza: se suman las líneas de la copia y una línea que registra la recuperación.
- **Todo**: el almacén queda exactamente como la copia (más la línea de la recuperación). Lo de antes queda en el diario.
- **Confirmación explícita**: casilla «He revisado lo que cambia» + botón. Avisa de cambios locales posteriores a la copia que se perderían.
- **Concurrencia**: si otra pestaña escribió después de la vista previa → «conflicto», no se escribe nada. Dos recuperaciones a la vez → la segunda se rechaza al instante. Sin Web Locks → no se recupera.
- **Interrupción**: el diario (`…:antes-de-recuperar`) se escribe dentro del mismo bloqueo, antes de los datos, con el texto exacto que se reemplaza. Al volver a abrir: «sin escribir» → se cierra como no aplicada; «escrita» → se comprueba y se cierra; «desconocida» (algo escribió después) → queda abierta, bloquea nuevas recuperaciones y ofrece guardar o recuperar lo de antes.
- **Errores**: sin espacio para el diario o los datos, escritura rechazada o relectura que no coincide → se informa y nunca se anuncia como recuperado.
- `store.ts` gana dos cosas compatibles: `save(..., { beforeWrite })` (escribir algo dentro del mismo bloqueo, antes de los datos; si falla no se escribe nada) y `ifAvailable` en el tipo de Web Locks.

## Pantalla `#/recuperar` (página de prueba)

Almacén de prueba (cargar sintéticos, copiar aquí PROYECTOS —solo lectura—, perder el primer proyecto, hacer un cambio local, exportar, borrar solo `elyum:prueba-p2r1:*`) → 1 Elegir la copia → 2 Qué cambiaría → 3 Confirmar → resultado releído → Última recuperación (guardar o volver a lo de antes).

## Pruebas

- `p2r1.test.ts` (27): lectura y rechazos (no JSON, cortada, otra app, vacía, demasiado grande, alterada de cuatro formas, versión futura de tres formas), comparación, selección, todo, elecciones que no validan, vocabulario compartido, conflicto, dos recuperaciones, sin Web Locks, sin espacio para el diario, escritura rechazada, relectura que no coincide, interrupción en dos puntos, resultado desconocido, deshacer, aislamiento del almacén de prueba.
- `e2e/projects/restore.mjs` (36, Chromium tamaño iPhone): recuperación sintética real comprobada leyendo `localStorage`, deshacer, seis archivos incompatibles, pestaña desfasada, recuperación simultánea, cuota agotada, tres interrupciones al reabrir, copia de Exportar de PROYECTOS recuperada entera, PROYECTOS intacto, sin Web Locks.

Chromium no es WebKit: el comportamiento en el iPhone se confirma solo con la prueba física.
