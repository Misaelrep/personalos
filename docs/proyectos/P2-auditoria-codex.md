# P2 · Handoff de auditoría independiente (Codex)

**Para:** Codex, como auditor independiente.
**De:** Claude Code, autor de P2.
**Aprueba:** Misael.

## Reglas de la auditoría

- **No modificar código.** Nada de commits, pushes ni PR en ninguna rama.
- Si quieres probar una hipótesis con código, hazlo en una copia local desechable y descríbelo en el informe. **No lo subas.**
- **No usar datos reales.** Solo los sintéticos de `docs/proyectos/pruebas/` o los que generes.
- **No tocar** `main`, `feature/aprender-*`, Vercel ni producción.

## Qué se audita

| | |
|---|---|
| Repositorio | `Misaelrep/personalos` (público) |
| Rama | `proyectos/p2-copias` |
| Commit | `97a1f9de35728b83a7e9e7c63ea883adff2548bc` |
| Base | `main` en `dfc42a4` |
| Diff | `git diff main...proyectos/p2-copias` (23 archivos, +1.696 / −15) |

**Qué hace P2:** SISTEMA → Copias de seguridad.
- Exporta a un archivo todos los datos de ELYUM que viven en el `localStorage` del dispositivo.
- Los importa con verificación de integridad, vista previa por módulo, conflictos sin sobrescritura silenciosa, copia externa obligatoria antes de escribir, escritura con relectura y vuelta atrás.
- Añade un aviso visible si el almacenamiento falla.

**Archivos principales:**

| Archivo | Contenido |
|---|---|
| `src/features/backup/domain/format.ts` | Formato `elyum.backup` v1 |
| `canonical.ts` | JSON canónico |
| `integrity.ts` | SHA-256 con Web Crypto |
| `collect.ts` | `moduleOf`: qué clave pertenece a qué módulo |
| `create.ts` | Crear la copia |
| `parse.ts` | `parseBackup`, la verificación completa |
| `plan.ts` | `planImport`, `defaultSelection`, `plannedWrites`, `isUntouchedDay` |
| `apply.ts` | `applyWrites` y `rollback` |
| `src/features/backup/storage/storage.ts` | `StorageLike`, `writeVerified`, `isQuotaError` |
| `storage/system.ts` | Prueba de salud, memoria `elyum:system:v1:*` |
| `src/features/backup/ui/Copias.tsx` | Flujo de pantalla; `onApply` hacia la línea 122 |
| `ui/deliver.ts` | Web Share / descarga |
| `ui/health.ts` | Salud del almacenamiento |
| `ui/SystemNotice.tsx` | Aviso global |
| `src/features/backup/backup.test.ts` | 30 tests |

**Núcleo tocado (aprobado):**
- `src/App.tsx`
- `src/layout/sections.ts`
- `src/pwa/moment.ts`

**Cómo se guardan hoy los datos** (inventario completo, de `main` y de la rama de APRENDER):

| Dato | Clave | Escritura |
|---|---|---|
| Días | `personal-os:day:<YYYY-MM-DD>` | `src/state/storage.ts`; guardado en cada cambio (`DayProvider.tsx:46`), errores silenciados |
| Entrada diaria | `personal-os:entry` | `src/features/entry/entryStorage.ts` |
| APRENDER (rama `feature/aprender-sunset-final`, aún no en `main`) | `elyum:learn:v1:state`, `elyum:learn:v1:entry` | Sobre `{v, data}` |
| Simulación (`?date=` / `?t=`) | `personal-os:sim:*`, `elyum:learn:v1:sim:*` | Nunca deben copiarse |

## Cómo ejecutarlo

```
git fetch origin proyectos/p2-copias && git checkout 97a1f9de35728b83a7e9e7c63ea883adff2548bc
npm ci
npm test            # esperado: 12 archivos, 310 tests OK (280 del núcleo + 30 de P2)
npx tsc -b
npm run build       # precache ~892 KiB
node scripts/check-scope.mjs p2
npm run preview     # http://localhost:4173/?entry=none&section=sistema
```

**Documentación y demostración.** Este handoff, la demostración y las evidencias están en la rama `feature/proyectos`, en `docs/proyectos/`, no en el commit auditado. Léelos desde allí (`git show origin/feature/proyectos:docs/proyectos/...`) o en un segundo árbol de trabajo.

- `docs/proyectos/pruebas/demo-restauracion.cjs`: demostración automatizada con Playwright, datos sintéticos y contextos con almacenamiento separado. Las instrucciones de uso están en su cabecera; apúntala al build de P2 con `URL=`.
- `docs/proyectos/pruebas/copia-sintetica-v1.json`: copia sintética de ejemplo.
- `docs/proyectos/evidencias/2026-10-23-p2/`: registro y capturas de la última ejecución.

## Áreas que pido auditar

Para cada una: ¿es correcto? ¿hay un caso que lo rompa? ¿qué severidad tiene?

### 1. Cobertura de datos

