# P2 · Plan de corrección tras la auditoría independiente (Codex, `e7233a7`)

**Dictamen aceptado: NO APTO PARA PRODUCCIÓN.** Este documento es la propuesta previa a cualquier cambio de la arquitectura de seguridad.

- No se ha modificado código.
- No se toca el núcleo sin autorización expresa, excepción por excepción (§3).
- No se toca APRENDER.

**Fuente de requisitos:** el informe de auditoría de Codex sobre `e7233a78b569d220be0438cc6498c8af732dec93`. Un hallazgo no se considera resuelto porque pasen los tests existentes. Cada corrección lleva su reproducción adversarial de la auditoría como prueba de aceptación (§7).

## Reconocimiento previo (errores del autor)

- **El handoff afirmaba demasiado.** Decía que una sobrescritura de otra pestaña «se detecta y se avisa». Eso solo era cierto dentro de la ventana de 1,5 s, y falso para pestañas de versiones anteriores (H03).
- **`tabs.test.ts` no probaba el montaje real.** Simula las pestañas con una clase que llama a `check()` a mano; el componente real nunca lo hacía al montarse (H01). Las pruebas de exclusión no forzaban el intercalado peligroso (H04).
- **`demo-restauracion.cjs` termina con éxito aunque una comprobación salga `false`.** Además, su comprobación visual dependía de la hora. Las pruebas nuevas deben fallar ante cualquier comprobación negativa y fijar el reloj.

---

## 1. Matriz H01–H12

Columnas:
- **Dónde se resuelve:** **P2** (solo código de copias), **X·n** (requiere la excepción del núcleo n de §3) o **Límite** (no eliminable en navegador, §4).
- **Prueba:** la reproducción de la auditoría que debe pasar a ser regresión (numeración de §7).

