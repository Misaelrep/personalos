#!/usr/bin/env node
// P2-R1.4 · Mixed versions on ONE origin: the version in production before this change (77656f9, where Recuperar
// is not offered inside ELYUM) and this one, open at the same time over the same localStorage, as two windows of
// the same site would be while the installed app has not yet updated. Production builds, service workers blocked.
//   node e2e/projects/mixed-versions.mjs
//   MIXED_OLD_REF=<commit>   the old version (default 77656f92ecca08b368712bd92d5009427f46888b)
// Builds both (the old one from a temporary git worktree) and serves them: / → this version, /old/ → the old one.
// Invented data only. The interruption is SIMULATED (a planted open journal).
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = await import('playwright'))
}

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const OLD_REF = process.env.MIXED_OLD_REF ?? '77656f92ecca08b368712bd92d5009427f46888b'
const PORT = 4337
const DATA_KEY = 'elyum:projects:v1:data'
const JOURNAL_KEY = 'elyum:projects:v1:antes-de-recuperar'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── Builds ───────────────────────────────────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), 'p2r14-mixed-'))
const oldTree = join(work, 'old-tree')
const oldDist = join(work, 'old-dist')
const newDist = join(work, 'new-dist')
const env = { ...process.env, VERCEL_ENV: 'production' }
execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', oldTree, OLD_REF], { stdio: 'ignore' })
symlinkSync(join(ROOT, 'node_modules'), join(oldTree, 'node_modules'))
execFileSync('npx', ['vite', 'build', '--base=/old/', '--outDir', oldDist, '--emptyOutDir'], { cwd: oldTree, env, stdio: 'ignore' })
execFileSync('npx', ['vite', 'build', '--outDir', newDist, '--emptyOutDir'], { cwd: ROOT, env, stdio: 'ignore' })
const oldHead = execFileSync('git', ['-C', oldTree, 'rev-parse', 'HEAD']).toString().trim()
console.log(`· old version ${oldHead} · new version ${execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD']).toString().trim()} (+ working tree)`)

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' }
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const [dir, path] = url.pathname.startsWith('/old/') ? [oldDist, url.pathname.slice(5)] : [newDist, url.pathname.slice(1)]
  let file = normalize(join(dir, path || 'index.html'))
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch()
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true }
const getKey = (page, k) => page.evaluate((key) => localStorage.getItem(key), k)
const go = async (page, hash) => {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.waitForTimeout(250)
}
async function openAt(context, prefix, hash = '#/') {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror ${prefix}]`, e.message))
  await page.goto(`http://localhost:${PORT}${prefix}?entry=none&section=proyectos${hash}`)
  await page.waitForSelector('[data-testid="projects-section"]')
  await page.waitForTimeout(300)
  return page
}
const cards = async (page) => (await page.locator('[data-testid="project-card"]').allInnerTexts()).map((t) => t.split('\n')[0])
async function createProject(page, name) {
  await go(page, '#/nuevo-proyecto')
  await page.getByTestId('project-name').fill(name)
  await page.getByTestId('project-objective').fill(`Objetivo inventado de ${name}`)
  await page.waitForTimeout(150)
  if (await page.getByTestId('distinct').count()) await page.getByTestId('distinct').check()
  await page.getByTestId('create-project').click()
  await page.waitForTimeout(300)
}
const sha = (page, t) => page.evaluate(async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''), t)

