#!/usr/bin/env node
// P4b · Every new write of PROYECTOS in a real browser (Chromium via Playwright, iPhone-sized), synthetic data only.
//   node e2e/projects/operations.mjs
//   P4B_SHOTS=/some/dir   where screenshots go (default: a temp dir)
// A complete synthetic weekly review: six projects (two imported, four created, one duplicate refused),
// a condition met, an agent assignment, capacity and commitments, executed → returned → approved with
// evidence and verification; then persistence after reload, a stale tab refused, and read-only without locks.
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync } from 'node:fs'
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

const PORT = 4329
const URL = `http://localhost:${PORT}/proyectos.html`
const DATA_KEY = 'elyum:projects:v1:data'
const SHOTS = process.env.P4B_SHOTS ?? mkdtempSync(join(tmpdir(), 'p4b-shots-'))
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }

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
const stored = async (page) => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), DATA_KEY)) ?? 'null')
const body = (page) => page.locator('body').innerText()
const go = async (page, hash) => {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.waitForTimeout(150)
}
const taskHash = (sid) => `#/tarea/${encodeURIComponent(`src:${sid}`)}`
/** Wait for the write outcome and return it; dismiss it so the next one is fresh. */
async function outcome(page) {
  const o = page.getByTestId('outcome')
  await o.waitFor()
  const r = { ok: (await o.getAttribute('data-ok')) === '1', text: await o.innerText() }
  await o.click()
  await o.waitFor({ state: 'detached' })
  return r
}

async function importSynthetic(page, button, classes) {
  await go(page, '#/')
  await go(page, '#/importar')
  await page.getByRole('button', { name: button }).click()
  await page.waitForSelector('[data-testid="preview"]')
  for (const [literal, cls] of Object.entries(classes)) await page.selectOption(`[data-testid="class-${literal}"]`, cls)
  await page.waitForTimeout(150)
  await page.getByTestId('confirm').click()
  await page.waitForSelector('[data-testid="import-done"]')
}

async function createProject(page, name, objective) {
  await go(page, '#/')
  await go(page, '#/nuevo-proyecto')
  await page.fill('[data-testid="project-name"]', name)
  await page.fill('[data-testid="project-objective"]', objective)
  await page.getByTestId('create-project').click()
  await page.waitForSelector('[data-testid="stage-strip"]')
  return outcome(page)
}

