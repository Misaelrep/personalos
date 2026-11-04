#!/usr/bin/env node
// P2-R1.4 · Recuperar inside ELYUM, on PROYECTOS' own store, in a real browser (Chromium via Playwright, iPhone-sized).
//   node e2e/projects/restore-elyum.mjs
//   P2R14_SHOTS=/some/dir   where screenshots go (default: a temp dir)
// Fresh browser profile, invented data only (projects created on screen). The whole route: the menu entry, the copy
// of the current data bound to its text and generation (D2), the refusal of test copies (D3), recovering only what
// was lost, PROYECTOS up to date without reloading, back to what was before from the journal, another tab writing,
// two recoveries at once, unresolved and damaged journals found on reopening, unreadable data (D4), no Web Locks;
// and that no key outside PROYECTOS' five keys changes. Interruptions and failures are SIMULATED (a planted journal,
// a held lock): this does not prove real process kills or a physically full storage.
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

const PORT = 4336
const BASE = `http://localhost:${PORT}/?entry=none&section=proyectos`
const DATA_KEY = 'elyum:projects:v1:data'
const JOURNAL_KEY = 'elyum:projects:v1:antes-de-recuperar'
const RESTORE_LOCK = 'elyum:projects:v1:recuperacion'
const OWN = new Set([DATA_KEY, JOURNAL_KEY, 'elyum:projects:v1:prev:1', 'elyum:projects:v1:prev:2', 'elyum:projects:v1:prev:3'])
const SENTINELS = { 'personal-os:sentinel-p2r14': 'HOY intacto', 'elyum:learn:v1:sentinel-p2r14': 'APRENDER intacto', 'elyum:prueba-p2r1:sentinel-p2r14': 'almacén de prueba intacto' }
const SHOTS = process.env.P2R14_SHOTS ?? mkdtempSync(join(tmpdir(), 'p2r14-shots-'))
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

const shot = (page, name) => page.screenshot({ path: join(SHOTS, name), fullPage: true })
const getKey = (page, k) => page.evaluate((key) => localStorage.getItem(key), k)
const setKey = (page, k, v) => page.evaluate(([key, val]) => localStorage.setItem(key, val), [k, v])
const stored = async (page) => JSON.parse((await getKey(page, DATA_KEY)) ?? 'null')
/**
 * Every key outside PROYECTOS' five, with its value. Except `personal-os:entry`: the CORE stamps its own
 * «last active» time there each time ELYUM opens (this run opens new tabs); it is shown, not compared.
 */
const others = (page) => page.evaluate((own) => JSON.stringify(Object.keys(localStorage).filter((k) => !own.includes(k) && k !== 'personal-os:entry').sort().map((k) => [k, localStorage.getItem(k)])), [...OWN])
const ownKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elyum:projects:')))
const go = async (page, hash) => {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.waitForTimeout(200)
}
async function openElyum(context, hash = '#/') {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.goto(BASE + hash)
  await page.waitForSelector('[data-testid="projects-section"]')
  await page.waitForTimeout(300)
  return page
}
async function download(page, testId) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()])
  return readFileSync(await d.path(), 'utf8')
}
async function pick(page, name, text) {
  await page.setInputFiles('[data-testid="restore-input"]', { name, mimeType: 'application/json', buffer: Buffer.from(text) })
  await page.waitForSelector('[data-testid="backup-ok"], [data-testid="backup-problem"]')
  await page.waitForTimeout(150)
}
async function createProject(page, name) {
  await go(page, '#/nuevo-proyecto')
  await page.getByTestId('project-name').fill(name)
  await page.getByTestId('project-objective').fill(`Objetivo inventado de ${name}`)
  await page.waitForTimeout(150)
  if (await page.getByTestId('distinct').count()) await page.getByTestId('distinct').check()
  await page.getByTestId('create-project').click()
  await page.waitForTimeout(300)
}
/** A save through PROYECTOS' own store, as another tab would. `fn` receives the data and the sandbox helpers. */
async function storeWrite(page, fnText) {
  return page.evaluate(async (src) => {
    const { browserStore } = await import('/src/features/projects/store/store.ts')
    const sb = await import('/src/features/projects/ui/sandbox.ts')
    const s = browserStore('e2e-otra-pestaña', () => new Date().toISOString())
    const l = await s.load()
    const fn = new Function('d', 'sb', `return (${src})(d, sb)`)
    return s.save(fn(l.data, sb), l.generation)
  }, fnText)
}
const cards = async (page) => (await page.locator('[data-testid="project-card"]').allInnerTexts()).map((t) => t.split('\n')[0])
const confirmBtn = (page) => page.getByTestId('restore-confirm')
async function saveCurrentCopy(page) {
  await download(page, 'current-copy-save')
  await page.getByTestId('current-copy-confirm').waitFor()
  await page.getByTestId('current-copy-confirm').check()
  await page.waitForTimeout(200)
}

