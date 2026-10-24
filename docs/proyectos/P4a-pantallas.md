# P4a · Pantallas de PROYECTOS — `proyectos/p4a-pantallas`

**Autorizado:** 24/10/2026. Parte de `proyectos/p3-almacen`. Todo es de solo lectura salvo IMPORTAR, que escribe únicamente tras confirmar. **Fuera de la navegación de la app** hasta P4c: no se tocan `App.tsx`, `sections.ts`, HOY, FOCUS, SEMANA ni APRENDER.

Validación:

```
npm test && npm run build && node scripts/check-scope.mjs p4a && node e2e/projects/run.mjs && node e2e/projects/screens.mjs
```

## Página de prueba

`proyectos.html` monta `src/features/projects/ui/main.tsx`. Las pantallas van por hash para que atrás y recargar conserven el sitio:

| Ruta | Pantalla |
|---|---|
| `#/` | PROYECTOS: todos los proyectos, tareas por estado |
| `#/proyecto/<id>` | PROYECTO: objetivo, siguientes acciones, bloqueos, hitos, tareas, origen |
| `#/tarea/<id>` | TAREA: ejecutada / verificada / aprobada por separado, requisitos, responsable, delegación, trabajo, evidencias, procedencia |
| `#/importar` | IMPORTAR: archivo o dossier sintético, destino, palabras nuevas, vista previa, conflictos, confirmar o cancelar |
| `#/exportar` | EXPORTAR: generar y verificar, guardar (hoja de compartir en el iPhone), verificar una copia guardada |
| `#/prueba-iphone` | Prueba de Web Locks con datos sintéticos en claves propias (`elyum:prueba-p4a:*`) |

- En dev, Vite sirve `/proyectos.html` sin cambiar nada. Para que **el build** (y la Preview de Vercel) la incluya hace falta la segunda entrada en `vite.config.ts`, pendiente de aprobación.
- El build mete el manifiesto de la app (`start_url: /`) en cada HTML. La página lo quita al arrancar para que, añadida a la pantalla de inicio, se abra ella misma y no ELYUM. **Sin probar en un iPhone.**

## Reglas de las pantallas

- Estado de una tarea (`ui/view.ts`): cerrada → espera aprobación → sin clasificar → bloqueada → por verificar → lista. Todo se deriva; nada se guarda.
- Nada se inventa en pantalla: prioridad, responsable, candidatos y siguiente acción muestran «Sin asignar», «Ninguno decidido» o «Sin escribir».
- Una condición sin comprobar se muestra «por verificar» con el texto del dossier; nunca cuenta como cumplida.
- Importar: los estados nuevos empiezan como «sin decidir». Destino sugerido: el proyecto que ya usa el archivo o que ya tiene esos IDs, y se explica por qué. Si se elige «proyecto nuevo» con un nombre existente, se avisa; los IDs repetidos impiden importar.
- Si otra pestaña guarda, la página relee y lo dice; una vista previa abierta se recalcula. Si el guardado choca igualmente, se rechaza y se avisa.
- Sin Web Locks: banda «Solo lectura»; se puede consultar, previsualizar y exportar, pero no confirmar.
- Datos ilegibles: se avisa, no se importa nada encima y se puede exportar tal cual.

## Pruebas

- `p4a.test.ts`: 16 pruebas unitarias (estados, separación ejecutada/verificada/aprobada, candidatas, fuentes, reimportación v2, pestaña desactualizada, duplicado, prueba de Web Locks con y sin bloqueo, persistencia, borrado limitado a sus claves).
- `e2e/projects/screens.mjs`: 33 comprobaciones en Chromium a 390 px, con capturas. **Chromium no es Safari:** no prueba el iPhone.

## Límites antes de P4b

- Web Locks, persistencia e instalación en iPhone: **sin verificar** hasta la prueba física.
- Safari y la app instalada tienen almacenamientos separados: los datos de uno no aparecen en el otro.
- Sin edición: un conflicto solo puede aparecer si otra pestaña cambió datos (en las pruebas, con código).
- Los títulos se muestran literales (`\|`, `*paso*`), como los guarda P3.
- Con dos entradas, el build reparte el código común de la app en un chunk compartido. La app funciona igual, pero sus archivos cambian de nombre y de reparto.
