# APRENDER · Fase B1 — Capability Foundation

Estado: **implementada en `feature/aprender-capability-engine`, pendiente de revisión**. No está en `main`.

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
| `domain/capability/model.ts` | Tipos, enumeraciones y constantes (límites, `SEPARATE_OCCASION_MS` = 8 h, `RECENT_OCCASIONS` = 3) |
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
- **Bloqueo.** Desde la primera evidencia, el objetivo y su descomposición quedan fijos. Un objetivo `ACTIVE` no puede bajar de 3 habilidades.
- **Intentos.** Solo sobre objetivos `ACTIVE`, y uno a la vez. Un intento en curso se puede descartar y no deja nada; uno registrado no se puede descartar.
- **Registro.** Para confirmar hacen falta qué ocurrió, el veredicto, la ayuda y la relación de contexto. Confirmar crea una evidencia, sea cual sea el veredicto.

## Fuerza de la evidencia (`strength.ts`), derivada

| Fuerza | Cuándo |
|---|---|
| **DÉBIL** | Registrada después (`RETROSPECTIVE`), o sin prueba, contexto o resultado |
| **MODERADA** | Intento directo (`LIVE`) con resultado, veredicto, ayuda y contexto |
| **FUERTE** | Moderada y, además, un enlace http(s) que un tercero pueda abrir, o corroborada por otro intento directo con el mismo veredicto en otra ocasión (≥ 8 h) |
| **MUY FUERTE** | Requiere una procedencia independiente. B1 no tiene ninguna, así que no puede producirla, y eso es deliberado |

## Reducer de dimensiones (`dimensions.ts`)

**Estados:**

| Estado | Significado |
|---|---|
| `UNKNOWN` | No hay evidencia aplicable |
| `NOT_YET` | Hay evidencia y ninguna cumple todavía |
| `SUPPORTED` | Una señal directa, todavía insuficiente |
| `DEMONSTRATED` | Repetida en ocasiones separadas y coherente |
| `MIXED` | Hay evidencia material a favor y en contra |

**Regla común (`judge`)**, sobre la evidencia aplicable, ordenada en el tiempo:
1. Ninguna → `UNKNOWN`.
2. Ningún `MET` → `NOT_YET`.
3. Desde el primer `MET` solo cuentan las 3 ocasiones más recientes. Una ocasión nueva empieza ≥ 8 h después de la anterior. Los fallos anteriores al primer éxito son el camino, no una contradicción.
4. Entre esas ocasiones, algún `PARTIAL` o `NOT_MET` → `MIXED`. No se promedia.
5. Todo `MET` y ≥ 2 ocasiones con evidencia directa → `DEMONSTRATED`.
6. En otro caso → `SUPPORTED`.

La evidencia `RETROSPECTIVE` no entra en ninguna dimensión: es un indicio débil y se muestra como tal. La evidencia directa incompleta puede contradecir, pero nunca demostrar.

**Por dimensión:**
- **Ejecución.** `judge` sobre toda la evidencia directa (el veredicto).
- **Autonomía.** Solo cuentan los intentos con ayuda ≤ la autonomía objetivo de la habilidad. Un éxito `GUIDED` nunca demuestra `SUPPORTED` ni `AUTONOMOUS`. Si toda la evidencia usó más ayuda → `UNKNOWN` (`ONLY_MORE_HELP`).
- **Transferencia.** Solo cuentan los contextos `VARIED` o `NOVEL`; `SAME` nunca. Para `DEMONSTRATED` hace falta además un éxito `NOVEL`.
- **Consistencia.** Se juzga sobre ocasiones de evidencia directa:
  - menos de 2 ocasiones → `UNKNOWN`;
  - 2 ocasiones con éxito → `SUPPORTED`;
  - 3 → `DEMONSTRATED`;
  - un fallo reciente → `MIXED`.
  - Muchos éxitos en una misma sesión cuentan como una sola ocasión.
- **Comprensión.** Siempre `UNKNOWN` en B1. La explicación se guarda y se marca como no verificada (`EXPLANATION_UNVERIFIED`). No hay evaluación semántica.

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

Cada prueba registra `skillId`, `gapId`, `statement`, `reason`, `targetDimension`, `targetContext`, `maxAssistance`, `successCriterion` (siempre el criterio de la habilidad) y, si procede, `notBefore` y `evidenceRefs`.

| Regla | Situación | Prueba | Contexto | Ayuda máxima |
|---|---|---|---|---|
| A | Sin intento directo | `BASE`, «antes de estudiar» | `SAME` | la autonomía objetivo |
| B | Criterio no cumplido | `FOCUS_CRITERION`, centrada en el criterio | `SAME` | la ayuda del último intento |
| C | Cumplido con más ayuda que el objetivo | `LESS_HELP` | `SAME` | un paso menos de ayuda, sin pasar del objetivo |
| D | Ejecución demostrada, transferencia desconocida | `TRANSFER` | `VARIED` (`NOVEL` si ya funcionó uno variado) | la autonomía objetivo |
| E | Un solo éxito | `REPEAT` | `SAME` | la ayuda del éxito; `notBefore` = éxito + 8 h |
| F | Evidencia contradictoria | `RESOLVE`, reproduce el contexto y la ayuda del último intento que fue en contra | el de ese intento | la de ese intento |

Si no hay ningún hueco abierto en ejecución, autonomía, transferencia y consistencia, no hay próxima prueba en B1. La pantalla lo dice tal cual.

## Persistencia y migración

- **Ubicación.** Un tercer slot del mismo espacio de nombres versionado: `elyum:learn:v1:capability`, y `elyum:learn:v1:sim:capability` en simulación.
- **Compatibilidad con la Fase A.** `state` y `entry` no cambian en nada. Una instalación de la Fase A lee el slot nuevo como vacío y no necesita migración.
- **Formato.** El sobre de siempre, `{ v: 1, data: { schema: 1, objectives, skills, attempts, evidence, flow } }`, escrito entero en un solo `setItem`: la escritura es atómica dentro de lo que permite localStorage.
- **Lectura:**
  - vacío → nada;
  - ilegible o con otra forma → `corrupt`: se copia una vez a `…capability:backup` y la sesión empieza vacía;
  - versión o schema más nuevos → `newer`: no se lee y nunca se escribe encima (tampoco si lo primero que ocurre es un guardado);
  - schema actual → cada registro se valida por separado y el inválido se aparta.
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