| ID | Sev. | Causa raíz | Corrección propuesta | Dónde | Prueba |
|---|---|---|---|---|---|
| **H01** | Alta | La protección es un **componente** que reacciona a **eventos**. Una pestaña nacida durante `writing` no recibe el evento anterior, el efecto no comprueba nada al montar, y el núcleo guarda el día **al montarse**, antes que cualquier componente. | **Barrera de escritura, no un velo.** Una capa de persistencia se instala **antes de montar cualquier proveedor** y decide **en cada escritura** si está permitida, según el estado duradero (transacción activa, generación de datos). El velo queda solo como aviso visual. | X1 + X2 | A1, A2 |
| **H02** | Alta | El importador se excluye a sí mismo. `systemBusy` vive con la pantalla, se libera al desmontarla y no bloquea la navegación. `DayProvider` conserva el día viejo en memoria hasta la recarga. | **La operación es global, no de la pantalla.** Desde que empieza hasta que la pestaña se recarga, la barrera rechaza **todas** las escrituras de la app en esa pestaña también, salvo las de la propia transacción. Velo modal global sin navegación. Tras confirmar, la generación cambia: cualquier escritura con memoria anterior se rechaza y fuerza la recarga. | X1 + X2 (+ X3) | A3 |
| **H03** | Alta | El código antiguo no conoce ningún protocolo, y nada que haga el código nuevo puede impedir que una pestaña antigua escriba. La verificación final es puntual; la pestaña antigua actúa después. | **No empezar si puede existir un escritor incompatible.** Precondición verificable: el service worker activo es el de esta versión, no hay otro esperando, y `clients.matchAll({includeUncontrolled:true})` informa de **una sola ventana** (esta). Esa lista incluye pestañas de **cualquier** versión del mismo origen. Si algo no se puede verificar (sin SW, sin respuesta, API ausente), **la restauración no se ofrece**. Las pestañas que se abran durante la operación sirven la versión nueva y quedan bajo la barrera. **Ver los límites L1–L3.** | X4 + Límite | A4 |
| **H04** | Alta | Leer el marcador, decidir y escribir son pasos separados. El «bloqueo» vence por tiempo y el propietario vencido puede seguir y cerrar una operación ajena. | **Exclusión real con Web Locks** (`navigator.locks.request('elyum-datos', {mode:'exclusive', ifAvailable:true})`), retenido durante toda la operación. El navegador lo libera solo cuando muere el proceso propietario; **no hay vencimiento por tiempo**. Cada operación tiene una generación; la confirmación comprueba que la generación de partida no cambió. Sin Web Locks → no se ofrece restaurar. | P2 | A5, A6 |
| **H05** | Alta | `localStorage` no tiene comparar-y-escribir. La reversión deshacía también una clave que la importación no llegó a escribir, pisando un cambio ajeno. | (a) La exclusión entre escritores compatibles la da la barrera: ninguno escribe durante la transacción (X2). (b) Los incompatibles los excluye la precondición de H03. (c) Comprobación y lote en **una sola tarea síncrona**, sin esperas entre medias. (d) **Reversión con propiedad:** solo se revierte una clave cuyo valor actual es exactamente el que escribió esta operación (hash en el diario). Si hay un tercer valor, se informa de **conflicto** y no se toca. Estados distintos: «revertido», «no llegó a escribirse», «conflicto». | P2 + X2 | A7 |
| **H06** | Alta | El lote y la reversión vivían en memoria; el diario previo era de mejor esfuerzo y no había recuperación al arrancar. | **Diario duradero de escritura anticipada** (`elyum:system:v2:txn`): operación, fase, generación, y por clave los **bytes anteriores** y el **hash** del valor nuevo. Se escribe y verifica **antes** de tocar datos; si no cabe, la operación no empieza. Al arrancar, antes de montar nada, un diario en `applying` lleva a **modo recuperación** (§6), con la barrera cerrada. Confirmar es una sola escritura (diario `committed` + generación nueva). Un abandono nunca se desbloquea como si se hubiera confirmado. | X1 + P2 | A8 |
| **H07** | Alta | El hash prueba que el **archivo** no cambió, no que su **contenido** sea utilizable. El núcleo consume el día sin validar tipos (`schedule.ts:144`, `objective.trim()`), y `loadDay` sustituye lo ilegible por un día vacío que se guarda, perdiendo los bytes. | (a) **Validadores por módulo y versión** del formato del núcleo, de la entrada y de APRENDER v1, en código de P2, sin tocar sus archivos. Una clave incompatible se muestra como «no restaurable» y **no se escribe nunca**. (b) **Preservación al arrancar:** antes de montar el núcleo, una clave de ELYUM que no supera su validador se copia literal a cuarentena (`elyum:system:v2:quarantine:*`) y la copia de seguridad la incluye. (c) **Recuperación accesible** con una raíz de recuperación que no monta `DayProvider` y un límite de errores por encima de él. | X1 + X5 + P2 | A9 |
| **H08** | Media | La sonda solo demuestra que **su** escritura pequeña funciona. Los guardados del núcleo capturan y silencian sus errores. | **Observador pasivo de escrituras reales:** la capa de persistencia envuelve `Storage.prototype.setItem`; si una escritura de una clave de ELYUM lanza, lo registra y **vuelve a lanzar**, así que el núcleo se comporta exactamente igual que hoy. Aviso persistente de «No se guardó: …», visible también durante FOCUS y la entrada. La sonda queda como dato secundario. | X2 | A10 |
| **H09** | Media | `carrySelection` une la selección anterior con la automática y reactiva módulos excluidos. | Distinguir **decisión del usuario** de **propuesta automática**: un módulo que el usuario tocó conserva su decisión; los demás reciben la propuesta. | P2 | A11 |
| **H10** | Media | Lecturas sin capturar (`getItem` que lanza) escapan del controlador y dejan la operación a medias. | Controlador de operación como **máquina de estados** con todas las lecturas y escrituras capturadas. Un fallo de lectura no es «ausencia de datos»: es estado `fallido` o `recuperación`, duradero y con la barrera mantenida si no se sabe si es seguro continuar. | P2 | A12 |
| **H11** | Media | Sin límites de tamaño; `File.text()`, el parseo y los hashes sin contención. | Límite de archivo **antes de leer** (propuesta: 10 MB), límites de número de claves (5.000) y tamaño por valor (1 MB). Captura de `File.text()`, `JSON.parse` y Web Crypto, con mensaje visible. Hash calculado una sola vez sobre el texto canónico. | P2 | A13 |
| **H12** | Baja | El hash v1 no cubre `createdAt` ni `device`; `JSON.parse` acepta claves duplicadas. | **Formato v2** (§8): metadatos dentro de lo firmado, validación de fecha y de longitud de etiquetas, rechazo de claves JSON duplicadas con un analizador estricto propio. Texto honesto: «contenido íntegro», no «auténtico». Lectura de v1 conservada para las copias existentes (hoy solo sintéticas). | P2 | A14 |
| **PWA** (§7 auditoría) | — | `useUpdates.apply` programa una recarga incondicional a los 3 s. | La operación global se consulta también en ese temporizador. Si aun así hay una recarga, el diario la convierte en recuperación, no en pérdida. | X3 | A15 |

