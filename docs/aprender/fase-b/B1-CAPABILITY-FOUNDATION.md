# APRENDER · Fase B1 — Capability Foundation

Estado: **B1 + corrección B1.1, implementadas en `feature/aprender-capability-engine`, pendientes de revisión**. No están en `main`. B1.1 corrige cuatro decisiones de B1: la fuerza de la evidencia, la falsa precisión temporal, las definiciones versionables y la fecha de los intentos retrospectivos.

B1 lleva a una persona de «quiero poder hacer X» a «esta es mi próxima prueba» sin progreso ficticio. Es determinista y manual: no hay IA, backend ni evaluación semántica.

## Tesis y plantilla

APRENDER convierte información consumida en capacidad utilizable.

Una **habilidad** es la capacidad reproducible de producir un resultado observable, bajo condiciones determinadas y con una autonomía determinada:

> Ser capaz de [acción] para producir [resultado], en [contexto], cumpliendo [criterio], con [nivel de ayuda].

| Concepto | Qué es |
|---|---|
| Evidencia | El intento observable, salga como salga. Un intento fallido también es evidencia |
| Hueco | La diferencia entre lo demostrado y lo necesario para avanzar |
| Próxima prueba | El intento que más reduce la incertidumbre relevante |

**Regla:** intento antes que asistencia.

**Nunca son progreso:** el consumo, el tiempo, los cursos, las notas, la confianza subjetiva ni los porcentajes. Sin evidencia, el estado es **DESCONOCIDO**: no sabemos todavía, no «incapaz».

## Código

Todo está en `src/features/learn/`.

| Archivo | Contenido |
|---|---|
| `domain/capability/model.ts` | Tipos, enumeraciones y límites. Sin reglas temporales (B1.1) |
| `domain/capability/validate.ts` | Plantilla completa, acción observable, duplicados normalizados y condiciones de activación |
| `domain/capability/commands.ts` | Transiciones puras (los ids y el tiempo vienen de fuera); `effectiveEvidence` |
| `domain/capability/strength.ts` | Fuerza de la evidencia, derivada |
| `domain/capability/dimensions.ts` | Reducer de las cinco dimensiones |
| `domain/capability/gaps.ts` | Huecos, derivados |
| `domain/capability/nextTest.ts` | Próxima prueba, derivada; `skillPicture` |
| `domain/capability/language.ts` | Las frases (plantillas fijas en español) |
| `storage/capabilityCodec.ts` + `storage/learnStore.ts` | Persistencia |
| `hooks/useCapability.ts` | Estado y guardado |
| `components/develop/*` y `screens/AhoraScreen.tsx` | La interfaz |

## Fuente de verdad y derivados

**Se guarda:**
- la configuración (`CapabilityObjective`, `Skill`);
- la historia (`Attempt`, `Evidence`);
- la posición en el flujo (`flow`, que es navegación).

**Se deriva cada vez y nunca se guarda:** el estado de las dimensiones, los huecos y la próxima prueba. La misma historia produce siempre el mismo resultado (hay un test que lo comprueba).

**La evidencia es inmutable.** Corregir un registro crea otro con `supersedes` y `correctionReason`. El original sigue en la historia, tachado. Las derivaciones leen solo la evidencia efectiva: la que ningún registro posterior sustituye.

## Revisiones de las definiciones (B1.1)

Cambiar la definición no reescribe la historia.

- **Habilidad sin evidencia:** se edita directamente.
- **Habilidad con evidencia:** nunca se edita. El cambio crea un registro nuevo con:
  - el mismo `lineageId`;
  - `revision + 1`;
  - `supersedesSkillId` apuntando a la revisión que sustituye.
- **La revisión anterior queda intacta y es historia:** no se edita ni se vuelve a intentar.
  - Su evidencia sigue ligada a ella.
  - La revisión nueva empieza sin evidencia: nada antiguo demuestra su criterio nuevo.