try {
  const context = await browser.newContext(IPHONE)
  const now = await openAt(context, '/')
  for (const n of ['Uno de prueba', 'Dos de prueba']) await createProject(now, n)
  const old = await openAt(context, '/old/')
  await go(old, '#/')
  check('both versions open the same PROYECTOS', JSON.stringify((await cards(old)).sort()) === JSON.stringify(['Dos de prueba', 'Uno de prueba']))
  check('the old version does not offer Recuperar inside ELYUM (as in production today)', (await old.getByTestId('go-restore').count()) === 0)
  await go(now, '#/')
  check('this version offers it', (await now.getByTestId('go-restore').count()) === 1)

  // An unresolved recovery left by the new version.
  const raw = await getKey(now, DATA_KEY)
  const planted = {
    format: 'elyum-projects-restore/1', state: 'en-curso', startedAt: new Date().toISOString(), writer: 'e2e', baseGeneration: JSON.parse(raw).generation,
    before: raw, beforeSha256: await sha(now, raw), targetSha256: '0'.repeat(64), source: { exportedAt: new Date().toISOString(), storedSha256: '1'.repeat(64), generation: 1 }, summary: 'Recuperación simulada (prueba)',
  }
  await now.evaluate(([k, v]) => localStorage.setItem(k, v), [JOURNAL_KEY, JSON.stringify(planted)])
  await old.waitForSelector('[data-testid="pending-recovery"]', { timeout: 5000 })
  await go(old, '#/nuevo-proyecto')
  await old.getByTestId('project-name').fill('Intento desde la versión antigua')
  await old.getByTestId('project-objective').fill('No debería guardarse')
  await old.waitForTimeout(200)
  check('the old version sees the unresolved recovery and offers no writes', (await old.getByTestId('create-project').isDisabled()) && (await getKey(old, DATA_KEY)) === raw)
  check('the old version’s notice still says Recuperar is not enabled (outdated text, documented)', (await old.getByTestId('pending-recovery').innerText()).includes('aún no está habilitado'))

  // Resolved from this version: the old one may write again.
  await go(now, '#/recuperar')
  await now.getByTestId('journal-settle').click()
  await now.waitForFunction(() => !document.querySelector('[data-testid="journal-open"]'))
  await old.waitForTimeout(600)
  await go(old, '#/')
  check('resolved in this version: the old one drops the notice', (await old.getByTestId('pending-recovery').count()) === 0)

  // A real recovery from this version, while the old one is open.
  await go(now, '#/exportar')
  await now.getByTestId('export').click()
  await now.waitForSelector('[data-testid="export-result"]')
  const [d] = await Promise.all([now.waitForEvent('download'), now.getByTestId('save-export').click()])
  const copy = readFileSync(await d.path(), 'utf8')
  await createProject(old, 'Tres desde la versión antigua')
  await now.waitForTimeout(400)
  await go(now, '#/recuperar')
  await now.setInputFiles('[data-testid="restore-input"]', { name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(copy) })
  await now.waitForSelector('[data-testid="restore-plan"]')
  await now.getByTestId('restore-all').check()
  await now.getByTestId('restore-sure').check()
  await Promise.all([now.waitForEvent('download'), now.getByTestId('current-copy-save').click()])
  await now.getByTestId('current-copy-confirm').check()
  await now.waitForTimeout(200)
  await now.getByTestId('restore-confirm').click()
  await now.waitForSelector('[data-testid="restore-result"][data-ok="true"]')
  await old.waitForTimeout(600)
  await go(old, '#/')
  check('after the recovery the old version re-read the data (the project created there after the copy is gone)', !(await cards(old)).includes('Tres desde la versión antigua') && (await cards(old)).length === 2, (await cards(old)).join(' · '))
  const afterRestore = await getKey(now, DATA_KEY)
  // The old version, writing after the recovery: on top of it, at the next generation.
  await createProject(old, 'Cuatro desde la versión antigua')
  const after = JSON.parse(await getKey(now, DATA_KEY))
  check('the old version saves on top of the recovered data, never over it (generation moved on)', after.generation === JSON.parse(afterRestore).generation + 1 && after.data.projects.length === 3)
  await context.close()
} catch (e) {
  check('run finished', false, e instanceof Error ? e.stack : String(e))
} finally {
  await browser.close()
  server.close()
  execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', oldTree], { stdio: 'ignore' })
  rmSync(work, { recursive: true, force: true })
}
const ok = results.filter((r) => r.ok).length
console.log(`\n${ok}/${results.length} comprobaciones (versiones mezcladas)`)
process.exit(ok === results.length ? 0 : 1)
