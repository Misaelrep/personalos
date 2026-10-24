# PROYECTOS · Registro de cambios (rama `proyectos/p2e-exportar`)

## 24/10/2026 · P2-E · Exportación y verificación de copias

Base: `main` `dfc42a4`. Paquete independiente de `proyectos/p2-copias` (NO APTO), autorizado solo para exportar y verificar.

- SISTEMA → Copias de seguridad: **Exportar copia** (todo en el mismo toque: lectura, firma, autoverificación y entrega) y **Comprobar una copia guardada** (solo lectura, con comparación frente al dispositivo).
- Formato `elyum.backup` **v2**:
  - huella total sobre todo el archivo, metadatos incluidos;
  - analizador JSON estricto (sin claves duplicadas);
  - estado por clave: `valido` / `no-reconocido` / `ilegible` / `sin-validador`;
  - las claves de ELYUM desconocidas se nombran;
  - límites de 25 MB y 50 000 claves.
- SHA-256 síncrono propio, probado contra Node y los vectores FIPS.
- **Ninguna escritura** en ningún almacenamiento; sin código de importación ni de restauración.
- Recuadro de límites visible antes de exportar.
- `@playwright/test` 1.63.0 (desarrollo): 13 pruebas e2e sobre la app compilada, que registran cada escritura y exigen cero, y 2 controles negativos que deben fallar.
- Núcleo: `App.tsx` y `sections.ts` (SISTEMA, aprobado). `moment.ts` sin cambios.
- Documentación: `P2E-exportacion.md`, `P2E-prueba-iphone.md`, `P2E-auditoria-codex.md` y `X2-alternativas.md`.
