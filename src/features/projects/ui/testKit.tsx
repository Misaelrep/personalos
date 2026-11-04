import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER_V2, SYNTHETIC_DOSSIER_V2_NAME, SYNTHETIC_TALLER, SYNTHETIC_TALLER_NAME } from '../import/fixtures'
import type { SyntheticDossier } from './ImportView'
import { LocksCheckView } from './LocksCheckView'
import type { TestKit } from './ProjectsApp'
import { RestoreSandboxTools } from './RestoreSandboxTools'
import { RestoreView } from './RestoreView'
import { RowLink } from './parts'
import { sandboxTarget } from './testTargets'

/**
 * P2-R1.4 · Everything that exists only on the PROYECTOS test page
 * (`proyectos.html`): the synthetic dossiers, the iPhone Web Locks check, and
 * Recuperar on the separate test store with its tools. Only `ui/main.tsx` (the
 * test page's entry) imports this file, and that page is built only for
 * development and Vercel previews (`vite.config.ts`). ELYUM's build never
 * reaches it, so none of it is in production, not even as a separate chunk.
 */

const encoder = new TextEncoder()
const file = (name: string, text: string) => ({ name, bytes: encoder.encode(text) })
const SYNTHETIC: readonly SyntheticDossier[] = [
  { label: 'Huerto v1', file: file(SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER) },
  { label: 'Huerto v2 · cambios', file: file(SYNTHETIC_DOSSIER_V2_NAME, SYNTHETIC_DOSSIER_V2) },
  { label: 'Taller', file: file(SYNTHETIC_TALLER_NAME, SYNTHETIC_TALLER) },
]

export function createTestKit(): TestKit {
  const target = sandboxTarget()
  return {
    label: 'Prueba · datos sintéticos',
    synthetic: SYNTHETIC,
    route: (kind) => (kind === 'prueba' ? <LocksCheckView /> : <RestoreView target={target} tools={(ctx) => <RestoreSandboxTools ctx={ctx} />} />),
    menu: (
      <>
        <RowLink href="#/recuperar-prueba" testId="go-restore-test">
          <p className="text-[15px] text-ink">Recuperar en el almacén de prueba</p>
          <p className="text-[12.5px] text-ink-3">Almacén separado con herramientas sintéticas</p>
        </RowLink>
        <RowLink href="#/prueba-iphone" testId="go-check">
          <p className="text-[15px] text-ink">Prueba del iPhone</p>
          <p className="text-[12.5px] text-ink-3">Web Locks y persistencia, con datos sintéticos</p>
        </RowLink>
      </>
    ),
  }
}
