# P2 · Prueba física en el iPhone (Preview, solo datos sintéticos)

**Qué se prueba:** la rama `proyectos/p2-copias` (commit `97a1f9d`). Su Preview de Vercel:

```
https://personalos-git-proyectos-p2-copias-elyum.vercel.app
```

**Datos de prueba:** `docs/proyectos/pruebas/copia-sintetica-v1.json`. Es una copia **sintética**:
- 4 claves de días (21, 22 y 23/10/2026, más la entrada diaria);
- 1 de Aprender;
- 1 de Proyectos;
- huella `7484d68b`.

No contiene ningún dato real. No uses tus datos de ELYUM en esta prueba.

Duración estimada: 15–20 minutos.

---

## 0. Antes de empezar: dos comprobaciones de seguridad

### 0.1 El Preview está protegido

**Esta comprobación no se ha podido hacer desde el entorno de desarrollo**: su red no tiene acceso a `vercel.app`. Hazla tú:

1. En el iPhone, abre Safari en **navegación privada** (sin sesión de Vercel).
2. Visita la URL del Preview.
3. **Correcto:** aparece una pantalla de Vercel que pide iniciar sesión («Log in to Vercel», «Authentication Required» o similar).
4. **Incorrecto:** se abre ELYUM directamente. **Detén la prueba** y avísame: el Preview sería público. No contiene datos privados, pero no debe quedar abierto.

En el escritorio puedes comprobarlo igual: abre la URL en una ventana privada.

### 0.2 Tu ELYUM de producción no se ve afectado (por diseño)

- El Preview vive en **otro origen** (`personalos-git-proyectos-p2-copias-elyum.vercel.app`), distinto del de producción.
- En el navegador, cada origen tiene su propio `localStorage`, su propio service worker y su propia caché. Lo que hagas en el Preview **no puede leer ni escribir** los datos de producción, ni a la inversa.
- Una app instalada desde el Preview es **otra app** en la pantalla de inicio, con su propio almacenamiento. Desinstalarla solo borra los datos de esa app de prueba.
- Para no confundirlas, al instalar ponle el nombre **«ELYUM Prueba»** (paso 3).
- No abras la app de producción durante la prueba. Así no hay ninguna duda de qué estás tocando.

---

## 1. Guarda la copia sintética en el iPhone

- Guarda el archivo `copia-sintetica-v1.json` en **Archivos** (iCloud Drive o En mi iPhone).
- Te lo envío con esta entrega, y también está en el repositorio, en `docs/proyectos/pruebas/`.

## 2. Safari: cargar los datos sintéticos

1. En Safari normal (no privado), con sesión de Vercel iniciada, abre:
   `https://personalos-git-proyectos-p2-copias-elyum.vercel.app/?entry=none&section=sistema`
2. Debe aparecer **SISTEMA → Copias de seguridad**.
3. En **Importar**, toca **Elegir copia** y selecciona `copia-sintetica-v1.json`.
4. Comprueba la vista previa:
   - **Integridad verificada · huella 7484d68b**
   - Días: 21, 22 y 23/10 nuevos. Si haces la prueba justo el 23/10, ese día puede salir «en conflicto · Aquí: vacío», ya marcado «Usar el de la copia», porque ELYUM crea el día de hoy al abrirse. La **entrada diaria** sale «en conflicto» y se conserva la de este dispositivo: es lo esperado.
   - Aprender: 1 nuevo. Proyectos: 1 nuevo.
5. Toca **Exportar el estado actual** → **Guardar en Archivos**. Es obligatorio antes de importar.
6. Marca **«He guardado esa copia fuera de este dispositivo.»** → **Importar**.
7. Se muestra «Restaurado: N datos escritos y verificados», ELYUM se recarga, y arriba aparece «Copia restaurada · N datos…».

**Comprueba** en SEMANA → abre el **miércoles 21/10** y el **jueves 22/10**: el DAYSCAPE de esos días muestra sus bloques registrados.

## 3. Safari → exportar, y la app instalada → restaurar

