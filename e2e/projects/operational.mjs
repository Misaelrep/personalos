#!/usr/bin/env node
// Synthetic only. Incognito contexts, loopback dev server, actual operational keys. No production URL.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
const { chromium } = createRequire(import.meta.url)('playwright')
// LAB_BASE: run the same checks through the temporary HTTPS access (operational-https.mjs starts the server and the TLS front).
const external = process.env.LAB_BASE
const server = external ? undefined : await createServer({ server: { host: '127.0.0.1', port: 4333, strictPort: true }, logLevel: 'error' })
const tls = external ? { ignoreHTTPSErrors: true } : {} // the test's own self-signed certificate
let browser
const base = external ?? 'http://127.0.0.1:4333'
const key = 'elyum:projects:v1:data'
const journalKey = 'elyum:projects:v1:antes-de-recuperar'
const labKey = 'elyum:lab:p2r1:run'
const checks = []
const check = (name, condition) => { assert(condition, name); checks.push(name); console.log('✓', name) }
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key)
const snapshot = (page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])))
async function open(context) {
  const page = await context.newPage()
  await page.goto(base + '/e2e/projects/operational.html')
  await page.getByTestId('lab-start').click()
  await page.getByTestId('operational-lab').waitFor()
  return page
}
async function choose(page, text) {
  await page.getByTestId('restore-input').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(text) })
}
async function confirm(page) {
  await page.getByTestId('restore-sure').check()
  await page.getByTestId('restore-confirm').click()
  await page.getByTestId('restore-result').waitFor()
}
try {
  await server?.listen()
  browser = await chromium.launch(process.env.LAB_RESOLVE ? { args: [`--host-resolver-rules=${process.env.LAB_RESOLVE}`, '--proxy-server=direct://'] } : {})
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, ...tls })
  const page = await open(context)
  check('seed: operational data key with six invented projects', (await stored(page)).data.projects.length === 6)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lab-export').click()])
  const text = Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8')
  const copy = JSON.parse(text)
  check('download is the exact synthetic operational envelope', copy.stored === await page.evaluate(k => localStorage.getItem(k), key))
  await page.getByTestId('lab-copy-confirm').check()
  await page.getByTestId('lab-lose').click()
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k)).data.projects.length === 5, key)
  // A genuine export from a second disposable context is valid, but belongs to another run.
  const foreignContext = await browser.newContext({ serviceWorkers: 'block', ...tls })
  const foreignPage = await open(foreignContext)
  const foreignText = await foreignPage.evaluate(async () => (await (await import('/src/features/projects/store/export.ts')).exportProjects(localStorage, new Date().toISOString())).text)
  const beforeForeign = await snapshot(page)
  await choose(page, foreignText)
  await page.getByTestId('backup-problem').waitFor()
  check('foreign-run backup rejected before any write', beforeForeign === await snapshot(page))
  await foreignContext.close()
  await choose(page, text)
  await page.getByTestId('restore-plan').waitFor()
  const first = JSON.parse(copy.stored).data.projects[0].id
  await page.locator(`[data-unit="proyecto:${first}"] input`).check()
  await confirm(page)
  check('selective recovery succeeds', await page.getByTestId('restore-result').getAttribute('data-ok') === 'true')
  check('actual operational journal and data agree', (await stored(page)).data.projects.length === 6 && await page.evaluate(k => JSON.parse(localStorage.getItem(k)).state === 'completada', journalKey))
  await page.waitForFunction(() => document.querySelector('[data-testid="lab-session"]').textContent.includes('6 proyectos'))
  check('normal session refreshed after recovery', true)
  await page.getByTestId('journal-undo').click()
  await page.getByTestId('restore-all').check()
  await confirm(page)
  check('undo uses the same operative store', (await stored(page)).data.projects.length === 5)
  // A local change from another tab must invalidate an already prepared recovery.
  await choose(page, text)
  await page.locator(`[data-unit="proyecto:${first}"] input`).check()
  const other = await open(context)
  const generation = (await stored(page)).generation
  await other.getByTestId('lab-edit').click()
  await other.waitForFunction(([k, g]) => JSON.parse(localStorage.getItem(k)).generation > g, [key, generation])
  const beforeConflict = await snapshot(page)
  await confirm(page)
  check('another tab causes conflict without changing any key', await page.getByTestId('restore-result').getAttribute('data-reason') === 'conflicto' && beforeConflict === await snapshot(page))
  const regular = await context.newPage()
  await regular.goto(base + '/proyectos.html#/recuperar')
  await regular.getByTestId('target-note').waitFor()
  check('regular recovery route remains sandboxed', (await regular.getByTestId('target-note').innerText()).includes('almacén de prueba separado'))
  const keys = await page.evaluate(() => Object.keys(localStorage))
  check('only operational keys and the lab marker were created', keys.every(k => k === labKey || k === key || k === journalKey || /^elyum:projects:v1:prev:[123]$/.test(k)))
  const protectedContext = await browser.newContext({ serviceWorkers: 'block', ...tls })
  const protectedPage = await protectedContext.newPage()
  await protectedPage.goto(base + '/e2e/projects/operational.html')
  await protectedPage.evaluate(() => localStorage.setItem('personal-os:synthetic-sentinel', 'untouched'))
  const beforeRefusal = await snapshot(protectedPage)
  await protectedPage.getByTestId('lab-start').click()
  await protectedPage.getByRole('alert').waitFor()
  check('prepopulated origin is refused intact', beforeRefusal === await snapshot(protectedPage))
  await protectedContext.close()
  await context.close()
  console.log(`${checks.length}/${checks.length} operational-key checks passed`)
} finally {
  await browser?.close()
  await server?.close()
}
