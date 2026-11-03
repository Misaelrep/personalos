#!/usr/bin/env node
// Temporary HTTPS access to the synthetic operational lab from a phone. DEVELOPMENT ONLY.
//   ELYUM_LAB_HOST=<nombre del acceso temporal> node e2e/projects/lab-server.mjs
// It listens only on 127.0.0.1 (nothing on the local network). An HTTPS tunnel started by the person
// forwards that one hostname to it. Vite accepts that hostname and no other (besides loopback), with no
// live reload. The lab page still demands development mode, its own page, an empty origin, Web Locks
// and its synthetic session mark. Nothing here is part of the production build.
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

export const LAB_PAGE = '/e2e/projects/operational.html'

export async function startLabServer({ host, port = 4333 }) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('El servidor del laboratorio solo funciona en desarrollo.')
  const server = await createServer({
    mode: 'development',
    server: { host: '127.0.0.1', port, strictPort: true, allowedHosts: [String(host)], hmr: false, ws: false },
    define: { __ELYUM_LAB_HOST__: JSON.stringify(String(host)) },
    logLevel: 'warn',
  })
  // The same rule the page applies, from the same file: checked before listening.
  const { labHostProblem } = await server.ssrLoadModule('/src/features/projects/testing/labHost.ts')
  const problem = labHostProblem(host)
  if (problem) {
    await server.close()
    throw new Error(`Nombre de host no admitido (${problem}). No se ha abierto ningún puerto.`)
  }
  await server.listen()
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.ELYUM_LAB_HOST
  const port = Number(process.env.ELYUM_LAB_PORT ?? 4333)
  try {
    const server = await startLabServer({ host, port })
    console.log(`Laboratorio sintético escuchando solo en http://127.0.0.1:${port} (este equipo).`)
    console.log(`En el iPhone, abre: https://${host}${LAB_PAGE}`)
    console.log('Para cerrar el acceso: Ctrl+C aquí y también en la ventana del túnel.')
    const stop = async () => {
      await server.close()
      process.exit(0)
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
