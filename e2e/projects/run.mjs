#!/usr/bin/env node
// P3 · Adversarial tests in a real browser (Chromium via Playwright), synthetic data only.
//   node e2e/projects/run.mjs
// Starts Vite in development, opens the P3 harness in real tabs that share one
// origin (same localStorage, same Web Locks) and checks: concurrent tabs, races,
// a held lock, a closed tab, a full storage, corrupt data, no Web Locks, the
// import flow (preview, cancel, confirm, re-import, conflict) and the export.
import { createRequire } from 'node:module'
import { writeFileSync, mkdtempSync } from 'node:fs'
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

const PORT = 4327
const URL = `http://localhost:${PORT}/e2e/projects/harness.html`
const DATA_KEY = 'elyum:projects:v1:data'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()

async function fresh(init) {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true })
  if (init) await context.addInitScript(init)
  const open = async () => {
    const page = await context.newPage()
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
    await page.goto(URL)
    await page.waitForSelector('body[data-ready="1"]')
    return page
  }
  return { context, open }
}
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), DATA_KEY)
const keys = (page) => page.evaluate(() => Object.keys(localStorage).sort())
const tmp = mkdtempSync(join(tmpdir(), 'p3-'))
const dossierFile = (name, text) => {
  const path = join(tmp, name)
  writeFileSync(path, text)
  return path
}

