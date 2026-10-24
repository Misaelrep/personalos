# X5-A · Cuarentena de días ilegibles al arrancar — propuesta de paquete independiente

**Estado:** propuesta. **No implementada.** Aprobada conceptualmente. Antes de implementarla se piden un diff acotado, pruebas y garantías de que no altera datos en silencio; este documento los describe. **Requiere tu aprobación expresa**, porque toca un archivo del núcleo.

**Rama prevista:** `proyectos/x5a-cuarentena` desde `main`. Independiente de P2-E y de P2-R.

## Problema (H07, ya existe en `main`)

Un día guardado que el núcleo no puede consumir se pierde o rompe la app **antes de que nadie pueda exportarlo**:

| Caso | Qué hace hoy `main` | Resultado |
|---|---|---|
| El valor no es JSON | `loadDay` devuelve un día vacío; `DayProvider` lo guarda al montarse | **Los bytes originales se sobrescriben** |
| JSON con otra fecha o sin `records` | Igual | Igual |
| JSON aceptado por `loadDay` pero con tipos que rompen el render (p. ej. `objective: 123` → `schedule.ts` llama a `.trim()`) | La app falla al pintar | **Pantalla en blanco** |

## Presentación de la excepción del núcleo

| | |
|---|---|
| **Archivo afectado** | `src/main.tsx` |
| **Motivo técnico** | Es el único punto que se ejecuta antes de que `DayProvider` lea y vuelva a guardar el día. Cualquier protección posterior llega tarde |
| **Cambio mínimo** | 2 líneas: `import { quarantineUnreadableDays } from './features/recovery/quarantine'` y su llamada antes de `createRoot`. El resto vive en un módulo nuevo, fuera del núcleo |
| **Riesgo** | Un validador equivocado podría aislar un día válido, que entonces aparecería vacío en HOY. Sus bytes seguirían en cuarentena, visibles y exportables. Un error interno del módulo nunca debe impedir el arranque |
| **Pruebas de regresión** | Ver abajo |
| **Alternativa sin modificar el núcleo** | Una página separada (`recuperacion.html`) para exportar los bytes en bruto. **No evita la pérdida** al abrir la app con normalidad; solo sirve si se abre antes. O no hacer nada y depender de exportar con frecuencia (situación actual) |

Para que el aviso sea visible sin abrir SISTEMA hacen falta 2 líneas más en `src/App.tsx`, archivo ya tocado por SISTEMA. Sin ellas, el aviso solo aparece en SISTEMA.

## Diff acotado (previsto)

```
src/main.tsx                                  +2
src/features/recovery/quarantine.ts           nuevo, ~70 líneas
src/features/recovery/quarantine.test.ts      nuevo
src/features/backup/domain/collect.ts         +1 regla: elyum:quarantine:* entra en la copia (P2-E)
src/features/backup/ui/Copias.tsx             lista de días en cuarentena (solo lectura)
e2e/x5a.spec.ts                               nuevo
```

## Comportamiento

Para cada clave `personal-os:day:*` (nunca `sim`):

1. **Solo se actúa si el núcleo la perdería o fallaría con ella.** Es decir:
   - no es JSON;
   - `loadDay` la rechazaría;
   - o tiene un tipo que hace fallar el render.

   Cada condición tiene que estar **demostrada con un test** que reproduzca la pérdida o el fallo en el núcleo real. Un valor solo «raro» pero inocuo (un estado desconocido, un campo de más) **no** se toca.
2. **Copia antes de nada:** los bytes van, idénticos, a `elyum:quarantine:v1:<clave original>`. Si esa clave ya existe con otros bytes, se usa `…#2`, `…#3`, sin sobrescribir nunca. La copia se relee y se compara byte a byte.
3. **Solo si la copia se verificó,** se elimina la clave original. El núcleo creará un día vacío al abrir esa fecha, como ya hace hoy, pero ahora sin perder nada.
4. **Si la copia falla** (cuota, bloqueo), **no se toca nada**: la app se comporta exactamente como `main`.
5. **Un error interno** del módulo se captura; el arranque continúa sin cambios.
6. **Es idempotente:** un segundo arranque no hace nada.
7. **Nada en silencio:**
   - SISTEMA muestra «Se aisló un día que no se podía leer: <fecha>», persistente mientras exista la cuarentena;
   - con las 2 líneas de `App.tsx`, además, un aviso discreto en HOY;
   - las copias P2-E incluyen la cuarentena.

## Garantías que deben quedar probadas

| Garantía | Prueba |
|---|---|
| Ningún día válido se toca | Fixtures de cada formato histórico (IDs de martes antiguos, V3), días producidos por `dayReducer` en pruebas basadas en propiedades: almacenamiento idéntico byte a byte tras arrancar, salvo lo que el núcleo ya escribe (hoy, entrada) |
| Los bytes aislados son idénticos | Comparación byte a byte, en unitarias y e2e |
| Sin copia verificada, el original sigue | Simulación de cuota llena |
| Nunca bloquea el arranque | Excepción forzada dentro del módulo → la app arranca como `main` |
| El caso de la auditoría ya no deja la app en blanco | `objective: 123` → la app arranca, el día queda en cuarentena y se avisa |
| Simulación intacta | `?date=` / `?t=` no se tocan |
| Regresión | Las 280 pruebas del núcleo + `pwa.test.ts` + build |

**Esfuerzo estimado:** 4–6 h de desarrollo + auditoría de Codex (1–2 h).
