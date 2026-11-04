#!/usr/bin/env node
// P2-R1 · Recovering PROYECTOS from an exported copy, in a real browser (Chromium via Playwright, iPhone-sized).
// Synthetic data only, and only into the separate test store (elyum:prueba-p2r1:*), at #/recuperar-prueba (P2-R1.4).
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
  // P2-R1.4: the test store has its own route (#/recuperar-prueba); Exportar now links to Recuperar on PROYECTOS itself.
  check('Exportar links to Recuperar on PROYECTOS itself', (await page.getByTestId('go-restore-from-export').getAttribute('href')) === '#/recuperar')
  await go(page, '#/recuperar-prueba')
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
  check('weeks alone are refused (their commitment needs the lost project), with the reason', (await weeks.getAttribute('data-selectable')) === 'false' && (await weeks.innerText()).includes('recupera también «Huerto de prueba»'))
  await shot(page, '15-recuperar-vista-previa.png')
  check('preview wrote nothing', (await sandbox(page)).generation === damaged.generation)

  // ── 3b · P2-R1.2 · H02: combined selections, checked as a whole on every change ──
  const sure = page.getByTestId('restore-sure')
  const confirmBtn = page.getByTestId('restore-confirm')
  check('H02 · weeks cannot be recovered alone but can be ticked', (await weeks.getAttribute('data-choosable')) === 'true' && !(await weeks.locator('input').isDisabled()))
  await weeks.locator('input').check()
  await page.getByTestId('restore-invalid').waitFor()
  check('H02 · weeks alone: the selection is invalid, no confirmation offered', (await confirmBtn.count()) === 0 && (await page.getByTestId('restore-invalid').locator('xpath=..').innerText()).includes('Huerto de prueba'))
  await shot(page, '22-p2r12-semanas-solas.png')
  await lost.locator('input').check()
  await sure.waitFor()
  check('H02 · weeks together with the project they need: valid, confirmation offered', (await page.getByTestId('restore-invalid').count()) === 0 && (await confirmBtn.count()) === 1)
  await sure.check()
  check('H02 · ticked «he revisado»: confirm enabled for this selection', !(await confirmBtn.isDisabled()))
  await shot(page, '23-p2r12-semanas-con-proyecto.png')
  await weeks.locator('input').uncheck()
  await sure.waitFor()
  check('H02 · changing the selection unticks «he revisado» and disables confirm', !(await sure.isChecked()) && (await confirmBtn.isDisabled()))
  await sure.check()
  await page.getByTestId('restore-all').check()
  await sure.waitFor()
  check('H02 · switching to «todo» unticks «he revisado» too (audit H2)', !(await sure.isChecked()) && (await confirmBtn.isDisabled()))
  await page.getByTestId('restore-all').uncheck()
  await lost.locator('input').uncheck()
  check('H02 · nothing was written while choosing', (await sandbox(page)).generation === damaged.generation && (await getKey(page, SB_JOURNAL)) === null)

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
  const other = await open('#/recuperar-prueba')
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

  // ── 10 · Interruptions, found on reopening (P2-R1.2 · H04: resolved explicitly, never on their own) ──
  const cur = await sandbox(page)
  const sha = (p, text) => p.evaluate(async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join(''), text)
  const shaOf = (p, d) => sha(p, JSON.stringify(d))
  const base = { ...(await journal(page)), state: 'en-curso', finishedAt: undefined, error: undefined, resultGeneration: undefined }
  const reopen = async (j) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SB_JOURNAL, typeof j === 'string' ? j : JSON.stringify(j)])
    await page.reload()
    await page.waitForSelector('[data-testid="sandbox-state"]')
    await page.waitForTimeout(300)
  }
  const openKind = async () => (await page.getByTestId('journal-open').count()) && (await page.getByTestId('journal-open').getAttribute('data-kind'))
  const nowRaw = await getKey(page, SB_DATA)
  await reopen({ ...base, baseGeneration: cur.generation, before: nowRaw, beforeSha256: await sha(page, nowRaw), targetSha256: '0'.repeat(64) })
  check('H04 · interrupted before writing: found on reopening, NOT closed on its own, writes blocked', (await openKind()) === 'sin-escribir' && (await journal(page)).state === 'en-curso' && (await page.getByTestId('journal-blocks').count()) === 1)

  // Interruption followed by a normal edit, from this tab and from a tab opened before (other): refused, nothing written.
  const genBlocked = (await sandbox(page)).generation
  await page.getByTestId('sandbox-change').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-note"]')?.textContent?.includes('no se ha guardado'))
  const noteHere = await page.getByTestId('sandbox-note').innerText()
  await other.getByTestId('sandbox-change').click()
  await other.waitForFunction(() => document.querySelector('[data-testid="sandbox-note"]')?.textContent?.includes('no se ha guardado'))
  const noteOther = await other.getByTestId('sandbox-note').innerText()
  check('H04 · a normal edit after the interruption is refused, in this tab and in another tab', noteHere.includes('sin resolver') && noteOther.includes('sin resolver') && (await sandbox(page)).generation === genBlocked && (await journal(page)).state === 'en-curso', `${noteHere} | ${noteOther}`)
  check('H04 · the clear button (which would delete the journal) is disabled while it is open', await page.getByTestId('sandbox-clear').isDisabled())
  await shot(page, '24-p2r12-pendiente-bloquea.png')
  await page.getByTestId('journal-settle').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
  check('interrupted before writing: closed as «nothing changed» when the person resolves it', (await journal(page)).state === 'no-aplicada')
  await sandboxAction(other, 'sandbox-change')
  check('H04 · once resolved, the other tab can edit again', (await sandbox(page)).generation === genBlocked + 1)
  const cur2 = await sandbox(page)

  await reopen({ ...base, baseGeneration: cur2.generation - 1, targetSha256: await shaOf(page, cur2.data) })
  check('interrupted after writing: found, not closed on its own', (await openKind()) === 'escrita-sin-cerrar' && (await journal(page)).state === 'en-curso')
  await page.getByTestId('journal-settle').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
  check('interrupted after writing: closed as completed when the person resolves it', (await journal(page)).state === 'completada')

  await reopen({ ...base, baseGeneration: cur2.generation - 3, targetSha256: '1'.repeat(64) })
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

  // ── 10b · P2-R1.2 · H03: a damaged journal (right format, wrong structure) ──
  const goodJournal = await journal(page)
  const damagedText = JSON.stringify({ ...goodJournal, state: 'terminada' })
  const dataBefore = await getKey(page, SB_DATA)
  await reopen(damagedText)
  check('H03 · damaged journal: not read as closed; diagnosed; kept exactly', (await openKind()) === 'ilegible' && (await page.getByTestId('journal-damaged').innerText()).includes('estado desconocido') && (await getKey(page, SB_JOURNAL)) === damagedText)
  check('H03 · it cannot be closed before saving it', await page.getByTestId('journal-close-damaged').isDisabled())
  await page.getByTestId('sandbox-change').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-note"]')?.textContent?.includes('no se ha guardado'))
  check('H03/H04 · with a damaged journal, edits are refused and nothing changes', (await page.getByTestId('sandbox-note').innerText()).includes('dañado') && (await getKey(page, SB_DATA)) === dataBefore && (await getKey(page, SB_JOURNAL)) === damagedText)
  await shot(page, '25-p2r12-diario-danado.png')
  // P2-R1.3 · F04: cancelling the share sheet is not saving.
  await page.evaluate(() => {
    window.__share = [Navigator.prototype.canShare, Navigator.prototype.share]
    Navigator.prototype.canShare = () => true
    Navigator.prototype.share = () => Promise.reject(new DOMException('Share canceled', 'AbortError'))
  })
  await page.getByTestId('journal-save-damaged').click()
  await page.getByTestId('journal-save-outcome').waitFor()
  check(
    'F04 · share sheet cancelled: says nothing was saved, no confirmation offered, close stays disabled',
    (await page.getByTestId('journal-save-outcome').innerText()).includes('Cancelado') && (await page.getByTestId('journal-damaged-confirm').count()) === 0 && (await page.getByTestId('journal-close-damaged').isDisabled()),
  )
  await shot(page, '27-p2r13-compartir-cancelado.png')
  await page.evaluate(() => {
    ;[Navigator.prototype.canShare, Navigator.prototype.share] = window.__share
  })
  const savedDamaged = await download(page, 'journal-save-damaged')
  check('H03 · «guardar el diario tal cual» gives exactly its text', savedDamaged === damagedText)
  check('F04 · download asked for: still no close until the person confirms it is kept', (await page.getByTestId('journal-save-outcome').getAttribute('data-delivered')) === '1' && (await page.getByTestId('journal-close-damaged').isDisabled()))
  await page.getByTestId('journal-damaged-confirm').check()
  check('F04 · confirmed by the person: close enabled', !(await page.getByTestId('journal-close-damaged').isDisabled()))
  // Quota while closing: the journal stays exactly, the error stays on screen, writes stay blocked.
  await page.evaluate((jk) => {
    window.__realSetItem = Storage.prototype.setItem
    const real = window.__realSetItem
    Storage.prototype.setItem = function (k, v) {
      if (k === jk) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      return real.call(this, k, v)
    }
  }, SB_JOURNAL)
  await page.getByTestId('journal-close-damaged').click()
  await page.getByTestId('journal-close-error').waitFor()
  await page.waitForTimeout(300)
  check('cuota · closing without space: visible error, journal intact and still open', (await page.getByTestId('journal-close-error').innerText()).includes('No hay espacio') && (await getKey(page, SB_JOURNAL)) === damagedText && (await openKind()) === 'ilegible' && (await getKey(page, SB_DATA)) === dataBefore)
  await shot(page, '28-p2r13-cuota-al-cerrar.png')
  await page.evaluate(() => (Storage.prototype.setItem = window.__realSetItem))
  await page.getByTestId('journal-close-damaged').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
  const closedDamaged = await journal(page)
  check('H03 · closed by the person, its text kept inside, the text before still recoverable', closedDamaged.state === 'revisada' && closedDamaged.damaged === damagedText && closedDamaged.before === goodJournal.before && (await page.getByTestId('journal-undo').count()) === 1 && (await getKey(page, SB_DATA)) === dataBefore)

  // ── 10d · P2-R1.3 · F02 (closed journal, altered text before) and F03 (open journal of 8c7ea4c) ──
  {
    const alteredText = JSON.stringify({ ...goodJournal, before: goodJournal.before.replace('"generation":', '"generation": ') })
    await reopen(alteredText)
    const gen = (await sandbox(page)).generation
    await page.getByTestId('sandbox-change').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-note"]')?.textContent?.includes('no se ha guardado'))
    check('F02 · closed journal whose text before no longer matches its fingerprint: damaged for Recuperar AND for a normal edit', (await openKind()) === 'ilegible' && (await page.getByTestId('sandbox-note').innerText()).includes('dañado') && (await sandbox(page)).generation === gen && (await getKey(page, SB_JOURNAL)) === alteredText)
    const curNow = await sandbox(page)
    const legacy = { ...goodJournal, state: 'en-curso', beforeSha256: null, finishedAt: undefined, resultGeneration: undefined, error: undefined, damaged: undefined, before: await getKey(page, SB_DATA), baseGeneration: curNow.generation, targetSha256: '0'.repeat(64), summary: 'diario de 8c7ea4c' }
    await reopen(legacy)
    check('F03 · open journal of 8c7ea4c (no fingerprint): found, not closed on its own', (await openKind()) === 'sin-escribir')
    await page.getByTestId('journal-settle').click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
    const closedLegacy = await journal(page)
    check('F03 · closing it leaves a VALID journal: fingerprint computed, text before kept, nothing reopens', closedLegacy.state === 'no-aplicada' && closedLegacy.before === legacy.before && closedLegacy.beforeSha256 === (await sha(page, legacy.before)) && (await page.getByTestId('journal-open').count()) === 0)
    await sandboxAction(page, 'sandbox-change')
    check('F03 · and edits work again', (await sandbox(page)).generation === curNow.generation + 1)
  }

  // ── 10e · P2-R1.3.1 · R13-01: a close applies only to the exact journal text delivered and confirmed ──
  {
    const g = await journal(page)
    const textA = JSON.stringify({ ...g, state: 'terminada', summary: 'diario A' })
    const textB = JSON.stringify({ ...g, state: 'otra-cosa', summary: 'diario B' })
    const settled = () => page.waitForFunction(() => document.querySelector('[data-testid="journal-close-error"]') || !document.querySelector('[data-testid="journal-open"]')).then(() => page.waitForTimeout(300))
    const off = async (id) => (await page.getByTestId(id).count()) === 0 || (await page.getByTestId(id).isDisabled())
    const confirmA = async () => {
      await reopen(textA)
      const got = await download(page, 'journal-save-damaged')
      await page.getByTestId('journal-damaged-confirm').check()
      return got === textA && !(await page.getByTestId('journal-close-damaged').isDisabled())
    }
    // A · the journal is replaced (another tab or the installed app) while this screen still shows A, confirmed.
    check('R13-01 · A exported and confirmed: close enabled on this screen', await confirmA())
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SB_JOURNAL, textB]) // same page: no «storage» event, the screen stays stale
    const dataA = await getKey(page, SB_DATA)
    const keysA = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))
    await page.getByTestId('journal-close-damaged').click()
    await settled() // refused (error shown) or, on the faulty code, closed
    check(
      'R13-01 · A · journal replaced by B: close refused, B kept exactly, no key changed, message says it changed',
      (await getKey(page, SB_JOURNAL)) === textB &&
        (await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))) === keysA &&
        (await page.getByTestId('journal-close-error').innerText()).includes('ha cambiado'),
    )
    check(
      'R13-01 · A · old confirmation gone: no checkbox, close disabled, the screen now shows B and asks to save it again',
      (await page.getByTestId('journal-damaged-confirm').count()) === 0 && (await off('journal-close-damaged')) && (await openKind()) === 'ilegible' && (await page.getByTestId('journal-damaged').count()) === 1 && (await page.getByTestId('journal-damaged').innerText()).includes('estado desconocido: otra-cosa'),
    )
    await shot(page, '29-r1301-diario-sustituido.png')
    await page.getByTestId('sandbox-change').click()
    await page.waitForTimeout(500)
    check('R13-01 · A · writes still blocked', (await getKey(page, SB_DATA)) === dataA)

    // B · client B (the other tab) resolves A and starts a new recovery, interrupted after the new journal and before the data.
    check('R13-01 · B · client A exported and confirmed A', await confirmA())
    await other.reload()
    await other.waitForSelector('[data-testid="sandbox-state"]')
    await other.waitForTimeout(300)
    check('R13-01 · B · client B saves the same A', (await download(other, 'journal-save-damaged')) === textA)
    await other.getByTestId('journal-damaged-confirm').check()
    await other.getByTestId('journal-close-damaged').click()
    await other.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
    check('R13-01 · B · client B closed A', (await journal(other)).state === 'revisada' && (await journal(other)).damaged === textA)
    const dataB = await getKey(other, SB_DATA)
    await other.evaluate(([dk, jk]) => {
      window.__realSetItem = Storage.prototype.setItem
      const real = window.__realSetItem
      let journalWrites = 0
      Storage.prototype.setItem = function (k, v) {
        if (k === dk || (k === jk && ++journalWrites > 1)) throw new DOMException('interrumpida', 'UnknownError') // the process stops here
        return real.call(this, k, v)
      }
    }, [SB_DATA, SB_JOURNAL])
    await pick(other, 'copia-prueba.json', sandboxCopy)
    await other.waitForSelector('[data-testid="restore-plan"]')
    const rb = await recover(other, [], true)
    await other.evaluate(() => (Storage.prototype.setItem = window.__realSetItem))
    const fresh = await getKey(page, SB_JOURNAL)
    check('R13-01 · B · new recovery interrupted: new open journal written, data untouched', !rb.ok && JSON.parse(fresh).state === 'en-curso' && (await getKey(page, SB_DATA)) === dataB, rb.text)
    const keysB = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))
    // Client A's screen still shows A, delivered and confirmed.
    check('R13-01 · B · client A still shows A with its old confirmation', !(await page.getByTestId('journal-close-damaged').isDisabled()))
    await page.getByTestId('journal-close-damaged').click()
    await settled() // refused (error shown) or, on the faulty code, closed
    check(
      'R13-01 · B · old confirmation: close refused, the new journal kept exactly, no key changed, no data lost',
      (await getKey(page, SB_JOURNAL)) === fresh && (await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))) === keysB && (await getKey(page, SB_DATA)) === dataB && (await page.getByTestId('journal-close-error').innerText()).includes('ha cambiado'),
    )
    check('R13-01 · B · the screen now shows the new journal to review (interrupted before writing)', (await openKind()) === 'sin-escribir')
    await shot(page, '30-r1301-recuperacion-nueva-interrumpida.png')
    await page.getByTestId('sandbox-change').click()
    await page.waitForTimeout(500)
    check('R13-01 · B · write block intact', (await getKey(page, SB_DATA)) === dataB)
    // Resolved the normal way, for the steps that follow.
    if (await page.getByTestId('journal-settle').count()) {
      await page.getByTestId('journal-settle').click()
      await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
    }

    // C · A unchanged, exported and confirmed: closes normally.
    check('R13-01 · C · A exported and confirmed again', await confirmA())
    await page.getByTestId('journal-close-damaged').click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
    const closedC = await journal(page)
    check('R13-01 · C · legitimate close: closed, its exact text kept, data untouched', closedC.state === 'revisada' && closedC.damaged === textA && (await getKey(page, SB_DATA)) === dataB && (await page.getByTestId('journal-close-error').count()) === 0)
  }

  // ── 10c · P2-R1.2 · H04: PROYECTOS itself, opened with an unresolved recovery in its own store ──
  {
    const mainRaw = await getKey(page, DATA_KEY)
    const MAIN_JOURNAL = 'elyum:projects:v1:antes-de-recuperar'
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [MAIN_JOURNAL, JSON.stringify({ ...base, before: mainRaw, beforeSha256: await sha(page, mainRaw), baseGeneration: JSON.parse(mainRaw).generation })])
    const p2 = await open('#/')
    await p2.getByTestId('pending-recovery').waitFor()
    const rows = await p2.locator('[data-testid="go-new-project"]').count()
    await go(p2, '#/nuevo-proyecto')
    const createDisabled = await p2.getByTestId('create-project').isDisabled()
    const attempt = await p2.evaluate(async () => {
      const { browserStore } = await import('/src/features/projects/store/store.ts')
      const s = browserStore('e2e', () => new Date().toISOString())
      const l = await s.load()
      return s.save(l.data, l.generation)
    })
    check('H04 · PROYECTOS detects it on opening, offers no writes, and its store refuses them', rows === 1 && createDisabled && attempt.ok === false && attempt.reason === 'recuperacion-pendiente' && (await getKey(p2, DATA_KEY)) === mainRaw, JSON.stringify(attempt))
    await shot(p2, '26-p2r12-proyectos-pendiente.png')
    await page.evaluate((k) => localStorage.removeItem(k), MAIN_JOURNAL) // test setup only: the planted journal goes
    await p2.close()
  }
  check('H04 · PROYECTOS’ own keys are back exactly as before (only the planted journal was removed)', (await notSandbox(page)) === mainBefore)

  // ── 11 · A copy of PROYECTOS itself, recovered whole into the empty test store ──
  await page.getByTestId('sandbox-clear').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-state"]')?.textContent?.includes('Vacío'))
  check('clearing the test store removes only its keys', (await notSandbox(page)) === mainBefore && (await getKey(page, SB_DATA)) === null)
  // ── 11a · The iPhone case: an OLD copy after clearing and refilling the test store ──
  await sandboxAction(page, 'sandbox-fill')
  await pick(page, 'copia-prueba.json', sandboxCopy)
  await page.waitForSelector('[data-testid="restore-plan"]')
  const rows = async (state, selectable) => page.locator(`[data-testid="restore-unit"][data-state="${state}"]${selectable === undefined ? '' : `[data-selectable="${selectable}"]`}`).count()
  const blockedText = await page.locator('[data-testid="restore-unit"][data-state="solo-en-copia"][data-selectable="false"]').allInnerTexts()
  check(
    'old copy after a reset: six «solo en la copia» + six «solo aquí» (new ids); Huerto and Taller blocked as sharing their dossier; nothing preselected',
    (await rows('solo-en-copia')) === 6 && (await rows('solo-local')) === 6 && blockedText.length === 2 && blockedText.every((t) => t.includes('comparte su dossier')) && (await page.locator('[data-testid="restore-unit"] input:checked').count()) === 0,
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
    const p = await ro.open('#/recuperar-prueba')
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
