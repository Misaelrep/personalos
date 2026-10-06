# ELYUM — HOY + FOCUS + DAYSCAPE + SEMANA · Rutina maestra V3

Aplicación web de rutina semanal. Contiene la entrada diaria (DAYSCAPE), la pantalla HOY, el modo FOCUS y SEMANA, alimentados por **una sola fuente de verdad**: la RUTINA MAESTRA V3, de lunes a domingo (`src/data/routine/`).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # motor de horario (vitest)
npm run build      # typecheck + build de producción (+ manifest, service worker, iconos)
npm run preview    # http://localhost:4173 — el build de producción, con service worker (ver MOBILE / PWA)
```

## Revisar cualquier momento del día

**Fecha y hora son siempre locales.** Sin parámetros, la app toma fecha, hora y día de la semana de la zona horaria del navegador / dispositivo (operaciones de fecha local: `getFullYear/getMonth/getDate/getDay/getHours`), nunca de UTC: con ellas decide la fecha activa, el día de la semana, AHORA, el cambio de día a medianoche local, la clave de persistencia diaria y la entrada del día. No se usa `toISOString()` para fechas. Probado en `src/state/timezone.test.ts` bajo UTC−6 y UTC+9, cerca de medianoche, donde la fecha UTC y la local no coinciden.

| Parámetro | Efecto |
| --- | --- |
| `?t=10:14` | El reloj arranca a esa hora local (de hoy) y sigue corriendo desde ahí. |
| `?date=2026-09-28` | El reloj arranca en esa fecha, a la hora actual. Combinado con `?t=` fija el momento exacto: `?date=2026-09-28&t=10:30`. Fechas imposibles (`2026-02-31`) se ignoran. Sin parámetros, el reloj es el real: producción no cambia. |
| `?motion=completo` · `sutil` · `reducido` | Fuerza un nivel de movimiento (por defecto: `reducido` si el sistema pide `prefers-reduced-motion`, si no `completo`). |
| `?entry=full` · `micro` · `none` | Fuerza la entrada diaria completa, la micro entrada o ninguna, ignorando las reglas de sesión (no guarda nada). |
| `?section=semana` · `aprender` | Abre directamente SEMANA o APRENDER (solo si no toca entrada: combínalo con `&entry=none`). Sin el parámetro, la app abre en HOY. |
| `?learn=full` · `brief` | Fuerza el ritual completo o la entrada breve de APRENDER, ignorando la regla del día. No guarda nada. |
| `?field=collapse` · `fast` · `hold` | Revisión de DAYSCAPE: `collapse` acorta el mensaje, forma el día de golpe (sin nombres) y sale solo tras 1,2 s para revisar FORMAS → FRAGMENTOS → PARTÍCULAS → CONVERGENCIA → HOY a velocidad normal; `fast` acelera toda la entrada; `hold` impide la salida automática de `collapse`. Se pueden combinar (`fast,collapse`). Sin el parámetro, nada cambia: DAYSCAPE solo sale con CONTINUAR. |

Semana de referencia: lunes `2026-09-28` · martes `2026-09-29` · miércoles `2026-09-30` · jueves `2026-10-01` · viernes `2026-10-02` · sábado `2026-10-03` · domingo `2026-10-04`.

Momentos útiles (añade `&entry=none` para ir directo a HOY):

| URL | Qué se ve |
| --- | --- |
| `?date=2026-09-28&t=10:30` | Lunes · Nueva Marca Wellness (incluye AI Polaris) |
| `?date=2026-09-29&t=10:14` | Martes · Páginas Web → Velocity → Alimentación / recuperación |
| `?date=2026-09-29&t=07:10` | Martes · Merkaba pendiente → *¿Mover a las 09:30?* |
| `?date=2026-09-30&t=14:30` | Miércoles · Páginas Web |
| `?date=2026-10-01&t=14:00` | Jueves · Regeneración / libre (sin acciones) |
| `?date=2026-10-02&t=08:30` | Viernes · Páginas Web |
| `?date=2026-10-03&t=12:30` | Sábado · TouchDesigner, *Alternativa: Biotron* |
| `?date=2026-10-03&t=13:35` | Sábado · Finanzas personales (15 min) |
| `?date=2026-10-04&t=17:30` | Domingo · Nueva Marca Wellness (y `19:15` Descanso) |
| `?date=2026-09-27&t=13:30` · `?date=2026-10-04&t=13:30` | Domingo rotativo · Newsletter · Páginas Web |
| `?date=2026-10-02&t=08:25` · `?date=2026-10-03&t=08:25` · `?date=2026-10-04&t=08:25` | Breathwork energizante: viernes no (Páginas Web sigue), sábado no, domingo sí |
| `?date=2026-09-29&t=23:30` · `?date=2026-09-30&t=04:00` | La noche: Dormir sigue siendo AHORA a ambos lados de medianoche |

El estado del día se guarda en `localStorage` por fecha local (`personal-os:day:YYYY-MM-DD`), así una recarga no pierde lo marcado y cada día empieza limpio. Para reiniciar un día, borra esa clave.

**La simulación no toca la persistencia real.** Con `?date=` o `?t=`, el estado de los días y la memoria de la entrada se guardan aparte (`personal-os:sim:day:YYYY-MM-DD`, `personal-os:sim:entry`): revisar otro día nunca marca nada en los días reales ni da por vista la entrada de hoy. Para limpiar la simulación, borra las claves `personal-os:sim:*`.

## SEMANA (V0.4) — Archipiélago minimal · galaxia abstracta de vidrio

*¿Cómo está diseñada mi semana?* — no *¿qué tengo a las 14:00?*. Siete objetos + una red de luz + una atmósfera compartida. Se abre desde la navegación (desktop: barra lateral; móvil: navegación inferior HOY · SEMANA) y muestra directamente la vista general: nunca repite la entrada diaria.

**Datos.** `src/domain/week.ts`: `buildWeek(hoy, routineForDate)` resuelve lunes → domingo de la semana activa **por fecha real** (nada fijo como "28 sep – 4 oct"), cada día con el mismo resolvedor que HOY (rotación del domingo y overrides incluidos) y el mismo motor de horario. Deriva, sin horas: carga ponderada (profundo 1 · aprendizaje y cuerpo 0,6 · ritual y admin 0,3), espacio abierto, el bloque profundo más largo y tres regiones — mañana 06–12 · tarde 12–19 · noche 19–22 — nombradas por su trabajo profundo (o, si no lo hay, por sus dos actividades mayores; nunca una comida o un traslado). `buildWeek(hoy, …, ±1)` prepara la semana anterior / siguiente (sin UI todavía).

**Forma** (`src/features/week/geometry.ts`, puro). Cada día es un guijarro de vidrio óptico moldeado a mano: una familia, siete individuos. Nada parte de una elipse: siete contornos propios (12 puntos de control cada uno, con un extremo más lleno, distinta tensión arriba y abajo, una desviación del eje y pequeñas irregularidades) — Lunes compacto y asimétrico a la izquierda, Martes más plano e inclinado, Miércoles más abierto en un extremo, Jueves muy fino (membrana), Viernes compacto y torcido, Sábado más lleno con la curva inferior más pesada, Domingo más largo y hondo. El contorno vive en su propio plano y se ve en perspectiva: la cúpula sube sobre el borde lejano, la curva inferior baja bajo el cercano y los extremos quedan romos — un guijarro, nunca un cuenco ni una almendra. Por eso el mismo objeto puede girar hacia nosotros sin volverse un círculo. La carga vive en el vidrio, no en el tamaño: grosor, escarcha, niebla interior. Jueves: la pieza más fina y clara, con su contorno interior visible. Sábado: la más densa, no la más grande. Domingo: la más larga, con un interior continuo y más hondo, más silenciosa. HOY: punto modular 3 × 3 sobre su vidrio, borde algo más frío y su relación algo más viva. Pasado: un poco más plateado · futuro: un poco más translúcido.

**Material.** Interior lechoso lavanda con la luz reunida abajo (y algo de melocotón), un borde óptico fino, una banda refractada suave bajo el borde lejano, una cáustica en el borde inferior y una sombra leve. Solo Jueves (membrana) y Domingo (profundo) muestran su contorno interior completo; los demás son cúpulas macizas. Cada pieza recibe su propio reflejo (creciente, mancha, chispa o casi nada), en su propia capa: respira despacio y sin ir al paso de las otras, sin repintar el vidrio.

**Composición** (según la referencia aprobada C2.1). Desktop: Lunes abre a la izquierda; Martes y Miércoles, pequeños y lejanos, arriba en el centro; Jueves cae hacia el aire abierto, abajo a la izquierda; Viernes abajo; el par cercano Sábado / Domingo a la derecha. Tres planos — 2 lejanos, 3 medios, 2 cercanos — por escala, nitidez, saturación y opacidad, con un leve paralaje con el puntero; sin centro geométrico. Móvil: un campo vertical, no una lista — izquierda → derecha → centro, bandas compartidas, nunca dos días seguidos en la misma columna, los nombres a uno u otro lado del vidrio. No se arrastra ni se desplaza como un mapa.

**Red de luz.** Ni órbitas ni diagrama: 4–6 fibras abiertas e incompletas que se doblan, cambian de dirección, se bifurcan, se pierden, y una que une dos regiones sin tocar ninguna pieza. Casi todo pasa por detrás de los días; una cruza entre los lejanos y los cercanos. 5–8 puntos de luz sobre ellas aparecen y se apagan despacio. Cada fibra respira, cambia un poco su curvatura y a veces transporta un brillo, en ciclos propios de 20–60 s.

**Atmósfera.** Aurora Pearl sobre Pearl Ivory cálido, en tres planos: velos del fondo (Champagne Mist, Soft Peach, Muted Mauve / Lavender) que derivan en ciclos de 40–90 s con haces de luz diagonales; una banda de bruma malva en el plano medio, por delante de los días lejanos y por detrás de los cercanos; y un velo delantero casi imperceptible. Solo CSS (transform / opacity), sin máscaras ni WebGL.

**Cuatro estados** (`weekFlow.ts`, máquina de estados pura):

1. **General** — rango de la semana, siete nombres, una línea de función por día.
2. **Día seleccionado** (tap / clic, ~700 ms) — el mismo objeto se acerca, gira un poco hacia el frente y se aplana; se estabiliza; la semana retrocede; la red pierde presencia; su materia se ordena (~600 ms) en MAÑANA · TARDE · NOCHE, densidades de luz sin bandas. Su nombre y su función flotan sobre el vidrio; las tres partes, dentro; *VER DÍA →* debajo (o tocar de nuevo el día). Tocar alrededor o `Esc` vuelve.
3. **La superficie pierde su límite** (~900 ms) — el vidrio se expande y se disuelve, las fibras se apagan, la materia queda en tres placas con el contorno del propio objeto que se separan en profundidad y se enfrían; un punto frío marca la parte del día donde estará AHORA.
4. **DAYSCAPE real** de esa fecha (~1 s después): el mismo `buildDayscape` y el mismo componente `Dayscape`, alojados en `WeekDayscape.tsx` como los aloja la entrada diaria. *← Semana* (o `Esc`) deshace el día en materia y devuelve la semana; si el día es hoy, *Continuar* hace la salida de siempre y aterriza en el AHORA de HOY.

**Movimiento reducido.** Velos, fibras, puntos de luz y reflejos quietos, sin deriva ni brillos; la selección es un fundido suave; la apertura es un fundido simplificado. Los objetos se mantienen.

## Entrada diaria

```
ABRIR APP → MENSAJE → EL MENSAJE SE DISUELVE → DAYSCAPE (el día entero se forma por oleadas; explorar sin límite)
→ CONTINUAR → FORMAS → FRAGMENTOS → CAMPO DE PARTÍCULAS → CONVERGENCIA EN AHORA → HOY EMERGE DE LA MISMA ATMÓSFERA
```

- **Primera apertura real del día** (fecha local): entrada completa. Un toque durante el mensaje lo hace avanzar; en DAYSCAPE, los toques exploran. DAYSCAPE no sale solo: **CONTINUAR →** aparece, discreto, a los ~14 s. `dailyEntrySeenDate` se guarda cuando HOY ya está en pantalla: si la app se cierra antes, el ritual vuelve a aparecer.
- **Mismo día, vuelta tras ≥ 30 min**: micro entrada (≈1,7 s): atmósfera breve → *¿Listo para volver?* → HOY.
- **Mismo día, vuelta en < 30 min**: HOY directamente.
- Cambiar de pestaña, bloquear el teléfono o volver de otra app no dispara nada: se decide una vez por carga de página. Si cambia el día con la app abierta, la entrada del nuevo día llega en la siguiente apertura real.
- Con una sesión de Focus en curso no se muestra ninguna entrada.
- **Mensaje del día**: biblioteca editorial local en `src/data/dailyMessages.ts`, sin IA ni red. Se elige con `díaDelAño % mensajes` y se guarda `dailyMessageId` con la fecha, así todo el día muestra el mismo.
- Memoria en `localStorage` → `personal-os:entry` (`dailyEntrySeenDate`, `dailyMessage`, `lastActiveAt`, `dayscapeHintDate`).

### DAYSCAPE (V0.7)

Todo el día a la vez, alrededor del presente (arquitectura D aprobada: radial alrededor de AHORA + profundidad y parallax). No hay línea ni trayectoria: el tiempo es **profundidad y materia**.

- **Mismos datos que HOY** (`buildDayView` sobre la rutina de la fecha): todas las actividades del día, transiciones incluidas (los huecos sintéticos no). No hay lista propia de objetos: forma, tamaño y nombre salen de la hora, la categoría, `dayscapeRole`, el estado temporal y el de ejecución. Los días con menos bloques (jueves) se ven, a propósito, menos densos.
- **Papel visual por categoría**: `deep_work` y gimnasio (cuerpo ≥ 60 min) → masa mayor; práctica creativa con Focus (TouchDesigner) → mayor; ritual → micro (la meditación del día, media); transición, recuperación, libre y huecos → espacio; dormir → extremo. Un `dayscapeRole` explícito en el bloque gana. La inspección de un bloque con `secondaryOption` añade, discreta, *Alternativa: …* (nunca un segundo objeto).
- **Tres planos**: primer plano (hasta 1 h de pasado / ~2 h de futuro), plano medio y fondo; lo lejano es más pequeño, más difuso y está más alto. El pasado está erosionado (plata, suelta materia); el futuro, todavía formándose (hielo, incompleto). **AHORA** es el centro perceptivo: destaca por nitidez, materialidad, escala y estabilidad (no hace morph ni deriva), con un azul hielo-plata poco saturado.
- **Cinco Aperturas** (Cardinal, Órbita, Disolvente, Eje, Prisma): la misma materia en cinco configuraciones; AHORA es el Prisma. Explorando, un único morph lento a la vez.
- **Tiempo y ejecución separados**: completado, parcial, omitido y sin registrar salen solo del estado guardado (núcleo de cada forma). Un bloque pasado sin registro nunca se muestra como hecho.
- **Revelado progresivo** en seis oleadas (ejemplo del martes: 0–2 s Merkaba, Hermana · 2–3,5 s Escritura, Breathwork, Substack · 3,5–5 s Inglés, Pausa, Lectura · 5–7 s Páginas Web, Velocity, Alimentación · 7–9 s Marca Wellness, Gimnasio, Comida / ducha · 9–11 s Marca Wellness, Cierre digital, Breathwork relajante, Dormir). Cada actividad: forma → Astral Fade → nombre → horario. **Cada nombre se lee ~1,5–2 s** y se disuelve en su sitio; las oleadas se solapan, así nunca están las 18 etiquetas a la vez. Después solo queda **AHORA / nombre / horario**, permanente.
- **Pista**: con el campo limpio aparece, muy discreto, `TOCA PARA EXPLORAR · ARRASTRA PARA RECORRER`. Se va con la primera interacción y no vuelve ese día (`dayscapeHintDate`).
- **Arrastrar** recorre el día con parallax: primer plano 100 %, medio 52 %, fondo 20 %, atmósfera 2–10 % (cada masa con su propio factor). Límites suaves e inercia.
- **Tocar** una actividad la trae al frente (tamaño de primer plano, nítida, recupera algo de materia) y la información se materializa a su alrededor —nombre y horario encima; ✦, tipo y estado debajo— sobre una neblina refractiva, **sin tarjeta**. El resto se aparta y baja, sin oscurecer; una masa de luz se acerca, muy despacio, a lo inspeccionado. Sus vecinas en el tiempo quedan menos atenuadas (preparado para deslizar a la anterior / siguiente más adelante). Tocar fuera o Esc lo devuelve todo a su sitio.
- **Símbolos delicados, dianas generosas**: cada actividad tiene un área de toque invisible de 44–52 px (gana la más cercana) y un botón accesible para teclado y lector de pantalla.
- **Atmósfera viva**: suelo perla con masas de luz independientes (perla, silver mist, hielo, violeta y un velo de niebla delante del fondo) y un reflejo especular. Cada masa vive su propia vida de 9–24 s —aparece, deriva, se expande, pierde definición, desaparece y renace en otro sitio—, visible en pocos segundos y nunca sincronizada.
- **Salida (≈ 5,3 s tras CONTINUAR)**: calma (0,4 s) → **FORMAS → FRAGMENTOS** (cada forma se abre en sus piezas, que se separan, giran y se erosionan a su manera; lo lejano primero) → **CAMPO DE PARTÍCULAS** (microfragmentos que se asientan en puntos perlados, con reflejos plata y profundidad por plano) → AHORA, el último en romperse (2 s) → **CONVERGENCIA** (2,7 s: cuatro puntos completan el módulo 3 × 3, una parte la absorbe el presente, el resto se disuelve; el módulo pasa de difuso a nítido y se asienta) → el módulo, ya con su nombre, aterriza en el AHORA de HOY mientras HOY emerge de la misma atmósfera.
- **Movimiento reducido**: sin deriva, morph ni partículas; revelado y nombres solo con opacidad; la inspección no mueve la actividad (la información aparece a su alrededor, en su sitio); arrastrar sigue funcionando, sin inercia; la atmósfera solo cambia de opacidad en su sitio; salida por fundidos.
- **Claridad funcional (V0.8)**: la atmósfera sigue siendo protagonista al explorar; cuando hay algo que entender o hacer, la capa funcional gana autoridad.
  - **AHORA**: jerarquía AHORA → actividad → horario → tiempo restante (`1 h 46 min restantes`), más contraste y nitidez en su forma y núcleo, una neblina perla sin bordes que lo separa de la atmósfera y más aire alrededor de su nombre. Al inspeccionar otra actividad se atenúa menos.
  - **Actividades secundarias**: algo menos presentes (opacidad, desenfoque por plano, nombres más ligeros en tono y peso).
  - **Acciones**: la pista lleva un gesto mínimo (un punto que toca y arrastra); CONTINUAR tiene más contraste, una línea que respira y una flecha que se inclina hacia delante. Ambos sobre una neblina perla, sin botones.
  - **Transición a HOY** más compacta (6,6 s → 5,3 s) y sin estados casi idénticos: calma 0,4 s → fragmentos → partículas → AHORA se rompe (2 s) → convergencia (2,7 s) difusa → reconocible → estructurada (el módulo gana nitidez, contraste y se asienta) → nombrada (3,45 s) → HOY (3,9 s).
  - **HOY**: el tiempo restante destaca, *Cerrar bloque* y *Omitir* quedan claramente por debajo de INICIAR FOCUS, y SIGUIENTE es inequívocamente secundario (nombre más pequeño y en tinta más suave).
- **Cualquier día**: el revelado y CONTINUAR se ajustan al número real de actividades (≈ 11 s y 14 s para un día completo, antes para uno ligero, algo más para uno muy lleno); en días muy llenos las formas secundarias son algo más pequeñas y los nombres nunca salen de la pantalla. El tiempo restante de AHORA sigue el reloj mientras DAYSCAPE está abierto. Un día sin rutina (o sin bloques) no usa otro día: la app muestra un error de rutina explícito.
- Código: `src/features/dayscape/` — `model.ts` (modelo y oleadas), `choreography.ts` (tiempos), `layout.ts` (composición D, nombres, inspección, dianas), `forms.ts` (las cinco formas), `morph.ts`, `matter.ts` (fragmentos → partículas → convergencia), `atmosphere.ts` (vidas de las masas de luz), `Aperture.tsx`, `MassField.tsx`, `MatterCanvas.tsx`, `DayscapeAtmosphere.tsx`, `Dayscape.tsx`.

## APRENDER (Fase A · esqueleto)

Nueva sección de ELYUM (HOY · SEMANA · **APRENDER**) con su identidad, su navegación, su persistencia y su estructura propias. **Es solo el esqueleto**: todavía no hay IA, backend, llamadas de red, voz, grafo de conocimiento, modelos mentales funcionales, objetivos ni habilidades. Funciona sin conexión, como el resto.

**Qué hay.** Una entrada con ritual, el campo *¿Qué tienes en mente?* con tres sugerencias, y tres vistas internas — **AHORA · MAPA · MODELOS** — que son una línea de palabras arriba, no la navegación (esa es la inferior / lateral). Las rutas intelectuales (orientarme, desarrollar, explorar) no son pestañas.

**Identidad.** Reutiliza el lenguaje de FOCUS sin tocarlo: la tipografía de puntos (`DotWord`, matriz 5 × 7) deletrea APRENDER —se comprobó su legibilidad a 320, 375 y 390 px—, etiquetas con tracking amplio y atmósfera profunda. Sin fuentes ni assets nuevos. APRENDER **toma prestada por nombre la atmósfera `focus-session`** (`features/learn/atmosphere.ts`): es temporal; tendrá la suya y solo ese archivo cambiará.

**Entrada (hora local del dispositivo, nunca UTC).**

- *Primera entrada de la fecha* — ritual completo: 0,0 atmósfera · 0,2 APRENDER empieza a formarse · 2,3 la frase del día · 6,0 desfragmentación · 7,0 *¿Qué tienes en mente?* · 7,6 el campo · 8,2 las sugerencias. La navegación se aparta hasta las sugerencias.
- *Entradas posteriores ese día* — breve (≈1 s): sin wordmark ni frase, sin esperas, la navegación siempre visible.
- *Nunca un bloqueo*: cualquier clic, toque o tecla lleva al estado funcional en ≈0,3 s. Mientras dura el gesto que saltó, lo que aparece bajo el dedo no se puede pulsar (el toque que solo quería "seguir" no activa una sugerencia).
- Se marca "visto" al llegar al estado funcional (por tiempo o saltando); si se cierra la app a mitad, el ritual se repite.
- Con `prefers-reduced-motion`, la desfragmentación y la formación del wordmark son fundidos simples.

**Frase del día.** Biblioteca local, una frase por fecha local y estable todo el día (`día % tamaño`; la frase registrada gana si se edita la biblioteca). `features/learn/data/phrases.ts` contiene **solo 3 frases semilla de desarrollo**, marcadas `seed` en código, sin autor y sin citas reales: la biblioteca editorial verificada la sustituirá sin tocar la selección.

**AHORA** es la casa de APRENDER. Sin una capacidad activa contiene el campo; si se escribe texto libre sin tocar una sugerencia, aparece una **elección manual** de ruta marcada `TEMPORARY_ROUTING_FALLBACK` (no hay clasificador ni simulación de IA: la ruta es siempre la que la persona toca; el archivo se elimina cuando llegue la interpretación). Con una intención guardada AHORA la conserva, dice que aún no hay una capacidad activa y permite *Empezar de nuevo* (las palabras vuelven al campo). **MAPA** y **MODELOS** son solo estados vacíos.

**Persistencia** (propia, versionada, sin tocar ninguna clave del core): `elyum:learn:v1:state` (intención y borrador del campo, que sobrevive a una recarga) y `elyum:learn:v1:entry` (fecha del último ritual y frase del día), con envelope `{ v: 1, data }`; una sesión simulada (`?date=` / `?t=`) usa `elyum:learn:v1:sim:*`. Otra versión de envelope se ignora sin destruirla; si el almacenamiento no está disponible, la sesión sigue en memoria.

**Dominio.** `domain/types.ts` solo declara los tipos que se usarán después (LearningGoal, Skill, Evidence, LearningSession · Knowledge, KnowledgeConnection, Area, MentalModel, Source, Exploration · Context, ContextUpdate · Hypothesis, Experiment), mínimos —identidad, y `kind` en Knowledge—. `KnowledgeKind` = principle · procedure · heuristic · observation; **MentalModel es un objeto compuesto aparte, no un KnowledgeKind**.

**Puntos compartidos tocados** (todos aditivos): `layout/sections.ts` (`aprender` disponible), `App.tsx` (montar la sección, igual que SEMANA) y `components/dot/glyphs.ts` (el nombre `APRENDER` en la unión de palabras de puntos). Nada de PWA, service worker ni estrategia de actualización cambia: el ritual cuenta como inmersivo, así que no se ofrece una versión nueva en mitad de él.

## MOBILE / PWA

ELYUM se instala en la pantalla de inicio del iPhone (y en Android / escritorio) como una app **standalone**: sin barras del navegador, con su icono y su nombre, y funciona sin conexión después de la primera carga. Es una PWA: sin App Store, sin envoltorio nativo, sin backend.

### Instalar en el iPhone (Safari)

1. Abre en **Safari** la URL de ELYUM (la de producción; o la Preview de Vercel para probar una rama). Tiene que ser Safari: desde otra app o navegador la opción puede no aparecer.
2. Toca el botón **Compartir** (el cuadrado con la flecha hacia arriba). Según la versión de iOS y el diseño de Safari está en la barra inferior o superior; si no lo ves, toca primero **···** en la barra de Safari y después **Compartir**.
3. Desliza la hoja hacia arriba y toca **Añadir a pantalla de inicio**. (Si no aparece: **Editar acciones…** al final de la hoja y actívala.)
4. El nombre propuesto es **ELYUM**: déjalo así (o corrígelo) y toca **Añadir**. Si iOS muestra el interruptor **Abrir como app web**, déjalo activado.
5. Sal de Safari y abre **ELYUM** desde su icono (matriz 3 × 3 sobre Deep Ink). Es standalone si no hay barra de direcciones ni botones de Safari, arriba solo aparece la barra de estado del iPhone (hora, batería) y en el selector de apps aparece como *ELYUM*, no como Safari.

La app instalada tiene **su propio almacenamiento**, separado de Safari (así funciona iOS): lo que hayas marcado en Safari no aparece en la app instalada y viceversa. Úsala siempre desde el icono. Si la Preview de Vercel está protegida con login de Vercel, la app instalada lo pedirá otra vez la primera vez (no comparte cookies con Safari).

### Configuración

- **`vite-plugin-pwa` 1.3** (`vite.config.ts`, modo `generateSW`, `registerType: 'prompt'`): genera `manifest.webmanifest`, `sw.js` (Workbox) y lo inyecta en el build. En `npm run dev` no hay service worker; se prueba con `npm run build && npm run preview`.
- **Manifest** (`src/pwa/config.ts`, compartido con los tests): `name` y `short_name` *ELYUM*, `display: standalone`, `start_url: /`, `scope: /`, `id: /`, `orientation: portrait-primary` (iOS decide igualmente si gira), `background_color: #F7F9FC` (Pearl: lo que la app pinta antes de su atmósfera), `theme_color: #081A32` (Deep Ink), `lang: es`. El `<link rel="manifest">` lleva `crossorigin="use-credentials"` para que funcione en Previews protegidas de Vercel.
- **`index.html`**: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: default`, `apple-mobile-web-app-title: ELYUM`, `apple-touch-icon`, `theme-color` y una imagen de lanzamiento por iPhone.

### Iconos y lanzamiento

- Sin logotipo nuevo: el motivo 3 × 3 de `public/mark.svg` (puntos astral, centro aurora, sobre Deep Ink), con más aire para la pantalla de inicio. Fuentes: `src/pwa/icon.svg` (esquinas redondeadas) e `icon-maskable.svg` (a sangre).
- `public/`: `pwa-192x192.png`, `pwa-512x512.png` (any), `maskable-512x512.png` (Android: la matriz queda dentro de la zona segura), `apple-touch-icon.png` (180 × 180, a sangre, sin transparencia: iOS aplica su propia máscara). Para regenerarlos, rasteriza las fuentes SVG a esos tamaños (los tests comprueban nombres y píxeles).
- `public/splash/launch-*.png`: 13 imágenes de lanzamiento (iPhone SE → 17 Pro Max / Air, vertical), color Pearl liso: al tocar el icono no hay destello negro ni blanco duro, y la app entra sobre el mismo fondo. No hay splash artificial: dura lo que tarda en cargar.

### Barra de estado

`default` + `theme-color` dinámico. La app ya fija `theme-color` con el fondo de cada momento (atmósfera de HOY, Pearl Ivory en SEMANA, Deep Ink en FOCUS y en la atmósfera profunda de la noche); en standalone iOS pinta la barra de estado con ese color y elige iconos oscuros o claros según el contraste. Por eso no se usa `black-translucent`: dejaría los iconos siempre blancos, ilegibles sobre HOY y SEMANA claros. Limitación: el contenido empieza bajo la barra de estado (no por detrás), y si alguna versión de iOS no aplicara el cambio de color en vivo, la barra quedaría con el color de la pantalla de arranque. Verificar en el dispositivo (checklist).

### Safe areas, altura y toque

- Contextuales, sin padding global: HOY `padding-top: inset + 28px` y `padding-bottom: 4rem + inset` (su final nunca queda bajo la navegación); cabecera de SEMANA `inset + 28px`; cabecera del día abierto `inset + 22px`; navegación inferior, CONTINUAR, *Volver a la semana* y FOCUS con `max(inset inferior, …)`. En Safari (insets 0) todo queda exactamente como antes (verificado píxel a píxel contra `49387ac`).
- No hay `100vh`: `body` usa `100dvh` y las capas a pantalla completa son `fixed inset-0`; los `vh` restantes son solo decorativos (velos, halos) y el tamaño del círculo de FOCUS, estables en standalone.
- Toque ≥ 44 px sin cambiar el aspecto: clase `.hit` (Button y botones sueltos) y `.sm-open::before` amplían el área táctil con un pseudo-elemento; CONTINUAR, *← Semana* y los campos de texto ganan altura sin mover su texto. Excepción asumida: con un día seleccionado en SEMANA, los días que retroceden miden ~38 px de alto (su escala es parte del renderer congelado); en reposo todos superan 44 px.
- Teclado: el objetivo usa texto de 18 px (iOS no hace zoom), la tecla de retorno es **OK / Done** (`enterkeyhint`) y lo guarda y cierra el teclado; mientras se escribe en un móvil, la navegación inferior y el aviso de versión se apartan. Nada depende de hover (en SEMANA el hover solo existe con `(hover: hover)`).

### Service worker, caché y offline

- **Precache** de todo el build (~870 KB, 20 archivos): HTML, JS, CSS, las fuentes (todas las subsets), iconos y manifest. Las imágenes de lanzamiento no (solo las lee iOS al instalar). `cleanupOutdatedCaches` borra las versiones anteriores.
- **Una sola app, cualquier URL:** toda navegación recibe el mismo `index.html` del precache y se ignoran todos los parámetros (`?date=`, `?t=`, `?entry=`, `?section=`): una URL simulada nunca es otra versión ni otra entrada de caché. La separación simulación / real sigue siendo la del almacenamiento (`personal-os:sim:*`).
- **Offline:** la rutina vive en el bundle y la app no hace peticiones de red. Tras una primera carga con conexión funcionan sin red HOY, SEMANA, DAYSCAPE (de cualquier fecha), FOCUS, la entrada diaria y los estados locales (probado: recarga offline, URL nunca visitada offline, FOCUS y registro de resultado offline). Sin conexión solo no se buscan versiones nuevas.

### Actualizaciones

1. Cada deploy genera un `sw.js` nuevo. La app lo busca al abrirse, cada vez que vuelve al primer plano y cada hora si sigue abierta.
2. La versión nueva se descarga en segundo plano y **espera**: nunca recarga sola.
3. Solo en reposo (HOY o SEMANA; nunca durante FOCUS, su cierre y resultado, la entrada diaria o un día abierto) aparece sobre la navegación, discreto: **Nueva versión disponible · Actualizar**. Si llega durante FOCUS, aparece al volver a HOY.
4. **Actualizar** activa la nueva versión y recarga en HOY. Si no se toca, la nueva versión se usa sola la próxima vez que la app se abra desde cero (iOS la cierra tras un tiempo en segundo plano, o al cerrarla desde el selector de apps). Si otra ventana la activa, esta no recarga hasta estar en reposo.
5. Los estados guardados (localStorage) no se tocan al actualizar. No hace falta reinstalar.

Código: `src/pwa/updates.ts` (registro + comprobaciones), `src/pwa/moment.ts` (cuándo se puede ofrecer), `src/pwa/UpdateNotice.tsx`.

### Almacenamiento, privacidad y límites

- **Estado local, por dispositivo:** `personal-os:day:<fecha local>` (registros, completados, omitidos, parciales, objetivos, Focus abierto) y `personal-os:entry` (entrada vista, mensaje del día, última actividad); las simulaciones usan `personal-os:sim:*`. Sigue en localStorage. Instalada, la app pide almacenamiento persistente (`navigator.storage.persist()`) para que el sistema no lo desaloje.
- **Sin cuenta, sin sincronización:** el iPhone tiene su estado y el escritorio el suyo; Safari y la app instalada también son distintos. Borrar la app de la pantalla de inicio borra su estado. Si no se usa durante semanas, iOS podría limpiar sus datos.
- **La rutina viaja en el frontend:** quien tenga la URL puede ver la rutina (está en el JavaScript). No hay login ni contraseña: no se añade un acceso falso solo de frontend. Autenticación y backend son otra fase.
- **Identificadores técnicos que conservan el nombre anterior (a propósito):** las claves de `localStorage` `personal-os:day:*`, `personal-os:entry` y `personal-os:sim:*` no son nombre de producto sino la dirección donde viven los datos de cada dispositivo: renombrarlas dejaría sin estado (días, objetivos, entrada vista) a la app ya instalada. Por la misma razón no cambian `id`, `scope` y `start_url` del manifest (siguen en `/`, así el sistema reconoce la misma app), ni las URLs, ni el service worker. También conservan el nombre antiguo, sin efecto para quien usa la app: el `name` privado de `package.json` y el nombre del repositorio / proyecto de Vercel.
- **Hora local:** instalada se comporta igual que Safari: fecha, hora y día de la semana del dispositivo, nunca UTC.
- **Iconos:** iOS guarda el icono al instalar; si el icono cambia en el futuro, hay que quitar y volver a añadir la app para verlo.

### Probar y desplegar

- Local: `npm run build && npm run preview` → http://localhost:4173 (DevTools → Application: Manifest, Service workers, Cache storage; *Offline* para probar sin red). Tests: `src/pwa/pwa.test.ts` (manifest, iconos, metadatos iOS, imágenes de lanzamiento, URLs simuladas, cuándo se ofrece una versión, standalone).
- Deploy: cada rama genera su Preview en el mismo proyecto de Vercel; `main` es producción. Tras el merge, el iPhone recibe la versión nueva al abrir o volver a la app (aviso → Actualizar) sin reinstalar. No cambies `id`, `start_url` ni `scope` del manifest: el sistema lo trataría como otra app.

## Arquitectura

```
src/
  domain/          modelo puro, sin React
    types.ts       Rutina, bloques, categorías, estados (PRÓXIMO, ACTIVO, EN FOCUS, COMPLETADO, PARCIAL, OMITIDO, SIN REGISTRAR)
    routine.ts     resolveDay(semana, fecha, config) → rutina de esa fecha (rotaciones + overrides) · validateWeek
    schedule.ts    buildDayView(rutina, estado, hora, {ayer, mañana}) → ahora / siguiente / después / camino / progreso
    week.ts        buildWeek(hoy, resolver, desplazamiento) → lunes–domingo: carga, espacio, mañana / tarde / noche
    time.ts, labels.ts, energy.ts
  data/
    routine/       RUTINA MAESTRA V3: un archivo por día, config.ts (decisiones abiertas), rules.ts, index.ts
    profile.ts
  state/           reloj, reducer del día, persistencia, DayProvider
  motion/          vocabulario de movimiento (tokens.ts) y niveles COMPLETO / SUTIL / REDUCIDO
  atmosphere/      Astral Fade (halos), partículas, presets por estado energético
  components/      dot typography (DotWord, glifos 5×7), botones, labels, glifos de estado
  features/
    today/         HOY: contexto, AHORA, SIGUIENTE, camino del día, meditación pendiente
    focus/         flujo HOY → FOCUS → RESULTADO → SIGUIENTE → HOY
    closing/       pregunta de resultado (Sí / Parcial / No), compartida por HOY y FOCUS
    entry/         entrada diaria y micro entrada, reglas de sesión, mensaje del día
    dayscape/      DAYSCAPE: el día entero alrededor del presente, su atmósfera y su materia
    week/          SEMANA: lentes, red de luz, velos, selección, apertura al DAYSCAPE de una fecha
  layout/          navegación lateral (desktop), navegación inferior (móvil) y secciones
  features/learn/  APRENDER (Fase A): domain/ data/ storage/ hooks/ components/ screens/ — ver su sección
  pwa/             app instalable: manifest (config.ts), actualizaciones (updates.ts), aviso, standalone
