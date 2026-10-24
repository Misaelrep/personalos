# P2-E · Handoff de auditoría independiente (Codex)

**Para:** Codex, como auditor independiente.
**De:** Claude Code, autor de P2-E.
**Aprueba:** Misael.

## Reglas de la auditoría

- **No modificar código.** Nada de commits, pushes ni PR en ninguna rama.
- Para probar una hipótesis con código, usa una copia local desechable y descríbelo en el informe. **No lo subas.**
- **No usar datos reales.** Solo los sintéticos del repositorio o los que generes.
- **No tocar** `main`, `feature/aprender-*`, Vercel ni producción.

## Qué se audita

| | |
|---|---|
| Repositorio | `Misaelrep/personalos` (público) |
| Rama | `proyectos/p2e-exportar` |
| Commit | el indicado en el mensaje de entrega (el último de la rama) |
| Base | `main` en `dfc42a4` |
| Diff | `git diff main...proyectos/p2e-exportar` |
| Diseño | [`P2E-exportacion.md`](P2E-exportacion.md) |

P2-E es un paquete **nuevo y más pequeño** que P2 (`e7233a7`, NO APTO). **Solo exporta y verifica.** No contiene código de importación ni de restauración. Los hallazgos H01–H06 y H09 de tu auditoría anterior no aplican, porque su código no existe en esta rama. Comprueba que, efectivamente, no existe.

## Cómo ejecutarlo

```
git fetch origin proyectos/p2e-exportar && git checkout origin/proyectos/p2e-exportar
npm ci
npm test                         # esperado: 312 OK (280 del núcleo + 32 de P2-E)
npx tsc -b
npm run build
node scripts/check-scope.mjs p2e
npm run test:e2e                 # esperado: 13 OK, 3 omitidas (controles y capturas)
E2E_SABOTAJE=1 npx playwright test -g "control negativo"   # esperado: 2 FALLAN, salida 1
npm run preview                  # http://localhost:4173/?entry=none&section=sistema
```

Las e2e usan `@playwright/test` 1.63.0 con el Chromium correspondiente (`npx playwright install chromium` si no lo tienes).

## Afirmaciones que pido verificar, y cómo romperlas

Para cada una: ¿es cierta? ¿hay un caso que la rompa? ¿qué severidad tiene?

### 1. P2-E no escribe en ningún almacenamiento

- **Afirmación:** ni al abrir SISTEMA, ni al exportar, ni al verificar, P2-E llama a `setItem`, `removeItem` o `clear`, ni escribe en `sessionStorage`, IndexedDB, Cache Storage o cookies.
- **Pruebas que lo sostienen:**
  - el tipo `ReadableStorage` no tiene métodos de escritura;
  - escaneo de las fuentes (`backup.test.ts` y `check-scope.mjs`);
  - e2e que interceptan **todas** las escrituras de la página y exigen cero, más el almacenamiento idéntico byte a byte.
- **Cómo intentar romperla:** busca rutas indirectas: un `as unknown as Storage`, una librería, efectos de React. Busca también escrituras que el registro no vea (por ejemplo, `Storage.prototype` sustituido después de la instalación del registro).
- **Ojo:** el núcleo **sí** escribe (el día de hoy al montarse y el latido cada 30 s). Eso es de `main`, no de P2-E. Las e2e fijan el reloj para separarlo.

### 2. La copia es exactamente lo guardado en el momento del toque

- **Afirmación:** lectura, firma, autoverificación y entrega ocurren en una sola tarea síncrona (`onExport` en `Copias.tsx` hasta `navigator.share`).
- **Pregunta abierta:** ¿puede **otra pestaña** escribir en `localStorage` **en mitad** del bucle de lectura de `readSnapshot`? La especificación ya no exige el *storage mutex*.
  - Si puede, la copia mezclaría claves de antes y de después de esa escritura.
  - Cada valor seguiría siendo uno realmente guardado. El núcleo no tiene invariantes entre claves: cada día es independiente.
  - APRENDER guarda su estado en una sola clave.
  - Evalúa el riesgo real en Chrome y en Safari.

### 3. Formato v2 e integridad

- **Afirmación:** el total cubre **todo** el archivo salvo el propio total (`coveredByTotal` en `integrity.ts`), y cualquier alteración se rechaza.
- **Revisa:**
  - `canonicalJson`: orden de claves por unidades UTF-16, `undefined`, números (solo hay enteros), `__proto__`, cadenas con sustitutos sueltos;
  - que dos archivos distintos no puedan tener el mismo canónico;
  - que no haya ningún campo fuera del hash.
- **`strictJson.ts`:** gramática RFC 8259, claves duplicadas (también si solo difieren por escapes: `"a"` y `"a"`), profundidad máxima 64, BOM. ¿Algún texto que `JSON.parse` lea distinto de lo que este analizador valida?
- **`verify.ts`:** forma exacta, clave fuera de su módulo, clave en dos módulos, conteos, estados por clave. ¿Algún archivo malformado o malicioso que pase?

### 4. SHA-256 propio (`sha256.ts`)

- **Motivo:** Web Crypto es asíncrono, y la copia tiene que hacerse dentro del toque (ver el diseño).
- **Pruebas actuales:**
  - vectores FIPS, incluido el millón de «a»;
  - todas las longitudes de 0 a 200 bytes contra Node;
  - datos aleatorios de hasta 1 MB;
  - texto UTF-8.
- **Revisa:** el relleno con longitudes grandes, el desbordamiento de enteros, y el rendimiento con 5–25 MB en un iPhone.

### 5. Estado por clave (`keyStatus.ts`)

- ¿`valido` coincide con lo que `loadDay`, `migrateDay` y `DayState` consumen sin fallar? ¿Hay algún día marcado `valido` que deje la app en blanco (como `objective: 123` en H07)?
- Recuerda que el estado **no decide** qué se copia: todo se copia.

### 6. Cobertura de datos (`collect.ts`)

- ¿Todas las claves que escriben `main` y la rama de APRENDER entran en un módulo?
- ¿Se excluyen las de simulación, las de sistema y las ajenas?
- Las desconocidas de ELYUM se nombran: ¿es suficiente, o deberían copiarse?

### 7. Entrega en iOS y errores

- ¿`shareFile` llama a `navigator.share` dentro de la activación del usuario en todos los caminos?
- ¿El mapeo `AbortError` → cancelado, `NotAllowedError` → bloqueado y el resto → fallo es correcto en Safari iOS 17 y 18?
- ¿Puede algún mensaje afirmar que la copia está guardada cuando no lo está?

### 8. Límites y textos

- ¿El recuadro de límites dice la verdad y no promete de más?
- En particular: cambios no guardados (L5, sin X2), días dañados (H07 sin X1 ni X5), autoría (L7) y restauración no disponible.

### 9. Calidad de las pruebas e2e

- ¿Fallan cuando deben? Los dos controles negativos lo demuestran para un archivo alterado y para una escritura inesperada.
- ¿Hay alguna afirmación de este documento que **no** tenga una prueba que falle si deja de ser cierta?

## Formato del informe que necesito

Un archivo Markdown con:

1. **Resumen:** ¿apto para integrarse? Sí, no, o sí con condiciones.
2. **Hallazgos**, cada uno con:
   - severidad: crítica / alta / media / baja / informativa;
   - área (1–9);
   - archivo y línea;
   - escenario concreto;
   - impacto sobre los datos;
   - recomendación (sin aplicarla).
3. **Verificaciones hechas sin hallazgo.**
4. **Pruebas que añadirías.**

Entrégalo a Misael.