## 2. Qué se resuelve dentro de P2, sin tocar el núcleo

- **H04:** Web Locks, generación de operación y propietario sin vencimiento.
- **H05 (parte de P2):** lote síncrono y reversión con propiedad y conflicto explícito.
- **H06 (parte de P2):** diario duradero, máquina de estados y decisiones de recuperación.
- **H07 (parte de P2):** validadores por módulo y versión, exclusión de lo incompatible en la vista previa, cuarentena incluida en la exportación.
- **H09–H12** completos.
- **Pruebas:** batería adversarial con el árbol real (§7).

**Todo eso, por sí solo, no cierra H01, H02, H03, H06 ni H07.** Su cierre depende de dos cosas que P2 no puede hacer sin tocar el núcleo o su comportamiento: actuar **antes** de que el núcleo monte y guarde, y **impedir** escrituras del núcleo y de APRENDER.

## 3. Excepciones del núcleo que requieren tu autorización

Ninguna se aplicará sin aprobación individual.

### X1 · `src/main.tsx` — arranque protegido y raíz de recuperación

- **Motivo:** H01, H06 y H07 exigen decidir **antes** de montar `DayProvider`, que lee y vuelve a guardar al montarse y cuyo fallo deja la página en blanco.
- **Cambio mínimo** (unas 15 líneas):
  1. Llamar a `bootGuard()` antes de `createRoot`: instala la capa de persistencia, lee el diario y valida o pone en cuarentena.
  2. Si hay transacción incompleta, renderizar `<Recuperacion/>` en lugar del árbol normal.
  3. Envolver el árbol normal en un límite de errores que, ante un fallo de arranque, muestre la misma recuperación (exportar en bruto, ver qué falló).
- **Riesgo:** un error en `bootGuard` afecta al arranque de toda la app. Se mitiga con `bootGuard` puro y probado, que nunca lanza: ante su propio fallo, deja pasar sin barrera y registra el problema.
- **Regresión:** suite completa, más arranque con almacenamiento vacío, normal, simulado (`?date=`), con datos corruptos y con diario en cada fase.
- **Alternativa sin tocar `main.tsx`:** una página de recuperación separada (`recuperacion.html`, entrada propia de Vite), más un enlace de emergencia en `index.html` si `#root` queda vacío. **Es peor:** en la app instalada de iOS no hay barra de direcciones y depende de ese enlace, y no impide el guardado inicial del núcleo, así que no cierra H01 ni H06.

### X2 · Capa de persistencia que intercepta `Storage.prototype.setItem` y `removeItem`, instalada desde `bootGuard`

- **Motivo:**
  - Es el único punto que ve **todas** las escrituras: núcleo, entrada y APRENDER, **sin modificar sus archivos**. Modificar APRENDER no está permitido.
  - Hace dos cosas: **barrera** (H01, H02, H05) y **observador** de fallos reales (H08).
- **Cambio mínimo:** módulo de P2, unas 80 líneas, que actúa solo sobre `window.localStorage` y solo en claves de ELYUM:
  - **Sin operación en curso y misma generación:** llama al original. Si lanza, lo registra y **relanza**, así que el núcleo se comporta igual que hoy.
  - **Con transacción activa o generación distinta a la de arranque:** no escribe, registra el intento y pide recarga.
  - La transacción escribe con las funciones originales capturadas.
- **Riesgo:**
  - Cambia en tiempo de ejecución el comportamiento de la persistencia del núcleo; por eso se presenta como excepción aunque no edite sus archivos.
  - Un error en la envoltura afectaría a todos los guardados. Se mitiga con código mínimo, tests de paso transparente byte a byte y desactivación de la barrera, nunca del guardado, ante un fallo interno.
  - La generación se guarda en `elyum:system:*`.
