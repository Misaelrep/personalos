import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { OpError } from '../domain/ops'
import type { ProjectsData } from '../domain/types'
import type { Projects } from './useProjects'

/**
 * P4b · Every change the screens make goes through `write`: one pure change,
 * saved by the session against the generation on screen (Web Lock + re-read).
 * The outcome is always shown; a conflict re-reads the data and writes nothing.
 */

export interface Outcome {
  ok: boolean
  message: string
}

export interface Writer {
  writable: boolean
  busy: boolean
  write(label: string, change: (d: ProjectsData) => ProjectsData): Promise<boolean>
}

const Ctx = createContext<Writer>({ writable: false, busy: false, write: async () => false })
export const useWrite = () => useContext(Ctx)

export function WriteProvider({ p, children }: { p: Projects; children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>()
  const writable = p.state?.status === 'listo' && p.state.writable

  const write = useCallback(
    async (label: string, change: (d: ProjectsData) => ProjectsData) => {
      setBusy(true)
      try {
        const r = await p.session.change(change)
        if (r.ok) {
          p.sync()
          setOutcome({ ok: true, message: `${label} · guardado` })
          return true
        }
        if (r.reason === 'conflicto') {
          await p.reload()
          setOutcome({ ok: false, message: 'Otra pestaña o la app instalada guardó antes. No se ha escrito nada; los datos se han vuelto a leer. Revisa y repite.' })
        } else setOutcome({ ok: false, message: r.message })
        return false
      } catch (e) {
        setOutcome({ ok: false, message: e instanceof OpError ? e.message : `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}` })
        return false
      } finally {
        setBusy(false)
      }
    },
    [p],
  )

  // A confirmation fades; an error stays until it is read.
  useEffect(() => {
    if (!outcome?.ok) return
    const t = setTimeout(() => setOutcome(undefined), 3000)
    return () => clearTimeout(t)
  }, [outcome])

  return (
    <Ctx.Provider value={{ writable, busy, write }}>
      {children}
      {outcome && (
        <button
          type="button"
          data-testid="outcome"
          data-ok={outcome.ok ? '1' : '0'}
          onClick={() => setOutcome(undefined)}
          className={`fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-[528px] rounded-[16px] border px-4 py-3 text-left text-[14px] leading-[1.45] shadow-[0_18px_40px_-20px_rgba(8,26,50,0.45)] ${
            outcome.ok
              ? 'border-[color-mix(in_srgb,#1f9d6a_40%,transparent)] bg-[color-mix(in_srgb,#1f9d6a_8%,var(--color-pearl))] text-[#145f41]'
              : 'border-[color-mix(in_srgb,#d4421f_40%,transparent)] bg-[color-mix(in_srgb,#d4421f_7%,var(--color-pearl))] text-[#8f2a12]'
          }`}
        >
          {outcome.message}
        </button>
      )}
    </Ctx.Provider>
  )
}
