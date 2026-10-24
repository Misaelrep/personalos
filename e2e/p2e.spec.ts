import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * P2-E on the real app: SISTEMA → Copias de seguridad, export and verification.
 *
 * Synthetic data only. Every test records each write the page makes to
 * localStorage or sessionStorage from the moment the screen is ready, and
 * ends by asserting there were none and that the storage is byte-for-byte as
 * it was. The exported file is checked by this test's own code (its own
 * canonical JSON and SHA-256), not by the app's.
 */

const T0 = new Date('2026-10-21T10:30:00+02:00') // a Wednesday, outside any DST change
const PAUSE = new Date(T0.getTime() + 5000) // the page clock stops here: every run sees the same time
const CREATED = '2026-10-21T10:30:07+02:00' // PAUSE plus the 2 s the screen is given to appear
const FILE_NAME = 'elyum-copia-2026-10-21-1030.json'
const MAX_BYTES = 25 * 1024 * 1024

const day = (date: string, records: Record<string, unknown>, more: Record<string, unknown> = {}) => JSON.stringify({ date, records, ...more })
const SEED: Record<string, string> = {
  'personal-os:day:2026-10-19': day('2026-10-19', { 'mon-web-1000': { status: 'completado', objective: 'Objetivo sintético «ñ» 🌙' } }),
  'personal-os:day:2026-10-20': day('2026-10-20', { 'tue-web-1000': { status: 'parcial', outcome: 'parcial', pendingNote: 'Nota sintética' } }, { meditationMoved: true }),
  'personal-os:day:2026-10-18': '{"date":"2026-10-18","records":', // unreadable on purpose: it must still be exported
  'elyum:learn:v1:state': JSON.stringify({ v: 1, data: { intention: 'Intención sintética' } }),
  'elyum:projects:v1:data': JSON.stringify({ version: 1, note: 'sintético' }),
  'personal-os:sim:day:2026-10-19': day('2026-10-19', {}),
  'elyum:system:v1:meta': '{}',
  'otra-app:dato': 'ajeno',
  'elyum:futuro:v1:x': '1',
}
const EXPORTED = ['personal-os:day:2026-10-18', 'personal-os:day:2026-10-19', 'personal-os:day:2026-10-20', 'elyum:learn:v1:state', 'elyum:projects:v1:data']

type ShareMode = 'none' | 'ok' | 'abort' | 'notallowed' | 'cannot'
interface Options {
  seed?: Record<string, string>
  share?: ShareMode
  noCrypto?: boolean
  unreadableStorage?: boolean
}

/** Seeds the origin, records every storage write, optionally stubs the share sheet; then opens SISTEMA. */
async function open(page: Page, o: Options = {}) {
  await page.clock.install({ time: T0 })
  await page.addInitScript(
    ({ seed, share, noCrypto, unreadableStorage }) => {
      const w = window as unknown as Record<string, unknown>
      if (!sessionStorage.getItem('e2e:seeded')) {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
        sessionStorage.setItem('e2e:seeded', '1')
      }
      const writes: [string, string, string?][] = []
      w.__writes = writes
      const proto = Storage.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
      for (const m of ['setItem', 'removeItem', 'clear']) {
        const original = proto[m]
        proto[m] = function (this: Storage, ...args: unknown[]) {
          writes.push([m, this === localStorage ? 'local' : 'session', args[0] as string | undefined])
          return original.apply(this, args)
        }
      }
      if (noCrypto) Object.defineProperty(window.crypto, 'subtle', { value: undefined, configurable: true })
      if (unreadableStorage)
        Object.defineProperty(Storage.prototype, 'key', {
          value() {
            throw new DOMException('denied', 'SecurityError')
          },
        })
      if (share !== 'none') {
        w.__shared = null
        Object.defineProperty(navigator, 'canShare', { value: () => share !== 'cannot', configurable: true })
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async ({ files }: { files: File[] }) => {
            if (share === 'abort') throw new DOMException('cancelled', 'AbortError')
            if (share === 'notallowed') throw new DOMException('no activation', 'NotAllowedError')
            w.__shared = { name: files[0].name, text: await files[0].text() }
          },
        })
      }
    },
    { seed: o.seed ?? SEED, share: o.share ?? 'none', noCrypto: !!o.noCrypto, unreadableStorage: !!o.unreadableStorage },
  )
  await page.goto('/?entry=none&section=sistema')
  await page.clock.pauseAt(PAUSE)
  await page.clock.runFor(2000) // let the screen's entrance animation run on the paused clock
  await expect(page.getByRole('heading', { name: 'Copias de seguridad' })).toBeVisible()
}