- **Revisión vigente** de un linaje: la que ningún otro registro sustituye. `activeSkillsOf` solo devuelve revisiones vigentes no archivadas.
- **Objetivo sin evidencia:** se edita directamente.
- **Objetivo con evidencia:** la definición vigente se congela en `previousRevisions` (`{ definición, revision, until }`, solo se añade) y `revision` sube.
  - Cada evidencia guarda el `objectiveRevision` bajo el que se produjo.
  - El objetivo conserva su `id` porque habilidades e intentos apuntan a él: por eso sus definiciones anteriores son instantáneas congeladas y no registros aparte.
- **En la interfaz**, una definición con evidencia se edita aparte y se aplica una sola vez al continuar o guardar: una revisión por cambio, no una por tecla.
- **Una definición revisada debe estar completa.** No se revisa nada con un intento abierto.
- **Añadir o archivar habilidades** después de la evidencia está permitido: no reescribe nada.

## Reglas de objetivos y habilidades

- **Borrador.** Un objetivo nace como `DRAFT` y solo guarda `rawIntent`. Nada se rellena a partir del texto.
- **Activación (`ACTIVE`).** Exige:
  - la plantilla completa (cada parte con ≥ 3 caracteres);
  - una acción observable;
  - un resultado distinto de la acción;
  - entre 3 y 7 habilidades válidas, sin duplicados;
  - que haya menos de 3 objetivos `ACTIVE`. Los `DRAFT`, `PAUSED` y `ARCHIVED` no cuentan.
- **Acción no observable.** Tras quitar «quiero / poder / ser capaz de…», una acción que empieza por *aprender, estudiar, saber, entender, comprender, conocer, dominar* o *repasar* no es observable. Es una lista cerrada y conservadora.
- **Duplicados.** Una habilidad está duplicada cuando acción, resultado, contexto, criterio y autonomía coinciden, normalizados (sin mayúsculas, acentos ni puntuación).
- **Estados de un objetivo.** No existe `COMPLETED` y nadie puede marcar el logro a mano. `ACTIVE → PAUSED` y `* → ARCHIVED`. No se pausa con un intento en curso.
- **Definiciones.** Con evidencia, cambiar una definición crea una revisión (ver arriba). Un objetivo `ACTIVE` no puede bajar de 3 habilidades.
- **Intentos.** Solo sobre objetivos `ACTIVE`, y uno a la vez. Un intento en curso se puede descartar y no deja nada; uno registrado no se puede descartar.
- **Registro.** Para confirmar hacen falta qué ocurrió, el veredicto, la ayuda y la relación de contexto. Confirmar crea una evidencia, sea cual sea el veredicto.

## Fuerza de la evidencia (`strength.ts`), derivada (B1.1)

La fuerza se calcula sobre **un solo registro**: un registro es un intento. La acumulación de intentos pertenece al reducer y nunca cambia, retroactivamente, la fuerza de otro registro.

| Fuerza | Cuándo |
|---|---|
| **DÉBIL** | Registrada después (`RETROSPECTIVE`), o sin prueba, contexto o resultado |
| **MODERADA** | Intento directo (`LIVE`) completo y `SELF_REPORTED`. Es el máximo de un autoinforme |
| **FUERTE** | Reservada para una procedencia futura realmente verificable o independiente (`INDEPENDENT_PROVENANCES`, vacía en B1) |
| **MUY FUERTE** | Reservada para un estándar todavía superior |

B1 solo puede producir DÉBIL y MODERADA, y es lo correcto. Un enlace adjunto no cambia la fuerza: puede ser irrelevante o inaccesible, puede no demostrar el criterio, y lo añadió la misma persona. Se guarda como referencia, sin verificar.

## Reducer de dimensiones (`dimensions.ts`, B1.1)

**Estados:**

| Estado | Significado |
|---|---|
| `UNKNOWN` | No hay evidencia aplicable |
| `NOT_YET` | Hay evidencia aplicable y todavía no cumple |
| `SUPPORTED` | Una señal directa, todavía insuficiente |
| `DEMONSTRATED` | Repetida y coherente |
| `MIXED` | Hay evidencia material a favor y en contra |

