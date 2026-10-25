# APRENDER · ATARDECER — procedencia y decisiones congeladas

Este documento conserva en el repositorio lo necesario para no reconstruir nada de memoria: qué assets son master y cuáles runtime, de dónde salió cada uno, cómo se codificaron, la geometría y el timing aprobados.

- **Huellas SHA-256:** [`SHA256SUMS.txt`](SHA256SUMS.txt).
- **Masters binarios:** se conservan fuera del repositorio, en el paquete de recuperación (Parte 1, Parte 2, `guides-v2`, `a2-candidatos`). Sus huellas están en ese mismo archivo.

**Estado:** preintegración cerrada e integración real en `feature/aprender-atardecer-cierre`, desde `c069e2e`. Pendiente: Preview y prueba en un iPhone real antes de cualquier merge a `main`.

## Masters y runtime

| Capa | Master congelado (fuente) | Runtime en `public/learn/sunset/` | Codificación del runtime |
|---|---|---|---|
| **A1**, vidrio claro | `A1_v4_master.png`, 880×1904 RGBA opaco, 2 545 403 B | `sunset-surface-light@2x.webp`, 228 154 B | Pillow 12.3 / libwebp 1.6.0: `quality=92, method=6, exact=True, alpha_quality=100` |
| **A2**, vidrio profundo (A2-A) | `A2_master_A2-A.png`, 880×1904, derivado píxel a píxel de A1 (`make-a2.cjs`) | `sunset-surface-deep@2x.webp`, 212 580 B | Codificador WebP de Chromium: canvas `toBlob('image/webp', 0.92)` (reproducido byte a byte con Chromium de Playwright 1.63) |
| **B**, dedo (R2) | `B0_v3_master.png` (1448×1086) → `B_final_R2_master.png` (1024×768 RGBA, alfa recta) | `sunset-touch@2x.webp`, 60 934 B | Pillow/libwebp: `quality=90, method=6, exact=True, alpha_quality=100`; alfa idéntico al PNG |
| **C1**, fugas cálidas v2 | `C1v2_master.png`, 440×952 RGBA (y su fuente 880×1904) | `sunset-prism-edge.webp`, 15 028 B | Pillow/libwebp: `quality=86, method=6, exact=True, alpha_quality=100` |
| **C2**, halos fríos v2 | `C2v2_master.png`, 440×952 RGBA (y su fuente 880×1904) | `sunset-prism-ghost.webp`, 36 210 B | Pillow/libwebp: `quality=86, method=6, exact=True, alpha_quality=100` |
| **sunset-ahora v2**, vidrio de AHORA | `sunset-ahora_v2.png`, 440×952 RGBA, **MASTER DEFINITIVO** | `sunset-ahora.webp`, 14 266 B | Pillow/libwebp: `quality=86, method=6, exact=True, alpha_quality=100` |

Todas las codificaciones del runtime se han reproducido byte a byte desde su master con el codificador indicado.

**A1:** el PNG `A1_v4_master.png` sigue siendo el master fuente congelado. El WebP q92 es solo el asset operativo.

| | Valor |
|---|---|
| Diferencia frente al PNG (ΔE_OK×100) | media 0,44 · p99 1,42 · máximo 3,80 |
| p99 a 390 px (DPR 3) | 1,31 |
| p99 a 320 px (DPR 2) | 1,20 |
| Bordes | los 8, en la misma columna |
| Banding | sin banding nuevo |
| Calidez de F | sin cambio |
| Peso | −91 % |

## Procedencia

- **A1 v4.** Vidrio claro, la fuente geométrica de verdad de las placas (`guides-v2`).
- **A2-A, «profunda luminosa».** `out(x,y) = F(A1(x,y), y) + grano`. Cada píxel depende solo del mismo píxel de A1 y de su fila: sin filtros espaciales ni desplazamiento.
  - Tono en OKLab.
  - Banda y 650–1255 con limitador suave de luminancia.
  - Zona húmeda desde y 1330.
- **B.** `B0_v3` → R2 en una sola transformación: escala 0,562, giro −0,1°, ancla `B0 (1305,142)` → `B (880,120)`.
  - Refracción R2 por franjas: A −5 · B −18 · C 0 · hueco C–D −18 · D 0.
  - Registro sobre A: `x_A = x_B − 314`, `y_A = y_B + 452`.
  - Silueta con IoU 0,921; yema invariante.
