# P2-E · Exportación y verificación de copias — `proyectos/p2e-exportar`

**Responsable:** Claude Code (implementación). **Aprobación:** Misael. **Auditoría:** Codex, antes de proponer integración.

**Base limpia:** `main` en `dfc42a4` («ELYUM identity patch V1.0.1»). La rama no contiene nada de `proyectos/p2-copias`, que sigue como **NO APTO**: no hay importación, ni restauración, ni marcador entre pestañas, ni `systemBusy`. El código de copia se ha reescrito para este paquete; solo se reutilizan, adaptados, `canonical.ts`, los nombres de archivo y la entrega por Web Share.

Sin merge a `main`. Sin producción. Sin tocar APRENDER, la rutina ni el núcleo fuera de lo aprobado.

## Qué hace

**SISTEMA → Copias de seguridad**, dos acciones:

1. **Exportar copia.** En **un único paso síncrono dentro del toque**:
   - lee todas las claves de ELYUM;
   - firma la copia;
   - la vuelve a leer con la misma verificación estricta que un archivo guardado y comprueba que su contenido es idéntico a lo leído;
   - la entrega: menú de compartir en el teléfono y en la app instalada, descarga en el escritorio.

   Si algo falla, no se entrega nada y se dice por qué.
2. **Comprobar una copia guardada.** Eliges el archivo en Archivos, iCloud…, y la app:
   - lo valida sin escribir nada;
   - muestra la fecha, el origen, las claves por módulo y el estado de cada clave;
   - lo compara con lo que hay ahora en el dispositivo.

   Sirve para comprobar que el archivo quedó guardado de verdad (límite L6).

**No hay importación ni restauración.** No existe código para ello en la rama, y una prueba y el guardián de alcance lo comprueban.

## Las diez condiciones de la autorización

| # | Condición | Cómo se cumple | Cómo se prueba |
|---|---|---|---|
| 1 | Rama independiente desde una base limpia y documentada | `proyectos/p2e-exportar` desde `main` `dfc42a4` | `git log main..proyectos/p2e-exportar` |
| 2 | Sin código de restauración ni rutas de importación | No existen. El tipo `ReadableStorage` no tiene métodos de escritura | `backup.test.ts`: escaneo del código. e2e: «no hay importación ni restauración». `check-scope.mjs p2e`: escaneo propio |
| 3 | Exporta CORE, APRENDER y PROYECTOS sin modificarlos | Lectura síncrona de `localStorage`, byte a byte. **P2-E no escribe nada en ningún almacenamiento**, ni siquiera metadatos propios | e2e: cada prueba registra **todas** las escrituras de la página a `localStorage` y `sessionStorage` desde que la pantalla está lista. Termina exigiendo **cero** escrituras y el almacenamiento idéntico |
| 4 | Formato versionado con integridad | Formato `elyum.backup` **versión 2** con SHA-256 por módulo y total. El total cubre **todo** el archivo, metadatos incluidos | Unitarias: cada alteración rechazada por su motivo. e2e: el archivo se comprueba con un canónico y un SHA-256 **propios del test**, no los de la app |
| 5 | Verificar el archivo más tarde sin escribir | «Comprobar una copia guardada» | e2e: verificar un archivo, cero escrituras |
| 6 | Mostrar los límites | Recuadro «Lo que la copia es, y lo que no», visible antes de exportar | e2e comprueba su texto |
| 7 | Errores de lectura, huella, compartir y archivos grandes | Ver «Errores» | Unitarias y e2e |
| 8 | Sin datos personales reales | Todos los datos de pruebas, capturas y archivos de ejemplo son sintéticos | Revisión del diff |
| 9 | Prueba física en el iPhone | [`P2E-prueba-iphone.md`](P2E-prueba-iphone.md) | Pendiente (tú) |
| 10 | Auditoría independiente antes de proponer integración | [`P2E-auditoria-codex.md`](P2E-auditoria-codex.md) | Pendiente (Codex) |

## Formato `elyum.backup` versión 2

```
{
  "schema": "elyum.backup",
  "version": 2,
  "meta": {
    "createdAt": "2026-10-21T10:30:07+02:00",      hora local con su desfase
    "device": "iPhone · app instalada",           opcional; nunca se envía a ningún sitio
    "app": "ELYUM",
    "storage": "localStorage",
    "excluded": { "simulation": 1, "system": 0, "foreign": 0, "unknownElyum": ["elyum:…"] }
  },
  "modules": {
    "core":     { "keys": { "personal-os:day:2026-10-20": "<texto guardado, literal>", "personal-os:entry": "…" } },
    "learn":    { "keys": { "elyum:learn:v1:state": "…" } },
    "projects": { "keys": { "elyum:projects:…": "…" } }
  },
  "keyStatus": { "<clave>": "valido" | "no-reconocido" | "ilegible" | "sin-validador" },
  "counts": { "core": 5, "learn": 1, "projects": 1 },
  "integrity": {
    "algorithm": "SHA-256",
    "modules": { "core": "<hex>", "learn": "<hex>", "projects": "<hex>" },
    "total": "<hex de todo el archivo en JSON canónico, sin el propio total>"
  }
}
```