async function ready(page: Page) {
  await expect(page.getByRole('button', { name: 'Exportar copia' })).toBeEnabled()
}

const storageNow = (page: Page) =>
  page.evaluate(() => {
    const all: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      all[k] = localStorage.getItem(k)!
    }
    return all
  })
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __writes: unknown[] }).__writes.length)

/** From this point on, the page must not write anything. */
async function baseline(page: Page) {
  return { storage: await storageNow(page), writes: await writes(page) }
}
async function expectNoWrites(page: Page, b: { storage: Record<string, string>; writes: number }) {
  const log = await page.evaluate(() => (window as unknown as { __writes: unknown[] }).__writes)
  expect(log.slice(b.writes), 'escrituras en el almacenamiento durante la operación').toEqual([])
  expect(await storageNow(page), 'almacenamiento intacto').toEqual(b.storage)
}

// The test's own canonical JSON and hash, independent of the app's code.
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`
}
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Independent check of an exported file against what the device holds. */
function checkExport(text: string, device: Record<string, string>) {
  const f = JSON.parse(text)
  expect(f.schema).toBe('elyum.backup')
  expect(f.version).toBe(2)
  expect(f.meta).toMatchObject({ createdAt: CREATED, app: 'ELYUM', storage: 'localStorage' })
  expect(f.meta.excluded).toEqual({ simulation: 1, system: 1, foreign: 1, unknownElyum: ['elyum:futuro:v1:x'] })
  const all = { ...f.modules.core.keys, ...f.modules.learn.keys, ...f.modules.projects.keys }
  // Every ELYUM key on the device, byte for byte — and nothing else.
  const expected = Object.fromEntries(Object.entries(device).filter(([k]) => /^personal-os:(day:|entry$)|^elyum:(learn|projects):/.test(k) && !k.includes(':sim:')))
  expect(all).toEqual(expected)
  for (const k of EXPORTED) expect(Object.hasOwn(all, k), k).toBe(true)
  expect(f.keyStatus['personal-os:day:2026-10-18']).toBe('ilegible')
  expect(f.keyStatus['personal-os:day:2026-10-19']).toBe('valido')
  expect(f.keyStatus['elyum:learn:v1:state']).toBe('sin-validador')
  expect(f.counts).toEqual({ core: Object.keys(f.modules.core.keys).length, learn: 1, projects: 1 })
  for (const id of ['core', 'learn', 'projects']) expect(f.integrity.modules[id]).toBe(sha(canonical(f.modules[id].keys)))
  const { total, ...rest } = f.integrity
  expect(total).toBe(sha(canonical({ ...f, integrity: rest })))
  return f
}

async function exportByDownload(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  const d = await download
  expect(d.suggestedFilename()).toBe(FILE_NAME)
  return readFileSync(await d.path())
}

async function verifyFile(page: Page, buffer: Buffer, name = FILE_NAME) {
  await page.getByTestId('verify-input').setInputFiles({ name, mimeType: 'application/json', buffer })
  const result = page.getByTestId('verify-result')
  await expect(result).toBeVisible()
  return result
}

test('exporta todos los datos guardados, byte a byte, sin escribir nada', async ({ page }) => {
  await open(page)
  await ready(page)
  await expect(page.getByTestId('limits')).toContainText('Restaurar todavía no está disponible')
  await expect(page.getByTestId('limits')).toContainText('no llegó a guardarse')
  await expect(page.getByTestId('device-counts')).toContainText('elyum:futuro:v1:x')
  const b = await baseline(page)
  const text = (await exportByDownload(page)).toString('utf8')
  checkExport(text, b.storage)
  await expect(page.getByTestId('export-note')).toContainText('Copia descargada')
  await expectNoWrites(page, b)
})

test('verifica el archivo guardado sin escribir nada y lo compara con el dispositivo', async ({ page }) => {
  await open(page)
  await ready(page)
  const file = await exportByDownload(page)
  const b = await baseline(page)
  const result = await verifyFile(page, file)
  await expect(result).toHaveAttribute('data-ok', 'true')
  await expect(result).toContainText('Copia íntegra')
  await expect(result).toContainText('21/10/2026, 10:30')
  await expect(page.getByTestId('verify-statuses')).toHaveText('Claves: 4 válidas · 1 ilegible · 2 sin validar')
  await expect(page.getByTestId('verify-comparison')).toContainText('0 distintas · 0 solo en el archivo · 0 solo aquí')
  await expectNoWrites(page, b)
})

test('la comparación nombra lo que cambió en el dispositivo después de exportar', async ({ page }) => {
  await open(page)
  await ready(page)
  const file = await exportByDownload(page)
  await page.evaluate(() => localStorage.setItem('elyum:projects:v1:data', '{"version":1,"note":"después"}'))
  const b = await baseline(page)
  await expect(await verifyFile(page, file)).toHaveAttribute('data-ok', 'true')
  await expect(page.getByTestId('verify-comparison')).toContainText('1 distintas')
  await expect(page.getByTestId('verify-comparison')).toContainText('Proyectos · data: distinta')
  await expectNoWrites(page, b)
})

test('rechaza cada archivo alterado por su motivo, sin escribir nada', async ({ page }) => {
  await open(page)
  await ready(page)
  const text = (await exportByDownload(page)).toString('utf8')
  const b = await baseline(page)
  const cases: [string, string, string][] = [
    ['un valor cambiado', text.replace('Objetivo sintético', 'Objetivo sintetico'), 'integrity'],
    ['la fecha cambiada', text.replace(CREATED, '2026-10-22T10:30:02+02:00'), 'integrity'],
    ['el estado de una clave cambiado', text.replace('"personal-os:day:2026-10-18": "ilegible"', '"personal-os:day:2026-10-18": "valido"'), 'integrity'],
    ['una clave repetida', text.replace('"schema": "elyum.backup",', '"schema": "elyum.backup",\n  "schema": "elyum.backup",'), 'duplicate-key'],
    ['truncado', text.slice(0, Math.floor(text.length / 2)), 'json'],
    ['de una versión futura', text.replace('"version": 2', '"version": 3'), 'version-future'],
    ['de formato 1', text.replace('"version": 2', '"version": 1'), 'version-old'],
    ['otro JSON', '{"hola": 1}', 'schema'],
  ]
  for (const [what, variant, kind] of cases) {
    expect(variant, `la variante «${what}» debe diferir del original`).not.toBe(text)
    const result = await verifyFile(page, Buffer.from(variant, 'utf8'), `${what}.json`)
    await expect(result, what).toHaveAttribute('data-ok', 'false')
    await expect(result, what).toHaveAttribute('data-kind', kind)
  }
  await expectNoWrites(page, b)
})

test('un archivo demasiado grande se rechaza sin leerlo', async ({ page }) => {
  await open(page)
  await ready(page)
  const b = await baseline(page)
  const result = await verifyFile(page, Buffer.alloc(MAX_BYTES + 1, 0x20), 'enorme.json')
  await expect(result).toHaveAttribute('data-ok', 'false')
  await expect(result).toContainText('No se ha leído')
  await expectNoWrites(page, b)
})

test('la copia es de lo guardado en el momento de pulsar, también si cambió justo antes', async ({ page }) => {
  await open(page)
  await ready(page)
  // Another part of the app (or another tab) saves just before the tap: no storage event reaches this page.
  await page.evaluate(() => localStorage.setItem('elyum:projects:v1:data', '{"version":1,"note":"cambiado"}'))
  const b = await baseline(page)
  const text = (await exportByDownload(page)).toString('utf8')
  const f = checkExport(text, b.storage)
  expect(f.modules.projects.keys['elyum:projects:v1:data']).toBe('{"version":1,"note":"cambiado"}')
  await expectNoWrites(page, b)
})

test('sin Web Crypto también exporta y verifica (la huella no depende de él)', async ({ page }) => {
  await open(page, { noCrypto: true })
  await ready(page)
  const b = await baseline(page)
  const file = await exportByDownload(page)
  checkExport(file.toString('utf8'), b.storage)
  await expect(await verifyFile(page, file)).toHaveAttribute('data-ok', 'true')
  await expectNoWrites(page, b)
})

test('si el almacenamiento no se puede leer, lo dice y no genera una copia vacía', async ({ page }) => {
  await open(page, { unreadableStorage: true })
  await expect(page.getByRole('alert')).toContainText('No se puede leer el almacenamiento')
  await expect(page.getByRole('button', { name: 'Exportar copia' })).toBeDisabled()
})

test('no hay importación ni restauración en la pantalla', async ({ page }) => {
  await open(page)
  await ready(page)
  await expect(page.getByRole('button', { name: /restaur|importar|recuperar/i })).toHaveCount(0)
  await expect(page.locator('input[type=file]')).toHaveCount(1)
})

// Phone: the share sheet («Guardar en Archivos»), stubbed so each outcome can be forced.
async function phone(browser: Browser, share: ShareMode) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid', locale: 'es-ES', serviceWorkers: 'block' })
  const page = await context.newPage()
  await open(page, { share })
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'el contexto debe comportarse como un teléfono').toBe(true)
  await ready(page)
  return { context, page }
}

test('teléfono: comparte el archivo verificado', async ({ browser }) => {
  const { context, page } = await phone(browser, 'ok')
  const b = await baseline(page)
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  await expect(page.getByTestId('export-note')).toContainText('Copia entregada')
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared)
  expect(shared.name).toBe(FILE_NAME)
  checkExport(shared.text, b.storage)
  await expectNoWrites(page, b)
  await context.close()
})

test('teléfono: cerrar el menú de compartir no se presenta como copia guardada', async ({ browser }) => {
  const { context, page } = await phone(browser, 'abort')
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  await expect(page.getByTestId('export-note')).toContainText('No se guardó ninguna copia')
  await expect(page.getByRole('button', { name: 'Descargar en su lugar' })).toHaveCount(0)
  await context.close()
})

test('teléfono: si el sistema no abre el menú, lo dice y ofrece descargar', async ({ browser }) => {
  const { context, page } = await phone(browser, 'notallowed')
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  await expect(page.getByTestId('export-note')).toContainText('no abrió el menú de compartir')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar en su lugar' }).click()
  expect((await download).suggestedFilename()).toBe(FILE_NAME)
  await context.close()
})

test('teléfono: un navegador que no comparte archivos lo dice', async ({ browser }) => {
  const { context, page } = await phone(browser, 'cannot')
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  await expect(page.getByTestId('export-note')).toContainText('no puede compartir archivos')
  await expect(page.getByRole('button', { name: 'Descargar en su lugar' })).toBeVisible()
  await context.close()
})

// Control negativo: con E2E_SABOTAJE=1 esta prueba exige aceptar un archivo alterado.
// Debe FALLAR; demuestra que la suite no da por buena una comprobación negativa.
test('control negativo (solo con E2E_SABOTAJE=1)', async ({ page }) => {
  test.skip(!process.env.E2E_SABOTAJE, 'solo para demostrar que la suite falla')
  await open(page)
  await ready(page)
  const text = (await exportByDownload(page)).toString('utf8')
  const result = await verifyFile(page, Buffer.from(text.replace('Objetivo sintético', 'Objetivo alterado'), 'utf8'))
  await expect(result).toHaveAttribute('data-ok', 'true', { timeout: 3000 })
})

// Control negativo del detector de escrituras: una escritura tras la línea base debe hacer fallar la prueba.
test('control negativo del detector de escrituras (solo con E2E_SABOTAJE=1)', async ({ page }) => {
  test.skip(!process.env.E2E_SABOTAJE, 'solo para demostrar que la suite falla')
  await open(page)
  await ready(page)
  const b = await baseline(page)
  await page.evaluate(() => localStorage.setItem('elyum:projects:v1:data', '{"sabotaje":true}'))
  await expectNoWrites(page, b)
})

// Capturas para la documentación (datos sintéticos): E2E_CAPTURAS=<carpeta> npx playwright test -g capturas
test('capturas (solo con E2E_CAPTURAS)', async ({ page, browser }) => {
  const dir = process.env.E2E_CAPTURAS
  test.skip(!dir, 'solo para generar capturas')
  await open(page)
  await ready(page)
  const file = await exportByDownload(page)
  // Synthetic files for the iPhone test: one valid copy and the same copy with one value altered.
  writeFileSync(`${dir}/copia-sintetica-v2.json`, file)
  writeFileSync(`${dir}/copia-sintetica-v2-alterada.json`, file.toString('utf8').replace('Objetivo sintético', 'Objetivo alterado'))
  await verifyFile(page, file)
  await page.screenshot({ path: `${dir}/escritorio-exportada-y-verificada.jpg`, type: 'jpeg', quality: 70, fullPage: true })
  const { context, page: p } = await phone(browser, 'ok')
  await p.getByRole('button', { name: 'Exportar copia' }).click()
  await expect(p.getByTestId('export-note')).toContainText('Copia entregada')
  await verifyFile(p, Buffer.from(file.toString('utf8').replace('Objetivo sintético', 'Objetivo alterado'), 'utf8'), 'alterada.json')
  await page.close() // a second open page keeps the phone page from being painted in headless captures
  await p.getByTestId('export-note').scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${dir}/telefono-exportar-entregada.jpg`, type: 'jpeg', quality: 70 })
  await p.getByTestId('verify-result').scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${dir}/telefono-verificar-alterada-rechazada.jpg`, type: 'jpeg', quality: 70 })
  await context.close()
})
