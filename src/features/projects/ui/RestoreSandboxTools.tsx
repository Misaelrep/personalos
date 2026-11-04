import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { exportProjects } from '../store/export'
import { createStore, DATA_KEY, readEnvelope, type Loaded } from '../store/store'
import { saveJsonFile, stampedName } from './files'
import { Card, Section } from './parts'
import type { ToolsContext } from './RestoreView'
import { clearSandbox, localChange, loseProject, syntheticSix } from './sandbox'

/**
 * P2-R1 · The test-store tools, moved out of Recuperar (P2-R1.4) so they are
 * never part of the regular route. Shown only on the test page of the previews
 * (`proyectos.html#/recuperar-prueba`). Each writes only `elyum:prueba-p2r1:*`
 * through the same store (lock and generation); «Copiar aquí PROYECTOS» only
 * reads PROYECTOS.
 */

const now = () => new Date().toISOString()
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function RestoreSandboxTools({ ctx }: { ctx: ToolsContext }) {
  const { env, loaded, busy, open } = ctx
  const [note, setNote] = useState<string>()
  const data = loaded?.kind === 'ok' ? loaded.data : undefined

  async function write(label: string, make: (current: Loaded) => Promise<Parameters<ReturnType<typeof createStore>['save']>[0] | undefined>) {
    ctx.setBusy(true)
    setNote(undefined)
    try {
      const store = createStore(env)
      const current = await store.load()
      const next = await make(current)
      if (!next) return
      const r = await store.save(next, current.kind === 'ok' || current.kind === 'vacio' ? current.generation : -1)
      setNote(r.ok ? `${label}: hecho (generación ${r.generation}).` : `${label}: no se ha guardado (${r.message}).`)
      await ctx.afterWrite()
    } finally {
      ctx.setBusy(false)
    }
  }

  return (
    <Section label="Almacén de prueba">
      <Card className="flex flex-col gap-3 px-4 py-4">
        {!loaded ? (
          <p className="text-[14px] text-ink-3">Leyendo…</p>
        ) : loaded.kind === 'vacio' ? (
          <p className="text-[14px] text-ink-2" data-testid="sandbox-state">
            Vacío.
          </p>
        ) : loaded.kind === 'ok' ? (
          <p className="text-[14px] text-ink-2" data-testid="sandbox-state" data-generation={loaded.generation}>
            {n(loaded.data.projects.length, 'proyecto', 'proyectos')} · {n(loaded.data.tasks.length, 'tarea', 'tareas')} · generación {loaded.generation}
          </p>
        ) : (
          <p className="text-[14px] text-[#b5531a]">El almacén de prueba no se puede leer ({loaded.kind === 'ilegible' ? loaded.reason : loaded.format}).</p>
        )}
        <div className="flex flex-col gap-2">
          <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy || loaded?.kind !== 'vacio'} data-testid="sandbox-fill" onClick={() => write('Datos sintéticos', async () => syntheticSix(now))}>
            Cargar datos sintéticos
          </Button>
          <Button
            variant="choice"
            className="h-10 px-3 text-[12px]"
            disabled={busy || loaded?.kind !== 'vacio'}
            data-testid="sandbox-copy-main"
            onClick={() =>
              write('Copia de PROYECTOS', async () => {
                const main = await readEnvelope(window.localStorage.getItem(DATA_KEY))
                if (main.kind !== 'ok') {
                  setNote('PROYECTOS no tiene datos legibles que copiar.')
                  return undefined
                }
                return main.data
              })
            }
          >
            Copiar aquí PROYECTOS
          </Button>
          <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy || !data?.projects.length} data-testid="sandbox-lose" onClick={() => write('Simular pérdida', async () => loseProject(data!, data!.projects[0].id))}>
            Perder el primer proyecto
          </Button>
          <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy || !data?.tasks.length} data-testid="sandbox-change" onClick={() => write('Cambio local', async () => localChange(data!, now))}>
            Hacer un cambio local
          </Button>
          <Button
            variant="choice"
            className="h-10 px-3 text-[12px]"
            disabled={busy || loaded?.kind !== 'ok'}
            data-testid="sandbox-export"
            onClick={async () => {
              const at = now()
              await saveJsonFile(stampedName('elyum-prueba-recuperar', at), (await exportProjects(env.storage, at, 'prueba-p2r1')).text)
            }}
          >
            Exportar este almacén
          </Button>
          <Button
            variant="choice"
            className="h-10 px-3 text-[12px]"
            disabled={busy || open}
            data-testid="sandbox-clear"
            onClick={async () => {
              const count = clearSandbox(window.localStorage)
              setNote(`Borradas ${count} claves elyum:prueba-p2r1:* (solo el almacén de prueba y su diario).`)
              await ctx.afterWrite({ clearResult: true })
            }}
          >
            Borrar el almacén de prueba
          </Button>
        </div>
        {note && (
          <p className="text-[13px] text-ink-3" data-testid="sandbox-note">
            {note}
          </p>
        )}
        <p className="text-[12.5px] leading-[1.5] text-ink-4">Estos botones solo escriben claves elyum:prueba-p2r1:*. «Copiar aquí PROYECTOS» solo lee tus datos de PROYECTOS.</p>
      </Card>
    </Section>
  )
}
