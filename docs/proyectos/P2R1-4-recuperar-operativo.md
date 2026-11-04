# P2-R1.4 · Recuperar dentro de PROYECTOS

Base: `main` = `77656f92ecca08b368712bd92d5009427f46888b`. Respaldo: `respaldo/main-antes-de-recuperar`. Sin merge.

## Qué cambia

- **Recuperar se abre dentro de ELYUM**: desde el menú de PROYECTOS, desde Exportar y desde el aviso de «recuperación sin resolver» (D1).
- **Un solo destino** (`ui/restoreTarget.ts`): el almacenamiento del navegador **sin prefijo** y `navigator.locks`, igual que la sección PROYECTOS (`browserStore`). Datos (`elyum:projects:v1:data`), versiones (`…:prev:1..3`), diario (`…:antes-de-recuperar`) y bloqueos (`elyum:projects:v1`, `…:recuperacion`) salen de ese mismo sitio.
- **Copia de lo actual obligatoria** antes de confirmar cuando hay datos (D2). Solo vale para el texto exacto y la generación que se exportaron: cualquier cambio de los datos la invalida. Cancelar la hoja de compartir no registra nada. Se vuelve a comprobar justo antes de escribir. No hace falta para resolver diarios pendientes o dañados.
- **Copias marcadas de prueba rechazadas** (D3): las del almacén de prueba (`origin: 'prueba-p2r1'`) y las del laboratorio (`syntheticRecoveryLab`). Se rechazan al leer la copia y otra vez al confirmar. «Volver a lo de antes» no pasa por esa regla: se acepta si su texto es exactamente el «antes» del diario de este almacén, comprobado también al confirmar.
- **No se recupera encima de datos ilegibles** (D4): la pantalla lo dice y remite a Exportar.
- **Interrupciones**: como hasta ahora, nada se cierra solo (D5).
- **Refresco**: tras recuperar, revertir o cerrar un diario se vuelve a leer la sesión de PROYECTOS. En la ruta operativa, la pantalla se relee también cuando otra pestaña guarda.
- **Herramientas de prueba** (`ui/RestoreSandboxTools.tsx`): solo en la página de prueba de las vistas previas, ruta `#/recuperar-prueba` (D6). `RestoreView` ya no tiene destino por defecto.
- **Fuera del build de producción** (2º commit): todo lo exclusivo de la página de prueba entra por `ui/testKit.tsx`, que solo importa `ui/main.tsx` (la entrada de `proyectos.html`). Eso incluye las herramientas del almacén de prueba, `sandboxTarget` (`ui/testTargets.ts`), los dossiers sintéticos de Importar y la prueba del iPhone. `ProjectsApp` lo recibe como `test`, y ELYUM no se lo pasa. Resultado: ninguno de los archivos JS de producción lo contiene, ni siquiera como trozo aparte. En desarrollo y en las vistas previas sigue disponible. De paso, `#/prueba-iphone` dentro de ELYUM ya no abre la prueba del iPhone (antes sí la abría). Lo comprueba `e2e/projects/check-build.mjs`.

## Lo que no cambia

`store/restore.ts`, `store/journal.ts`, `store/store.ts`, `store/export.ts` y `store/session.ts` (el motor validado: R13-01, validación de copias, conflictos, bloqueo por diario), el laboratorio (`testing/`), `App.tsx`, `vite.config.ts`, la PWA, HOY/FOCUS/SEMANA/DAYSCAPE/APRENDER.

## Pruebas

- Unitarias nuevas: `src/features/projects/p2r1-4.test.ts`.
- E2E nuevas: `e2e/projects/restore-elyum.mjs` (Recuperar en ELYUM), `e2e/projects/mixed-versions.mjs` (`77656f9` y esta versión abiertas a la vez en el mismo origen) y `e2e/projects/check-build.mjs` (qué contiene cada build).
- Expectativas cambiadas a propósito: `integration.mjs` (ahora Recuperar sí se ofrece dentro de ELYUM), `restore.mjs`, `operational.mjs` y `operational-https.mjs` (el almacén de prueba pasa a `#/recuperar-prueba`).
- Omisiones: las mismas dos que ya existían (`dossier-compat.test.ts`, necesitan el dossier real privado mediante `PROYECTOS_DOSSIER`; no se ejecutan porque no se autoriza usar datos personales). No se añade ninguna.
- Solo se han simulado las interrupciones (diario plantado, bloqueo retenido, fallo de escritura inyectado). No hay prueba de un corte real del proceso ni de almacenamiento físicamente lleno.

## Limitaciones documentadas

- En el iPhone, Safari y la app instalada no comparten almacenamiento. La pantalla dice cuál se usa («en esta app instalada» / «en este navegador»).
- Solo hay un diario: una recuperación nueva sustituye al diario anterior ya cerrado.
- Una pestaña con la versión `77656f9` respeta el diario y bloquea sus guardados, pero su aviso dice todavía «aún no está habilitado».
- En producción quedan solo textos de la pantalla común de Recuperar que nombran el almacén de prueba o el laboratorio (para rechazar sus copias o describir esos destinos). No queda código de las herramientas.
