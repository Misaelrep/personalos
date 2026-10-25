# APRENDER — estado y decisiones congeladas

Documento de continuidad. Léelo antes de trabajar en APRENDER: lo que aquí figura como cerrado o congelado **no se reabre** salvo regresión demostrable (un defecto medible frente a lo aprobado), y nunca por preferencia estética.

## Estado

| Fase | Estado | Dónde |
|---|---|---|
| **APRENDER FASE A** (esqueleto) | **CERRADA** | `main`, merge `8420da7` |
| **APRENDER FASE A.1 ATMÓSFERAS** | **CERRADA** | `main`, merge `8420da7` |
| FASE B · DESARROLLAR / CAPABILITY ENGINE | **B1 Capability Foundation implementada, en revisión** (B2 no iniciada) | rama `feature/aprender-capability-engine`, desde `main` `62be277`; reglas en [`fase-b/B1-CAPABILITY-FOUNDATION.md`](fase-b/B1-CAPABILITY-FOUNDATION.md) |

**Fase A** incluye:
- la sección APRENDER y su entrada con ritual;
- el campo *¿Qué tienes en mente?* y sus sugerencias;
- AHORA · MAPA · MODELOS;
- la persistencia propia `elyum:learn:v1:*`;
- los tipos de dominio, solo declarados.

**Fase A.1** incluye:
- las atmósferas DÍA · ATARDECER · NOCHE por hora local;
- el cruce de polaridad;
- ATARDECER · APARICIÓN.

Ver `README.md` (sección APRENDER) y `atardecer/PROCEDENCIA.md`.

## Hitos

| Commit | Qué fija |
|---|---|
| `f817394` | Cierre de ATARDECER: assets definitivos, precarga, geometría física, timing 7,25 s. Checkpoint conservado en `feature/aprender-atardecer-cierre` |
| `713124a` | Ondas continuas a velocidad constante y timing extendido (+3 s) |
| `0218cf8` | P3 PRISMA AZUL. Su Preview superó la QA física en iPhone |
| `8420da7` | Merge en `main` (`--no-ff`, sin reescribir historia). Producción desplegada por Vercel desde este commit |

## Decisiones congeladas

**Día y Noche** permanecen sin cambios. Usan el ritual clásico.

**Atardecer definitivo** = ondas continuas + P3. Detalle en `atardecer/PROCEDENCIA.md`.

- **Ondas continuas.** Cada frente crece a una velocidad constante: radio = velocidad × edad, sin pausas, aceleraciones ni saltos.
  - Varios frentes coexisten.
  - Nacen en 0,85 · 1,60 · 2,32 · 3,10 s.
  - Solo cambia su aspecto con la edad.
  - La información reacciona al paso real de cada frente.
  - La convergencia empieza a 3,3 s y se solapa con la última onda.
- **Timing extendido.** Contacto pleno 0,82 s · propagación 0,85–3,85 s · convergencia desde 3,3 s · APRENDER ≈4,8 s · frase 5,3 s · escena fuera 10,25 s. La salida FRASE → AHORA conserva sus intervalos.
- **Color de APRENDER: P3 PRISMA AZUL.**
  - Base `#CCD8E6`; tonos perla `#EAEDF4`, cian `#B6E6F0` y violeta `#D6CCEC`.
  - Halo `rgba(196,222,248,0.55)`.
  - Contraste mínimo medido ≥ 9,16:1.
  - Referencia histórica anterior: naranja `#FF7452`.
- **sunset-ahora v2** con presencia horneada del 20 %.
- **Geometría:** 6 placas / 8 bordes, 0 bordes ficticios. Los k aprobados no se tocan.
- **Assets congelados.** A1, A2, B, C1, C2 y sunset-ahora v2 son byte-idénticos a sus SHA-256 (`atardecer/SHA256SUMS.txt`). El test `atardecer.test.ts` lo vigila.
- **B (el dedo):** entra en `BEATS.contact` = 0,2 s, sale de 0,9 a 1,3 s y se traslada como máximo 5,19 px. No se modifica.
- **Movimiento reducido:** sin ondas ni desplazamiento radial. Contacto → cambio óptico suave → convergencia por fundido → APRENDER.
- **Fallback aceptado:** el ritual clásico se usa si la escena no carga a tiempo, o en DÍA y NOCHE. En ATARDECER muestra APRENDER en P3 uniforme (el color base, sin variación por punto). No es un defecto.

## Deuda técnica registrada (posponible; no bloquea)

- El **worker procedural** no se usa en runtime y sigue en el bundle: `textures.worker.ts` y las texturas de vidrio, profundidad y mano de `pixels.ts`. Se retirará en una limpieza aparte.
- **`layout.json`:** refactor posponible. Hoy la geometría vive en `optics.ts` (`PLATES_A`, `SLABS`) y `geometry.ts` (`assetFrame`, `B_ON_A`).

## Reglas para el siguiente trabajo

- La Fase B parte de la arquitectura conceptual ya aprobada, que se entregará como paquete de trabajo. No se diseña una metodología de aprendizaje nueva.
- El CORE no se modifica ni reestructura sin justificarlo y obtener aprobación: DAILY ENTRY, HOY, FOCUS, SEMANA, DAYSCAPE, Routine Master y persistencia.
- Nada de merge a `main` ni despliegues sin autorización. La QA física en iPhone la hace el responsable del producto.
- Los dossiers, backlogs y datos personales no se incorporan al repositorio público ni a los despliegues de prueba.
