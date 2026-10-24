#!/usr/bin/env node
// Scope guard for the PROYECTOS packages: fails if a branch changes anything outside what its package was approved to touch.
//   node scripts/check-scope.mjs p2            (compares against main, committed + uncommitted changes)
//   node scripts/check-scope.mjs p1 origin/main
import { execSync } from 'node:child_process'

const SHARED = ['docs/proyectos/', 'scripts/check-scope.mjs']
const ALLOWED = {
  // P2 · Copias de seguridad: its own modules plus the approved core touch points (E3/E4/E8).
  p2: ['src/features/backup/', 'src/features/system/', 'src/App.tsx', 'src/layout/sections.ts', 'src/pwa/moment.ts', 'README.md', ...SHARED],
  // P1 · Modelo de PROYECTOS: pure domain only. No navigation, HOY, FOCUS, SEMANA or APRENDER.
  p1: ['src/features/projects/', ...SHARED],
  // P3 · Almacén e importación de PROYECTOS: its own module and its browser test harness. No navigation yet.
  p3: ['src/features/projects/', 'e2e/projects/', ...SHARED],
  // P4a · Pantallas de PROYECTOS en su página de prueba (proyectos.html); vite.config.ts solo con aprobación. Sin navegación (P4c).
  p4a: ['src/features/projects/', 'e2e/projects/', 'proyectos.html', 'vite.config.ts', ...SHARED],
}
// Never, in any package of PROYECTOS.
const FORBIDDEN = ['src/features/learn/', 'src/data/routine/', 'src/state/', 'src/domain/', 'src/features/focus/', 'src/features/week/', 'src/features/today/', 'src/features/dayscape/', 'src/features/entry/']

const [pkg, base = 'main'] = process.argv.slice(2)
if (!ALLOWED[pkg]) {
  console.error(`Paquete desconocido: ${pkg}. Usa: ${Object.keys(ALLOWED).join(', ')}`)
  process.exit(2)
}
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).split('\n').filter(Boolean)
const files = [...new Set([...sh(`git diff --name-only ${base}...HEAD`), ...sh('git diff --name-only HEAD'), ...sh('git ls-files --others --exclude-standard')])].sort()
const inside = (f, list) => list.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p))
const forbidden = files.filter((f) => inside(f, FORBIDDEN))
const outside = files.filter((f) => !inside(f, ALLOWED[pkg]))

console.log(`${pkg}: ${files.length} archivos cambiados frente a ${base}`)
for (const f of files) console.log(`  ${inside(f, ALLOWED[pkg]) ? '✓' : '✗'} ${f}`)
if (forbidden.length || outside.length) {
  if (forbidden.length) console.error(`\nPROHIBIDO (núcleo o APRENDER): ${forbidden.join(', ')}`)
  if (outside.length) console.error(`\nFuera del alcance aprobado de ${pkg}: ${outside.join(', ')}`)
  process.exit(1)
}
console.log('\nAlcance correcto.')