```

La UI no contiene datos de rutina: ni horas, ni títulos, ni objetivos. Todo sale de `src/data/routine/` (ver abajo).

## Rutina maestra V3 — única fuente de verdad

```
WEEKLY_ROUTINE (src/data/routine/index.ts)  ← monday.ts … sunday.ts
      │  routineForDate('2026-10-04')  =  resolveDay(semana, fecha, RESOLVE_CONFIG)
      ▼            aplica rotaciones (domingo) y overrides (jueves sin gym, fechas sueltas)
RUTINA DE LA FECHA
      │  buildDayView(rutina, estado de esa fecha, minuto, { ayer, mañana })
      ▼
DAYVIEW  →  AHORA · SIGUIENTE · DESPUÉS · camino · progreso
      ├── HOY       (NowCard, NextUp, DayPath)
      ├── DAYSCAPE  (buildDayscape(view))
      └── FOCUS     (el bloque de la vista con ese id)
```

`DayProvider` resuelve hoy, ayer y mañana (así Dormir no se rompe a medianoche) y construye una única `DayView` que consumen las tres vistas.

**Dónde editar:** `src/data/routine/<día>.ts`. Cada bloque es una línea:

```ts
block('tue-web-1000', '10:00', '12:00', 'Páginas Web', 'deep_work', 'focus', {
  subtitle: 'MVP / Testeo', descriptor: 'Trabajo profundo', project: 'web', dayscapeRole: 'major',
})
//     id              inicio   fin      título         categoría   estado energético   extras
```

- **id**: `<día>-<slug>-<HHMM>` (`mon-meditation-0600`, `sat-touchdesigner-1200`). Estable y legible: el estado se guarda por **fecha real + id**, así completar un miércoles no marca los demás. Si cambias la hora de un bloque, cambia el id (el validador lo exige).
- **fin** puede omitirse: el bloque dura hasta el siguiente (Dormir llega hasta la primera actividad del día siguiente).
- **categoría** (`deep_work`, `learning`, `ritual`, `creative_practice`, `body`, `recovery`, `transition`, `admin`, `reflection`, `sleep`, `free`) fija por defecto `focusEligible` y `countsForProgress` (`define.ts → CATEGORY_DEFAULTS`); un bloque puede sobrescribirlos (TouchDesigner: `creative_practice` con `focusEligible: true`).
  - Solo `deep_work` abre FOCUS por defecto. Transición, recuperación, libre y dormir nunca cuentan en el progreso.
  - HOY: bloque con Focus → *Iniciar focus · Cerrar bloque · Omitir*; bloque que cuenta → *Completar · Omitir*; el resto (traslados, comidas, pausas, espacios libres, dormir) se muestra sin acciones.
- **extras**: `shortTitle` (nombre corto en el camino y DAYSCAPE), `subtitle`, `descriptor` (sustituye a la etiqueta de la categoría), `project`, `dayscapeRole`, `secondaryOption`, `includes` (lo que ocurre dentro del bloque sin partirlo: AI Polaris ~1 h dentro de Wellness lunes y miércoles), `metadata` (p. ej. `publication: true` en Substack).
- **objetivos**: no hay objetivos en los datos. El objetivo se escribe en HOY y se guarda por fecha + bloque (`defaultObjective` existe, pero ningún bloque lo usa).

**Añadir un bloque:** una línea `block(...)` en su día, en orden de hora. **Añadir un día / reemplazarlo:** un archivo con `DayRoutine` (`weekday`, `dayName`, `theme`, `meditation`, `blocks`) registrado en `WEEKLY_ROUTINE`. En desarrollo, `validateWeek` avisa en consola de cualquier incoherencia (día que falta, id mal formado o repetido, solapes, Focus en un bloque que no es profundo, transición que cuenta…) y `npm test` falla.

**Sin respaldo:** si falta un día, `routineForDate` lanza `RoutineMissingError` y la app muestra *Error de rutina* con el día y la fecha. Nunca se usa otro día.

**`secondaryOption`:** una alternativa dentro del mismo bloque, nunca una segunda obligación. Sábado 12:00–13:20 es **TouchDesigner** (un solo bloque, un solo objeto en DAYSCAPE, FOCUS abre TouchDesigner) con `secondaryOption: Biotron · Sesión creativa / experimentación`, que aparece discreta bajo la descripción en HOY, en el detalle del camino y en la inspección de DAYSCAPE.

**Overrides** (`config.ts`): cambios de una fecha concreta, `{ remove, patch, add }` sobre la rutina de ese día.
- **Jueves sin gimnasio** (uno al mes): `THURSDAY_WITHOUT_GYM` (en `thursday.ts`) quita el gimnasio y el bloque libre de 18:00 y alarga *Regeneración / libre* hasta 20:50. Se aplica solo a las fechas de `THURSDAYS_WITHOUT_GYM` — hoy vacío: **no está decidido qué jueves**. Ej.: `THURSDAYS_WITHOUT_GYM = ['2026-10-15']`.
- Cualquier otra excepción: `DATE_OVERRIDES['2026-10-12'] = { remove: [...], patch: {...}, add: [...] }`.

**Rotaciones:** la definición vive con su día y la resolución de la semana en `config.ts`.
- **Domingo 13:00–16:00** (`sun-rotation-1300`): semana A = **Newsletter**, semana B = **Páginas Web**. Ancla: `SUNDAY_ROTATION_ANCHOR = '2026-09-27'` (Newsletter) en `config.ts`; la variante es `SUNDAY_ROTATION[semanasDesdeElAncla % 2]` (con módulo positivo, así las fechas anteriores al ancla siguen alternando): 27/09 Newsletter · 04/10 Páginas Web · 11/10 Newsletter · 18/10 Páginas Web… (y 20/09 Páginas Web). El bloque resuelto es trabajo profundo normal —título *Newsletter* o *Páginas Web*, *Trabajo profundo*, su proyecto, Focus, masa mayor en DAYSCAPE— y llega así a HOY, DAYSCAPE y FOCUS. El id no cambia entre semanas.
  - **Cambiar el ancla:** pon en `SUNDAY_ROTATION_ANCHOR` cualquier domingo en que toque Newsletter.
  - **Invertir Newsletter / Web:** cambia el orden en `SUNDAY_ROTATION = ['web', 'newsletter']` (o mueve el ancla una semana).
  - Qué es cada variante (título, proyecto, descripción): `SUNDAY_DEEP_VARIANTS` en `sunday.ts`. Con `SUNDAY_ROTATION_ANCHOR = null` el bloque volvería a leerse *Trabajo profundo rotativo · Variante de esta semana sin definir*.
- **Domingo 17:00–21:00** es un único periodo profundo: Wellness 17:00–19:00, Descanso 19:00–19:30 (el único), Wellness 19:30–21:00. No insertar nada más.

**Reglas globales** (`rules.ts`, informativas): dormir 22:00–06:00 · meditación 06:00 (martes: Merkaba) · **Breathwork energizante 08:25 (3 min) cuando esté programado en la rutina del día** — no es universal: lunes, martes, miércoles, jueves y domingo; **viernes no** (08:00–10:00 Páginas Web es un bloque continuo) y **sábado no** (su mañana ya está definida: Inglés 07:00–08:15, Substack 08:30, desayuno) · SIN INPUTS 06:00–12:00 (domingo: correo 08:30–09:30) · pantallas OFF ~20:50 · bloques profundos ~120 min · Substack se publica lunes, martes, miércoles y sábado (viernes se trabaja, no se publica) · gimnasio L–J 16–18, V 18–20, D 10:30–12:30, sábado no.

**Migración del estado guardado** (`storage.ts → migrateDay`, al cargar cada fecha):
- Registros y Focus abierto con ids del martes de prueba (`merkaba`, `paginas-web`, `wellness-1`…) se **traducen** a sus ids V3 (`tue-merkaba-0600`, `tue-web-1000`, `tue-wellness-1400`…) en fechas que son martes.
- En cualquier otra fecha esos ids se **descartan**: describían el martes de respaldo, no ese día.
- Se conserva todo lo demás: registros con ids V3, objetivos, notas y `meditationMoved`. Nada se borra en bloque, y un registro V3 nunca se sobrescribe con uno antiguo.
- `personal-os:entry` (memoria de la entrada diaria) no cambia.

## Decisiones de interpretación

Puntos donde la especificación dejaba margen. Todos son fáciles de cambiar.

- **Pasado ≠ completado:** un bloque cuya hora terminó sin registro queda *Sin registrar* (◌), en HOY y en DAYSCAPE, y no suma progreso. Desde el camino del día (desplegar el bloque) se puede *Marcar completado* o *Marcar omitido*.
- **Meditación:** si su franja pasa sin marcarla, queda *pendiente* y aparece *¿Mover a las 09:30?* hasta el final de esa franja. *Sí* la mueve y sustituye a Lectura (Lectura no se reubica; nada más se mueve). Añadí *Ya la hice* por si se hizo sin marcarla. Si nadie responde antes de que acabe la Lectura, cuenta como omitida. El rescate solo existe donde la rutina lo permite sin desplazar nada: lunes, martes y miércoles (Lectura 09:30). Jueves a domingo la meditación no tiene franja de rescate.
- **Resultado "No"** deja el bloque COMPLETADO (se trabajó) con resultado *no conseguido*; *Parcial* → estado PARCIAL con la nota de lo pendiente. Nada se reprograma.
- **Transiciones, recuperación, espacios libres** (traslados, pausas, comidas, descansos, *Regeneración / libre* y huecos entre bloques) aparecen en AHORA cuando tocan, sin acciones, y no cuentan en el camino ni en el progreso. El progreso cuenta los bloques con `countsForProgress` (martes: 12).
- **Acciones de AHORA:** bloque con `focusEligible` → *Iniciar focus* · *Cerrar bloque* · *Omitir*; resto → *Completar* · *Omitir*. Tras cerrar, *Deshacer* permite corregir un toque accidental.
- **FOCUS** tiene *Finalizar bloque* y, discreto, *Salir sin cerrar* (vuelve a HOY sin registrar resultado). El temporizador cuenta lo que queda del bloque; si se pasa, muestra el exceso con `+`.
- **CIERRE** (20:50 en adelante) usa la atmósfera profunda también en HOY; el resto de estados son claros.
- **Sin respaldo de martes:** los siete días tienen rutina propia; si faltara uno, error de rutina explícito.
- **Navegación:** HOY y SEMANA están activas; Aprender y Sistema siguen atenuadas y sin acción en desktop, solo para validar la estructura (`src/layout/sections.ts`). En móvil, una navegación inferior discreta (HOY · SEMANA) muestra solo las secciones disponibles; se oculta durante la entrada, FOCUS y al abrir un día.
- **DAYSCAPE de otro día (desde SEMANA):** se construye con la rutina y los registros guardados de esa fecha, a la **misma hora del día** que ahora — igual que `?date=` —, así que su AHORA es el bloque de esa fecha a esta hora. Para hoy es exactamente el DAYSCAPE en vivo.
- **Sin marca:** el único signo de identidad es una matriz de 3×3 puntos (placeholder).

## Sistema de movimiento

| Verbo | Dónde |
| --- | --- |
| FADE | Entrada escalonada de HOY, información que aparece/desaparece |
| DRIFT | Halos (ciclos de 26–44 s) y partículas (15–40 s), solo CSS |
| CONVERGE | Partículas hacia el centro y puntos que forman `FOCUS` |
| DISSOLVE | La palabra `FOCUS` se deshace; el temporizador se desvanece al finalizar |
| EXPAND | Camino del día y detalle de cada bloque |
| PULSE | Punto del bloque activo |
| MORPH | Cambio de bloque en AHORA, estado energético, acciones → resultado |
| ORBIT | Anillo del temporizador en FOCUS |

Transición HOY → FOCUS: 0–250 ms superficies secundarias · 250–650 ms sale la navegación, AHORA toma protagonismo, los halos se expanden · 650–1000 ms la luz pasa a azul profundo y las partículas convergen · `FOCUS` en dot typography · se disuelve y quedan temporizador, proyecto, objetivo y finalizar.

Con `prefers-reduced-motion` no hay partículas, halos animados ni secuencia cinematográfica: solo fundidos.