- **C1 v2, «orgánica controlada».** Bandas verticales con dos lóbulos y deriva ≤ ±5 px.
  - α ≤ min(0,85, `C1_control_allowed`).
  - α = 0 en el wordmark, la frase y el contacto (r70).
  - En la banda, solo x ≥ 413 (α máx. 0,094).
- **C2 v2, «profundidad controlada».** Corredores de ±22 px (en C) sobre los bordes medidos (`params-C2v2.json`, `C2_control_allowed`).
- **sunset-ahora v2.** Receta [`make-ahora.cjs`](make-ahora.cjs) con [`sunset-ahora_v2.params.json`](sunset-ahora_v2.params.json): la de la v1 con `presence: 0.2`.
  - Pasos: A1 v4 → 440×952 en luz lineal; desenfoque anisótropo (σx 1,6; σy 7 → 12 en la zona húmeda desde y 665); croma ×0,45; L hacia perla `#EEF2F8` en un 0,45; traza de C1 al 6 %.
  - Presencia horneada: **20 %** (alfa 0,200–0,239).
  - Comprobación: la misma receta con `presence: 0.15` reproduce byte a byte `sunset-ahora_v1.png` (`00ff6d5f…`).
  - **Congelado: no se ajustan presencia, color, geometría, derivación ni transición.**

## Geometría final (fuente operativa: el código, `guides-v2` y los tests)

| | |
|---|---|
| Lienzo A | 880×1904, trim 780×1688 en (50,108); C = A/2 (440×952) |
| Encaje en pantalla | `s = max(w/780, h/1688)`; el contacto del asset (566,572) va sobre el punto de contacto vivo, con recorte al sangrado (`geometry.ts: assetFrame`). A 390×844: s 0,5, x −25, y −54. A 320×568: s 0,4103, x −21,8, y −140,7 |
| **6 placas** (px de A) | A 0–130 · B 130–267 · C 267–339 · D 484–638,5 · E 681,5–725 · F 768,5–880 (cálida). A y F llegan al borde del lienzo; B y C empiezan donde acaba la anterior |
| **8 bordes físicos** | 130 · 267 · 339 · 484 · 638,5 · 681,5 · 725 · 768,5. Un borde compartido cuenta una vez; **0 bordes ficticios** |
| k (refracción del renderer) | `k = signo · salto / (0,03 · (0,6 + 0,4·w/0,1) · 780)` con saltos de diseño A 20 · B 28 · C 28 · D 28 · E 25 · F 23 px |
| B\|C | Con los k aprobados el desplazamiento es igual a ambos lados: **no hay salto de refracción visible**. Aceptado: el hilo de luz permanece. A\|B salta 8 px; los bordes vidrio/aire, 23–28 px |
| Registro medido | Hilos frente al borde del asset ≤ 0,62 px. B frente a A1: deriva 0,000 px (390) y 0,014 px (320) |

`layout.json` no existe por decisión: la geometría vive en `optics.ts` (`PLATES_A`, `SLABS`) y `geometry.ts` (`assetFrame`, `B_ON_A`). Puede ser un refactor futuro si hace falta.

## Timing aprobado (reloj de la escena; t = 0 cuando arranca, tras la precarga)

| Momento | Valor |
|---|---|
| Arranque del reloj | Solo cuando A1, A2, B, C1 y C2 están **decodificados** (`assets.ts`). Pasado 2,5 s o ante un error, ritual clásico sin escena |
| **B** | Entra en `BEATS.contact` = 0,20 s (reloj + 200 ms exactos), en 0,5 s; sale de 0,9 a 1,3 s. Traslación máxima 5,19 px (−5, 1,4). **Congelado** |
| A1 → A2 | A2 desde 0,7 s, durante 0,9 s. A1 opaco debajo, con filtro `saturate(1.8) brightness(0.92)` de 0,75 a 1,45 s. Bloom del contacto apagado a ≈1,45 s |
| Frase | 2,3 s. Desfragmentación: 6,0 s |
| Salida FRASE → AHORA | El vidrio profundo se aclara aún opaco (`brightness(2.3)`, 6,05–6,6 s). Después se disuelve sobre sunset-ahora, de 6,45 a **7,25 s (objetivo)** |
| Tolerancia del final | Un fotograma (1/60 s). Medido: opacidad 0 a 7,256 s en 390 y 320 |
| Pregunta | Empieza a 7,0 s con residuo de escena (≈21 % a 7,0 s; ≈4 % a 7,14 s). **Aprobado.** En el primer instante, con la pregunta a opacidad casi nula, el peor píxel mide ≈4,1–4,3:1; ya legible, ≥ 5,85:1 |
| Movimiento reducido | Mismos instantes; B solo se funde, sin traslación |

