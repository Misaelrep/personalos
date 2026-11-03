# Laboratorio operativo sintético · acceso temporal desde el iPhone (solo desarrollo)

Integrado en `proyectos/p2r1-integracion` (base `main` = `10cc045`), después del laboratorio de Codex. Sin merge ni despliegue. Usado en la prueba física del 03/11/2026, ya cerrada.

## Qué cambia

- `testing/labHost.ts`: además de loopback, el laboratorio admite **un único** nombre de host, el que recibe el servidor del laboratorio al arrancar, y solo por HTTPS (Web Locks exige contexto seguro). Se rechazan comodines, direcciones IP, puertos, rutas, mayúsculas, el dominio de ELYUM y `*.vercel.app`.
- `testing/operationalLab.ts` usa esa regla. Siguen igual: modo desarrollo, página dedicada, origen vacío, Web Locks y marca de sesión sintética.
- `testing/main.tsx`: la pantalla inicial muestra «Conexión segura · Web Locks · Dirección». El nombre llega solo desde `lab-server.mjs` (`__ELYUM_LAB_HOST__`); en un `npm run dev` normal no existe.
- `e2e/projects/lab-server.mjs`: servidor de desarrollo que escucha **solo en 127.0.0.1**, admite ese nombre y ningún otro (Vite responde 403), sin recarga en vivo ni conexión de actualización. Comprueba el nombre con la misma regla antes de abrir el puerto, y se niega con `NODE_ENV=production` o en Vercel.
- `vite.config.ts` no cambia: el laboratorio no entra en el build.

El acceso HTTPS lo da un túnel que la persona inicia y cierra (por ejemplo, `cloudflared tunnel --url http://127.0.0.1:4333`).

## Pruebas

- `testing/operationalLab.test.ts`: 11 casos nuevos (se abre con HTTPS en el nombre configurado; se rechaza otro nombre, HTTP, sin nombre configurado, fuera de desarrollo, otra página, sin Web Locks, dominio de ELYUM, IP de red local, origen no vacío; solo nombres concretos).
- `e2e/projects/operational-https.mjs` (Chromium): el servidor rechaza nombres no válidos sin abrir puerto. Con un frontal TLS local que reenvía el nombre, como un túnel: contexto seguro y Web Locks, semilla en las claves operativas, sin socket de recarga, otro nombre bloqueado con 403, HTTP rechazado, Recuperar habitual en su almacén de prueba. Después, **todas** las comprobaciones de `operational.mjs` a través de ese nombre.
- `operational.mjs` acepta `LAB_BASE` y `LAB_RESOLVE` para esa ejecución; sin ellas funciona como antes.
