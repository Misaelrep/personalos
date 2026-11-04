#!/usr/bin/env node
// P2-R1.4 · What each build contains. Builds production and preview into temporary folders and checks:
//  - production: no test page, and NO JavaScript file (entry or separate chunk) holds the synthetic tools,
//    the synthetic dossiers, the iPhone check or the lab;
//  - preview: the test page exists and the tools live only in its own chunk, not in what ELYUM loads.
//   node e2e/projects/check-build.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
// Text that only the test tools, the synthetic dossiers, the iPhone check or the lab contain.
const MARKERS = ['Cargar datos sintéticos', 'Copiar aquí PROYECTOS', 'Borrar el almacén de prueba', 'HUERTO DE PRUEBA', 'TALLER DE PRUEBA', 'DOSSIER_SINTETICO', 'Huerto de prueba', 'Prueba del iPhone', 'elyum:prueba-p4a', 'elyum:prueba-p2r1:', 'Prueba · datos sintéticos', 'Laboratorio local', 'elyum:lab:p2r1', 'operational.html']
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const work = mkdtempSync(join(tmpdir(), 'p2r14-builds-'))
const build = (env) => {
  const out = join(work, env)
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, VERCEL_ENV: env }, stdio: 'ignore' })
  return out
}
const jsFiles = (dir) => readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js'))
const found = (dir, files, markers = MARKERS) => markers.filter((m) => files.some((f) => readFileSync(join(dir, 'assets', f), 'utf8').includes(m)))
const loadedBy = (dir, html) => [...readFileSync(join(dir, html), 'utf8').matchAll(/assets\/([^"]+\.js)/g)].map((m) => m[1])

try {
  const prod = build('production')
  const pFiles = jsFiles(prod)
  check('production: no test page', !existsSync(join(prod, 'proyectos.html')))
  const pHits = found(prod, pFiles)
  check(`production: none of the ${pFiles.length} JavaScript files holds test-only code`, pHits.length === 0, pHits.length ? pHits.join(', ') : pFiles.join(', '))
  check('production: ELYUM still has Recuperar on PROYECTOS', pFiles.some((f) => readFileSync(join(prod, 'assets', f), 'utf8').includes('tus datos de PROYECTOS')))

  const prev = build('preview')
  check('preview: the test page exists', existsSync(join(prev, 'proyectos.html')))
  const elyum = loadedBy(prev, 'index.html')
  const page = loadedBy(prev, 'proyectos.html')
  // In preview the engine (store/restore.ts, unchanged) sits in a chunk shared by both pages, with its
  // SANDBOX_PREFIX constant: a name, not test code. Production does not have it (checked above).
  const eHits = found(prev, elyum, MARKERS.filter((m) => m !== 'elyum:prueba-p2r1:'))
  check('preview: what ELYUM loads holds no test-only code', eHits.length === 0, eHits.length ? eHits.join(', ') : elyum.join(', '))
  const tHits = found(prev, page)
  check('preview: the test page carries the tools, the synthetic dossiers and the iPhone check', ['Cargar datos sintéticos', 'HUERTO DE PRUEBA', 'Prueba del iPhone'].every((m) => tHits.includes(m)), page.join(', '))
  check('preview: the lab is not built (development only)', !tHits.includes('Laboratorio local') && !tHits.includes('elyum:lab:p2r1'))
} catch (e) {
  check('run finished', false, e instanceof Error ? e.message : String(e))
} finally {
  rmSync(work, { recursive: true, force: true })
}
console.log(`\n${results.filter(Boolean).length}/${results.length} comprobaciones de los builds`)
process.exit(results.every(Boolean) ? 0 : 1)
