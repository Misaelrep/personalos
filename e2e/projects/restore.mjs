#!/usr/bin/env node
// P2-R1 · Recovering PROYECTOS from an exported copy, in a real browser (Chromium via Playwright, iPhone-sized).
// Synthetic data only, and only into the separate test store (elyum:prueba-p2r1:*).
//   node e2e/projects/restore.mjs
//   P2R1_SHOTS=/some/dir   where screenshots go (default: a temp dir)
// A real recovery: export → lose a project and change another → recover the lost one → check by reading
// storage; undo through the journal; a full recovery of a copy made by Exportar of PROYECTOS itself. And the
// adversarial cases: incompatible and altered files, a tab that wrote after the preview, two recoveries at
// once, a failed write, interruptions found on reopening, and no Web Locks.
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = await import('playwright'))
}

const PORT = 4331
const URL = `http://localhost:${PORT}/proyectos.html`
const DATA_KEY = 'elyum:projects:v1:data'
const PREFIX = 'elyum:prueba-p2r1:'
const SB_DATA = PREFIX + DATA_KEY
const SB_JOURNAL = PREFIX + 'elyum:projects:v1:antes-de-recuperar'
const RESTORE_LOCK = 'elyum:projects:v1:recuperacion'
const SHOTS = process.env.P2R1_SHOTS ?? mkdtempSync(join(tmpdir(), 'p2r1-shots-'))
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true }

async function fresh(init) {
  const context = await browser.newContext(IPHONE)
  if (init) await context.addInitScript(init)
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
const getKey = async (page, k) => page.evaluate((key) => localStorage.getItem(key), k)
const sandbox = async (page) => JSON.parse((await getKey(page, SB_DATA)) ?? 'null')
const journal = async (page) => JSON.parse((await getKey(page, SB_JOURNAL)) ?? 'null')
const notSandbox = (page) => page.evaluate((p) => JSON.stringify(Object.keys(localStorage).filter((k) => !k.startsWith(p)).sort().map((k) => [k, localStorage.getItem(k)])), PREFIX)
const go = async (page, hash) => {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.waitForTimeout(150)
}
async function download(page, testId) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()])
  return readFileSync(await d.path(), 'utf8')
}
async function sandboxAction(page, testId) {
  const before = await page.getByTestId('sandbox-state').innerText()
  await page.getByTestId(testId).click()
  await page.waitForFunction((b) => document.querySelector('[data-testid="sandbox-state"]')?.textContent !== b, before)
}
async function pick(page, name, text) {
  await page.setInputFiles('[data-testid="restore-input"]', { name, mimeType: 'application/json', buffer: Buffer.from(text) })
  await page.waitForSelector('[data-testid="backup-ok"], [data-testid="backup-problem"]')
  await page.waitForTimeout(100)
}
async function recover(page, units, all = false) {
  if (all) await page.getByTestId('restore-all').check()
  for (const u of units) await page.locator(`[data-unit="${u}"] input`).check()
  await page.getByTestId('restore-sure').check()
  await page.getByTestId('restore-confirm').click()
  const r = page.getByTestId('restore-result')
  await r.waitFor()
  return { ok: (await r.getAttribute('data-ok')) === 'true', reason: await r.getAttribute('data-reason'), text: await r.innerText() }
}
async function importSynthetic(page, button) {
  await go(page, '#/')
  await go(page, '#/importar')
  await page.getByRole('button', { name: button }).click()
  await page.waitForSelector('[data-testid="preview"]')
  for (const sel of await page.locator('[data-testid^="class-"]').all()) await sel.selectOption('pendiente')
  await page.waitForTimeout(150)
  await page.getByTestId('confirm').click()
  await page.waitForSelector('[data-testid="import-done"]')
}

