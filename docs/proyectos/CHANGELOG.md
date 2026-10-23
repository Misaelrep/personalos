# PROYECTOS · registro de cambios

Desarrollo aislado de PROYECTOS y de su red de seguridad.

- **Tronco:** `feature/proyectos`, nacido de `main` `dfc42a4`.
- **Un paquete por rama:** `proyectos/p2-copias`, `proyectos/p1-dominio`.

Reglas:
- Nada de esto se fusiona a `main` ni se despliega a producción sin aprobación.
- Las ramas de APRENDER (`feature/aprender-*`) no se tocan.
- Ningún dato real (dossiers, backlogs) entra en el repositorio, que es público.

Cada paquete se valida con:

```
npm test && npm run build
node scripts/check-scope.mjs <p1|p2>   # falla si el paquete toca algo fuera de su alcance aprobado
```

## P2 · Copias de seguridad — `proyectos/p2-copias`

**Responsable:** Claude Code (implementación). **Aprobación y pruebas físicas:** Misael.

**Alcance aprobado:**
- Exportar e importar todo ELYUM: CORE, APRENDER y PROYECTOS.
- Formato versionado, integridad SHA-256 y vista previa.
- Restauración selectiva por módulo.
- Conflictos sin sobrescritura silenciosa.
- Copia externa obligatoria antes de importar.
- Vuelta atrás si algo falla.
- Errores de almacenamiento visibles.
- Ubicación: SISTEMA → Copias de seguridad.

| Archivo | Cambio |
|---|---|
| `src/features/backup/domain/*` | Formato `elyum.backup` v1, JSON canónico, SHA-256, recogida por módulo, lectura y verificación, vista previa, escritura verificada con vuelta atrás |
| `src/features/backup/storage/*` | `StorageLike` inyectable, errores tipados (`quota`, `unavailable`, `mismatch`), prueba de salud, memoria de SISTEMA (`elyum:system:v1:*`) |
| `src/features/backup/ui/*` | Pantalla Copias, entrega del archivo (compartir o descargar), aviso global de almacenamiento y de restauración |
| `src/features/system/Sistema.tsx` | Sección SISTEMA |
| `src/features/backup/backup.test.ts` | Tests |
| `src/layout/sections.ts` | **Core aprobado (E4):** `sistema` disponible |
| `src/App.tsx` | **Core aprobado (E4/E8):** montar SISTEMA y el aviso; `?section=sistema` |
| `src/pwa/moment.ts` | **Core aprobado:** no ofrecer actualización durante una importación (`systemBusy`) |
| `README.md` | Sección «Copias de seguridad (SISTEMA)» |

**No toca:**
- La rutina.
- El estado del día ni su reducer.
- HOY, FOCUS, SEMANA, DAYSCAPE.
- La entrada.
- APRENDER.
- Service worker y manifest.

### P2 · revisión 2 — riesgos de concurrencia (23/10/2026)

**Pedido en la revisión:** evitar sobrescrituras desde otras pestañas con estado obsoleto, y que la importación no sobrescriba datos que cambiaron después de la vista previa. Sin rediseñar el núcleo.

| Archivo | Cambio |
|---|---|
| `src/features/backup/storage/restore.ts` | Nuevo: marcador de restauración entre pestañas (`elyum:system:v1:restore`), regla de la guarda (`guardAction`), importaciones simultáneas (`restoreInProgressElsewhere`) |
| `src/features/backup/domain/apply.ts` | Comprobación previa (`changedSincePreview`): si algo cambió desde la vista previa, no se escribe nada. Comprobación posterior (`overwrittenAfterImport`). `sameStored` ignora solo `lastActiveAt` de la entrada |
| `src/features/backup/domain/plan.ts` | `carrySelection`: conserva las elecciones en la vista previa actualizada |
| `src/features/backup/ui/Copias.tsx` | Anunciar → esperar 400 ms → reverificar → escribir → cerrar el anuncio. Vista previa actualizada con lo que cambió, nueva copia externa obligatoria; aviso si otra pestaña restaura |
| `src/features/backup/ui/SystemNotice.tsx` | `RestoreGuard`: velo que bloquea toques y teclas en las demás pestañas y recarga al terminar. Aviso persistente de «Restauración incompleta» |
| `src/features/backup/ui/health.ts` | El aviso de restauración lleva las claves sobrescritas |
| `src/App.tsx` | Montar `<RestoreGuard />` (1 línea + import) |
| `src/features/backup/tabs.test.ts` | 15 tests: el riesgo sin guarda (control), bloqueo y recarga, pestaña en segundo plano, pestaña abierta en mitad de la restauración (y liberada si esta se abandona), varias pestañas, restauración abandonada, marcador antiguo, importaciones simultáneas, sobrescritura detectada, vista previa obsoleta (no escribe nada), conflicto elegido con valor nuevo, latido de la entrada, elecciones conservadas |
| `docs/proyectos/pruebas/dos-pestanas.cjs` | Prueba en navegador real con dos pestañas y eventos `storage` reales: 9/9 comprobaciones correctas |
| `README.md` | Explicación de ambos mecanismos |

**Núcleo:** sin cambios fuera de lo ya aprobado (`App.tsx`).

**Tests:** 325 (280 + 45).

## P1 · Modelo de PROYECTOS — `proyectos/p1-dominio`

Ver su sección cuando se añada en esa rama.