### Cambios frente a la versión 1 (P2, NO APTO)

| v1 | v2 | Hallazgo |
|---|---|---|
| `createdAt` y `device` fuera del hash | **Todo** dentro del total | H12 |
| `JSON.parse` acepta claves duplicadas | Analizador estricto: una clave repetida en cualquier objeto se rechaza | H12 |
| Un valor ilegible se copiaba sin decirlo | Estado por clave. El valor se exporta **siempre**, sea cual sea su estado | H07 (en exportación) |
| Campos de más se ignoraban | Forma exacta: campos de más o de menos se rechazan | — |
| Claves desconocidas de ELYUM se omitían en silencio | Se nombran en la copia y en pantalla | — |
| Sin límites de tamaño | 25 MB y 50 000 claves | H11 |

### Estado por clave

Es información para ti. **Nunca decide qué se copia.**

| Estado | Significado | Comprobación |
|---|---|---|
| `valido` | Esta versión lo lee como la app | Días: la forma que consume `loadDay` y `DayState`. Entrada: `EntryMemory` |
| `no-reconocido` | Es JSON, pero no con una forma conocida: la app podría no poder usarlo | Por ejemplo, `objective: 123` (el caso de H07) o un día guardado con otra fecha |
| `ilegible` | No es JSON | — |
| `sin-validador` | Esta versión no tiene validador para ese dato | APRENDER: solo el sobre `{v, data}`. PROYECTOS: aún no tiene formato guardado (P3) |

### Qué entra en la copia

| Clave | Módulo |
|---|---|
| `personal-os:day:<fecha>`, `personal-os:entry` | Días (CORE) |
| `elyum:learn:…` | Aprender |
| `elyum:projects:…` | Proyectos |
| `personal-os:sim:*`, cualquier `…:sim:…` | **No**: simulaciones (contadas en `excluded.simulation`) |
| `elyum:system:*` | **No**: claves de SISTEMA (contadas) |
| Otra clave `personal-os:*` o `elyum:*` | **No**, pero **nombrada** en `excluded.unknownElyum` y en pantalla |
| Cualquier otra | **No**: ajena (contada) |

## Por qué la copia se hace dentro del toque, y con un SHA-256 propio

La primera versión de P2-E preparaba la copia al abrir la pantalla, como P2, y la entregaba al tocar. **Las pruebas e2e lo hicieron fallar con razón:**
- el núcleo guarda el día y el latido de la entrada **justo después** de montarse la pantalla;
- además, guarda ese latido cada 30 s;
- así que la copia preparada quedaba obsoleta casi siempre, y el primer toque nunca entregaba nada.

Ahora:
- **Lectura, firma, autoverificación y entrega ocurren en el mismo toque**, sin esperas. En ese tiempo ningún otro código de la página puede guardar, así que la copia es exactamente lo guardado en ese instante.
- iOS solo abre el menú de compartir directamente desde un gesto. Sin esperas, la entrega sigue dentro del gesto (la duda de Codex sobre la ruta asíncrona de P2).
- Web Crypto solo calcula SHA-256 de forma asíncrona, así que se usa una implementación **síncrona** de SHA-256 (`sha256.ts`, FIPS 180-4).
  - Se prueba contra los vectores estándar, contra la implementación de Node con todas las longitudes de 0 a 200 bytes, contra datos aleatorios de hasta 1 MB y con texto UTF-8.
  - El e2e verifica cada archivo exportado con el SHA-256 de Node.
  - Ventaja añadida: no depende de que el navegador tenga Web Crypto.

## Errores

