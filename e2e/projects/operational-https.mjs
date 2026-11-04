#!/usr/bin/env node
// The temporary HTTPS access from a phone, simulated in Chromium: lab-server.mjs (only 127.0.0.1) behind a
// local TLS front that forwards the Host header, as an HTTPS tunnel does. Synthetic data, throwaway contexts.
//   node e2e/projects/operational-https.mjs
// Checks its restrictions, then runs ALL of operational.mjs through that hostname.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startLabServer, LAB_PAGE } from './lab-server.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const HOST = 'laboratorio-proyectos.test'
const OTHER = 'otro-host.test'
const LAB_PORT = 4336
const TLS_PORT = 4443
const RESOLVE = `MAP ${HOST} 127.0.0.1, MAP ${OTHER} 127.0.0.1`
const checks = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  checks.push({ name, ok })
}
const listening = (port) => new Promise((res) => {
  const r = httpRequest({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, () => res(true))
  r.on('error', () => res(false))
  r.end()
})

// 1 · The server refuses every hostname that is not a concrete, allowed one, before opening any port.
for (const bad of [undefined, '', '*.trycloudflare.com', '192.168.1.20', 'elyum.vercel.app', 'personalos-abc-elyum.vercel.app', 'Lab.Test']) {
  let refused = false
  try {
    const s = await startLabServer({ host: bad, port: LAB_PORT })
    await s.close()
  } catch (e) {
    refused = /no admitido/.test(e.message)
  }
  check(`lab server refuses «${bad}» and opens no port`, refused && !(await listening(LAB_PORT)))
}

// 2 · The real thing: lab server on loopback + TLS front forwarding the Host header.
const dir = mkdtempSync(join(tmpdir(), 'lab-tls-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${HOST}`, '-addext', `subjectAltName=DNS:${HOST}`, '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
const server = await startLabServer({ host: HOST, port: LAB_PORT })
const front = httpsServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
  const up = httpRequest({ host: '127.0.0.1', port: LAB_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  up.on('error', () => res.writeHead(502).end())
  req.pipe(up)
})
await new Promise((r) => front.listen(TLS_PORT, '127.0.0.1', r))
const browser = await chromium.launch({ args: [`--host-resolver-rules=${RESOLVE}`, '--proxy-server=direct://'] }) // the test hostnames resolve to this machine; never through a proxy
let failed = false
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const sockets = []
  page.on('websocket', (ws) => sockets.push(ws.url()))
  await page.goto(`https://${HOST}:${TLS_PORT}${LAB_PAGE}`)
  await page.getByTestId('lab-capabilities').waitFor()
  const caps = await page.getByTestId('lab-capabilities').innerText()
  check('configured hostname over HTTPS: secure context and Web Locks, shown on the page', caps.includes('Conexión segura: sí') && caps.includes('Web Locks: disponible') && caps.includes(HOST), caps)
  check('nothing is written before pressing Iniciar', (await page.evaluate(() => localStorage.length)) === 0)
  await page.getByTestId('lab-start').click()
  await page.getByTestId('operational-lab').waitFor()
  check('configured hostname over HTTPS: the lab opens and seeds six synthetic projects in the operational key', (await page.evaluate(() => JSON.parse(localStorage.getItem('elyum:projects:v1:data')).data.projects.length)) === 6)
  // Vite's page client still tries; what matters is that the lab server never accepts an update connection.
  const upgrade = await new Promise((res) => {
    const r = httpRequest({ host: '127.0.0.1', port: LAB_PORT, path: '/', headers: { host: HOST, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-protocol': 'vite-hmr' }, timeout: 3000 })
    r.on('upgrade', (_res, socket) => (socket.destroy(), res('101')))
    r.on('response', (x) => res(String(x.statusCode)))
    r.on('timeout', () => (r.destroy(), res('sin respuesta')))
    r.on('error', (e) => res(e.code ?? 'error'))
    r.end()
  })
  check('no live reload: the lab server refuses the update connection', upgrade !== '101', `respuesta ${upgrade}; la página lo intentó ${sockets.length} vez/veces`)

  const other = await (await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true })).newPage()
  const r = await other.goto(`https://${OTHER}:${TLS_PORT}${LAB_PAGE}`)
  check('any other hostname is blocked by the server (403), nothing served', r.status() === 403, String(r.status()))

  const plain = await (await browser.newContext({ serviceWorkers: 'block' })).newPage()
  await plain.goto(`http://${HOST}:${LAB_PORT}${LAB_PAGE}`)
  await plain.getByTestId('lab-start').click()
  await plain.getByRole('alert').waitFor()
  check('the configured hostname over plain HTTP: refused, nothing written', (await plain.evaluate(() => localStorage.length)) === 0 && (await plain.getByTestId('lab-capabilities').innerText()).includes('Web Locks: no disponible'))

  const full = await (await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true })).newPage()
  // P2-R1.4 (expectation changed on purpose): the test store moved to #/recuperar-prueba.
  await full.goto(`https://${HOST}:${TLS_PORT}/proyectos.html#/recuperar-prueba`)
  await full.getByTestId('target-note').waitFor()
  check('the test-store Recuperar page over the same access stays on its separate test store', (await full.getByTestId('target-note').innerText()).includes('almacén de prueba separado'))
} catch (e) {
  failed = true
  console.log('✗ run stopped —', e.message)
} finally {
  await browser.close()
}

// 3 · Every check of operational.mjs, through the temporary HTTPS hostname.
if (!failed) {
  // Asynchronous: this process keeps serving the lab and the TLS front while the child runs.
  const run = await new Promise((res) => {
    const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'operational.mjs')], { env: { ...process.env, LAB_BASE: `https://${HOST}:${TLS_PORT}`, LAB_RESOLVE: RESOLVE } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => res({ status, stdout, stderr }))
  })
  process.stdout.write(run.stdout.split('\n').filter((l) => !l.includes('outside of Vite serving')).map((l) => (l ? `  [operational.mjs por HTTPS] ${l}` : l)).join('\n'))
  if (run.status !== 0) process.stdout.write(run.stderr)
  check('operational.mjs, every check, through the HTTPS hostname', run.status === 0)
}
front.close()
await server.close()
const ok = checks.filter((c) => c.ok).length
console.log(`${ok}/${checks.length} comprobaciones del acceso HTTPS temporal`)
assert(ok === checks.length && !failed)