- **Regresión:**
  - las 280 pruebas del núcleo;
  - prueba de que, fuera de una restauración, todas las escrituras del núcleo y de APRENDER pasan **idénticas** (mismo orden, mismas claves, mismos bytes) con y sin la capa;
  - prueba con `sessionStorage` intacto.
- **Alternativa con cambios explícitos del núcleo:** llamar a `persist()` en `state/storage.ts` (`saveDay`) y en `entry/entryStorage.ts` (`saveEntryMemory`), unas 6 líneas. Es más transparente, pero **no cubre APRENDER** (no se puede tocar) ni escritores futuros, y deja H01 y H02 abiertos para APRENDER. **Recomiendo X2.**

### X3 · `src/pwa/updates.ts` — la recarga de respaldo respeta la operación global

- **Motivo:** la recarga incondicional a 3 s puede cortar la fase crítica.
- **Cambio mínimo:** unas 3 líneas; el temporizador consulta el estado global de operación y, si está ocupado, espera a que termine.
- **Riesgo:** bajo. Una actualización tarda un poco más en aplicarse.
- **Regresión:** `pwa.test.ts`, más actualización solicitada antes de importar y con la activación retrasada.
- **Alternativa:** no tocarlo y confiar en que el diario convierta esa recarga en recuperación (X1). Seguro, pero peor experiencia.

### X4 · `vite.config.ts` y `public/sw-clientes.js` — el service worker cuenta las ventanas abiertas

- **Motivo:** H03. Solo el service worker puede enumerar **todas** las ventanas del origen, también las de versiones antiguas.
- **Cambio mínimo:**
  - `workbox.importScripts: ['sw-clientes.js']`;
  - un archivo de unas 20 líneas que responde por `MessageChannel` con el número de ventanas (`clients.matchAll({type:'window', includeUncontrolled:true})`).
- **Riesgo:** modifica el service worker de producción, que ya tiene un flujo de actualización delicado. Si el script falla, el SW no se instala; se mitiga probándolo en un Preview y con un test de build que lo verifique.
- **Regresión:**
  - `pwa.test.ts`;
  - build;
  - prueba offline;
  - actualización de una versión a otra;
  - en iPhone, instalación y actualización de la PWA.
- **Alternativa:** ninguna que **detecte** clientes antiguos. Sin X4, H03 solo se puede tratar no ofreciendo la restauración general (§8).

### X5 · Tratamiento al arrancar de datos locales que el núcleo no puede consumir (H07, preexistente en `main`)

- **Opción A, la mía, sin editar archivos del núcleo:** dentro de `bootGuard` (X1), una clave de día que no supera el validador se **copia** literal a cuarentena. Solo en ese caso se sustituye por un día vacío marcado, que es lo que el núcleo haría de todos modos al no poder leerla, y la app arranca.
  - Los bytes quedan preservados y exportables.
  - El aviso «Se aisló un día que no se podía leer» enlaza a SISTEMA.
- **Opción B:** validar dentro de `loadDay` (`state/storage.ts`, unas 15 líneas).
- **Riesgo:** un validador demasiado estricto podría aislar días válidos. Se mitiga validando exactamente los tipos que el núcleo consume y probándolo con fixtures históricos (IDs antiguos de martes, `migrateDay`).
- **Regresión:** fixtures de cada formato histórico; el día corrupto de la auditoría (`objective: 123`) ya no deja la app en blanco.

## 4. Riesgos que no pueden eliminarse completamente en un navegador

