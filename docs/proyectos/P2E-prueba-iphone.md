# P2-E · Prueba física en el iPhone (Preview, solo datos sintéticos)

**Qué se prueba:** la rama `proyectos/p2e-exportar`: exportar una copia y comprobarla desde Archivos, en Safari y en la app instalada. **No hay importación ni restauración**: esta prueba no puede escribir en ELYUM.

**Preview de Vercel:**

```
https://personalos-git-proyectos-p2e-exportar-elyum.vercel.app
```

La URL sigue el patrón de los Previews anteriores. Si no abre, cópiala del panel de Vercel (Deployments → rama `proyectos/p2e-exportar`).

**Datos:** solo sintéticos. Los generas tú en el Preview (paso 2) y usas dos archivos de ejemplo de `docs/proyectos/evidencias/2026-10-24-p2e/`:

| Archivo | Para qué |
|---|---|
| `copia-sintetica-v2.json` | Copia válida hecha en otro «dispositivo» (el test automático) |
| `copia-sintetica-v2-alterada.json` | La misma copia con un valor cambiado: debe rechazarse |

No uses tus datos de ELYUM ni abras la app de producción durante la prueba.

Duración estimada: 15 minutos.

---

## 0. Seguridad, antes de empezar

### 0.1 El Preview está protegido

1. En el iPhone, abre Safari en **navegación privada**.
2. Visita la URL del Preview.
3. **Correcto:** Vercel pide iniciar sesión.
4. **Incorrecto:** ELYUM se abre directamente. **Detén la prueba** y avísame.

### 0.2 Producción no se ve afectada

- El Preview es **otro origen**, con su propio almacenamiento, su propio service worker y su propia caché. No puede leer ni escribir los datos de producción.
- La app instalada desde el Preview es **otra app**. Ponle el nombre **«ELYUM Prueba»**.

## 1. Guarda los dos archivos de ejemplo en Archivos

Te los envío con esta entrega. Guárdalos en **Archivos** (iCloud Drive o En mi iPhone).

## 2. Safari: datos sintéticos

1. En Safari normal, con la sesión de Vercel iniciada, abre la URL del Preview.
2. Completa la entrada si aparece. En **HOY**, marca **un bloque** como completado. Si el bloque admite objetivo, escribe «PRUEBA SINTÉTICA».
3. Abre **SISTEMA** en la navegación.

## 3. Safari: exportar

1. En **Copias de seguridad**, comprueba:
   - el recuadro **«Lo que la copia es, y lo que no»**, con la línea **«Restaurar todavía no está disponible»**;
   - la línea **«En este dispositivo: Días · HOY, FOCUS y entrada: N · Aprender: 0 · Proyectos: 0»**.
2. Toca **Exportar copia**.
   - **Esperado:** se abre el menú de compartir **al primer toque**.
   - Si en su lugar aparece «El sistema no abrió el menú de compartir», anótalo: es justo lo que esta versión quiere evitar.
3. Elige **Guardar en Archivos** y guárdala.
4. Anota la **huella** del mensaje «Copia entregada… Huella xxxxxxxx».

## 4. Safari: comprobar la copia guardada

1. En **Comprobar una copia guardada**, toca **Elegir un archivo** y elige la copia que acabas de guardar.
2. **Esperado:**
   - **«Copia íntegra · huella xxxxxxxx»**, la misma que anotaste;
   - fecha y hora de ahora;
   - «iPhone · navegador»;
   - **«Frente a este dispositivo: N iguales · 0 distintas · 0 solo en el archivo · 0 solo aquí»**. Si pasaron más de 30 segundos, la **Entrada diaria** puede salir como «distinta», con la nota que lo explica. Es normal: guarda la hora de actividad.
   - «Solo se ha verificado: no se ha restaurado ni escrito nada.»

## 5. Safari: cancelar no es guardar

1. Toca **Exportar copia** y **cierra** el menú de compartir sin guardar.
2. **Esperado:** «No se guardó ninguna copia: cerraste el menú de compartir.»

## 6. Safari: una copia alterada se rechaza

1. Elige `copia-sintetica-v2-alterada.json`.
2. **Esperado:** «No es una copia válida», con el motivo «El contenido de «Días · HOY, FOCUS y entrada» no coincide con su huella», y «No se ha escrito nada».

## 7. Safari: una copia de otro dispositivo se verifica sin tocar nada

1. Elige `copia-sintetica-v2.json`.
2. **Esperado:**
   - **«Copia íntegra · huella 9c87af33»**, del **21/10/2026, 10:30** · «Windows · navegador»;
   - «Claves: 4 válidas · 1 ilegible · 2 sin validar»; el día 18/10 está ilegible a propósito;
   - una comparación con diferencias, porque es otro «dispositivo».
3. Vuelve a **HOY**. **Esperado:** tu bloque sigue marcado como en el paso 2. No se ha importado nada.

## 8. App instalada

1. En Safari, en el Preview: **Compartir → Añadir a pantalla de inicio**, con el nombre **«ELYUM Prueba»**.
2. Ábrela desde la pantalla de inicio.
   - Su almacenamiento es **distinto** del de Safari: el bloque del paso 2 **no** debe aparecer.
   - Marca uno nuevo.
3. Ve a **SISTEMA** y repite los pasos 3 y 4: exportar → Guardar en Archivos → comprobar.
   - **Esperado:** el menú de compartir se abre **al primer toque**;
   - la copia sale «iPhone · app instalada»;
   - «0 distintas» (o solo la Entrada diaria).
4. **Sin conexión (opcional):** activa el modo avión, abre «ELYUM Prueba», exporta y comprueba. Debe funcionar igual.

## 9. Al terminar

- Borra «ELYUM Prueba» de la pantalla de inicio (borra su almacenamiento de prueba).
- Borra de Archivos las copias de prueba si quieres.

## Qué me envías

| Paso | Resultado (OK / falla + qué viste) |
|---|---|
| 0.1 Preview protegido | |
| 3 El menú de compartir se abre al primer toque (Safari) | |
| 4 Copia íntegra, misma huella, 0 distintas | |
| 5 Cancelar → «No se guardó» | |
| 6 Alterada rechazada | |
| 7 Otra copia verificada; HOY intacto | |
| 8 App instalada: primer toque, «app instalada», íntegra | |
| 8.4 Sin conexión (opcional) | |

Si algo falla, una captura de pantalla con **solo datos sintéticos** me basta.