| Situación | Qué pasa | Prueba |
|---|---|---|
| El almacenamiento no se puede leer (bloqueado, algún modo privado) | Aviso, botón desactivado. **No** se genera una copia vacía | Unitaria y e2e |
| La copia superaría 25 MB o 50 000 claves | No se genera; se dice el tamaño | Unitaria |
| La autoverificación falla | No se entrega | Cubierta por diseño; no hay forma de provocarla sin alterar el código |
| Menú de compartir cerrado | «No se guardó ninguna copia» | e2e |
| El sistema no abre el menú (iOS sin gesto) | Lo dice y ofrece **Descargar en su lugar** | e2e |
| El navegador no comparte archivos | Lo dice y ofrece descargar | e2e |
| La descarga falla | Lo dice | — |
| Archivo a verificar de más de 25 MB | Se rechaza **sin leerlo** | e2e |
| El archivo no se puede leer (iCloud sin descargar…) | Lo dice | — |
| JSON roto, clave repetida, otro esquema, versión antigua o futura, forma, clave fuera de su módulo, conteos o huella | Rechazo con su motivo; no se escribe nada | Unitarias (cada caso re-firmado, para que solo lo detecte su comprobación) y e2e |

## Límites declarados (visibles antes de exportar)

1. **Cambios no guardados.** Si el almacenamiento estaba lleno o bloqueado, un cambio pudo quedarse solo en memoria. Hoy, `saveDay` silencia ese error, así que ELYUM no puede saberlo. Para detectarlo haría falta X2 o tocar el núcleo, y ninguna de las dos cosas está autorizada (ver alternativas en [`X2-alternativas.md`](X2-alternativas.md)).
2. **Un almacenamiento por app.** Safari y la app instalada guardan sus datos por separado.
3. **Días dañados.** Un día guardado y dañado puede sustituirse por uno vacío al abrir la app. Ya ocurre en `main` (H07): sin X1 y X5 no se puede evitar antes de exportar.
4. **La huella no autentica.** Comprueba que el archivo no cambió; no prueba quién lo hizo (L7).
5. **Restaurar todavía no está disponible.** El formato está versionado, pero no se garantiza que una versión futura pueda leer todos los datos.
6. **Compartir o descargar no prueba que el archivo quedó guardado** (L6). Para eso está «Comprobar una copia guardada».

H03 (pestañas de versiones antiguas) **no afecta a P2-E**, porque no escribe. Sigue como requisito pendiente de P2-R: no se presenta `clients.matchAll()` como garantía.

## Archivos

| Archivo | Contenido |
|---|---|
| `src/features/backup/domain/format.ts` | Formato v2, estados por clave, límites |
| `canonical.ts` | JSON canónico |
| `strictJson.ts` | Analizador JSON estricto: claves duplicadas, profundidad máxima |
| `sha256.ts` | SHA-256 síncrono |
| `integrity.ts` | Huellas por módulo y total |
| `collect.ts` | Qué clave va a qué módulo; lectura síncrona |
| `keyStatus.ts` | Estado de cada clave |
| `create.ts` | Crear, serializar y autoverificar |
| `verify.ts` | Verificar un archivo y compararlo con el dispositivo (solo lectura) |
| `describe.ts` | Nombres legibles |
| `src/features/backup/storage/storage.ts` | `ReadableStorage`: solo lectura por tipo |
| `src/features/backup/ui/Copias.tsx` | Pantalla: exportar, límites, verificar |
| `ui/deliver.ts` | Compartir y descargar |
| `ui/notes.ts` | Mensajes tras exportar |
| `src/features/system/Sistema.tsx` | Sección SISTEMA |
| `src/features/backup/backup.test.ts` | 32 pruebas unitarias |
| `e2e/p2e.spec.ts`, `playwright.config.ts`, `e2e/tsconfig.json` | 13 pruebas e2e + 2 controles negativos + generación de capturas |
| `scripts/check-scope.mjs` | Guardián de alcance, con escaneo de solo lectura para `p2e` |

**Núcleo tocado:** solo lo aprobado para SISTEMA:
- `src/App.tsx`: `?section=sistema`, sección activa, `<Sistema/>` (+14 −7 líneas).
- `src/layout/sections.ts`: `sistema` disponible.

`src/pwa/moment.ts` queda **como en `main`**: sin operación crítica, no hace falta `systemBusy`. La recarga de 3 s de `updates.ts` (X3) no puede cortar nada, porque no hay escritura.

**Dependencia nueva:** `@playwright/test` **1.63.0**, exacta, solo de desarrollo. Es la versión del Chromium preinstalado; no entra en el bundle.

## Cómo validar

```
npm ci
npm test                       # 312: 280 del núcleo + 32 de P2-E
npx tsc -b
npm run build
node scripts/check-scope.mjs p2e
npm run test:e2e               # build + tsc de e2e + 13 pruebas en Chromium
E2E_SABOTAJE=1 npx playwright test -g "control negativo"    # debe FALLAR (2 pruebas, salida 1)
```

Registro de la última ejecución: [`evidencias/2026-10-24-p2e/registro.txt`](evidencias/2026-10-24-p2e/registro.txt).
