import { prefixedStorage, type RestoreEnv } from '../store/restore'
import { locksOf, now } from './restoreTarget'
import type { RestoreTarget } from './RestoreView'

/**
 * P2-R1.4 · The separate test store as a Recuperar destination. Test page only
 * (`ui/testKit.tsx`, imported by `ui/main.tsx`): never part of ELYUM's build.
 */
export function sandboxTarget(): RestoreTarget {
  const writer = `recuperar-prueba:${Math.random().toString(36).slice(2, 8)}`
  return {
    kind: 'prueba',
    createEnv: (): RestoreEnv => ({ storage: prefixedStorage(window.localStorage), locks: locksOf(), now, writer }),
    accepts: () => true,
    filePrefix: 'elyum-prueba',
    back: '#/exportar',
  }
}
