// P2 demonstration on the real built app (proyectos/p2-copias), with SYNTHETIC data only.
// Each browser context has its own, separate storage: A = the "iPhone" with data, B = an empty device,
// C = a device with conflicting / local-only data, D = a storage that fails halfway, E = a storage that is full.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const fs = require('fs'), path = require('path'), crypto = require('crypto')
// Usage (from the repo root, on the branch proyectos/p2-copias):
//   npm ci && npm run build && (cd dist && python3 -m http.server 4190) &
//   PLAYWRIGHT=<path to playwright> OUT=/tmp/elyum-demo node docs/proyectos/pruebas/demo-restauracion.cjs
// Writes screenshots, the exported synthetic copies and demo-log.txt into OUT. Synthetic data only.
const URL0 = process.env.URL || 'http://localhost:4190'
const OUT = process.env.OUT || path.join(require('os').tmpdir(), 'elyum-demo')
fs.mkdirSync(OUT, { recursive: true })
const log = []
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s) }

const TODAY = '2026-10-23' // Friday, in America/Mexico_City
const day = (date, records) => JSON.stringify({ date, records })
const SEED = {
  [`personal-os:day:${TODAY}`]: day(TODAY, {
    'fri-web-0800': { status: 'completado', outcome: 'si', objective: 'Formulario de contacto probado' },
    'fri-wellness-1020': { status: 'parcial', outcome: 'parcial', pendingNote: 'Cerrar la paleta', objective: 'Paleta de color v2' },
    'fri-newsletter-1400': { objective: 'Cerrar el borrador de la edición de prueba' },
  }),
  'personal-os:day:2026-10-22': day('2026-10-22', { 'thu-meditation-0600': { status: 'completado' } }),
  'personal-os:day:2026-10-21': day('2026-10-21', { 'wed-wellness-1000': { status: 'completado', outcome: 'no' }, 'wed-web-1400': { status: 'omitido' } }),
  'personal-os:entry': JSON.stringify({ dailyEntrySeenDate: TODAY, dailyMessage: { date: TODAY, id: 'm1' }, lastActiveAt: Date.now() }),
  'elyum:learn:v1:state': JSON.stringify({ v: 1, data: { draft: 'Borrador sintético · ñ · “comillas” · 🌅' } }),
  'elyum:projects:v1:data': JSON.stringify({ v: 1, data: { note: 'datos sintéticos de prueba' } }),
  // Never part of a copy:
  'personal-os:sim:day:2026-10-23': day(TODAY, { x: { status: 'completado' } }),
  'otra-app:clave': 'no es de ELYUM',
}

async function ctx(browser, name, opts = {}) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Mexico_City', locale: 'es-MX', acceptDownloads: true, serviceWorkers: 'block', ...opts })
  const p = await c.newPage()
  p.on('pageerror', (e) => say(`[${name}] pageerror`, e.message))
  return { c, p }
}
const elyumKeys = (p) => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /^(personal-os:(day:|entry$)|elyum:(learn|projects):)/.test(k) && !k.includes(':sim:') && !k.startsWith('personal-os:sim:')).sort().map((k) => [k, localStorage.getItem(k)])))
const allKeys = (p) => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))
async function openSistema(p) {
  await p.goto(`${URL0}/?entry=none&section=sistema`)
  await p.getByRole('heading', { name: 'Copias de seguridad' }).waitFor()
  await p.waitForTimeout(900)
}
async function exportFrom(p, buttonName, file) {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: buttonName }).click()])
  await dl.saveAs(file)
  return fs.readFileSync(file, 'utf8')
}
const shot = (p, name, full = true) => p.screenshot({ path: path.join(OUT, name), fullPage: full })

