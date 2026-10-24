#!/usr/bin/env node
// P4a · The PROYECTOS screens in a real browser (Chromium via Playwright, iPhone-sized), synthetic data only.
//   node e2e/projects/screens.mjs                       Vite dev server, /proyectos.html
//   P4A_URL=https://…/proyectos.html node e2e/projects/screens.mjs   against a built page (Preview)
//   P4A_SHOTS=/some/dir                                 where screenshots go (default: a temp dir)
// Checks: empty start, import (preview, decisions, cancel, confirm), overview, project, task,
// re-import with changes and with a conflict, another tab saving, export + verify (and a tampered
// copy), the Web Locks check twice, a browser without Web Locks, and unreadable stored data.
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = await import('playwright'))
}

const PORT = 4328
const DATA_KEY = 'elyum:projects:v1:data'
const SHOTS = process.env.P4A_SHOTS ?? mkdtempSync(join(tmpdir(), 'p4a-shots-'))
mkdirSync(SHOTS, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'p4a-'))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

let server
let URL = process.env.P4A_URL
if (!URL) {
  const { createServer } = await import('vite')
  server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
  await server.listen()
  URL = `http://localhost:${PORT}/proyectos.html`
}
const browser = await chromium.launch()
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true }

async function fresh(init, arg) {
  const context = await browser.newContext(IPHONE)
  if (init) await context.addInitScript(init, arg)
  const open = async (hash = '') => {
    const page = await context.newPage()
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
    await page.goto(URL + hash)
    await page.waitForSelector('[data-testid="build"]')
    return page
  }
  return { context, open }
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: join(SHOTS, name), fullPage })
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), DATA_KEY)
const text = (page, sel) => page.locator(sel).first().innerText()
const go = async (page, hash) => {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.waitForTimeout(150)
}

async function importSynthetic(page, button, classes = {}) {
  await go(page, '#/')
  await go(page, '#/importar')
  await page.getByRole('button', { name: button }).click()
  await page.waitForSelector('[data-testid="preview"]')
  for (const [literal, cls] of Object.entries(classes)) await page.selectOption(`[data-testid="class-${literal}"]`, cls)
  await page.waitForTimeout(150)
}