| # | Escenario | Por qué no se puede garantizar | Qué se hace |
|---|---|---|---|
| L1 | **Una pestaña con código antiguo** que no respeta el protocolo y escribe durante o después de una restauración | Ningún código nuevo controla lo que ejecuta otra página. `localStorage` no tiene permisos ni transacciones. | Se **detecta** con X4 y **no se empieza** si existe. No es una garantía absoluta (L2, L3). Sin X4, la restauración general no se habilita. |
| L2 | **Documento antiguo en la caché de ida y vuelta (bfcache)** o pestaña fuera del control del SW que no aparece en `clients.matchAll` | Las especificaciones no garantizan que esas páginas cuenten como clientes. | La barrera cubre todas las páginas de versión nueva, porque comprueba la generación en cada escritura. Para una página antigua congelada que reviva, el riesgo es residual: se documenta y no se puede cerrar. |
| L3 | **Navegador sin service worker, Web Locks o con APIs limitadas** (algunos modos privados, versiones antiguas) | No hay forma de verificar las precondiciones. | **Fallo seguro:** la restauración no se ofrece en ese navegador. La exportación sí funciona. |
| L4 | **Atomicidad entre varias claves** | `localStorage` no tiene transacciones. | Se emula con el diario y la recuperación al arrancar. Si el propio almacenamiento falla durante la recuperación, queda la copia externa. |
| L5 | **Cambios que nunca se guardaron** (cuota, almacenamiento bloqueado) | Si la escritura falla, el dato solo existe en memoria. | Se **detecta y se avisa** de forma persistente (X2). No se puede recuperar lo que nunca se escribió. |
| L6 | **Durabilidad del archivo exportado** (Archivos, iCloud, descargas) | Fuera de la app; compartir o descargar no prueba que el archivo exista después. | Verificación del archivo guardado desde la propia app (§8), más confirmación explícita. |
| L7 | **Autoría de una copia** | SHA-256 sin clave no autentica: cualquiera puede generar una copia coherente. | El texto dice «contenido íntegro», no «auténtico». Firma con clave: fuera de alcance. |
| L8 | **iOS borra el almacenamiento** (desinstalar la app, falta de uso prolongado) | Lo decide el sistema operativo. | `persist()` en la app instalada, más exportaciones periódicas. |
| L9 | **Corrupción de una sola escritura** a nivel de sistema operativo o disco | Por debajo del navegador. | Fuera de alcance; la copia externa es la defensa. |

**Consecuencia práctica.** En el iPhone con la app instalada solo existe una instancia, con almacenamiento propio y separado de Safari, así que L1 y L2 son casi inexistentes. El riesgo real de pestañas está en el escritorio. Debe confirmarse en la prueba física.

## 5. Arquitectura mínima de restauración segura (P2-R)

```
ARRANQUE (antes de montar nada) · bootGuard [X1]
  ├─ instala la capa de persistencia [X2]: barrera por escritura + observador de fallos
  ├─ lee el diario elyum:system:v2:txn y la generación
  │    ├─ applying / recovering  → RAÍZ DE RECUPERACIÓN (sin DayProvider)
  │    └─ committed / ninguno   → sigue
  ├─ valida las claves de ELYUM; incompatibles → cuarentena (bytes literales) [X5-A]
  └─ monta la app normal dentro de un límite de errores → recuperación si falla

RESTAURAR (en SISTEMA)
  1. Vista previa (como hoy) + validación de compatibilidad: lo incompatible no se ofrece.
  2. Precondiciones (todas o nada; cualquier duda = no se ofrece):
       Web Lock exclusivo «elyum-datos» (ifAvailable) ─ retenido hasta el final
       SW activo = esta versión, sin worker en espera  [X4]
       SW: una sola ventana en el origen (esta)        [X4]
       copia externa del estado actual hecha y confirmada
       espacio para el diario (escritura de prueba)
  3. Operación global: velo modal sin navegación; la barrera rechaza las escrituras de la app [X2]
  4. En UNA tarea síncrona:
       comprobar la vista previa (cada clave = lo revisado; si no, abortar sin escribir)
       escribir el diario {op, applying, generación g, por clave: antes (bytes) + hash(después)} → releer
       escribir las claves (función original) → releer cada una
       si algo falla → reversión con propiedad → diario recovering/aborted
       confirmar: diario {committed, generación g+1} (una sola escritura)
  5. Recargar. Las demás pestañas compatibles que intenten escribir con g → rechazo → recarga.
```

**Cómo responde a cada hallazgo:**
- **H01:** la barrera actúa desde el arranque y en cada escritura, no con eventos.
- **H02:** la operación es global, y la generación invalida la memoria del propio importador.
- **H03:** precondición de una sola ventana, con SW verificado.
- **H04:** Web Lock sin vencimiento.
- **H05:** lote síncrono, barrera y reversión con propiedad.
- **H06:** diario y recuperación al arrancar.
- **H07:** validadores, cuarentena y raíz de recuperación.

**Alcance de los módulos.** El núcleo y APRENDER se restauran con este mecanismo completo. El de **PROYECTOS** puede restaurarse **mucho antes** con un mecanismo propio (§9): sus claves solo las escribe PROYECTOS, y ninguna versión anterior de ELYUM las conoce, así que H03 no aplica.