**Solo cuenta la evidencia de la revisión vigente.** Dentro de ella, nada caduca:
- ninguna regla depende del tiempo transcurrido entre intentos (no hay regla de 8 h);
- una contradicción no deja de contar porque haya más éxitos después (no hay ventana de 3 ocasiones).

B2 podrá introducir una política explícita de recencia o condiciones.

**Regla común (`judge`):**
1. Ninguna evidencia → `UNKNOWN`.
2. Ningún `MET` → `NOT_YET`.
3. Algún `MET` y algún `PARTIAL` o `NOT_MET` → `MIXED`, sin promediar.
4. Todo `MET` en ≥ 2 intentos directos independientes → `DEMONSTRATED`. Independiente quiere decir intentos distintos: una corrección sustituye su registro, no cuenta como otro intento.
5. En otro caso → `SUPPORTED`.

La evidencia `RETROSPECTIVE` no entra en ninguna dimensión. La evidencia directa incompleta puede contradecir, pero nunca demostrar.

**Por dimensión:**
- **Ejecución.** Un `MET` → `SUPPORTED`; dos o más `MET` independientes sin nada en contra → `DEMONSTRATED`. No hace falta separarlos en el tiempo.
- **Autonomía.** Solo cuentan los intentos con la ayuda objetivo o menos. Un éxito con más ayuda nunca la promociona; si toda la evidencia usó más ayuda → `UNKNOWN` (`ONLY_MORE_HELP`).
- **Transferencia.**
  - `SAME` no informa.
  - `VARIED` o `NOVEL` pueden dar `SUPPORTED`.
  - `DEMONSTRATED` exige éxitos directos coherentes en más de un contexto distinto (contextos distintos tal como están escritos, normalizados), con al menos uno `NOVEL`.
- **Consistencia.** B1 no tiene el concepto de «ocasión», que llegará con Session en B2. Por eso:
  - un solo éxito → `UNKNOWN`;
  - varios éxitos → `SUPPORTED` como máximo (`NO_OCCASIONS_IN_B1`);
  - éxito y fallo → `MIXED`;
  - solo fallos → `NOT_YET`.
  - **B1 nunca produce `DEMONSTRATED` en consistencia.**
- **Comprensión.** Siempre `UNKNOWN` en B1. La explicación se guarda sin verificar.

## Huecos (`gaps.ts`), derivados

Cada hueco tiene `id` estable, `skillId`, `dimension`, `reason`, `statement`, `evidenceRefs` y `status`. `status` siempre es `OPEN`: un hueco que se cierra simplemente deja de derivarse.

Orden (el primero es el **hueco actual**):
1. `NO_ATTEMPT`: no hay evidencia. `NO_DIRECT_ATTEMPT`: solo hay un registro hecho después.
2. `CONTRADICTION`: alguna dimensión está `MIXED`.
3. `CRITERION_NOT_MET`: la ejecución está `NOT_YET`.
4. `AUTONOMY_BELOW_TARGET`: se cumplió el criterio, pero con más ayuda que el objetivo, o falló al nivel objetivo.
5. `TRANSFER_UNKNOWN` y `CONSISTENCY_UNKNOWN`. Si la ejecución está `DEMONSTRATED`, primero transferencia; si no, primero consistencia.

La comprensión no abre hueco en B1: nada puede cerrarlo todavía. Aparece en «lo que todavía no sabemos».

## Próxima prueba (`nextTest.ts`), derivada

Cada prueba registra `skillId`, `gapId`, `statement`, `reason`, `targetDimension`, `targetContext`, `maxAssistance`, `successCriterion` (siempre el criterio de la habilidad) y `evidenceRefs`. No lleva hora mínima (B1.1).

