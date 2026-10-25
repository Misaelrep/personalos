#!/usr/bin/env node
// P4c (preparación) · PROYECTOS as a section of ELYUM, in a real browser (Chromium via Playwright, iPhone-sized).
//   node e2e/projects/integration.mjs
//   P4C_SHOTS=/some/dir   where screenshots go (default: a temp dir)
// The navigation shows the sections; each opens and leaves without errors; PROYECTOS keeps its own routes
// and its own keys; HOY, SEMANA and APRENDER still open. The entry ritual is skipped with ?entry=none.
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

const PORT = 4333
const BASE = `http://localhost:${PORT}/`
const SHOTS = process.env.P4C_SHOTS ?? mkdtempSync(join(tmpdir(), 'p4c-shots-'))
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const note = (name, detail) => console.log(`· ${name} — ${detail}`)

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }

try {
  const context = await browser.newContext(IPHONE)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const nav = page.locator('nav.bottom-nav, nav[aria-label="Secciones"]').last()
  const tab = (name) => nav.getByRole('button', { name })

  await page.goto(`${BASE}?entry=none`)
  await page.waitForTimeout(2500)
  const labels = (await nav.innerText()).split('\n').map((s) => s.trim()).filter(Boolean)
  check('bottom navigation lists Hoy · Semana · Proyectos · Aprender', JSON.stringify(labels) === JSON.stringify(['HOY', 'SEMANA', 'PROYECTOS', 'APRENDER']), labels.join(' · '))
  const boxes = await nav.locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)] }))
  const fits = boxes.every(([l, r]) => l >= 0 && r <= 390)
  note('bottom navigation fits 390 px', fits ? 'sí' : `no: ${JSON.stringify(boxes)} (ajuste de NavRail.tsx pendiente de aprobación)`)
  await page.screenshot({ path: join(SHOTS, '21-p4c-hoy.png') })

  await tab('Proyectos').click()
  await page.waitForSelector('[data-testid="projects-section"]')
  check('Proyectos opens the PROYECTOS section, writable', (await page.getByTestId('mode').getAttribute('data-mode')) === 'escritura')
  check('inside ELYUM there is no «prueba» label or build stamp', (await page.getByTestId('build').count()) === 0 && !(await page.locator('[data-testid="projects-section"]').innerText()).includes('Prueba · datos sintéticos'))
  await page.screenshot({ path: join(SHOTS, '22-p4c-proyectos.png') })
  await page.getByTestId('go-review').click()
  await page.waitForTimeout(300)
  check('PROYECTOS routes work inside ELYUM (#/semana)', page.url().endsWith('#/semana') && (await page.getByText('Revisión semanal').count()) > 0)

  await tab('Semana').click()
  await page.waitForTimeout(800)
  check('Semana still opens; PROYECTOS leaves', (await page.locator('[data-testid="projects-section"]').count()) === 0)
  await tab('Aprender').click()
  await page.waitForTimeout(1500)
  const learnNav = await tab('Proyectos').isVisible().catch(() => false)
  note('Aprender', learnNav ? 'abre; la navegación sigue visible' : 'abre en modo inmersivo (primera entrada del día): la navegación se oculta')
  if (!learnNav) {
    await page.mouse.click(195, 400)
    await page.waitForTimeout(1500)
  }
  await tab('Proyectos').click()
  await page.waitForSelector('[data-testid="projects-section"]')
  check('back to Proyectos: it keeps the screen it was on', page.url().endsWith('#/semana'))
  await tab('Hoy').click()
  await page.waitForTimeout(800)
  check('Hoy still opens; PROYECTOS leaves', (await page.locator('[data-testid="projects-section"]').count()) === 0)

  const page2 = await context.newPage()
  await page2.goto(`${BASE}?entry=none&section=proyectos`)
  await page2.waitForSelector('[data-testid="projects-section"]', { timeout: 8000 })
  check('?section=proyectos opens straight onto PROYECTOS', true)
  check('no page errors', errors.length === 0, errors.join(' | '))
  await context.close()
} catch (e) {
  check('run finished', false, e instanceof Error ? e.stack : String(e))
} finally {
  await browser.close()
  await server.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones · capturas en ${SHOTS}`)
process.exit(failed.length ? 1 : 0)