## 6. Recuperación ante interrupciones y datos corruptos

**Modo recuperación.** Se monta sin `DayProvider` ni APRENDER, con la barrera cerrada, y siempre ofrece:

1. **Qué pasó:** operación, fecha, fase, claves afectadas, y por cada una si está como antes, como la copia o con un tercer valor.
2. **Exportar el estado actual en bruto**, incluidos la cuarentena y el diario. Siempre posible y siempre primero.
3. **Volver al estado anterior:** solo en las claves cuyo valor actual es el escrito por la operación (hash); los terceros valores se listan como conflicto y no se tocan.
4. **Completar la restauración** desde el archivo original, si el usuario lo vuelve a elegir y su hash coincide con el del diario.
5. **Salir** solo cuando el diario queda en `resolved`. Nunca se desbloquea un lote parcial como confirmado.

**Datos corruptos sin restauración** (preexistente en `main`):
- El arranque aísla la clave en cuarentena con sus bytes literales (X5-A), la app arranca y aparece un aviso persistente.
- La cuarentena entra en la exportación, en una sección propia.
- Nada se borra sin una acción explícita.

**Sin espacio para el diario:** la restauración no empieza («No hay espacio para restaurar con seguridad»). Exportar sigue disponible.

## 7. Pruebas adversariales nuevas, a partir de las reproducciones de Codex

**Reglas:**
- Se prueba **el árbol real** (build de producción en Chromium, con Playwright) y las funciones originales con almacenamiento inyectable.
- Nunca una máquina de estados paralela.
- Todas terminan en **fallo** si cualquier comprobación es negativa.
- El reloj se fija.
- Se registran **todas** las llamadas a `setItem` y `removeItem` del documento.

| # | Escenario | Criterio de aceptación |
|---|---|---|
| A1 | Pestaña que **abre** con el diario en `applying` y en `writing` (marcadores del protocolo actual y del nuevo) | Ninguna escritura de claves de ELYUM antes de resolverlo; se ve la recuperación o el velo |
| A2 | Pestaña que abre en cada fase: antes del candado, tras el diario, a mitad del lote, tras confirmar | Cero escrituras indebidas; después de confirmar, carga la generación nueva |
| A3 | **Importador** que navega a HOY o SEMANA, edita un objetivo y registra un bloque antes y después de escribir, también tras desmontar SISTEMA | Cero escrituras de estado viejo; lo restaurado intacto tras la recarga |
| A4 | **Build de `dfc42a4` en el mismo origen** abierta antes de restaurar, reanudada a los 3 s, 30 s y minutos después | La restauración **no se ofrece** mientras exista; si se cierra, sí. Nunca «restaurado» con pérdida posterior |
| A5 | Dos importadores sincronizados con barreras que consultan antes de adquirir, sobre claves iguales y disjuntas | Solo uno adquiere el candado; el otro, «otra operación en curso» |
| A6 | Propietario suspendido, reanudado tras otra operación; reloj alterado | El suspendido no escribe ni confirma (generación cambiada); no hay vencimiento por tiempo |
| A7 | Escritor externo intercalado antes de cada clave y durante la reversión | Los cambios ajenos se conservan; los informes distinguen revertido, no escrito y conflicto |
| A8 | **Terminación del proceso** (`Page.crash` por CDP o cierre del contexto) entre cada par de escrituras y durante la reversión; también sin diario | Al reabrir: recuperación antes de cualquier guardado; cada salida (anterior, completar, exportar) deja datos coherentes |
| A9 | Copia con `objective: 123`, `null`, arrays, tipos erróneos en `focus`, fechas que no coinciden, módulos de versión futura; día local `{BROKEN…` | La copia marca lo incompatible como no restaurable. El día local roto queda en cuarentena con sus bytes; la app arranca y SISTEMA es accesible |
| A10 | **Cuota real de Chromium**: llenar, guardar un objetivo grande en HOY | Aviso persistente de «No se guardó», también en FOCUS y en la entrada; la sonda no lo contradice |
| A11 | Excluir APRENDER, cambiar una clave del núcleo, revisar de nuevo | APRENDER sigue excluido |
| A12 | `getItem` que lanza en cada lectura del controlador (antes del candado, tras el diario, en la verificación) | Estado `fallido` o `recuperación` duradero y visible, con la barrera mantenida; nunca «sin datos» |
| A13 | Archivo de 50 MB, 100.000 claves, `File.text()` y Web Crypto que fallan | Rechazo antes de leer o con error visible; sin congelar la interfaz |
| A14 | Metadatos alterados, `createdAt` inválido, claves duplicadas en el sobre y en los mapas | Rechazo; el mensaje no sugiere autenticidad |
| A15 | Actualización solicitada antes de importar, activación retrasada, recarga desde otra pestaña | No hay recarga en la fase crítica; si se fuerza, hay recuperación al arrancar |
| A16 | Cambio de fecha (medianoche) entre la vista previa y la confirmación | Las claves cambiadas invalidan la operación; el día nuevo no escapa a la barrera |
| A17 | Paso transparente fuera de restauraciones (X2) | Escrituras del núcleo y de APRENDER idénticas con y sin la capa |