1. En Safari: SISTEMA → **Exportar copia** → **Guardar en Archivos**. **Anota la huella** que aparece («Copia exportada · … · huella xxxxxxxx»).
2. Instala el Preview: botón **Compartir** → **Añadir a pantalla de inicio** → nombre **«ELYUM Prueba»**.
3. Abre **ELYUM Prueba** desde la pantalla de inicio.
   - Es posible que Vercel vuelva a pedir sesión: la app instalada tiene sus propias cookies. Inicia sesión dentro de la app.
   - **Si el inicio de sesión no funciona dentro de la app instalada**, salta al **Plan B** (abajo). Es una limitación conocida de las Preview protegidas en iOS, no de P2.
4. En ELYUM Prueba: SISTEMA → **Elegir copia** → la que exportaste en el paso 3.1.
   - Debe decir **Integridad verificada** y la misma huella que anotaste.
   - Días, Aprender y Proyectos aparecen como nuevos. Hoy y la entrada diaria pueden aparecer en conflicto, como antes.
5. **Exportar el estado actual** → Guardar en Archivos → marca la confirmación → **Importar**. ELYUM Prueba se recarga y muestra «Copia restaurada».

## 4. Verificación cruzada: la propia app compara los datos

1. En **ELYUM Prueba**: SISTEMA → **Exportar copia** → Guardar en Archivos.
2. En **Safari**: SISTEMA → **Elegir copia** → la que acabas de exportar desde ELYUM Prueba.
3. **Resultado correcto:** todo aparece como «duplicados (iguales)», con 0 nuevos. Como mucho puede quedar en conflicto la **Entrada diaria**, porque cada app actualiza su hora de última actividad al abrirse, y el día de hoy, si lo tocaste en una de las dos. Así se demuestra que la app instalada tiene exactamente los mismos datos que Safari.
4. Toca **Cancelar**: no hace falta importar.

## 5. Opcional · rechazo de una copia alterada (mejor en el escritorio)

1. Abre un `.json` exportado con un editor de texto, cambia una sola letra de un objetivo y guárdalo.
2. Impórtalo en el Preview. Debe aparecer «No se importó nada · La integridad de … no coincide» y no cambia nada.

## 6. Limpieza

- Mantén pulsado **ELYUM Prueba** → Eliminar app. Se borran sus datos.
- En Safari: Ajustes → Apps → Safari → Avanzado → **Datos de sitios web** → busca `vercel.app` → elimina `personalos-git-proyectos-p2-copias-elyum.vercel.app`.
- Puedes borrar de Archivos las copias de prueba.

---

## Plan B: si la app instalada no puede pasar la protección de Vercel

**Usa navegación privada de Safari como segundo almacenamiento.** Está separada de la normal.
1. Repite el paso 3.4–3.5 en una pestaña privada (con sesión de Vercel) en lugar de en la app instalada.
2. Haz la verificación cruzada (paso 4) entre Safari normal y la pestaña privada.

**Lo que el Plan B no cubre:** la entrega por la hoja de compartir dentro de una app instalada. Eso se probará al instalar desde producción, tras el merge, y antes de usar P2 con datos importantes.

---

## Qué me devuelves

| # | Comprobación | Resultado (✓ / ✗ / nota) |
|---|---|---|
| 0.1 | La ventana privada pide sesión de Vercel | |
| 2.4 | Huella 7484d68b e integridad verificada | |
| 2.7 | Restauración en Safari y aviso tras recargar | |
| 2.7 | SEMANA → 21 y 22/10 con sus bloques | |
| 3.1 | Exportar en Safari: hoja de compartir → Archivos | |
| 3.3 | La app instalada abre (o se usa el Plan B) | |
| 3.4 | Misma huella al elegir la copia en la app | |
| 3.5 | Restauración en la app instalada | |
| 4.3 | Verificación cruzada: todo duplicado (salvo entrada / hoy) | |
| 5 | Copia alterada rechazada (opcional) | |

Las capturas de cualquier ✗ me ayudan.
