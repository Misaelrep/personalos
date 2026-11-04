# P2-R1 · Ruta operativa de laboratorio sintético (borrador para revisión)

Preparado por Codex sobre `4fe6671`; integrado en `proyectos/p2r1-integracion` (base `main` = `10cc045`). Sin merge ni despliegue.

Resultado: Chromium 11/11 en cinco ejecuciones y prueba física en iPhone superada (03/11/2026, datos sintéticos).

## Qué cambia

La pantalla Recuperar admite un destino inyectado por un harness de desarrollo. La ruta habitual `proyectos.html#/recuperar` conserva su destino `elyum:prueba-p2r1:*`. La nueva entrada `/e2e/projects/operational.html` no forma parte de las entradas de producción de Vite ni de su precache.

El harness usa **las claves operativas reales de PROYECTOS**, con datos inventados, en un origen desechable. No toca el despliegue ni el almacenamiento personal. Al abrirse inicialmente exige origen vacío; no borra nada para hacerlo cumplir. Solo admite desarrollo en loopback y la página dedicada, con Web Locks.

Crea seis proyectos sintéticos y una marca aleatoria `elyum:lab:p2r1:run`. La marca se conserva dentro del conjunto exportado. La pantalla de este laboratorio solo admite copias de la misma sesión; la marca identifica el experimento, no es una autenticación ni un detector de información personal. No se deben editar archivos para introducir datos personales.

Datos, versiones anteriores, diario, exportación, conflictos y reversión usan `elyum:projects:v1:*`, sin prefijo de sandbox. Solo la marca del laboratorio utiliza otra clave. Un adaptador limita escrituras a las claves del módulo y rechaza conjuntos sin la marca de sesión. No ofrece borrado. Los controles de preparación permanecen exclusivamente en el harness; no se añaden al flujo de producto.

Después de recuperar, el harness recarga una sesión normal de PROYECTOS; en otra pestaña atiende el evento `storage`. No se cambia el algoritmo de recuperación ni el cierre R13-01.

## Recorrido manual (perfil desechable)

1. Preparar una copia de trabajo de esta rama y `npm ci`. No usar el perfil habitual.
2. `npm run dev -- --host 127.0.0.1 --port 4333 --strictPort`.
3. Abrir `http://127.0.0.1:4333/e2e/projects/operational.html` en un perfil nuevo, sin extensiones/PWA/clientes antiguos sobre ese origen.
4. Pulsar Iniciar. Se crean seis proyectos inventados; si el origen contiene datos, se rechaza sin borrar nada. Usar otro puerto/perfil en ese caso.
5. Exportar la copia sintética y comprobar físicamente el archivo. Marcar la confirmación. Simular pérdida.
6. Elegir ese archivo, recuperar solo el proyecto perdido y confirmar. Deben aparecer seis proyectos en la sesión normal y diario completado en las claves operativas.
7. Volver a lo de antes → elegir «todo» → revisar y confirmar. Deben quedar cinco proyectos.
8. Abrir una segunda pestaña de la **misma página y origen**, iniciar/reabrir la misma sesión y hacer un cambio normal mientras la primera mantiene una vista previa. Confirmar la primera: debe rechazar por conflicto sin modificar claves.
9. Recargar y reabrir la página para comprobar persistencia. Las interrupciones y errores de cuota en adaptadores se cubren automáticamente; falta validar cortes y cuota física en navegador.
10. Al terminar, descartar el perfil completo. No abrir la aplicación habitual en ese origen durante el experimento ni usar dossiers o copias personales.

## Comprobaciones

- `npm test` y `npm run build`.
- `node scripts/check-scope.mjs p2r12 4fe6671` (mismo alcance de módulo, docs y e2e).
- `node e2e/projects/operational.mjs`: contextos efímeros Chromium, exportación, rechazo de otra sesión, recuperación, actualización de sesión, reversión, otra pestaña, aislamiento y negativa ante origen poblado.
- Pruebas unitarias `testing/operationalLab.test.ts`: condiciones de entrada, origen existente, claves, copias, recuperación/reversión, conflicto, interrupción/reapertura y R13-01 sobre el destino operativo.

Que las pruebas de memoria o DOM emulado pasen no valida cuota física, Web Locks reales, cierre del proceso, Safari ni PWA. No hay autorización de merge/despliegue ni de uso personal.