**Infraestructura:**
- Añadir `@playwright/test` como dependencia de desarrollo y un script `npm run test:e2e`. **Requiere tu aprobación** (dependencia nueva).
- El build de `dfc42a4` se sirve en el mismo origen para A4.
- **Matriz física en el iPhone**, de la §7 de la auditoría: la ejecutas tú, con datos sintéticos.

## 8. Viabilidad de un paquete de exportación independiente (P2-E)

**Viable**, con la restauración **eliminada del bundle**: no basta con ocultarla. Es un alcance distinto, para auditar aparte.

**Qué incluye P2-E:**
1. **Exportar** CORE, APRENDER y PROYECTOS con el **formato v2**: metadatos dentro de lo firmado, analizador estricto sin claves duplicadas, y por clave su **estado de validación** (`válido` / `no reconocido` / `ilegible`) sin dejar de exportar los bytes.
   - Hoy solo existen copias v1 sintéticas, así que cambiar a v2 no rompe nada real.
2. **Autoverificación antes de entregar:** se vuelve a analizar el texto serializado, se recalcula su hash y se compara con lo leído del almacenamiento. Si no coincide, no se entrega.
3. **Verificar un archivo guardado:** eliges una copia de Archivos y la app la valida sin escribir nada (integridad, conteos, validez por módulo, fecha). Cubre L6: prueba que el archivo existe y se puede leer.
4. **Texto de límites, visible antes de exportar:**
   - la copia contiene lo **guardado**, no cambios no guardados;
   - es de **este** almacenamiento (Safari y la app instalada son distintos);
   - **no autentica autoría**;
   - **restaurar aún no está disponible**: el archivo se podrá restaurar cuando exista P2-R;
   - guárdala fuera del dispositivo.
5. **Captura coherente:** la lectura de todas las claves es **síncrona** (una sola tarea).
   - El núcleo no tiene invariantes entre claves: cada día es independiente.
   - Si el almacenamiento cambia entre la copia preparada y el toque, se recalcula.
6. **Errores de lectura y de entrega** contenidos y visibles (H10, H11 aplicados a exportar).
7. **Opcional, según autorices X2 en su modo observador:** aviso de escrituras reales fallidas (H08).
   - Sin X2, la exportación lo dice: «si el almacenamiento falló, puede haber cambios que no están en la copia».
   - Mi recomendación: **incluir el observador** (solo observa y relanza, no bloquea).
8. **Opcional, según autorices X1 y X5-A:** cuarentena al arrancar, para no perder bytes corruptos antes de exportarlos (H07, segunda reproducción).
   - Sin X1, P2-E lo declara como límite: un día ilegible puede perderse al abrir la app, como ya pasa en `main`.

**Qué no incluye:**
- importar ni restaurar;
- marcador ni guardián de pestañas;
- `systemBusy`, ya que no hay operación crítica.

Se eliminan `apply.ts`, `plan.ts`, `restore.ts` y la vista previa de importación del código de producción. La sección SISTEMA sigue.

**Riesgos de P2-E:**
- **Escritura:** ninguna en datos; solo en `elyum:system:*` (metadatos y, con X1, cuarentena).
- **El usuario podría creer** que ya puede restaurar. Se mitiga con el texto del punto 4.
- **Pérdida de bytes corruptos antes de exportar** sin X1 (preexistente).