## Contraste de AHORA estable con sunset-ahora v2 (peor caso junto al glifo)

| | 390 | 320 |
|---|---|---|
| Pregunta | 6,43 | 6,33 |
| Campo | 6,74 | 6,74 |
| Sugerencias | 9,66 | 9,83 |
| Pestañas | 6,46 | 6,23 |

## Deuda técnica registrada (posponible)

- El worker de texturas procedurales (`textures.worker.ts`) y las texturas de vidrio, profundidad y mano de `pixels.ts` ya no se usan en runtime, porque las sustituyen los assets. Siguen en el bundle. Se retirarán en una limpieza aparte.
- `layout.json`: aplazado mientras no haya necesidad real.

## Variante ONDAS continuas (rama `feature/aprender-atardecer-ondas`)

Aprobada como candidata para sustituir a `f817394`, pendiente solo de la QA física en iPhone. No toca assets, geometría, k, B ni la salida FRASE → AHORA. `feature/aprender-atardecer-cierre` sigue en `f817394` como checkpoint.

| | Valor |
|---|---|
| Contacto pleno | 0,82 s (`BEATS.touched`) |
| Frentes | Nacen en 0,85 · 1,60 · 2,32 · 3,10 s (huecos 0,75 · 0,72 · 0,78 s). Radio = velocidad × edad, exacto; velocidad = (distancia del contacto a la esquina más lejana) / 2,85 s: 233 px/s a 390, 182 px/s a 320 |
| Forma | Propia de cada frente, fija toda su vida (±≈8 %, `frontShape`); huecos fijos por ángulo (`frontPresence`). Solo cambia su aspecto con la edad: menos intensidad, algo más ancho, menos refracción |
| Placas | Tras cada placa el frente se ve desplazado `4 px × k` (constante en toda la placa): escalón de 3–9 px en cada uno de los 8 bordes; dentro de la placa, la misma velocidad |
| Información | Cada fragmento reacciona cuando el frente, tal como se dibuja, pasa realmente por donde se ve el fragmento: antes, quieto; durante, perturbado; después, un poco más ordenado (≤ ≈0,18 de su camino) |
| Convergencia | Desde 3,3 s, de dentro afuera; estable a 4,5 s; APRENDER formado a ≈4,8 s (wordmark 3,35 s + 0,95 s + 0,5 s). Fin de la propagación: 3,85 s |
| Ritual | `APARICION_PROPAGATION = 3 s`: todo lo posterior al contacto, 3 s más tarde, sin acortar nada. Frase 5,3 s · desfragmentación 9,0 s · pregunta 10,0 s · fin de escena 10,25 s (observado: 10,252 s a 390 y 10,250 s a 320) |
| Movimiento reducido | Sin frentes: contacto → cambio óptico suave (A1 hacia su hielo, 1,1–3,7 s) → los fragmentos se funden desde 3,6 s → A2 y APRENDER |

## Color de APRENDER: P3 PRISMA AZUL (candidato definitivo, sujeto a la QA física)

Elegido entre CONTROL, P1, P2 y P3 con el tablero de comparación. Solo cambia el tratamiento cromático: DotWord, geometría, puntos, tamaño, espaciado, posición y timing no cambian.

| | Valor |
|---|---|
| Intención | Plata azulada / perla, con microvariaciones contenidas de cian y violeta: luz condensada dentro del vidrio. Ni neón ni blanco puro |
| Base (`mark.color`) | `#CCD8E6`; los puntos apagados usan este color |
| Halo (`mark.glow`) | `rgba(196,222,248,0.55)`, 14 px |
| Tonos de los puntos encendidos (`mark.tones`) | `#CCD8E6` 66 % · `#EAEDF4` perla 15 % · `#B6E6F0` cian 11 % · `#D6CCEC` violeta 8 % |
| Reparto | `domain/wordmark.ts: dotTone`, determinista por posición del punto: el mismo punto, siempre el mismo tono |
| Contraste punto / fondo (WCAG, mínimo) | A2 sola: 9,64 (390) y 9,16 (320). Con la frase: 10,49 (390) y 10,56 (320) |

En el DotWord en movimiento (el ritual clásico, sin APARICIÓN), los puntos toman el color base y el halo: DotWord no cambia.

**Referencia histórica, la versión aprobada anterior (`f817394`):** naranja `#FF7452`, halo `rgba(255,96,56,0.85)`, un solo color. Su contraste mínimo era 4,96–5,85:1.