| Regla | Situación | Prueba | Contexto | Ayuda máxima |
|---|---|---|---|---|
| A | Sin intento directo | `BASE`, «antes de estudiar» | `SAME` | la autonomía objetivo |
| B | Criterio no cumplido | `FOCUS_CRITERION`, centrada en el criterio | `SAME` | la ayuda del último intento |
| C | Cumplido con más ayuda que el objetivo | `LESS_HELP` | `SAME` | un paso menos de ayuda, sin pasar del objetivo |
| D | Ejecución demostrada, transferencia desconocida | `TRANSFER` | `VARIED` (`NOVEL` si ya funcionó uno variado) | la autonomía objetivo |
| E | Un éxito, sin consistencia demostrable en B1 | `REPEAT`: «Repítelo en otra ocasión» | `SAME` | la ayuda del éxito. Sin hora mínima inventada: qué es una ocasión lo define B2 |
| F | Evidencia contradictoria | `RESOLVE`, reproduce el contexto y la ayuda del último intento que fue en contra | el de ese intento | la de ese intento |

Si no hay ningún hueco abierto en ejecución, autonomía, transferencia y consistencia, no hay próxima prueba en B1. La pantalla lo dice tal cual.

## Intentos retrospectivos (B1.1)

«Ya lo intenté antes» nunca recibe una fecha que la persona no dio.

- `recordedAt` es el momento en que se registró, y siempre se conoce.
- `occurredAt` es el momento exacto del intento. Solo se conoce en un intento `LIVE`; en uno `RETROSPECTIVE` es `null`, que significa «momento desconocido».
- La persona puede dar un día aproximado (`occurredOn`, YYYY-MM-DD, local). Tiene que ser un día real y no posterior a hoy. Si no lo da, queda «fecha desconocida».
- La evidencia retrospectiva sigue siendo DÉBIL y no entra en las dimensiones.

## Persistencia y migración

- **Ubicación.** Un tercer slot del mismo espacio de nombres versionado: `elyum:learn:v1:capability`, y `elyum:learn:v1:sim:capability` en simulación.
- **Compatibilidad con la Fase A.** `state` y `entry` no cambian en nada. Una instalación de la Fase A lee el slot nuevo como vacío y no necesita migración.
- **Formato.** El sobre de siempre, `{ v: 1, data: { schema: 2, objectives, skills, attempts, evidence, flow } }`, escrito entero en un solo `setItem`.
- **Schema 1 → 2 (B1.1).** Schema 1 (B1, nunca publicado) se lee con valores por defecto explícitos y se escribe como 2 en el siguiente guardado:
  - todo es la revisión 1 de sí mismo;
  - toda evidencia se produjo bajo la revisión 1 del objetivo;
  - el momento inventado de un registro retrospectivo se descarta (pasa a `null`).
- **Lectura:**
  - ilegible → copia única a `…capability:backup` y la sesión empieza vacía;
  - versión o schema más nuevos → no se leen ni se sobrescriben;
  - schema 1 o 2 → cada registro se valida por separado y el inválido se aparta. En schema 2 se aparta, por ejemplo, un retrospectivo con momento exacto o un directo sin él.
- **Intención heredada.** Una intención `develop` guardada antes de B1 se entrega, una sola vez, a un borrador con su texto.

## Interfaz

En AHORA, elegir DESARROLLAR (por su sugerencia o por el `TEMPORARY_ROUTING_FALLBACK`) abre el flujo:

> ¿Qué quieres poder hacer? → Hazlo observable → ¿De qué habilidades depende? → ¿Cuál quieres comprobar primero? → Antes de estudiar, prueba → Cuando termines, cuéntalo → Lo que sabemos / Lo que todavía no sabemos / Hueco actual / Próxima prueba

- **ORIENTARME y EXPLORAR** mantienen el comportamiento de la Fase A.
- **Sin progreso visible:** no hay porcentajes, barras, radar ni puntuaciones.
- **Al volver:** las capacidades empezadas aparecen bajo el campo, con su estado en palabras.

## Fuera de B1

- Motor de sesiones (B2).
- Niveles FUNCIONAL / COMPETENTE / DOMINIO y su inferencia: B2 los definirá a partir de la evidencia estructurada de B1.
- EXPLORAR, MAPA, MODELOS, conocimiento, contextos, ORIENTARME.
- Voz, backend, IA y evaluación de explicaciones.
