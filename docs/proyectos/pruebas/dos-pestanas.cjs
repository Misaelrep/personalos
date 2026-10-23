// P2 · two tabs and a changing device, on the real built app, with SYNTHETIC data only.
// Two pages of the SAME browser context share localStorage and receive each other's `storage` events, like two tabs.
//   1. A tab showing HOY with an old day while another tab restores a copy: it must stop at once (veil),
//      reload when the restore ends, show the restored day, and a tap afterwards must keep the restored data.
//   2. The device changes after the preview (a tap in HOY): the import must write nothing and ask for a new review.
// Usage (repo root, branch proyectos/p2-copias):
//   npm ci && npm run build && (cd dist && python3 -m http.server 4193) &
//   PLAYWRIGHT=<path to playwright> OUT=/tmp/elyum-tabs URL=http://localhost:4193 node docs/proyectos/pruebas/dos-pestanas.cjs
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os')
const URL0 = process.env.URL || 'http://localhost:4193'
const OUT = process.env.OUT || path.join(os.tmpdir(), 'elyum-tabs')
fs.mkdirSync(OUT, { recursive: true })
const TZ = 'America/Mexico_City'
const log = []
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s) }
let failures = 0
const check = (label, ok) => { say(`${ok ? 'OK ' : 'FALLO'} · ${label}`); if (!ok) failures++ }

// Today in the browser's time zone (the app's local date).
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const DAY = `personal-os:day:${today}`
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date()).toLowerCase().slice(0, 3)

// A valid ELYUM copy built here, independently of the app's code (canonical JSON + SHA-256).
const canon = (v) => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`)
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex')
function copyFile(keys) {
  const modules = { core: { keys }, learn: { keys: {} }, projects: { keys: {} } }
  return {
    schema: 'elyum.backup', version: 1, createdAt: '2026-10-25T21:00:00-06:00', device: 'Prueba sintética',
    modules, counts: { core: Object.keys(keys).length, learn: 0, projects: 0 },
    integrity: { algorithm: 'SHA-256', modules: { core: sha(canon(keys)), learn: sha(canon({})), projects: sha(canon({})) }, total: sha(canon(modules)) },
  }
}
const RESTORED = { [`${weekday}-restaurado-0000`]: { status: 'completado', objective: 'Objetivo restaurado de la copia' } }
const OLD = { [`${weekday}-viejo-0000`]: { status: 'omitido' } }
const COPY = path.join(OUT, 'copia-dos-pestanas.json')
fs.writeFileSync(COPY, JSON.stringify(copyFile({ [DAY]: JSON.stringify({ date: today, records: RESTORED }) }), null, 2))

const dayIn = async (p) => JSON.parse((await p.evaluate((k) => localStorage.getItem(k), DAY)) || 'null')

async function openSistemaPreview(b) {
  await b.goto(`${URL0}/?entry=none&section=sistema`)
  await b.getByRole('heading', { name: 'Copias de seguridad' }).waitFor()
  await b.locator('input[type=file]').setInputFiles(COPY)
  await b.getByText('Integridad verificada').waitFor()
  // Today's day is a conflict (HOY has its own): choose the copy explicitly.
  const toggle = b.getByRole('listitem').filter({ hasText: 'Día' }).getByText('Conservar el de este dispositivo')
  if (await toggle.count()) await toggle.first().click()
}
async function safetyAndConfirm(b, name) {
  const [dl] = await Promise.all([b.waitForEvent('download'), b.getByRole('button', { name: /Exportar (el estado actual|de nuevo)/ }).click()])
  await dl.saveAs(path.join(OUT, name))
  await b.getByText('He guardado esa copia fuera de este dispositivo.').click()
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: TZ, acceptDownloads: true, serviceWorkers: 'block' })

  // ---------- Scenario 1: a tab with an old day during a restore
  const a = await ctx.newPage()
  await a.goto(`${URL0}/?entry=none`)
  await a.evaluate(([k, v]) => localStorage.setItem(k, v), [DAY, JSON.stringify({ date: today, records: OLD })])
  await a.reload()
  await a.locator('#now-title').waitFor()
  check('A (HOY) carga el día viejo', JSON.stringify((await dayIn(a)).records) === JSON.stringify(OLD))
  let aLoads = 0
  a.on('load', () => aLoads++)

  const b = await ctx.newPage()
  await openSistemaPreview(b)
  await safetyAndConfirm(b, 'b-antes-1.json')
  await b.getByRole('button', { name: 'Importar', exact: true }).click()
  // A must be veiled before B writes anything (B waits 400 ms after announcing).
  await a.locator('[data-restore-guard]').waitFor({ timeout: 3000 })
  check('A se bloquea con el velo en cuanto B anuncia la restauración', true)
  await a.screenshot({ path: path.join(OUT, '1-pestana-A-bloqueada.png') })
  // A tap on A while veiled must not reach HOY.
  await a.mouse.click(195, 420).catch(() => {})
  await a.waitForEvent('load', { timeout: 6000 })
  await a.locator('#now-title').waitFor()
  await a.waitForTimeout(1500)
  check('A se recarga sola al terminar la restauración', aLoads >= 1)
  check('A muestra el día restaurado', JSON.stringify((await dayIn(a)).records) === JSON.stringify(RESTORED))
  await b.waitForTimeout(2200) // B: verification after settling, then its own reload
  check('El día guardado es el restaurado tras asentarse', JSON.stringify((await dayIn(a)).records) === JSON.stringify(RESTORED))
  // A tap on A now: the core saves its WHOLE day — which must now include the restored records.
  const before = (await dayIn(a)).records
  const omit = a.getByRole('button', { name: 'Omitir' })
  if (await omit.count()) {
    await omit.first().click()
    await a.waitForTimeout(500)
    const after = (await dayIn(a)).records
    check('Un toque posterior en A conserva lo restaurado', Object.keys(RESTORED).every((k) => JSON.stringify(after[k]) === JSON.stringify(before[k])) && Object.keys(after).length > Object.keys(before).length)
  } else say('(sin botón Omitir en el bloque actual: se omite el paso del toque posterior)')
  await a.screenshot({ path: path.join(OUT, '2-pestana-A-recargada.png') })

  // ---------- Scenario 2: the device changes after the preview
  await a.evaluate(([k, v]) => localStorage.setItem(k, v), [DAY, JSON.stringify({ date: today, records: OLD })])
  await a.reload()
  await a.locator('#now-title').waitFor()
  await openSistemaPreview(b)
  await safetyAndConfirm(b, 'b-antes-2.json')
  // Meanwhile, HOY changes the day (a real tap in A).
  await a.getByRole('button', { name: 'Omitir' }).first().click()
  await a.waitForTimeout(400)
  const changedDay = await dayIn(a)
  await b.getByRole('button', { name: 'Importar', exact: true }).click()
  await b.getByText('Este dispositivo cambió después de la vista previa').waitFor({ timeout: 3000 })
  check('B detecta el cambio y no importa', JSON.stringify(await dayIn(b)) === JSON.stringify(changedDay))
  check('B exige de nuevo la copia de seguridad antes de importar', await b.getByRole('button', { name: 'Importar', exact: true }).isDisabled())
  check('A no se bloqueó (no se escribió nada)', (await a.locator('[data-restore-guard]').count()) === 0)
  await b.screenshot({ path: path.join(OUT, '3-vista-previa-cambiada.png'), fullPage: true })

  fs.writeFileSync(path.join(OUT, 'dos-pestanas-log.txt'), log.join('\n') + '\n')
  await browser.close()
  say(failures ? `${failures} comprobaciones fallidas` : 'Todas las comprobaciones correctas')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