try {
  const context = await browser.newContext(IPHONE)
  const page = await openElyum(context)
  for (const [k, v] of Object.entries(SENTINELS)) await setKey(page, k, v)

  // ── 0 · Entry points ───────────────────────────────────────────────────────
  check('D1 · the PROYECTOS menu offers Recuperar, and none of the test tools', (await page.getByTestId('go-restore').count()) === 1 && (await page.getByTestId('go-restore-test').count()) === 0 && (await page.getByTestId('go-check').count()) === 0)
  for (const name of ['Alfa de prueba', 'Beta de prueba', 'Gamma de prueba']) await createProject(page, name)
  await go(page, '#/')
  check('three invented projects created on screen', (await cards(page)).length === 3, (await cards(page)).join(' · '))

  await go(page, '#/exportar')
  await page.getByTestId('export').click()
  await page.waitForSelector('[data-testid="export-result"]')
  const copyA = await download(page, 'save-export')
  check('D1 · Exportar links to Recuperar', (await page.getByTestId('go-restore-from-export').getAttribute('href')) === '#/recuperar')
  const othersBefore = await others(page)

  // A loss, from another tab.
  const lostName = 'Alfa de prueba'
  const lose = await storeWrite(page, `(d, sb) => sb.loseProject(d, d.projects.find((p) => p.name === ${JSON.stringify(lostName)}).id)`)
  check('a project is lost (written by another tab through the store)', lose.ok, JSON.stringify(lose))
  await page.reload()
  await page.waitForSelector('[data-testid="projects-section"]')
  await go(page, '#/')
  check('PROYECTOS now shows two projects', (await cards(page)).length === 2)

  // ── 1 · The screen ─────────────────────────────────────────────────────────
  await page.getByTestId('go-restore').click()
  await page.getByTestId('target-note').waitFor()
  const note = await page.getByTestId('target-note').innerText()
  check('the screen names the destination: your PROYECTOS data in this browser', note.includes('tus datos de PROYECTOS') && note.includes('en este navegador'), note)
  check('no test-store tools on the regular route', (await page.getByTestId('sandbox-fill').count()) === 0 && (await page.getByTestId('sandbox-clear').count()) === 0 && (await page.getByTestId('sandbox-export').count()) === 0)
  await shot(page, '31-elyum-recuperar.png')

  // ── 2 · Copies that must not go in (D3), and a damaged one ─────────────────
  const rawBefore = await getKey(page, DATA_KEY)
  const sandboxMarked = JSON.stringify({ ...JSON.parse(copyA), origin: 'prueba-p2r1' }, null, 2)
  await pick(page, 'copia-del-almacen-de-prueba.json', sandboxMarked)
  check('D3 · a copy of the test store is refused, nothing written', (await page.getByTestId('backup-problem').innerText()).includes('almacén de prueba') && (await getKey(page, DATA_KEY)) === rawBefore)
  const labMarked = await page.evaluate(async () => {
    const { createStore } = await import('/src/features/projects/store/store.ts')
    const { exportProjects } = await import('/src/features/projects/store/export.ts')
    const { syntheticSix } = await import('/src/features/projects/ui/sandbox.ts')
    const m = new Map()
    const mem = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
    const t = () => new Date().toISOString()
    const s = createStore({ storage: mem, locks: navigator.locks, now: t, writer: 'e2e-laboratorio' })
    await s.save({ ...(await syntheticSix(t)), syntheticRecoveryLab: 'sesion-e2e' }, 0)
    return (await exportProjects(mem, t())).text
  })
  await pick(page, 'copia-del-laboratorio.json', labMarked)
  check('D3 · a copy of the synthetic lab is refused, nothing written', (await page.getByTestId('backup-problem').innerText()).includes('laboratorio') && (await getKey(page, DATA_KEY)) === rawBefore)
  const altered = JSON.parse(copyA)
  altered.stored = altered.stored.replace('Beta de prueba', 'Beta alterada')
  await pick(page, 'copia-alterada.json', JSON.stringify(altered))
  check('an altered copy is refused as altered, nothing written', (await page.getByTestId('backup-problem').getAttribute('data-problem')) === 'alterada' && (await getKey(page, DATA_KEY)) === rawBefore)

  // ── 3 · The copy of the current data (D2) ──────────────────────────────────
  await pick(page, 'elyum-proyectos.json', copyA)
  await page.waitForSelector('[data-testid="restore-plan"]')
  const lostUnit = page.locator('[data-testid="restore-unit"][data-state="solo-en-copia"]')
  check('the plan shows the lost project as «solo en la copia», nothing preselected', (await lostUnit.count()) === 1 && (await page.locator('[data-testid="restore-unit"] input:checked').count()) === 0)
  await lostUnit.locator('input').check()
  await page.getByTestId('restore-sure').check()
  await page.waitForTimeout(200)
  check('D2 · without a copy of the current data, confirm stays disabled and says why', (await confirmBtn(page).isDisabled()) && (await page.getByTestId('current-copy-gate').innerText()).includes('copia de lo que hay ahora'))
  const currentCopyText = await download(page, 'current-copy-save')
  await page.getByTestId('current-copy-confirm').waitFor()
  const cc = JSON.parse(currentCopyText)
  check('D2 · the copy saved is a verifiable copy of exactly what is stored now', cc.stored === (await getKey(page, DATA_KEY)) && cc.summary.generation === (await stored(page)).generation)
  check('D2 · saved but not yet confirmed by the person: still disabled', await confirmBtn(page).isDisabled())
  await page.getByTestId('current-copy-confirm').check()
  await page.waitForTimeout(200)
  check('D2 · confirmed: recovery may be confirmed', !(await confirmBtn(page).isDisabled()))
  await shot(page, '32-elyum-recuperar-copia-actual.png')

  // Precisión 1 · the data change after the copy: it no longer counts.
  const other = await openElyum(context)
  const edit = await storeWrite(other, `(d) => ({ ...d, projects: d.projects.map((p, i) => (i === 0 ? { ...p, objective: p.objective + ' (cambio en otra pestaña)' } : p)) })`)
  await page.waitForTimeout(600)
  check(
    'precisión 1 · another tab changed the data: the copy no longer counts, confirm disabled, nothing written',
    edit.ok && (await confirmBtn(page).isDisabled()) && (await page.getByTestId('current-copy-gate').innerText()).includes('cambiaron'),
  )
  // Start again on the new data: a new plan, and the old copy does not count for it.
  await pick(page, 'elyum-proyectos.json', copyA)
  await page.waitForSelector('[data-testid="restore-plan"]')
  await lostUnit.locator('input').check()
  await page.getByTestId('restore-sure').check()
  await page.waitForTimeout(200)
  check('precisión 1 · on a new plan the old copy still does not count', await confirmBtn(page).isDisabled())
  await saveCurrentCopy(page)

  // Two recoveries at once: another tab holds the recovery lock.
  await other.evaluate((name) => {
    window.__release = undefined
    void navigator.locks.request(name, { mode: 'exclusive' }, () => new Promise((r) => (window.__release = r)))
  }, RESTORE_LOCK)
  await other.waitForFunction(() => typeof window.__release === 'function')
  const rawHeld = await getKey(page, DATA_KEY)
  await confirmBtn(page).click()
  await page.getByTestId('restore-result').waitFor()
  check('another recovery running elsewhere: refused, nothing written', (await page.getByTestId('restore-result').getAttribute('data-reason')) === 'otra-recuperacion' && (await getKey(page, DATA_KEY)) === rawHeld)
  await other.evaluate(() => window.__release())

  // ── 4 · Recover only what was lost ─────────────────────────────────────────
  await pick(page, 'elyum-proyectos.json', copyA)
  await page.waitForSelector('[data-testid="restore-plan"]')
  await lostUnit.locator('input').check()
  await page.getByTestId('restore-sure').check()
  await saveCurrentCopy(page)
  await confirmBtn(page).click()
  await page.waitForSelector('[data-testid="restore-result"][data-ok="true"]')
  const afterRecovery = await stored(page)
  check('recovered and checked: the lost project is back, the change of the other tab kept', afterRecovery.data.projects.length === 3 && afterRecovery.data.projects.some((p) => p.objective.includes('cambio en otra pestaña')))
  await shot(page, '33-elyum-recuperado.png')
  await go(page, '#/')
  check('PROYECTOS shows the recovered project without reloading', (await cards(page)).includes(lostName), (await cards(page)).join(' · '))
  await other.waitForTimeout(400)
  await go(other, '#/')
  check('the other tab re-read PROYECTOS too', (await cards(other)).includes(lostName))
  check('the journal of the recovery is closed «completada»', JSON.parse(await getKey(page, JOURNAL_KEY)).state === 'completada')

  // ── 5 · Back to what was before, from the journal (precisión 2) ────────────
  await go(page, '#/recuperar')
  await page.getByTestId('journal-undo').waitFor()
  await page.getByTestId('journal-undo').click()
  await page.waitForSelector('[data-testid="backup-ok"], [data-testid="backup-problem"]')
  check('precisión 2 · the text before from this store’s journal is accepted (not refused as a test copy)', (await page.getByTestId('backup-ok').count()) === 1)
  await page.getByTestId('restore-all').check()
  await page.getByTestId('restore-sure').check()
  await page.waitForTimeout(200)
  check('D2 · reverting also asks for a copy of the current data first', await confirmBtn(page).isDisabled())
  await saveCurrentCopy(page)
  await confirmBtn(page).click()
  await page.waitForSelector('[data-testid="restore-result"][data-ok="true"]')
  await go(page, '#/')
  check('back to what was before: the lost project is gone again, without reloading', !(await cards(page)).includes(lostName) && (await cards(page)).length === 2)

  // ── 6 · Unresolved recovery found on reopening ─────────────────────────────
  {
    const raw = await getKey(page, DATA_KEY)
    const closed = JSON.parse(await getKey(page, JOURNAL_KEY))
    const planted = { ...closed, state: 'en-curso', before: raw, beforeSha256: await page.evaluate(async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join(''), raw), baseGeneration: JSON.parse(raw).generation, targetSha256: '0'.repeat(64) }
    delete planted.finishedAt
    delete planted.resultGeneration
    delete planted.error
    await setKey(page, JOURNAL_KEY, JSON.stringify(planted)) // simulated interruption (test setup)
    const p = await openElyum(context)
    await p.getByTestId('pending-recovery').waitFor()
    check('reopening with an unresolved recovery: the notice links to Recuperar', (await p.getByTestId('pending-recovery-go').getAttribute('href')) === '#/recuperar')
    await go(p, '#/nuevo-proyecto')
    const attempt = await storeWrite(p, '(d) => d')
    check('while it is unresolved nothing in PROYECTOS saves', (await p.getByTestId('create-project').isDisabled()) && attempt.ok === false && attempt.reason === 'recuperacion-pendiente' && (await getKey(p, DATA_KEY)) === raw)
    await shot(p, '34-elyum-pendiente.png')
    await go(p, '#/recuperar')
    await p.getByTestId('journal-open').waitFor()
    check('Recuperar says nothing was written, and offers to close it without asking for a copy', (await p.getByTestId('journal-open').getAttribute('data-kind')) === 'sin-escribir' && !(await p.getByTestId('journal-settle').isDisabled()))
    await p.getByTestId('journal-settle').click()
    await p.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
    await go(p, '#/')
    check('closed: no notice, PROYECTOS writable again, data untouched', (await p.getByTestId('pending-recovery').count()) === 0 && JSON.parse(await getKey(p, JOURNAL_KEY)).state === 'no-aplicada' && (await getKey(p, DATA_KEY)) === raw)

    // A damaged journal.
    await setKey(p, JOURNAL_KEY, '{"format":"elyum-projects-restore/1","state":"en-cu') // simulated cut (test setup)
    await p.reload()
    await p.waitForSelector('[data-testid="pending-recovery"]')
    await go(p, '#/recuperar')
    await p.getByTestId('journal-damaged').waitFor()
    check('a damaged journal: kept, cannot be closed before saving it', (await p.getByTestId('journal-close-damaged').isDisabled()))
    const savedDamaged = await download(p, 'journal-save-damaged')
    await p.getByTestId('journal-damaged-confirm').check()
    // Centred first: at the very bottom edge of this iPhone-sized viewport the emulated tap did not reach the button.
    await p.getByTestId('journal-close-damaged').evaluate((b) => b.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await p.getByTestId('journal-close-damaged').click()
    await p.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
    const closedDamaged = JSON.parse(await getKey(p, JOURNAL_KEY))
    check('saved exactly and closed, no copy of the current data asked, data untouched', savedDamaged === '{"format":"elyum-projects-restore/1","state":"en-cu' && closedDamaged.state === 'revisada' && closedDamaged.damaged === savedDamaged && (await getKey(p, DATA_KEY)) === raw)
    await p.close()
  }

  // ── 7 · Unreadable data (D4) ───────────────────────────────────────────────
  {
    const raw = await getKey(page, DATA_KEY)
    await setKey(page, DATA_KEY, raw.slice(0, -40)) // simulated damage (test setup)
    await page.reload()
    await page.waitForSelector('[data-testid="projects-section"]')
    await go(page, '#/recuperar')
    await pick(page, 'elyum-proyectos.json', copyA)
    check('D4 · over unreadable data: no plan, says so, nothing written', (await page.getByTestId('restore-plan').count()) === 0 && (await page.locator('text=no se recupera encima').count()) === 1 && (await getKey(page, DATA_KEY)) === raw.slice(0, -40))
    await setKey(page, DATA_KEY, raw) // test setup only: put it back
    await page.reload()
    await page.waitForSelector('[data-testid="projects-section"]')
  }

  // ── 8 · Cancelling the copy does not enable recovering (precisión 1) ───────
  {
    const p = await context.newPage()
    await p.addInitScript(() => {
      navigator.canShare = () => true
      navigator.share = () => Promise.reject(new DOMException('cancelado', 'AbortError'))
    })
    await p.goto(BASE + '#/recuperar')
    await p.getByTestId('target-note').waitFor()
    await pick(p, 'elyum-proyectos.json', copyA)
    await p.waitForSelector('[data-testid="restore-plan"]')
    await p.locator('[data-testid="restore-unit"][data-state="solo-en-copia"] input').check()
    await p.getByTestId('restore-sure').check()
    await p.getByTestId('current-copy-save').click()
    await p.getByTestId('current-copy-outcome').waitFor()
    check(
      'precisión 1 · share sheet cancelled: nothing recorded, no confirmation offered, confirm disabled',
      (await p.getByTestId('current-copy-outcome').getAttribute('data-recorded')) === '0' && (await p.getByTestId('current-copy-confirm').count()) === 0 && (await confirmBtn(p).isDisabled()),
    )
    await p.close()
  }

  // ── 9 · Only PROYECTOS' five keys ──────────────────────────────────────────
  check('only PROYECTOS’ five keys exist under elyum:projects:', (await ownKeys(page)).every((k) => OWN.has(k)), (await ownKeys(page)).join(', '))
  const othersAfter = await others(page)
  check('HOY, SEMANA, APRENDER and the test store: every other key byte-identical (ELYUM’s own «last active» stamp aside)', othersAfter === othersBefore, othersAfter === othersBefore ? '' : `antes ${othersBefore} · después ${othersAfter}`)
  for (const [k, v] of Object.entries(SENTINELS)) if ((await getKey(page, k)) !== v) check(`sentinel ${k} intact`, false)
  await context.close()

  // ── 10 · No Web Locks: read-only ───────────────────────────────────────────
  {
    const ro = await browser.newContext(IPHONE)
    await ro.addInitScript(() => {
      delete Navigator.prototype.locks
    })
    const p = await openElyum(ro, '#/recuperar')
    await p.getByTestId('target-note').waitFor()
    await pick(p, 'elyum-proyectos.json', copyA)
    await p.waitForSelector('[data-testid="restore-plan"]')
    await p.getByTestId('restore-all').check()
    await p.getByTestId('restore-sure').check()
    await confirmBtn(p).click()
    await p.getByTestId('restore-result').waitFor()
    check('no Web Locks: refused as read-only, nothing written', (await p.getByTestId('restore-result').getAttribute('data-reason')) === 'solo-lectura' && (await getKey(p, DATA_KEY)) === null && (await getKey(p, JOURNAL_KEY)) === null)
    await ro.close()
  }
} catch (e) {
  check('run finished', false, e instanceof Error ? e.stack : String(e))
} finally {
  await browser.close()
  await server.close()
}
const ok = results.filter((r) => r.ok).length
console.log(`\n${ok}/${results.length} comprobaciones · capturas en ${SHOTS}`)
process.exit(ok === results.length ? 0 : 1)
