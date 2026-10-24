# X2 · Detectar escrituras fallidas: alternativas y sus límites

**Decisión vigente:** X2 (interceptar `Storage.prototype.setItem` y `removeItem`) **no está autorizada**. Cualquier excepción posterior requerirá una aprobación específica. Este documento solo describe alternativas; **no se ha implementado ninguna**.

## El problema

El núcleo guarda el día con `saveDay` (`src/state/storage.ts`) y la entrada con `saveEntryMemory` (`src/features/entry/entryStorage.ts`). Los dos **silencian** cualquier error de escritura (cuota llena, almacenamiento bloqueado). APRENDER hace lo mismo con su estado, en su rama.

Consecuencia: un cambio que no llegó a guardarse vive solo en memoria y se pierde al cerrar. **Ninguna copia puede contenerlo**, y hoy nada lo avisa (H08, límite L5).

P2-E lo declara en pantalla como límite. No lo detecta.

## Alternativas

| # | Alternativa | Qué detecta | Qué toca | Límites |
|---|---|---|---|---|
| A | **X2 en modo observador**: envolver `setItem` y `removeItem`. Llama al original, registra el fallo y **relanza** | Toda escritura fallida de ELYUM: núcleo, entrada y APRENDER | Ningún archivo del núcleo, pero cambia en tiempo de ejecución el comportamiento de todas las escrituras de la página | Es la única que ve todos los escritores sin editarlos. Riesgo: un error en la envoltura afecta a todos los guardados. Requiere tu aprobación expresa (no autorizada) |
| B | **Cambio explícito en el núcleo**: `saveDay` y `saveEntryMemory` informan del fallo (por ejemplo, un evento `elyum:write-failed`) en vez de silenciarlo | Fallos de días y entrada | 2 archivos del núcleo, unas 6 líneas | **No cubre APRENDER** (no se puede tocar su rama) ni escritores futuros. Es una excepción del núcleo: requiere aprobación con el formato de seis puntos |
| C | **Sonda periódica de solo lectura**: comparar lo que la app tiene en memoria con lo guardado | Diferencias entre memoria y almacenamiento | Necesita acceso al estado en memoria de HOY y APRENDER, es decir, tocar el núcleo o APRENDER | Para el núcleo equivale a B, pero peor: con retraso y con falsos positivos mientras se escribe |
| D | **Sonda de capacidad** (escribir y borrar una clave de prueba en `elyum:system:*`) | Que el almacenamiento **ahora** acepta escrituras | Nada del núcleo; escribe una clave de sistema | Solo detecta un fallo **general** en el momento de la sonda, no un fallo puntual de `saveDay`. Además, P2-E se ha mantenido **sin ninguna escritura**; esta sonda lo rompería. No incluida |
| E | **Estimación de cuota** (`navigator.storage.estimate()`) | Cuánto espacio queda en el origen, de forma aproximada | Nada | En Safari la cifra es aproximada y no se refiere a `localStorage`. No detecta bloqueos. Sirve, como mucho, para avisar «queda poco espacio» |
| F | **No detectar; declarar el límite** y fomentar exportaciones frecuentes | Nada | Nada | Es lo que hace P2-E |

## Recomendación

- **Mientras X2 no se autorice:** F, que es lo implementado. Opcionalmente, E como aviso suave en P2-E: no escribe nada, pero su valor en iOS es bajo.
- **Si en P2-R se necesita detectar fallos reales:** A en modo observador, presentada como excepción con archivo afectado, motivo, cambio mínimo, riesgo, pruebas de regresión y alternativa. B es la alternativa sin interceptación, más estrecha, porque deja fuera a APRENDER.

## H03 · pestañas de una versión antigua (sigue pendiente)

**No resuelto.** Ninguna alternativa permite **garantizar** que se han detectado todas las pestañas antiguas.
- `clients.matchAll()` del service worker, o un mecanismo equivalente, **no** se presenta como garantía: las páginas en la caché de ida y vuelta, las no controladas por el SW o las congeladas pueden no aparecer.
- H03 queda como **requisito de P2-R**.
- P2-E no se ve afectado, porque no escribe.