try {
  // ── 1 · Empty start, import, screens ───────────────────────────────────────
  {
    const { context, open } = await fresh()
    const page = await open()
    check('starts empty and writable', (await text(page, 'h1')) === 'Aún no hay proyectos' && (await page.getAttribute('[data-testid="mode"]', 'data-mode')) === 'escritura')
    check('the page does not link the app manifest (installs as itself)', (await page.locator('link[rel="manifest"]').count()) === 0)

    await importSynthetic(page, 'Huerto v1')
    const counts = await text(page, '[data-testid="counts"]')
    check('preview: 6 new tasks, 2 references', /6\s*Nuevas/.test(counts) && /2\s*Referencias/.test(counts), counts.replace(/\s+/g, ' '))
    check('preview writes nothing', (await stored(page)) === null)
    const unclassified = await page.locator('[data-testid^="class-"]').count()
    check('new status words default to «sin decidir»', unclassified === 4 && (await page.inputValue('[data-testid="class-Pendiente"]')) === 'sin-decidir')
    await page.getByTestId('cancel').click()
    check('cancel: nothing stored, back to choosing a file', (await stored(page)) === null && (await page.locator('[data-testid="preview"]').count()) === 0)

    await importSynthetic(page, 'Huerto v1', { Pendiente: 'pendiente', 'No iniciado': 'pendiente' })
    await shot(page, '04-importar-vista-previa.png')
    await page.getByTestId('confirm').click()
    await page.waitForSelector('[data-testid="import-done"]')
    const env1 = JSON.parse((await stored(page)) ?? 'null')
    check('confirm: saved generation 1 with 6 tasks', env1?.generation === 1 && env1?.data?.tasks?.length === 6)

    await go(page, '#/')
    const card = await text(page, '[data-testid="project-card"]')
    check('overview shows the project with its stages', /huerto de prueba/i.test(card) && /6\/6 abiertas/.test(card) && /Ninguna tarea lista/.test(card), card.replace(/\s+/g, ' '))
    await shot(page, '01-proyectos.png')

    await page.locator('[data-testid="project-card"]').click()
    await page.waitForSelector('[data-testid="stage-strip"]')
    const strip = (await text(page, '[data-testid="stage-strip"]')).replace(/\s+/g, ' ')
    check('project: 0 ready · 1 to verify · 3 blocked · 2 unclassified', /0 Lista/.test(strip) && /1 Por verificar/.test(strip) && /3 Bloqueada/.test(strip) && /2 Sin clasificar/.test(strip), strip)
    const body = await page.locator('body').innerText()
    check('project: blockers in the dossier’s words', body.includes('espera HUE-01') && body.includes('«báscula» por verificar'))
    check('project: no next action invented', body.includes('Ninguna tarea está lista todavía'))
    await shot(page, '02-proyecto.png')

    await page.locator('[data-testid="task-row"]', { hasText: 'HUE-01' }).first().click()
    await page.waitForSelector('[data-testid="track"]')
    const track = (await text(page, '[data-testid="track"]')).replace(/\s+/g, ' ')
    check('task: executed / verified / approved shown apart', /Ejecutada No/i.test(track) && /Verificada Sin dato/i.test(track) && /Aprobada Sin dato/i.test(track), track)
    const tbody = await page.locator('body').innerText()
    check('task: owner, priority and delegation candidates stay unassigned', /Prioridad\s*Sin asignar/.test(tbody) && /Responsable\s*Sin asignar/.test(tbody) && /Ninguno decidido/.test(tbody))
    await page.locator('[data-testid="provenance"] summary').click()
    const prov = await text(page, '[data-testid="provenance"]')
    check('task: provenance with the original row and cited sources', prov.includes('| HUE-01 |') && prov.includes('F1: manual_inventado.md'))
    await shot(page, '03-tarea.png')
    await go(page, '#/tarea/src%3AHUE-05')
    await page.waitForSelector('[data-testid="track"]')
    const h5 = await text(page, 'h1')
    await page.$eval('[data-testid="provenance"]', (d) => (d.open = true))
    check('title shows «|» while the original row keeps «\\|»', h5 === 'Anotar el riego | diario' && (await text(page, '[data-testid="provenance"]')).includes('riego \\| diario'), h5)
    await go(page, '#/tarea/src%3AHUE-03')
    await page.waitForSelector('[data-testid="track"]')
    const t3 = (await text(page, '[data-testid="track"]')).replace(/\s+/g, ' ')
    check('unclassified status: «Ejecutada» says «Sin dato», not «No»', /Ejecutada Sin dato «Borrador existente» sin clasificar/i.test(t3), t3)
    await go(page, '#/tarea/src%3AHUE-01')
    await page.waitForSelector('[data-testid="track"]')
    await page.getByRole('link', { name: 'HUE-02' }).count()
    await page.locator('a', { hasText: /huerto de prueba/i }).first().click()
    await page.waitForTimeout(200)
    check('task → project back link', (await page.locator('[data-testid="stage-strip"]').count()) === 1)

    // ── 2 · Re-import v2 with an ELYUM-side change: conflict ────────────────────
    // Another tab edits HUE-03's status through the real store (the only way in P4a, which has no editing).
    const other = await open()
    await other.evaluate(async () => {
      const { browserStore } = await import('/src/features/projects/store/store.ts')
      const { ProjectsSession } = await import('/src/features/projects/store/session.ts')
      const { setStatus } = await import('/src/features/projects/domain/ops.ts')
      const s = new ProjectsSession(browserStore('otra-pestaña', () => new Date().toISOString()), () => new Date().toISOString())
      await s.open()
      const r = await s.change((d) => setStatus(d, 'src:HUE-03', 'No consta', { now: new Date().toISOString() }))
      if (!r.ok) throw new Error(r.message)
    }).catch((e) => check('other tab edits (dev server only)', false, e.message))
    await page.waitForTimeout(300)
    check('another tab saved: this one re-reads and says so', (await page.locator('body').innerText()).includes('Otra pestaña guardó cambios'))

    await importSynthetic(page, 'Huerto v2')
    check('v2 is offered into the project that holds its IDs', (await page.locator('body').innerText()).includes('parece una versión nueva de su dossier'))
    await page.selectOption('[data-testid="target"]', '')
    await page.waitForTimeout(200)
    const dup = await page.locator('body').innerText()
    check('choosing «new project» instead: duplicate name warned and import refused', dup.includes('Ya existe un proyecto llamado') && dup.includes('ya pertenece a otro proyecto') && (await page.getByTestId('confirm').isDisabled()))
    const projectId = await page.$eval('[data-testid="target"] option:nth-child(2)', (o) => o.value)
    await page.selectOption('[data-testid="target"]', projectId)
    await page.waitForTimeout(200)
    const c2 = (await text(page, '[data-testid="counts"]')).replace(/\s+/g, ' ')
    check('re-import v2: 1 new · 1 changed · 1 conflict · 1 no longer there', /1 Nuevas/.test(c2) && /1 Cambiadas/.test(c2) && /1 Conflictos/.test(c2) && /1 Ya no están/.test(c2), c2)
    check('confirm area is not fixed over the content', (await page.$eval('[data-testid="confirm-area"]', (e) => getComputedStyle(e).position)) === 'static')
    check('conflict defaults to keeping ELYUM', (await page.locator('[data-testid="conflict"] input[type=radio]').first().isChecked()) === true)
    await page.locator('[data-testid="conflict"]').first().scrollIntoViewIfNeeded()
    await shot(page, '05-importar-conflicto.png')
    // The store moves under the open preview: the preview recomputes and still asks before writing.
    const gen = JSON.parse(await stored(page)).generation
    await page.getByTestId('confirm').click()
    await page.waitForSelector('[data-testid="import-done"]')
    const env2 = JSON.parse(await stored(page))
    const hue03 = env2.data.tasks.find((t) => t.sourceId === 'HUE-03')
    const hue06 = env2.data.tasks.find((t) => t.sourceId === 'HUE-06')
    check('confirm v2: ELYUM kept on the conflict, HUE-06 not deleted, HUE-07 added', env2.generation === gen + 1 && hue03.status === 'No consta' && !!hue06 && env2.data.tasks.some((t) => t.sourceId === 'HUE-07'))

    // ── 3 · Stale preview: another tab saves between preview and confirm ────────
    await importSynthetic(page, 'Huerto v2')
    await other.evaluate(async () => {
      const { browserStore } = await import('/src/features/projects/store/store.ts')
      const { ProjectsSession } = await import('/src/features/projects/store/session.ts')
      const { setNextAction } = await import('/src/features/projects/domain/ops.ts')
      const s = new ProjectsSession(browserStore('otra-pestaña', () => new Date().toISOString()), () => new Date().toISOString())
      await s.open()
      await s.change((d) => setNextAction(d, 'src:HUE-01', 'Abrir la llave del jardín', { now: new Date().toISOString() }))
    })
    await page.waitForTimeout(300)
    const before = await stored(page)
    const g3 = JSON.parse(before).generation
    await page.getByTestId('confirm').click()
    await page.waitForSelector('[data-testid="import-done"]')
    const after = JSON.parse(await stored(page))
    check('stale preview is recomputed on the newer data; the other tab’s change survives', after.generation === g3 + 1 && after.data.tasks.find((t) => t.sourceId === 'HUE-01').nextAction === 'Abrir la llave del jardín')
    await other.close()

    // ── 4 · Export and verify ──────────────────────────────────────────────────
    await go(page, '#/exportar')
    await page.getByTestId('export').click()
    await page.waitForSelector('[data-testid="export-result"]')
    const ex = await text(page, '[data-testid="export-result"]')
    check('export: generated and verified at once', ex.includes('Copia verificada') && /7 tareas/.test(ex), ex.split('\n')[0])
    await shot(page, '06-exportar.png')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-export').click()])
    const saved = join(tmp, 'copia.json')
    await download.saveAs(saved)
    await page.setInputFiles('[data-testid="verify-input"]', saved)
    await page.waitForSelector('[data-testid="verify-result"]')
    const vr = await text(page, '[data-testid="verify-result"]')
    check('saved copy verifies and matches what is stored', vr.includes('Copia verificada') && vr.includes('Coincide con lo que hay guardado ahora'))
    const tampered = join(tmp, 'alterada.json')
    writeFileSync(tampered, readFileSync(saved, 'utf8').replace('HUERTO DE PRUEBA', 'HUERTO ALTERADO'))
    await page.setInputFiles('[data-testid="verify-input"]', tampered)
    await page.waitForFunction(() => document.querySelector('[data-testid="verify-result"]')?.textContent?.includes('no es válida'))
    check('a tampered copy is rejected', (await text(page, '[data-testid="verify-result"]')).includes('la huella del texto guardado no coincide'))

    // ── 5 · Web Locks check, twice (persistence) ───────────────────────────────
    const dataBefore = await stored(page)
    await go(page, '#/prueba-iphone')
    await page.getByTestId('run-check').click()
    await page.waitForSelector('[data-testid="check-report"]')
    const r1 = await page.$$eval('[data-testid^="step-"]', (els) => els.map((e) => `${e.dataset.testid.slice(5)}:${e.dataset.result}`))
    check('Web Locks check (Chromium): api, lock, write, conflict, read-only all pass', ['api:ok', 'bloqueo:ok', 'escritura:ok', 'conflicto:ok', 'sin-bloqueo:ok'].every((x) => r1.includes(x)), r1.join(' '))
    await page.reload()
    await page.waitForSelector('[data-testid="build"]')
    await page.getByTestId('run-check').click()
    await page.waitForSelector('[data-testid="check-report"]')
    check('second run after reload: persistence ok', (await page.getAttribute('[data-testid="step-persistencia"]', 'data-result')) === 'ok')
    await shot(page, '07-prueba-iphone.png')
    check('the check never touched the PROYECTOS data', (await stored(page)) === dataBefore)
    await context.close()
  }

  // ── 6 · Browser without Web Locks ────────────────────────────────────────────
  {
    const { context, open } = await fresh(() => {
      delete Navigator.prototype.locks
    })
    const page = await open()
    check('no Web Locks: read-only, said on screen', (await page.getAttribute('[data-testid="mode"]', 'data-mode')) === 'solo-lectura' && (await page.locator('body').innerText()).includes('Solo lectura en este navegador'))
    await importSynthetic(page, 'Huerto v1', { Pendiente: 'pendiente' })
    check('no Web Locks: preview works, confirm disabled, nothing stored', (await page.getByTestId('confirm').isDisabled()) && (await stored(page)) === null)
    await go(page, '#/prueba-iphone')
    await page.getByTestId('run-check').click()
    await page.waitForSelector('[data-testid="check-report"]')
    check(
      'no Web Locks: the check says so and proves read-only',
      (await page.getAttribute('[data-testid="step-api"]', 'data-result')) === 'falla' && (await page.getAttribute('[data-testid="step-sin-bloqueo"]', 'data-result')) === 'ok',
    )
    await shot(page, '08-sin-web-locks.png')
    await context.close()
  }

  // ── 7 · Unreadable stored data ───────────────────────────────────────────────
  {
    const { context, open } = await fresh((k) => localStorage.setItem(k, '{"format":"elyum-projects-store/1","roto":'), DATA_KEY)
    const page = await open()
    const raw = await stored(page)
    check('unreadable data: error shown, nothing overwritten', (await page.locator('body').innerText()).includes('no se pueden leer') && raw === '{"format":"elyum-projects-store/1","roto":')
    await go(page, '#/importar')
    check('unreadable data: import refuses', (await page.locator('body').innerText()).includes('ni se sobrescribirán') && (await page.locator('[data-testid="file-input"]').count()) === 0)
    await context.close()
  }
} catch (e) {
  check('run finished', false, e instanceof Error ? e.stack : String(e))
} finally {
  await browser.close()
  await server?.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones · capturas en ${SHOTS}`)
process.exit(failed.length ? 1 : 0)