try {
  const { context, open } = await fresh()
  const page = await open('#/')

  // ── 0 · PROYECTOS itself, with synthetic data, and its copy from Exportar ──
  await importSynthetic(page, 'Huerto v1')
  await importSynthetic(page, 'Taller')
  await go(page, '#/exportar')
  await page.getByTestId('export').click()
  await page.waitForSelector('[data-testid="export-result"]')
  const mainCopy = await download(page, 'save-export')
  check('Exportar of PROYECTOS gives a copy', JSON.parse(mainCopy).format === 'elyum-projects-export/1')
  const mainBefore = await notSandbox(page)

  // ── 1 · The test store ─────────────────────────────────────────────────────
  await page.getByTestId('go-restore-from-export').click()
  await page.waitForSelector('[data-testid="target-note"]')
  check('the screen says the target is the separate test store', (await page.getByTestId('target-note').innerText()).includes('almacén de prueba separado'))
  check('test store starts empty', (await page.getByTestId('sandbox-state').innerText()).includes('Vacío'))
  await sandboxAction(page, 'sandbox-fill')
  const filled = await sandbox(page)
  check('synthetic data loaded into the test store: six projects', filled?.data.projects.length === 6, `generación ${filled?.generation}`)
  const sandboxCopy = await download(page, 'sandbox-export')
  check('the test store’s copy says where it comes from', JSON.parse(sandboxCopy).origin === 'prueba-p2r1')
  await shot(page, '14-recuperar-almacen.png')

  // ── 2 · Loss and a later change ────────────────────────────────────────────
  const huerto = filled.data.projects[0]
  await sandboxAction(page, 'sandbox-lose')
  await sandboxAction(page, 'sandbox-change')
  const damaged = await sandbox(page)
  check('simulated loss and a later local change', damaged.data.projects.length === 5 && damaged.data.tasks.some((t) => t.title === 'Tarea creada después de la copia'))

  // ── 3 · Preview: nothing chosen, the lost project offered ──────────────────
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  const lost = page.locator(`[data-unit="proyecto:${huerto.id}"]`)
  check('the lost project shows as only in the copy, and can be chosen', (await lost.getAttribute('data-state')) === 'solo-en-copia' && (await lost.getAttribute('data-selectable')) === 'true')
  check('nothing is chosen by default; no confirm yet', (await page.locator('[data-testid="restore-unit"] input:checked').count()) === 0 && (await page.getByTestId('restore-confirm').count()) === 0)
  const weeks = page.locator('[data-unit="semanas"]')
  check('weeks alone are refused (their commitment needs the lost project), with the reason', (await weeks.getAttribute('data-selectable')) === 'false' && (await weeks.innerText()).includes('compromiso con una tarea desconocida'))
  await shot(page, '15-recuperar-vista-previa.png')
  check('preview wrote nothing', (await sandbox(page)).generation === damaged.generation)

  // ── 4 · Recover the lost project ───────────────────────────────────────────
  await lost.locator('input').check()
  await page.getByTestId('restore-sure').waitFor()
  check('confirm stays disabled until the person ticks «he revisado»', await page.getByTestId('restore-confirm').isDisabled())
  await shot(page, '16-recuperar-confirmar.png')
  let r = await recover(page, [])
  const after = await sandbox(page)
  const hTasks = (d) => d.data.tasks.filter((t) => t.projectId === huerto.id)
  check('recovered and read back: the screen says so', r.ok && r.text.includes('comprobado al releerlo'), r.text)
  check('storage: the lost project is back with all its tasks', after.data.projects.length === 6 && JSON.stringify(hTasks(after)) === JSON.stringify(hTasks(filled)))
  check('storage: the later local change is kept', after.data.tasks.some((t) => t.title === 'Tarea creada después de la copia'))
  const j1 = await journal(page)
  check('journal: completed, with the exact text before', j1.state === 'completada' && j1.before !== null && JSON.parse(j1.before).generation === damaged.generation)
  check('PROYECTOS itself and every other key untouched', (await notSandbox(page)) === mainBefore)
  await shot(page, '17-recuperar-hecho.png')

  // ── 5 · Undo through the journal ───────────────────────────────────────────
  await page.getByTestId('journal-undo').click()
  await page.waitForSelector('[data-testid="restore-plan"]')
  r = await recover(page, [], true)
  const undone = await sandbox(page)
  check('undo: back to the state before the recovery, through preview and confirm', r.ok && undone.data.projects.length === 5 && !undone.data.projects.some((p) => p.id === huerto.id))

  // ── 6 · Incompatible and altered files: refused, nothing written ───────────
  const f = JSON.parse(sandboxCopy)
  const bad = [
    ['no JSON', 'esto no es una copia', 'no-es-copia'],
    ['cut short', sandboxCopy.slice(0, 500), 'no-es-copia'],
    ['other app', JSON.stringify({ format: 'personal-os-backup/1' }), 'no-es-copia'],
    ['altered data', JSON.stringify({ ...f, stored: f.stored.replace('Taller de prueba', 'Taller alterado') }), 'alterada'],
    ['newer version', JSON.stringify({ ...f, format: 'elyum-projects-export/2' }), 'version-futura'],
    ['empty copy', JSON.stringify({ ...f, stored: null, storedSha256: null, readable: true, summary: undefined }), 'vacia'],
  ]
  const genBefore = (await sandbox(page)).generation
  for (const [name, text, problem] of bad) {
    await pick(page, `${name}.json`, text)
    const got = await page.getByTestId('backup-problem').getAttribute('data-problem')
    check(`file «${name}»: refused as ${problem}`, got === problem, got ?? '')
    if (name === 'altered data') await shot(page, '18-recuperar-copia-alterada.png')
  }
  check('no refused file wrote anything', (await sandbox(page)).generation === genBefore && (await getKey(page, SB_JOURNAL)) !== null)

  // ── 7 · Another tab writes after the preview ───────────────────────────────
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  const other = await open('#/recuperar')
  await other.waitForSelector('[data-testid="sandbox-state"]')
  await sandboxAction(other, 'sandbox-change')
  const genOther = (await sandbox(page)).generation
  r = await recover(page, [`proyecto:${huerto.id}`])
  check('stale preview: refused as a conflict, nothing written', !r.ok && r.reason === 'conflicto' && (await sandbox(page)).generation === genOther, r.text)
  await shot(page, '19-recuperar-conflicto.png')

  // ── 8 · Two recoveries at once ─────────────────────────────────────────────
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  await other.evaluate((name) => {
    window.__release = undefined
    navigator.locks.request(name, () => new Promise((res) => (window.__release = res)))
  }, RESTORE_LOCK)
  await other.waitForFunction(() => typeof window.__release === 'function')
  r = await recover(page, [`proyecto:${huerto.id}`])
  check('a second recovery while one runs: refused, nothing written', !r.ok && r.reason === 'otra-recuperacion' && (await sandbox(page)).generation === genOther, r.text)
  await other.evaluate(() => window.__release())

  // ── 9 · A write that fails (no space for the journal) ──────────────────────
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  await page.evaluate((jk) => {
    const real = Storage.prototype.setItem
    window.__realSetItem = real
    Storage.prototype.setItem = function (k, v) {
      if (k === jk) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      return real.call(this, k, v)
    }
  }, SB_JOURNAL)
  const jBefore = await getKey(page, SB_JOURNAL)
  r = await recover(page, [`proyecto:${huerto.id}`])
  await page.evaluate(() => (Storage.prototype.setItem = window.__realSetItem))
  check('no space for the journal: refused before touching the data', !r.ok && r.reason === 'sin-espacio' && (await sandbox(page)).generation === genOther && (await getKey(page, SB_JOURNAL)) === jBefore, r.text)

  // ── 10 · Interruptions, found on reopening ─────────────────────────────────
  const cur = await sandbox(page)
  const shaOf = (p, d) => p.evaluate(async (data) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))))].map((b) => b.toString(16).padStart(2, '0')).join(''), d)
  const base = { ...(await journal(page)), state: 'en-curso', finishedAt: undefined, error: undefined }
  const reopen = async (j) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SB_JOURNAL, JSON.stringify(j)])
    await page.reload()
    await page.waitForSelector('[data-testid="sandbox-state"]')
    await page.waitForTimeout(300)
  }
  await reopen({ ...base, baseGeneration: cur.generation, before: await getKey(page, SB_DATA), targetSha256: '0'.repeat(64) })
  check('interrupted before writing: closed on reopening as «nothing changed»', (await journal(page)).state === 'no-aplicada')
  await reopen({ ...base, baseGeneration: cur.generation - 1, before: 'otro', targetSha256: await shaOf(page, cur.data) })
  check('interrupted after writing: closed on reopening as completed', (await journal(page)).state === 'completada')
  await reopen({ ...base, baseGeneration: cur.generation - 3, before: base.before, targetSha256: '1'.repeat(64) })
  const openCard = page.getByTestId('journal-open')
  check('unknown outcome: stays open, warns, and offers the text before', (await openCard.getAttribute('data-kind')) === 'desconocida' && (await page.getByTestId('journal-save-before').count()) === 1)
  await shot(page, '20-recuperar-interrumpida.png')
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  await page.locator(`[data-unit="proyecto:${huerto.id}"] input`).check()
  await page.getByTestId('restore-sure').check()
  check('while one is open, a new recovery cannot be confirmed', await page.getByTestId('restore-confirm').isDisabled())
  await page.getByTestId('journal-dismiss').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
  check('after reviewing it, the person closes it', (await journal(page)).state === 'revisada')

  // ── 11 · A copy of PROYECTOS itself, recovered whole into the empty test store ──
  await page.getByTestId('sandbox-clear').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-state"]')?.textContent?.includes('Vacío'))
  check('clearing the test store removes only its keys', (await notSandbox(page)) === mainBefore && (await getKey(page, SB_DATA)) === null)
  // ── 11a · P2-R1.1: a copy from before the reset (same projects, other ids) ──
  await sandboxAction(page, 'sandbox-fill')
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  const twinRows = page.locator('[data-testid="restore-unit"][data-state="solo-en-copia"]')
  check(
    'copy from before the reset: warned, the six shown as existing under another id, none selectable alone',
    (await page.getByTestId('restore-warning').count()) === 1 &&
      (await twinRows.count()) === 6 &&
      (await page.locator('[data-testid="restore-unit"][data-state="solo-en-copia"][data-selectable="true"]').count()) === 0 &&
      (await twinRows.first().innerText()).includes('Existe con otro identificador'),
  )
  await shot(page, '21-recuperar-copia-anterior-al-reinicio.png')
  await page.getByTestId('sandbox-clear').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-state"]')?.textContent?.includes('Vacío'))
  await pick(page, 'elyum-proyectos.json', mainCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  r = await recover(page, [], true)
  const whole = await sandbox(page)
  const main = JSON.parse(JSON.parse(mainCopy).stored)
  check('full recovery of Exportar’s copy: the test store now holds exactly the copy’s data (plus the recovery line)', r.ok && JSON.stringify({ ...whole.data, history: whole.data.history.slice(0, -1) }) === JSON.stringify(main.data))
  check('and PROYECTOS itself is still untouched', (await notSandbox(page)) === mainBefore)
  await context.close()

  // ── 12 · Without Web Locks ─────────────────────────────────────────────────
  {
    const ro = await fresh(() => {
      delete Navigator.prototype.locks
    })
    const p = await ro.open('#/recuperar')
    await p.waitForSelector('[data-testid="sandbox-state"]')
    await p.getByTestId('sandbox-fill').click()
    await p.getByTestId('sandbox-note').waitFor()
    check('no Web Locks: the test store is not written', (await getKey(p, SB_DATA)) === null, await p.getByTestId('sandbox-note').innerText())
    await ro.context.close()
  }
} catch (e) {
  check('run finished', false, e instanceof Error ? e.stack : String(e))
} finally {
  await browser.close()
  await server.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones · capturas en ${SHOTS}`)
process.exit(failed.length ? 1 : 0)
