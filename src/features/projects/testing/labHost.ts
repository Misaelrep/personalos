/**
 * Temporary HTTPS access to the synthetic lab from a phone (development only).
 *
 * Besides loopback, the lab admits exactly ONE hostname, the one given to the
 * lab server (`e2e/projects/lab-server.mjs`) when it starts, and only over
 * HTTPS (Web Locks need a secure context). No wildcards, no IP addresses, no
 * ports or paths, and never ELYUM's own domain or Vercel's.
 */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOSTNAME = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})+$`)

/** Why `host` cannot be the lab's extra hostname, or `undefined` if it can. */
export function labHostProblem(host: unknown): string | undefined {
  if (typeof host !== 'string' || host === '') return 'no se ha indicado ningún nombre de host'
  if (!HOSTNAME.test(host)) return 'tiene que ser un nombre de host concreto, en minúsculas: sin comodines, puertos, rutas ni protocolo'
  if (/^[0-9.]+$/.test(host) || host.split('.').every((l) => /^[0-9]+$/.test(l))) return 'no se admite una dirección IP'
  if (LOOPBACK_HOSTS.includes(host)) return 'el equipo local ya está admitido; indica el nombre del acceso temporal'
  if (/(^|\.)vercel\.app$/.test(host) || host.includes('elyum')) return 'no se admite el dominio de ELYUM ni el de Vercel'
  return undefined
}

/** Is this page location one where the lab may open? */
export function labLocationAllowed(location: { hostname: string; protocol?: string }, labHost: string | undefined): boolean {
  if (LOOPBACK_HOSTS.includes(location.hostname)) return true
  return labHost !== undefined && labHostProblem(labHost) === undefined && location.hostname === labHost && location.protocol === 'https:'
}
