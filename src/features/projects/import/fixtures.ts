/**
 * SYNTHETIC dossier for tests and demos. Same LAYOUT as a real dossier
 * (named Markdown tables); every word of content is invented. Never put a
 * real dossier here: the repository is public.
 */
export const SYNTHETIC_DOSSIER_NAME = 'DOSSIER_SINTETICO_HUERTO_2026-10-20.md'

export const SYNTHETIC_DOSSIER = `# DOSSIER OPERATIVO — HUERTO DE PRUEBA

**Fecha de elaboración:** 20 de octubre de 2026.
**Finalidad:** comprobar el importador con un proyecto inventado.

## 1. Fuentes

| Clave | Fuente | Evidencia específica |
|---|---|---|
| F1 | \`manual_inventado.md\` | Reglas de riego |
| F2 | Conversación ficticia | Decisiones de siembra |

Regla del proyecto: máximo **dos parcelas activas**.

## 3. Estado de las parcelas

| Parcela | Riego | Aprob. | Pendiente |
|---|---|---|---|
| Parcela norte | Instalado | **Sí, usuario** | Revisar goteo |
| Parcela sur | No | No | Todo |

## 8. Backlog

| ID | Área | Tarea concreta | Estado | Entregable | Dependencia | Tiempo humano | Agente posible | Hecho cuando… | Fuente |
|---|---|---|---|---|---|---|---|---|---|
| HUE-01 | Riego | Comprobar la llave de *paso* | Pendiente | Foto de la llave | Acceso al jardín | 20–35 min | IA sugiere; humano revisa | La llave abre y cierra | F1 §2; F2 |
| HUE-02 | Riego | Cambiar el goteo | Pendiente | Goteo nuevo | HUE-01 | 25–45 min | Claude Code | No hay fugas | F1 |
| HUE-03 | Siembra | Elegir semillas | Borrador existente | Lista de semillas | HUE-02 o semillas del vecino | 10–20 min | IA compara | Lista cerrada | F2 |
| HUE-04 | Siembra | Sembrar según parcela | No consta | Parcelas sembradas | HUE-01..03 según parcela | 30–60 min sesión | Operador humano | Brotes visibles | F2 |
| HUE-05 | Registro | Anotar el riego \\| diario | No iniciado | Hoja de riego | HUE-02,03 | 15–25 min/sem | IA agrega | Cada día tiene dato | F1; F9 |
| HUE-06 | Registro | Medir la cosecha | Pendiente | Tabla de pesos | HUE-04 + báscula | 1 h | — | Pesos con fecha | F2 |
`