**Cambios del núcleo:**
- Sin excepciones: los ya aprobados (`sections.ts` y `App.tsx`; SISTEMA).
- `moment.ts` puede volver a su estado de `main`.

**Pruebas:**
- exportación con datos válidos, corruptos, de versión futura y vacíos;
- autoverificación;
- verificación de un archivo alterado o truncado;
- límites de tamaño;
- cuota real con X2-observador;
- iPhone: exportar, Archivos, verificar desde la app, en Safari y en la app instalada.

## 9. Secuencia e independencias

```
Ahora ─┬─ Decisiones: X1, X2 (observador / barrera), X3, X4, X5-A, dependencia Playwright
       │
       ├─ P1 · validación con el dossier ──────────► recomendación P3/P4   (independiente de P2)
       │
       ├─ P2-E · exportación + verificación (desde la rama de P2, sin restauración)
       │      → auditoría Codex (alcance P2-E) → prueba iPhone → autorización → main
       │
       ├─ P3/P4 · PROYECTOS (tras validar P1 y con P2-E en producción)
       │      · almacén de PROYECTOS con: versión, validación al cargar con cuarentena,
       │        errores de escritura visibles, un único escritor por clave
       │      · restaurar SOLO PROYECTOS desde una copia v2 (P2-R1): sin las carreras
       │        del núcleo (ninguna versión antigua escribe esas claves) → seguridad suficiente antes
       │
       └─ P2-R · restauración del núcleo y APRENDER (X1–X5, §5–§7)
              → auditoría Codex → matriz iPhone → autorización → main
```

**Recomendación sobre PROYECTOS.** No depender de la restauración del núcleo para empezar. Con P1 validado, P2-E en producción y un almacén de PROYECTOS diseñado con estas lecciones, PROYECTOS puede funcionar tras P3/P4 con:
- exportaciones semanales (P2-E);
- reimportación de los dossiers como fuente original (P3);
- restauración solo de PROYECTOS (P2-R1).

Los cambios hechos en la app (estados, aprobaciones, evidencias) quedan cubiertos por la exportación semanal y P2-R1.

## 10. Estimación de esfuerzo

En horas de trabajo efectivo. El calendario real depende de tus revisiones y de la disponibilidad de Codex.

| Paquete | Desarrollo (agente) | Auditoría (Codex) | Tu tiempo |
|---|---|---|---|
| Decisiones X1–X5 y Playwright | — | — | 20–30 min |
| **P2-E**, exportación y verificación (con X2-observador y, si autorizas, X1 + X5-A) | 8–12 h | 3–5 h | Revisión 20 min · iPhone 30–45 min |
| P1 · validación con el dossier | 4–6 h desde que llegue el archivo | Opcional | Decidir estados 30–60 min |
| P2-R1 · restaurar solo PROYECTOS, dentro de P3/P4 | 4–6 h | Con P3/P4 | Incluida en P3/P4 |
| **P2-R**, restauración completa del núcleo y APRENDER (X1–X5, A1–A17, e2e) | 30–45 h | 8–12 h, reauditoría | Revisión 30 min · matriz iPhone 2–3 h |

**Mi recomendación de orden:**
1. Decidir las excepciones.
2. **P2-E** y la validación de **P1**, en paralelo.
3. P3/P4 con P2-R1.
4. **P2-R** después, sin bloquear el uso de PROYECTOS en los 90 días.

Mientras tanto, la protección real de los datos es la exportación verificada y la copia externa. La restauración del núcleo se habilita solo cuando P2-R pase su reauditoría.

## Decisiones que te pido

1. **X1 · `main.tsx`** (arranque protegido y recuperación): ¿se autoriza? ¿Solo para P2-R o también para P2-E (cuarentena al arrancar)?
2. **X2 · capa de persistencia:** ¿se autoriza el **modo observador** para P2-E? ¿Y el **modo barrera** para P2-R?
3. **X3 · `pwa/updates.ts`** (para P2-R).
4. **X4 · service worker que cuenta ventanas** (para P2-R). Sin X4, la restauración del núcleo no se habilitará.
5. **X5 · opción A** (cuarentena al arrancar) u opción B (`loadDay`).
6. **Dependencia de desarrollo `@playwright/test`** para las pruebas e2e del árbol real.
7. **¿Empiezo P2-E?** Se presentaría para auditoría aparte, sin restauración en el bundle.