try {
  // A page opened with «?dormida» never hears that another tab saved (like a tab that was asleep).
  const { context, open } = await fresh(() => {
    if (!location.search.includes('dormida')) return
    const w = window.addEventListener.bind(window)
    window.addEventListener = (type, ...rest) => (type === 'storage' ? undefined : w(type, ...rest))
    const d = document.addEventListener.bind(document)
    document.addEventListener = (type, ...rest) => (type === 'visibilitychange' ? undefined : d(type, ...rest))
  })
  const page = await open()

  // ── 1 · Six synthetic projects ───────────────────────────────────────────────
  await importSynthetic(page, 'Huerto v1', { Pendiente: 'pendiente', 'No iniciado': 'pendiente' })
  await importSynthetic(page, 'Taller', { Pendiente: 'pendiente', Hecho: 'ejecutada' })
  for (const n of ['Cocina', 'Biblioteca', 'Bicicleta', 'Acuario']) {
    const r = await createProject(page, `${n} de prueba`, `Objetivo inventado: ${n.toLowerCase()} en orden`)
    if (!r.ok) check(`create ${n}`, false, r.text)
  }
  let d = (await stored(page)).data
  check('six projects: two imported, four created with generated ids', d.projects.length === 6 && d.projects.filter((p) => p.id.startsWith('new:')).length === 6 && d.projects.filter((p) => p.dossier.startsWith('elyum:')).length === 4, d.projects.map((p) => p.name).join(', '))

  await go(page, '#/')
  await go(page, '#/nuevo-proyecto')
  await page.fill('[data-testid="project-name"]', 'huerto de PRUEBA')
  await page.waitForTimeout(100)
  const dupBlocked = await page.getByTestId('create-project').isDisabled()
  check('a similar name is shown and creating needs an explicit «distinto»', (await page.getByTestId('similar').innerText()).includes('HUERTO DE PRUEBA') && dupBlocked)
  await shot(page, '12-nuevo-proyecto-parecido.png')
  await page.getByTestId('distinct').check()
  check('after «es distinto» it can be created (not done here)', !(await page.getByTestId('create-project').isDisabled()))

  // ── 2 · Requirement: condition met → candidate ──────────────────────────────
  await go(page, taskHash('HUE-01'))
  await page.locator('[data-testid="condition-control"] button', { hasText: /^Cumplida$/ }).click()
  let o = await outcome(page)
  check('condition marked met: saved, task becomes «Lista»', o.ok && (await page.locator('main, body').first().innerText()).includes('Se puede hacer ahora'), o.text)

  // ── 3 · Agent assignment ────────────────────────────────────────────────────
  await go(page, taskHash('TAL-03'))
  await page.locator('[data-testid="owner-control"] button', { hasText: 'Claude Code' }).click()
  o = await outcome(page)
  await page.fill('[data-testid="next-input"]', 'Redactar el inventario a partir de inventario_ficticio.md')
  await page.getByTestId('next-save').click()
  const o2 = await outcome(page)
  check('assignment to Claude Code with its instruction', o.ok && o2.ok && (await body(page)).includes('Encargo · Claude Code'))
  d = (await stored(page)).data
  const talId = d.tasks.find((t) => t.sourceId === 'TAL-03').projectId
  await go(page, `#/proyecto/${encodeURIComponent(talId)}`)
  const pv = await body(page)
  check('project: the assignment is listed apart from the person’s next actions', /ENCARGOS A AGENTES\s*1/i.test(pv) && pv.includes('Claude Code · Redactar el inventario'))
  await page.locator('text=Encargos a agentes').first().scrollIntoViewIfNeeded()
  await shot(page, '11-proyecto-encargos.png')

  // ── 4 · Weekly review ───────────────────────────────────────────────────────
  await go(page, '#/semana')
  const projectsInReview = await page.locator('[data-testid="review-projects"] > div').count()
  check('review shows the six projects', projectsInReview === 6)
  const cands = await page.locator('[data-testid="candidates"] > div').allInnerTexts()
  check('candidates: HUE-01 and TAL-01 only (TAL-03 is the agent’s)', cands.length === 2 && cands[0].includes('HUE-01') && cands[1].includes('TAL-01'), cands.map((c) => c.split('\n')[0]).join(' · '))
  check('nothing committed by itself', (await body(page)).includes('Ninguno todavía'))
  await page.fill('[data-testid="capacity"]', '3')
  await page.fill('[data-testid="wip"]', '2')
  await page.getByTestId('limits-save').click()
  o = await outcome(page)
  const row = (sid) => page.locator('[data-testid="candidates"] > div', { hasText: sid })
  await row('HUE-01').locator('[data-testid="commit-hours"]').fill('1')
  await row('HUE-01').getByTestId('commit').click()
  const c1 = await outcome(page)
  await row('TAL-01').locator('[data-testid="commit-hours"]').fill('0,5')
  await row('TAL-01').getByTestId('commit').click()
  const c2 = await outcome(page)
  const load = (await page.getByTestId('load').innerText()).replace(/\s+/g, ' ')
  check('capacity 3 h / 2 commitments: 1.5 h committed, none left', o.ok && c1.ok && c2.ok && load.includes('1.5 h / 3 h') && load.includes('Quedan 1.5 h') && load.includes('2 / 2') && load.includes('Caben 0 más'), load)
  check('awaiting approval lists TAL-04 (imported «Hecho», no approval data)', (await page.getByTestId('awaiting').innerText()).includes('TAL-04'))
  check('agents section lists TAL-03 apart', (await page.getByTestId('agents').innerText()).includes('TAL-03'))
  await page.getByTestId('close-review').click()
  o = await outcome(page)
  check('review closed and recorded', o.ok && (await body(page)).includes('Revisión cerrada'))
  await shot(page, '09-revision-semanal.png')

  // Over the limit: a warning, never a refusal.
  await go(page, '#/')
  await go(page, '#/semana')
  await page.fill('[data-testid="wip"]', '1')
  await page.getByTestId('limits-save').click()
  await outcome(page)
  check('lowering the limit warns, keeps both commitments', (await page.getByTestId('warnings').innerText()).includes('Tienes 2 compromisos y tu límite es 1') && (await page.locator('[data-testid="commitments"] > div').count()) === 2)
  await page.fill('[data-testid="wip"]', '2')
  await page.getByTestId('limits-save').click()
  await outcome(page)

  // ── 5 · Executed → evidence → returned → approved; verification apart ───────
  await go(page, taskHash('TAL-03'))
  await page.selectOption('[data-testid="status-select"]', 'Ejecutada')
  await page.getByTestId('status-save').click()
  o = await outcome(page)
  check('status changed explicitly to «Ejecutada» (ELYUM word added): waits for approval', o.ok && (await body(page)).includes('Ejecutada; falta tu decisión'))
  await page.fill('[data-testid="evidence-label"]', 'Inventario v1')
  await page.fill('[data-testid="evidence-url"]', 'https://example.invalid/inventario')
  await page.getByTestId('evidence-save').click()
  o = await outcome(page)
  check('evidence link added', o.ok && (await body(page)).includes('Inventario v1'))
  check('returning needs a reason', await page.getByTestId('return').isDisabled())
  await page.fill('[data-testid="approval-note"]', 'Faltan las brocas')
  await page.getByTestId('return').click()
  o = await outcome(page)
  const ret = await body(page)
  check('returned: reopened with its reason, not closed', o.ok && ret.includes('Devuelta') && ret.includes('Última nota: Faltan las brocas') && !ret.includes('Hecha o descartada'))
  await page.locator('[data-testid="approval-control"]').scrollIntoViewIfNeeded()
  await shot(page, '10-tarea-devuelta.png')
  await page.fill('[data-testid="evidence-label"]', 'Brocas añadidas al inventario')
  await page.getByTestId('evidence-save').click()
  await outcome(page)
  await page.getByTestId('approve').click()
  o = await outcome(page)
  const track = (await page.getByTestId('track').innerText()).replace(/\s+/g, ' ')
  check('approved: closed; verification still «Sin dato»', o.ok && (await body(page)).includes('Hecha o descartada') && /Verificada Sin dato/i.test(track) && /Aprobada Aprobada/i.test(track), track)
  await page.locator('[data-testid="verify-control"] button', { hasText: /^Verificada$/ }).click()
  o = await outcome(page)
  check('verified separately', o.ok && /Verificada Verificada/i.test((await page.getByTestId('track').innerText()).replace(/\s+/g, ' ')))
  await shot(page, '13-tarea-aprobada.png')
  d = (await stored(page)).data
  const t3 = d.tasks.find((t) => t.sourceId === 'TAL-03')
  check(
    'stored: dossier origin intact, history has every step',
    t3.origin.raw.includes('| Pendiente |') &&
      ['owner', 'nextAction', 'status', 'evidence', 'approval', 'verification'].every((f) => d.history.some((h) => h.id === t3.id && h.field === f)) &&
      d.history.filter((h) => h.id === t3.id && h.field === 'approval').map((h) => h.to.state).join(',') === 'devuelta,aprobada',
  )

  // ── 6 · Persistence ─────────────────────────────────────────────────────────
  const before = await stored(page)
  await page.reload()
  await page.waitForSelector('[data-testid="build"]')
  await go(page, '#/semana')
  const after = await stored(page)
  check('after reload: same generation, commitments and closed review on screen', after.generation === before.generation && (await page.locator('[data-testid="commitments"] > div').count()) === 2 && (await body(page)).includes('Revisión cerrada'))

  // ── 7 · A stale tab is refused, then works after re-reading ─────────────────
  const stale = await context.newPage()
  await stale.goto(URL.replace('proyectos.html', 'proyectos.html?dormida') + taskHash('TAL-02'))
  await stale.waitForSelector('[data-testid="build"]')
  const other = await open(taskHash('TAL-01'))
  await other.fill('[data-testid="next-input"]', 'Retirar las cajas de la mesa')
  await other.getByTestId('next-save').click()
  await outcome(other)
  const genOther = (await stored(other)).generation
  await stale.fill('[data-testid="next-input"]', 'Probar etiquetas de colores')
  await stale.getByTestId('next-save').click()
  o = await outcome(stale)
  const afterStale = await stored(stale)
  check('stale tab: refused visibly, the other tab’s change kept, nothing written', !o.ok && o.text.includes('Otra pestaña') && afterStale.generation === genOther && afterStale.data.tasks.find((t) => t.sourceId === 'TAL-01').nextAction === 'Retirar las cajas de la mesa', o.text)
  await stale.getByTestId('next-save').click()
  o = await outcome(stale)
  const both = await stored(stale)
  check('after re-reading, the retry saves and both changes are there', o.ok && both.data.tasks.find((t) => t.sourceId === 'TAL-02').nextAction === 'Probar etiquetas de colores' && both.data.tasks.find((t) => t.sourceId === 'TAL-01').nextAction === 'Retirar las cajas de la mesa')
  await context.close()

  // ── 8 · Read-only without Web Locks ─────────────────────────────────────────
  {
    const ro = await fresh(() => {
      delete Navigator.prototype.locks
    })
    const p = await ro.open('#/semana')
    check('no Web Locks: review has no write controls', (await p.getByTestId('capacity').count()) === 0 && (await p.getByTestId('close-review').count()) === 0)
    await go(p, '#/nuevo-proyecto')
    check('no Web Locks: cannot create a project', await p.getByTestId('create-project').isDisabled())
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