;(async () => {
  const browser = await chromium.launch()

  // ---------- A: device with data → export
  const A = await ctx(browser, 'A')
  await A.p.goto(`${URL0}/?entry=none`)
  await A.p.evaluate((seed) => { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v) }, SEED)
  await openSistema(A.p)
  await shot(A.p, '01-sistema-390.png')
  const exportText = await exportFrom(A.p, 'Exportar copia', path.join(OUT, 'copia-A.json'))
  await A.p.waitForTimeout(400)
  await shot(A.p, '02-exportada-390.png')
  const exp = JSON.parse(exportText)
  say('A · export:', 'schema', exp.schema, 'v', exp.version, 'counts', JSON.stringify(exp.counts), 'device', exp.device, 'hash', exp.integrity.total.slice(0, 8))
  say('A · export excludes simulation and foreign keys:', !exportText.includes('personal-os:sim:') && !exportText.includes('otra-app'))
  const aKeys = await elyumKeys(A.p)

  // Independent check of the file's integrity (Node's own SHA-256, not the app's code).
  const canon = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  const nodeHash = crypto.createHash('sha256').update(canon(exp.modules)).digest('hex')
  say('A · independent SHA-256 of the modules matches the file:', nodeHash === exp.integrity.total)

  // ---------- B: empty, separate storage → import → reload → byte-for-byte + same hash
  const B = await ctx(browser, 'B')
  await openSistema(B.p)
  say('B · ELYUM keys before:', Object.keys(await elyumKeys(B.p)).length)
  await B.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A.json'))
  await B.p.getByText('Integridad verificada').waitFor()
  await shot(B.p, '03-vista-previa-vacio-390.png')
  // Opening ELYUM wrote its own entry memory here: a real conflict. Choose the copy's explicitly, so the restore is complete.
  await B.p.getByRole('listitem').filter({ hasText: 'Entrada diaria' }).getByText('Conservar el de este dispositivo').click()
  const importBtn = B.p.getByRole('button', { name: 'Importar', exact: true })
  say('B · Importar disabled before the safety copy:', await importBtn.isDisabled())
  await exportFrom(B.p, 'Exportar el estado actual', path.join(OUT, 'copia-B-antes.json'))
  await B.p.getByText('He guardado esa copia fuera de este dispositivo.').click()
  await shot(B.p, '04-listo-para-importar-390.png')
  const reloaded = B.p.waitForEvent('load')
  await importBtn.click()
  await B.p.getByText('Restaurado:').waitFor()
  await shot(B.p, '04b-restaurado-antes-de-recargar-390.png')
  // Right after the import, before ELYUM reloads (and its own entry memory moves on): compare byte for byte.
  const bNow = await elyumKeys(B.p)
  say('B · right after import: keys byte-for-byte equal to A:', JSON.stringify(bNow) === JSON.stringify(aKeys), `(${Object.keys(bNow).length} keys)`)
  const mods = { core: { keys: {} }, learn: { keys: {} }, projects: { keys: {} } }
  for (const [k, v] of Object.entries(bNow)) mods[k.startsWith('personal-os:') ? 'core' : k.startsWith('elyum:learn:') ? 'learn' : 'projects'].keys[k] = v
  say('B · right after import: SHA-256 of B’s data equals the copy’s:', crypto.createHash('sha256').update(canon(mods)).digest('hex') === exp.integrity.total)
  await reloaded
  await B.p.waitForTimeout(1500)
  await shot(B.p, '05-tras-restaurar-aviso-390.png', false)
  const bKeys = await elyumKeys(B.p)
  const same = JSON.stringify(aKeys) === JSON.stringify(bKeys)
  for (const k of new Set([...Object.keys(aKeys), ...Object.keys(bKeys)])) if (aKeys[k] !== bKeys[k]) say('B · differs:', k, '| A:', aKeys[k], '| B:', bKeys[k])
  say('B · after reload (ELYUM updates its own lastActiveAt on opening): equal except that field:', same || Object.keys(aKeys).every((k) => aKeys[k] === bKeys[k] || (k === 'personal-os:entry' && JSON.stringify({ ...JSON.parse(aKeys[k]), lastActiveAt: 0 }) === JSON.stringify({ ...JSON.parse(bKeys[k]), lastActiveAt: 0 }))))
  const bAll = await allKeys(B.p)
  say('B · no simulation or foreign keys imported:', !Object.keys(bAll).some((k) => k.includes(':sim:') || k.startsWith('personal-os:sim:') || k.startsWith('otra-app')))
  await openSistema(B.p)
  const reexport = JSON.parse(await exportFrom(B.p, 'Exportar copia', path.join(OUT, 'copia-B-reexport.json')))
  say('B · re-export after reload: hashes of Aprender and Proyectos equal to A:', reexport.integrity.modules.learn === exp.integrity.modules.learn && reexport.integrity.modules.projects === exp.integrity.modules.projects)
  // HOY on B shows the restored day: objective of the current block and the resolved blocks.
  await B.p.goto(`${URL0}/?entry=none`)
  await B.p.waitForTimeout(1600)
  await shot(B.p, '06-hoy-restaurado-390.png')
  const hoyText = await B.p.locator('main').innerText()
  say('B · HOY shows the restored objective:', hoyText.includes('Cerrar el borrador de la edición de prueba'))
  // Importing the same copy again: all duplicates, nothing to write.
  await openSistema(B.p)
  await B.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A.json'))
  await B.p.getByText('Integridad verificada').waitFor()
  say('B · second import of the same copy:', (await B.p.getByText('Se escribirán 0 datos').count()) === 1 ? '0 writes (all duplicates)' : 'UNEXPECTED')
  await shot(B.p, '07-reimportar-duplicados-390.png')

  // ---------- Tamper: one character changed → rejected, nothing written
  const tampered = exportText.replace('Formulario de contacto probado', 'Formulario de contacto probadO')
  fs.writeFileSync(path.join(OUT, 'copia-A-alterada.json'), tampered)
  const T = await ctx(browser, 'T')
  await openSistema(T.p)
  const before = await allKeys(T.p)
  await T.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A-alterada.json'))
  await T.p.getByText('No se importó nada').waitFor()
  await shot(T.p, '08-copia-alterada-rechazada-390.png')
  const after = await allKeys(T.p)
  delete before['elyum:system:v1:health']; delete after['elyum:system:v1:health']
  say('T · tampered copy rejected, storage unchanged:', JSON.stringify(before) === JSON.stringify(after), '·', (await T.p.locator('[role=alert]').innerText()).replace(/\n/g, ' '))

  // ---------- C: conflicts and data only on this device
  const C = await ctx(browser, 'C')
  await C.p.goto(`${URL0}/?entry=none`)
  const conflictValue = day(TODAY, { 'fri-web-0800': { status: 'omitido' } })
  await C.p.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('personal-os:day:2026-10-20', JSON.stringify({ date: '2026-10-20', records: { 'tue-web-1000': { status: 'completado' } } })) }, [`personal-os:day:${TODAY}`, conflictValue])
  await openSistema(C.p)
  await C.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A.json'))
  await C.p.getByText('Integridad verificada').waitFor()
  await shot(C.p, '09-conflictos-390.png')
  await exportFrom(C.p, 'Exportar el estado actual', path.join(OUT, 'copia-C-antes.json'))
  await C.p.getByText('He guardado esa copia fuera de este dispositivo.').click()
  await Promise.all([C.p.waitForEvent('load'), C.p.getByRole('button', { name: 'Importar', exact: true }).click()])
  await C.p.waitForTimeout(800)
  const cKeys = await allKeys(C.p)
  say('C · conflict kept this device’s value by default:', cKeys[`personal-os:day:${TODAY}`] === conflictValue)
  say('C · data only on this device kept:', Boolean(cKeys['personal-os:day:2026-10-20']))
  say('C · new data added:', cKeys['personal-os:day:2026-10-22'] === SEED['personal-os:day:2026-10-22'])
  const aside = JSON.parse(cKeys['elyum:system:v1:pre-import'] || '{}')
  say('C · replaced values set aside on device (none replaced):', JSON.stringify(aside.replaced), 'added', (aside.added || []).length)

  // ---------- C2: same, but choosing the copy for the conflict → previous value set aside
  const C2 = await ctx(browser, 'C2')
  await C2.p.goto(`${URL0}/?entry=none`)
  await C2.p.evaluate(([k, v]) => localStorage.setItem(k, v), [`personal-os:day:${TODAY}`, conflictValue])
  await openSistema(C2.p)
  await C2.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A.json'))
  await C2.p.getByText('Integridad verificada').waitFor()
  await C2.p.getByRole('listitem').filter({ hasText: 'Día 23/10/2026' }).getByText('Conservar el de este dispositivo').click()
  await shot(C2.p, '10-conflicto-elegir-copia-390.png')
  await exportFrom(C2.p, 'Exportar el estado actual', path.join(OUT, 'copia-C2-antes.json'))
  await C2.p.getByText('He guardado esa copia fuera de este dispositivo.').click()
  await Promise.all([C2.p.waitForEvent('load'), C2.p.getByRole('button', { name: 'Importar', exact: true }).click()])
  const c2 = await allKeys(C2.p)
  say('C2 · copy chosen explicitly: value replaced', c2[`personal-os:day:${TODAY}`] === SEED[`personal-os:day:${TODAY}`], '· previous kept aside:', JSON.parse(c2['elyum:system:v1:pre-import']).replaced[`personal-os:day:${TODAY}`] === conflictValue)

  // ---------- D: storage fails halfway through the import → rollback, visible error
  const D = await ctx(browser, 'D')
  await D.p.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (k, v) {
      if (window.__failOn && k === window.__failOn) { const e = new DOMException('quota', 'QuotaExceededError'); throw e }
      return set.call(this, k, v)
    }
  })
  await D.p.goto(`${URL0}/?entry=none`)
  await D.p.evaluate(() => localStorage.setItem('personal-os:entry', JSON.stringify({ dailyEntrySeenDate: '2026-10-23', mine: true })))
  await openSistema(D.p)
  const dBefore = await elyumKeys(D.p)
  await D.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A.json'))
  await D.p.getByText('Integridad verificada').waitFor()
  await D.p.getByRole('listitem').filter({ hasText: 'Entrada diaria' }).getByText('Conservar el de este dispositivo').click() // also replace the entry → tests restoring a replaced value
  await exportFrom(D.p, 'Exportar el estado actual', path.join(OUT, 'copia-D-antes.json'))
  await D.p.getByText('He guardado esa copia fuera de este dispositivo.').click()
  await D.p.evaluate(() => { window.__failOn = 'personal-os:day:2026-10-23' })
  await D.p.getByRole('button', { name: 'Importar', exact: true }).click()
  await D.p.getByText('La importación no se completó').waitFor()
  await shot(D.p, '11-fallo-a-mitad-revertido-390.png')
  const dAfter = await elyumKeys(D.p)
  say('D · failure halfway: ELYUM data exactly as before:', JSON.stringify(dBefore) === JSON.stringify(dAfter))
  say('D · message:', (await D.p.locator('[role=alert]').last().innerText()).replace(/\n/g, ' '))

  // ---------- E: storage that cannot be written at all → visible notice on HOY and in SISTEMA
  const E = await ctx(browser, 'E')
  await E.p.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError') }
  })
  await E.p.goto(`${URL0}/?entry=none`)
  await E.p.waitForTimeout(1800)
  await shot(E.p, '12-almacenamiento-lleno-hoy-390.png', false)
  say('E · HOY shows the storage notice:', (await E.p.getByRole('alert').count()) > 0)
  await openSistema(E.p)
  await shot(E.p, '13-almacenamiento-lleno-sistema-390.png', false)

  // ---------- Layout checks: 320 and desktop
  for (const [w, h, name] of [[320, 568, '14-sistema-320.png'], [1280, 860, '15-sistema-escritorio.png']]) {
    const X = await ctx(browser, name, w > 1000 ? { viewport: { width: w, height: h }, isMobile: false, hasTouch: false } : { viewport: { width: w, height: h } })
    await X.p.goto(`${URL0}/?entry=none`)
    await X.p.evaluate((seed) => { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v) }, SEED)
    await openSistema(X.p)
    await X.p.locator('input[type=file]').setInputFiles(path.join(OUT, 'copia-A.json'))
    await X.p.getByText('Integridad verificada').waitFor()
    await shot(X.p, name)
    const overflow = await X.p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    say(`${name} · horizontal overflow:`, overflow)
  }
  // Navigation shows SISTEMA (mobile bottom nav) and HOY / SEMANA still work.
  const N = await ctx(browser, 'N')
  await N.p.goto(`${URL0}/?entry=none`)
  await N.p.waitForTimeout(1200)
  say('N · bottom nav:', (await N.p.locator('nav.bottom-nav').innerText()).replace(/\n/g, ' · '))
  await N.p.locator('nav.bottom-nav').getByRole('button', { name: 'Sistema' }).click()
  await N.p.getByRole('heading', { name: 'Copias de seguridad' }).waitFor()
  await N.p.locator('nav.bottom-nav').getByRole('button', { name: 'Hoy' }).click()
  await N.p.waitForTimeout(900)
  say('N · back to HOY:', await N.p.locator('#now-title').isVisible())
  await N.p.locator('nav.bottom-nav').getByRole('button', { name: 'Semana' }).click()
  await N.p.waitForTimeout(1500)
  say('N · SEMANA opens:', (await N.p.locator('.semana').count()) > 0)

  fs.writeFileSync(path.join(OUT, 'demo-log.txt'), log.join('\n') + '\n')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
