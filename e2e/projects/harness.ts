/*
 * P3 · Test harness: drives the real store, import and export in a real
 * browser. It is NOT the PROYECTOS screen (that is P4). Synthetic data only.
 */
import * as ops from '../../src/features/projects/domain/ops'
import { readinessOf } from '../../src/features/projects/domain/derive'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME } from '../../src/features/projects/import/fixtures'
import type { ImportDecisions } from '../../src/features/projects/import/plan'
import { exportProjects, verifyExport } from '../../src/features/projects/store/export'
import { ProjectsSession, type PreviewedImport } from '../../src/features/projects/store/session'
import { browserStore } from '../../src/features/projects/store/store'

const $ = (id: string) => document.getElementById(id)!
const writer = `tab-${Math.random().toString(36).slice(2, 8)}`
const now = () => new Date().toISOString()
const store = browserStore(writer, now)
const session = new ProjectsSession(store, now)
let preview: PreviewedImport | undefined
let decisions: ImportDecisions = { target: { create: { name: 'Huerto de prueba' } }, statusClasses: { Pendiente: 'pendiente', 'No iniciado': 'pendiente' } }

function showError(message: string | undefined) {
  $('error').textContent = message ?? ''
  $('error').classList.toggle('on', !!message)
}

function render() {
  const s = session.state
  $('mode').textContent = `modo: ${store.mode}${store.readOnlyReason ? ` — ${store.readOnlyReason}` : ''}`
  if (!s) return
  if (s.status !== 'listo') {
    $('status').textContent = `estado: ${s.status} (${s.reason})`
    ;($('file') as HTMLInputElement).disabled = true
    return
  }
  $('status').textContent = `estado: listo · generación ${s.generation} · proyectos ${s.data.projects.length} · tareas ${s.data.tasks.length}`
  ;($('file') as HTMLInputElement).disabled = !s.writable
}

async function previewFile(name: string, bytes: Uint8Array) {
  const s = session.state
  if (s?.status === 'listo' && s.data.projects[0]) decisions = { target: { projectId: s.data.projects[0].id } }
  const r = await session.previewImport({ name, bytes }, decisions)
  if (!r.ok) return showError(r.error)
  preview = r.preview
  const p = preview.plan
  showError(p.ok ? undefined : p.errors.join(' · '))
  $('counts').textContent = `nuevas ${p.counts.new} · iguales ${p.counts.unchanged} · cambiadas ${p.counts.changed} · conflictos ${p.counts.conflicts} · ya no están ${p.counts.missing}${p.sameFile ? ' · archivo ya importado' : ''}`
  $('literals').innerHTML = ''
  for (const l of p.newStatusLiterals) {
    const li = document.createElement('li')
    li.textContent = `${l.literal} → ${l.workClass} (${l.tasks.join(', ')})`
    $('literals').append(li)
  }
  $('items').innerHTML = ''
  for (const i of p.items) {
    const tr = document.createElement('tr')
    tr.className = i.kind
    tr.dataset.id = i.sourceId
    tr.innerHTML = `<td>${i.sourceId}</td><td>${i.kind}</td><td></td>`
    tr.lastElementChild!.textContent = i.changes.map((c) => `${c.field}: ${JSON.stringify(c.current)} → ${JSON.stringify(c.incoming)}`).join('; ')
    $('items').append(tr)
  }
  ;($('confirm') as HTMLButtonElement).disabled = !p.ok
  $('preview').hidden = false
}

$('file').addEventListener('change', async () => {
  const f = ($('file') as HTMLInputElement).files?.[0]
  if (f) await previewFile(f.name, new Uint8Array(await f.arrayBuffer()))
})
$('cancel').addEventListener('click', () => {
  preview = undefined
  $('preview').hidden = true
  ;($('file') as HTMLInputElement).value = ''
})
$('confirm').addEventListener('click', async () => {
  if (!preview) return
  const r = await session.confirmImport(preview)
  showError(r.ok ? undefined : `${r.reason}: ${r.message}`)
  if (r.ok) {
    preview = undefined
    $('preview').hidden = true
  }
  render()
})
$('export').addEventListener('click', async () => {
  const { text } = await exportProjects(window.localStorage, now())
  const v = await verifyExport(text)
  $('exported').textContent = v.ok ? 'copia verificada' : `copia NO verificada: ${v.problems.join('; ')}`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = `elyum-proyectos-${now().slice(0, 10)}.json`
  a.click()
})
window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('elyum:projects:')) $('status').textContent += ' · otra pestaña guardó cambios'
})

// For the browser tests.
Object.assign(window, {
  p3: {
    session,
    store,
    ops,
    readinessOf,
    verifyExport,
    synthetic: { name: SYNTHETIC_DOSSIER_NAME, text: SYNTHETIC_DOSSIER },
    reopen: async () => {
      await session.open()
      render()
    },
    render,
    showError,
  },
})

await session.open()
render()
document.body.dataset.ready = '1'