try {
  // 1 · Import flow through the harness UI: preview, cancel, confirm.
  {
    const { context, open } = await fresh()
    const page = await open()
    const synthetic = await page.evaluate(() => window.p3.synthetic)
    const path = dossierFile(synthetic.name, synthetic.text)
    await page.setInputFiles('#file', path)
    await page.waitForSelector('#preview:not([hidden])')
    check('vista previa: 6 nuevas, literales sin decidir visibles', (await page.textContent('#counts')).startsWith('nuevas 6') && (await page.textContent('#literals')).includes('Borrador existente → sin-decidir'))
    check('vista previa no escribe nada', (await keys(page)).length === 0)
    await page.click('#cancel')
    check('cancelar no escribe nada', (await keys(page)).length === 0)
    await page.setInputFiles('#file', path)
    await page.waitForSelector('#preview:not([hidden])')
    await page.click('#confirm')
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('generación 1'))
    check('confirmar guarda (generación 1, 6 tareas)', (await page.textContent('#status')).includes('tareas 6'))
    await page.reload()
    await page.waitForSelector('body[data-ready="1"]')
    check('los datos sobreviven a recargar', (await page.textContent('#status')).includes('generación 1 · proyectos 1 · tareas 6'))

    // Re-import: same file → all unchanged.
    await page.setInputFiles('#file', path)
    await page.waitForSelector('#preview:not([hidden])')
    check('reimportar el mismo archivo: 6 iguales, avisado', (await page.textContent('#counts')).includes('iguales 6') && (await page.textContent('#counts')).includes('archivo ya importado'))
    await page.click('#cancel')

    // ELYUM edit + dossier edit of the same field → visible conflict; ELYUM kept.
    await page.evaluate(async () => {
      const { session, ops } = window.p3
      const r = await session.change((d) => ops.setStatus(d, 'src:HUE-01', 'No iniciado', { now: new Date().toISOString() }))
      if (!r.ok) throw new Error(r.message)
    })
    const changed = synthetic.text.replace('| Comprobar la llave de *paso* | Pendiente |', '| Comprobar la llave de *paso* | No consta |')
    await page.setInputFiles('#file', dossierFile('DOSSIER_SINTETICO_HUERTO_2026-10-27.md', changed))
    await page.waitForSelector('#preview:not([hidden])')
    const conflictRow = await page.textContent('tr.conflicto[data-id="HUE-01"]').catch(() => null)
    check('conflicto visible en la vista previa', !!conflictRow && conflictRow.includes('"No iniciado" → "No consta"'))
    await page.click('#confirm')
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('generación 3'))
    const status = await page.evaluate(() => window.p3.session.state.data.tasks.find((t) => t.sourceId === 'HUE-01').status)
    check('el conflicto conserva el valor de ELYUM por defecto', status === 'No iniciado', status)

    // Export → verify, in the browser and from the downloaded file.
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')])
    await page.waitForFunction(() => document.querySelector('#exported').textContent !== '')
    check('exportación verificada en el navegador', (await page.textContent('#exported')) === 'copia verificada')
    const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'))
    const exported = JSON.parse(text)
    check('el archivo exportado contiene el texto guardado byte a byte', exported.stored === (await stored(page)))
    const tampered = JSON.stringify({ ...exported, stored: exported.stored.replace('Huerto de prueba', 'Huerto falso') })
    const v = await page.evaluate((t) => window.p3.verifyExport(t), tampered)
    check('una copia alterada no se verifica', v.ok === false, v.problems?.[0])
    await context.close()
  }

  // 2 · Two tabs: a stale tab cannot overwrite; it is told and nothing is written.
  {
    const { context, open } = await fresh()
    const a = await open()
    const b = await open()
    const synthetic = await a.evaluate(() => window.p3.synthetic)
    await a.setInputFiles('#file', dossierFile(synthetic.name, synthetic.text))
    await a.waitForSelector('#preview:not([hidden])')
    await a.click('#confirm')
    await a.waitForFunction(() => document.querySelector('#status').textContent.includes('generación 1'))
    const before = await stored(a)
    const r = await b.evaluate(async () => {
      const { session, ops } = window.p3
      return session.change((d) => ops.setWeekLimits(d, '2026-10-26', { wipLimit: 3 }, { now: new Date().toISOString() }))
    })
    check('pestaña desactualizada: conflicto, no escribe', r.ok === false && r.reason === 'conflicto' && (await stored(a)) === before, r.reason)
    check('la otra pestaña recibe el aviso de cambio', (await b.textContent('#status')).includes('otra pestaña guardó cambios'))
    await b.evaluate(() => window.p3.reopen())
    check('tras recargar, la pestaña ve los datos nuevos', (await b.textContent('#status')).includes('tareas 6'))
    await context.close()
  }

  // 3 · Race: two tabs save 25 times each at once, retrying on conflict. No update may be lost.
  {
    const { context, open } = await fresh()
    const [a, b] = [await open(), await open()]
    const burst = (page, tag) =>
      page.evaluate(async (tag) => {
        const { session } = window.p3
        let conflicts = 0
        for (let i = 0; i < 25; i++) {
          for (;;) {
            const r = await session.change((d) => ({ ...d, history: [...d.history, { at: new Date().toISOString(), by: 'usuario', entity: 'week', id: tag, field: `n${i}` }] }))
            if (r.ok) break
            if (r.reason !== 'conflicto') throw new Error(r.message)
            conflicts++
            await session.open()
          }
        }
        return conflicts
      }, tag)
    const [ca, cb] = await Promise.all([burst(a, 'A'), burst(b, 'B')])
    const final = await a.evaluate(async () => (await window.p3.session.open(), window.p3.session.state))
    const ids = final.data.history.map((h) => `${h.id}${h.field}`)
    check('carrera entre dos pestañas: 50 cambios, ninguno perdido', final.generation === 50 && new Set(ids).size === 50, `generación ${final.generation}, conflictos detectados ${ca + cb}`)
    await context.close()
  }

  // 4 · A tab holding the lock: the other waits; if the tab closes, the lock is released.
  {
    const { context, open } = await fresh()
    const [a, b] = [await open(), await open()]
    await a.evaluate(() => {
      navigator.locks.request('elyum:projects:v1', () => new Promise(() => {}))
    })
    const pending = b.evaluate(() => window.p3.session.change((d) => d))
    await b.waitForTimeout(500)
    await a.close()
    const r = await pending
    check('una pestaña cerrada libera el bloqueo y la otra guarda', r.ok === true, JSON.stringify(r))
    const c = await open()
    await c.evaluate(() => {
      navigator.locks.request('elyum:projects:v1', () => new Promise(() => {}))
    })
    const d = await open()
    const r2 = await d.evaluate(() => window.p3.session.change((x) => x))
    check('bloqueo retenido demasiado tiempo: rechazo visible, nada escrito', r2.ok === false && r2.reason === 'bloqueo-no-disponible', r2.reason)
    await context.close()
  }

  // 5 · Full storage: the error is visible and the stored data stays as it was.
  {
    const { context, open } = await fresh()
    const page = await open()
    await page.evaluate(() => window.p3.session.change((d) => d))
    const before = await stored(page)
    const filled = await page.evaluate(() => {
      const chunk = 'x'.repeat(256 * 1024)
      let i = 0
      try {
        for (; i < 400; i++) localStorage.setItem(`relleno:${i}`, chunk)
      } catch {
        return i
      }
      return -1
    })
    const r = await page.evaluate(async () => {
      const { session, ops } = window.p3
      const big = 'y'.repeat(600 * 1024)
      const r = await session.change((d) => ops.setWeekLimits({ ...d, weeks: [...d.weeks] }, '2026-10-26', { wipLimit: 3 }, { now: big }))
      window.p3.showError(r.ok ? undefined : r.message)
      return r
    })
    check('almacenamiento lleno: error devuelto y visible', r.ok === false && r.reason === 'sin-espacio' && (await page.isVisible('#error')), `relleno ${filled} bloques; ${r.reason}`)
    check('almacenamiento lleno: los datos guardados no cambian', (await stored(page)) === before)
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('relleno:')).forEach((k) => localStorage.removeItem(k)))
    await context.close()
  }

  // 6 · Corrupt and future data: opened as such, never overwritten, still exportable.
  {
    const { context, open } = await fresh()
    const page = await open()
    for (const [raw, kind] of [
      ['{"format":"elyum-projects-store/1","generation":', 'ilegible'],
      ['{"format":"elyum-projects-store/9","generation":4}', 'version-futura'],
    ]) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [DATA_KEY, raw])
      await page.reload()
      await page.waitForSelector('body[data-ready="1"]')
      const st = await page.textContent('#status')
      const r = await page.evaluate(() => window.p3.session.change((d) => d))
      check(`datos ${kind}: se abren como tales y no se sobrescriben`, st.includes(kind) && r.ok === false && (await stored(page)) === raw && (await page.isDisabled('#file')), st)
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')])
      const exported = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')))
      check(`datos ${kind}: se exportan tal cual`, exported.stored === raw && exported.readable === false)
    }
    await context.close()
  }

  // 7 · Without Web Locks: read-only, nothing written.
  {
    const { context, open } = await fresh(() => {
      Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true })
    })
    const page = await open()
    const r = await page.evaluate(() => window.p3.session.change((d) => d))
    check('sin Web Locks: solo lectura, nada escrito', (await page.textContent('#mode')).includes('solo-lectura') && r.ok === false && r.reason === 'solo-lectura' && (await keys(page)).length === 0 && (await page.isDisabled('#file')))
    await context.close()
  }
} catch (e) {
  check('ejecución sin errores', false, e instanceof Error ? e.stack : String(e))
} finally {
  await browser.close()
  await server.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas en ${browser.version?.() ?? 'Chromium'}`)
process.exit(failed.length ? 1 : 0)