- ¿`moduleOf` incluye **todas** las claves que ELYUM escribe (núcleo y APRENDER) y excluye todas las de simulación y las ajenas?
- ¿Hay datos de ELYUM fuera de `localStorage` (sessionStorage, IndexedDB, Cache Storage, cookies) que una restauración debería cubrir?
- ¿Algún prefijo podría capturar claves de otra app que comparta origen?

### 2. Compatibilidad de versiones

- Una copia v1 leída por una versión futura de la app; una copia de versión futura leída por esta (debe rechazarse).
- **Los valores se copian como texto opaco.** Evalúa qué pasa al restaurar días con un formato antiguo: `migrateDay` en `src/state/storage.ts` los migra al leer. ¿Y si APRENDER cambia de `v1` a `v2` de espacio de claves?
- **Punto que señalo yo:** `createdAt` y `device` **no están cubiertos por el hash**. La integridad cubre `modules`; los conteos se verifican aparte. ¿Es aceptable o deberían firmarse también?

### 3. Importación selectiva

- `defaultSelection` y `plannedWrites`: un módulo no seleccionado no se toca nunca, y un conflicto elegido fuera de un módulo seleccionado se ignora.
- **Heurística `isUntouchedDay`:** un día local sin registros, sin Focus y sin meditación movida se preselecciona para la copia. ¿Hay algún estado del día con información que esa regla considere «vacío» por error? Revisa `DayState` en `src/domain/types.ts`.

### 4. Conflictos

- Por defecto se conserva lo local, y elegir la copia es explícito por clave. ¿Hay algún camino en la interfaz (`Copias.tsx`, componente `Preview`) por el que se sobrescriba sin elección visible?
- **Punto que señalo yo:** `onApply` vuelve a calcular el plan con el estado actual justo antes de escribir. Si un dato cambió entre la vista previa y la importación (otra pestaña), ¿qué ocurre con una clave cuyo conflicto ya estaba elegido? Se escribiría la copia sobre el valor nuevo, que queda apartado en `elyum:system:v1:pre-import`.

### 5. Reversión

- `applyWrites` y `rollback`: tras cualquier fallo a mitad de importación, ¿el almacenamiento queda **exactamente** como antes? Incluye claves añadidas (se eliminan) y reemplazadas (se restauran).
- ¿Qué pasa si falla también la vuelta atrás?
- La copia local previa (`elyum:system:v1:pre-import`) tiene **un único hueco** y cada importación lo reemplaza. ¿Es suficiente, dado que la copia externa es obligatoria?

### 6. Errores de almacenamiento

- `isQuotaError` en Safari, Chrome y Firefox, también con modo privado.
- La prueba de salud (`checkStorage`) detecta un almacenamiento lleno o bloqueado, pero **no un fallo puntual de `saveDay`** del núcleo, que sigue siendo silencioso: decisión E8, no tocar el núcleo. ¿Qué riesgo residual queda?
- ¿El aviso global (`SystemNotice`) puede quedarse oculto cuando más importa?

### 7. Concurrencia y recarga

- **Riesgo que señalo yo:** si ELYUM está abierto en **otra pestaña o ventana** (escritorio) durante una restauración, esa pestaña conserva el día en memoria. En su siguiente cambio guardará encima del día restaurado (`DayProvider.tsx:46`). Esta pestaña sí se recarga (`Copias.tsx`, hacia la línea 137) y la otra no. Evalúa la severidad y propón mitigación sin tocar el núcleo, si la hay (p. ej. `storage` event o `BroadcastChannel` para pedir recarga, o un aviso).
- Ventana de 1,2 s entre escribir y recargar: ¿puede algo escribir encima en ese intervalo?
- **Cambio de día a medianoche** entre la vista previa y la importación.

### 8. iOS / PWA

- `deliverFile`: la copia se prepara antes del toque para que `navigator.share` se llame dentro de la activación del usuario. Revisa si la ruta asíncrona de respaldo (cuando los datos cambiaron) puede perder la activación en iOS y caer a descarga.
- Comportamiento de la descarga de un blob en una PWA instalada en iOS.

### 9. Seguridad de la entrada

- Archivos enormes o malformados.
- Claves con caracteres raros (`__proto__`, unicode).
- Valores no string.
- JSON con claves duplicadas.
- ¿Puede una copia maliciosa escribir fuera de los prefijos permitidos o provocar XSS en la vista previa (`keyLabel`, `valueSummary`)?

## Formato del informe que necesito

Un archivo Markdown con:

1. **Resumen**: ¿apto para producción? Sí, no, o sí con condiciones.
2. **Hallazgos**, cada uno con:
   - severidad: crítica / alta / media / baja / informativa;
   - área (1–9);
   - archivo y línea;
   - escenario concreto que lo provoca (pasos o datos);
   - impacto sobre los datos del usuario;
   - recomendación (sin aplicarla).
3. **Verificaciones hechas sin hallazgo** (qué comprobaste y cómo).
4. **Pruebas que añadirías** (descripción, sin código subido).

Entrégalo a Misael. Él decidirá qué se corrige y quién lo hace.
