import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { exportProjects, verifyExport } from '../store/export'
import {
  buildRestore,
  diagnoseJournal,
  dismissJournal,
  inspectJournal,
  journalAsCopy,
  performRestore,
  planRestore,
  readBackup,
  settleJournal,
  type Backup,
  type BackupRead,
  type JournalStatus,
  type RestoreEnv,
  type RestorePlan,
  type RestoreResult,
  type RestoreUnit,
} from '../store/restore'
import { emptyProjectsData } from '../store/session'
import { createStore, DATA_KEY, type Loaded } from '../store/store'
import { saveJsonFile, stampedName } from './files'
import { dateTime, shortHash } from './labels'
import { Banner, Card, Chip, Field, Mono, Section, Title, TopBar } from './parts'
import { currentCopyGate, isJournalBefore, type CopyGate, type CurrentCopy } from './restoreTarget'

/**
 * P2-R1 · RECUPERAR: from a copy made in Exportar, back into a store.
 *
 * P2-R1.4 · The destination is always given (`target`, see `restoreTarget.ts`):
 * PROYECTOS itself (inside ELYUM), the separate test store (test page of the
 * previews only, with its tools passed in `tools`), or the synthetic lab.
 * The engine (`store/restore.ts`) is the same for all three.
 *
 * Steps on screen: pick the file → its check → what it would change, by
 * project → choose (nothing is chosen by default) → confirm → the result,
 * read back. A journal keeps the text before; if a recovery is interrupted
 * the screen says what happened when it opens again.
 */

const now = () => new Date().toISOString()
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const STATE_LABEL: Record<RestoreUnit['state'], string> = {
  'solo-en-copia': 'Solo en la copia',
  'solo-local': 'Solo aquí',
  igual: 'Igual',
  distinta: 'Distinta',
}

const JOURNAL_LABEL: Record<string, string> = {
  completada: 'Completada y comprobada',
  fallida: 'Falló: no se escribió nada',
  'no-aplicada': 'Interrumpida antes de escribir: nada cambió',
  revisada: 'Cerrada tras revisarla',
}

function StoreLine({ loaded }: { loaded: Loaded | undefined }) {
  if (!loaded) return <p className="text-[14px] text-ink-3">Leyendo…</p>
  if (loaded.kind === 'vacio') return <p className="text-[14px] text-ink-2" data-testid="sandbox-state">Vacío.</p>
  if (loaded.kind !== 'ok') return <Banner tone="error">Lo guardado aquí no se puede leer ({loaded.kind === 'ilegible' ? loaded.reason : loaded.format}).</Banner>
  return (
    <p className="text-[14px] text-ink-2" data-testid="sandbox-state" data-generation={loaded.generation}>
      {n(loaded.data.projects.length, 'proyecto', 'proyectos')} · {n(loaded.data.tasks.length, 'tarea', 'tareas')} · generación {loaded.generation}
    </p>
  )
}

function ReadProblem({ read }: { read: Extract<BackupRead, { ok: false }> }) {
  return (
    <Banner tone="error">
      <span data-testid="backup-problem" data-problem={read.problem}>
        {read.message}
      </span>
      {read.details.length > 0 && (
        <ul className="mt-1 list-disc pl-4">
          {read.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <span className="mt-1 block">No se ha escrito nada.</span>
    </Banner>
  )
}

function UnitRow({ u, checked, disabled, onToggle }: { u: RestoreUnit; checked: boolean; disabled: boolean; onToggle(): void }) {
  return (
    <label className={`flex gap-3 border-t border-[var(--line)] px-4 py-3.5 first:border-t-0 ${u.choosable && !disabled ? 'cursor-pointer' : ''}`} data-testid="restore-unit" data-unit={u.key} data-state={u.state} data-selectable={u.selectable} data-choosable={u.choosable}>
      <input type="checkbox" className="mt-1 size-5 shrink-0" checked={checked} disabled={disabled || !u.choosable} onChange={onToggle} aria-label={`Recuperar ${u.label}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] text-ink">{u.label}</p>
          <Chip tone={u.state === 'distinta' || u.state === 'solo-en-copia' ? 'warn' : 'muted'}>{STATE_LABEL[u.state]}</Chip>
        </div>
        <ul className="mt-1 flex flex-col gap-0.5 text-[13px] leading-[1.45] text-ink-3">
          {u.changes.slice(0, 6).map((c, i) => (
            <li key={i}>{c}</li>
          ))}
          {u.changes.length > 6 && <li>… y {u.changes.length - 6} cambios más.</li>}
        </ul>
        {u.localNewer > 0 && u.choosable && (
          <p className="mt-1 text-[12.5px] text-[#b5531a]">Aquí hay {n(u.localNewer, 'cambio posterior', 'cambios posteriores')} a la copia: recuperarla los deshace (quedan en el diario de esta recuperación).</p>
        )}
        {!u.selectable && u.choosable && (
          <p className="mt-1 text-[12.5px] text-[#b5531a]" data-testid="unit-why">
            No se puede recuperar sola: {u.why.join(' ')} Puedes marcarla junto con lo que necesita; la selección se comprueba entera.
          </p>
        )}
      </div>
    </label>
  )
}

/**
 * Where a recovery writes. Built in ONE place per destination (`restoreTarget.ts`;
 * the lab builds its own in `testing/operationalLab.ts` with only the first three).
 */
export interface RestoreTarget {
  createEnv(): RestoreEnv
  accepts(backup: Backup): boolean
  onRefresh?(): void
  /** Absent: the synthetic lab. */
  kind?: 'operativo' | 'prueba'
  /** D3 · Why this copy is refused here (said on screen), when `accepts` is false. */
  refusal?(backup: Backup): string | undefined
  /** D2 · A copy of what is stored now, bound to its text and generation, before confirming. */
  requireCurrentCopy?: boolean
  /** «en esta app instalada» / «en este navegador». */
  where?: string
  /** Start of the names of the files saved from this screen. */
  filePrefix?: string
  /** Where «back» goes; no top bar when absent. */
  back?: string
}

/** P2-R1.4 · What the test-store tools get (test page only). */
export interface ToolsContext {
  env: RestoreEnv
  loaded: Loaded | undefined
  busy: boolean
  setBusy(b: boolean): void
  /** A journal is open or damaged. */
  open: boolean
  /** After a tool wrote: forget the copy and the plan on screen, and read again. */
  afterWrite(opts?: { clearResult?: boolean }): Promise<void>
}

export function RestoreView({ target, tools }: { target: RestoreTarget; tools?: (ctx: ToolsContext) => ReactNode }) {
  const [sandbox, setSandbox] = useState<Loaded>()
  const [journal, setJournal] = useState<JournalStatus>()
  const [source, setSource] = useState<{ name: string; read: BackupRead }>()
  const [plan, setPlan] = useState<RestorePlan>()
  const [mode, setMode] = useState<'seleccion' | 'todo'>('seleccion')
  const [chosen, setChosen] = useState<string[]>([])
  /** H02 · «He revisado» counts only for the exact selection it was ticked on; any change unticks it. */
  const [sureFor, setSureFor] = useState<string>()
  /** H03 · A damaged journal: what can be read from it, and whether the person saved it as it is. */
  /**
   * F04 · `delivered`: the exact text whose delivery was asked for (share completed or download started).
   * `confirmed`: the person says they checked it is kept. Only both, for the text now in the journal, allow closing.
   */
  const [damage, setDamage] = useState<{ reason: string; before?: string; delivered?: string; via?: string; outcome?: string; confirmed: boolean }>()
  /** Cuota · a failed close stays on screen until a close succeeds. */
  const [closeError, setCloseError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RestoreResult>()
  /** Precisión 2 · Where the plan's copy came from: a file, or the journal of this store («Volver a lo de antes»). */
  const [from, setFrom] = useState<'archivo' | 'diario'>('archivo')
  /** A confirmation refused before anything was written (test copy, copy of the current data no longer valid…). */
  const [refused, setRefused] = useState<string>()
  /** D2 · The copy of the current data made here, and what happened when it was saved. */
  const [currentCopy, setCurrentCopy] = useState<CurrentCopy>()
  const [copyOutcome, setCopyOutcome] = useState<string>()
  const [gate, setGate] = useState<CopyGate>({ ok: true })
  const getEnv = target.createEnv
  const env = getEnv()
  const prefix = target.filePrefix ?? 'elyum-prueba'
  const operational = target.kind === 'operativo'

  const refresh = useCallback(async () => {
    const e = getEnv()
    setSandbox(await createStore(e).load())
    // H04 · Found on opening, never closed on its own: the person resolves it explicitly.
    const st = await inspectJournal(e.storage)
    setJournal(st)
    if (st.kind === 'ilegible') {
      const d = st.raw === null ? { reason: st.reason } : await diagnoseJournal(st.raw)
      setDamage((prev) => ({ ...(prev?.delivered === st.raw && prev ? prev : { confirmed: false }), reason: st.reason, ...(d.before ? { before: d.before } : {}) }))
    } else setDamage(undefined)
    if (st.kind === 'sin-escribir' || st.kind === 'escrita-sin-cerrar') {
      if (st.closeError) setCloseError(st.closeError)
    }
    target.onRefresh?.()
  }, [getEnv, target])
  useEffect(() => {
    void refresh()
    // P2-R1.4 · On PROYECTOS itself, another tab saving or recovering changes what this screen may offer: read
    // again. Not for the test store and the lab, whose suites keep a stale screen on purpose (R13-01); the
    // engine refuses a stale screen's writes either way.
    if (target.kind !== 'operativo') return
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('elyum:projects:v1:')) void refresh()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, target.kind])

  function resetChoice() {
    setMode('seleccion')
    setChosen([])
    setSureFor(undefined)
  }

  async function usePlanFrom(name: string, text: string, origin: 'archivo' | 'diario' = 'archivo') {
    setResult(undefined)
    setRefused(undefined)
    resetChoice()
    setFrom(origin)
    let read = await readBackup(text)
    if (read.ok && origin === 'diario' && !(await isJournalBefore(env.storage, read.backup.storedSha256)))
      read = { ok: false, problem: 'no-es-copia', message: 'Lo de antes ya no coincide con el diario de este almacén. Vuelve a abrir Recuperar.', details: [] }
    // Precisión 2 · the test-copy rule applies to files, never to the text before kept by this store's own journal.
    else if (read.ok && origin === 'archivo' && !target.accepts(read.backup))
      read = { ok: false, problem: 'no-es-copia', message: target.refusal?.(read.backup) ?? 'Este laboratorio solo acepta copias sintéticas generadas en este mismo perfil de prueba.', details: [] }
    setSource({ name, read })
    setPlan(undefined)
    if (!read.ok) return
    const current = await createStore(env).load()
    setSandbox(current)
    if (current.kind !== 'ok' && current.kind !== 'vacio') return
    const local = current.kind === 'ok' ? current.data : emptyProjectsData()
    setPlan(planRestore(local, current.generation, read.backup))
  }

  async function onFile(f: File) {
    await usePlanFrom(f.name, await f.text())
  }

  /** Precisión 1/2 · Everything that must still hold at the moment of confirming. `undefined`: it holds. */
  async function stillAllowed(p: RestorePlan): Promise<string | undefined> {
    if (from === 'archivo' && !target.accepts(p.backup)) return target.refusal?.(p.backup) ?? 'Esta copia no se acepta aquí.'
    if (from === 'diario' && !(await isJournalBefore(env.storage, p.backup.storedSha256))) return 'Lo de antes ya no coincide con el diario de este almacén. Vuelve a abrir Recuperar.'
    if (target.requireCurrentCopy) {
      const g = await currentCopyGate(currentCopy, env.storage.getItem(DATA_KEY), p.baseGeneration)
      if (!g.ok) return g.why
    }
    return undefined
  }

  async function confirm() {
    if (!plan || !built?.ok || !sure) return
    setBusy(true)
    try {
      const why = await stillAllowed(plan)
      if (why) {
        setRefused(why)
        return
      }
      setRefused(undefined)
      const r = await performRestore(env, plan, selection, source?.name)
      setResult(r)
      setPlan(undefined)
      resetChoice()
      // The data this copy was made from is no longer what is stored (or the person starts again).
      setCurrentCopy(undefined)
      setCopyOutcome(undefined)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  /** D2 · Export what is stored now, checked, and remember exactly which text and generation it was. */
  async function saveCurrent() {
    setBusy(true)
    try {
      const at = now()
      const made = await exportProjects(env.storage, at)
      const v = await verifyExport(made.text)
      if (!v.ok || !made.file.summary || made.file.storedSha256 === null) {
        setCurrentCopy(undefined)
        setCopyOutcome(`No se pudo hacer una copia verificada de lo actual${v.ok ? '' : `: ${v.problems.join('; ')}`}.`)
        return
      }
      const r = await saveJsonFile(stampedName(`${prefix}-antes-de-recuperar`, at), made.text)
      if (r.status === 'entregado') {
        setCurrentCopy({ generation: made.file.summary.generation, storedSha256: made.file.storedSha256, confirmed: false })
        setCopyOutcome(r.via === 'compartir' ? 'Se ha enviado por la hoja de compartir.' : 'Se ha pedido la descarga.')
      } else {
        setCurrentCopy(undefined)
        setCopyOutcome(r.status === 'cancelado' ? 'Cancelado: no se ha guardado ninguna copia.' : `No se pudo guardar: ${r.message}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const toolsContext: ToolsContext = {
    env,
    loaded: sandbox,
    busy,
    setBusy,
    open: false,
    afterWrite: async (opts) => {
      setPlan(undefined)
      setSource(undefined)
      if (opts?.clearResult) setResult(undefined)
      await refresh()
    },
  }
  // H02 · The selection as a whole, rebuilt and checked on every change of the boxes.
  const selection = mode === 'todo' ? ({ mode: 'todo' } as const) : ({ mode: 'seleccion', units: [...chosen].sort() } as const)
  const built = plan && (mode === 'todo' || chosen.length) ? buildRestore(plan, selection, now()) : undefined
  const choiceKey = plan ? JSON.stringify([plan.backup.storedSha256, plan.baseGeneration, selection]) : undefined
  const sure = !!choiceKey && sureFor === choiceKey && !!built?.ok
  const open = journal && (journal.kind === 'desconocida' || journal.kind === 'escrita-sin-cerrar' || journal.kind === 'sin-escribir' || journal.kind === 'ilegible')
  toolsContext.open = !!open
  // D2 · Recomputed whenever the copy, the plan or what is stored changes (refresh reads `sandbox` again).
  useEffect(() => {
    let live = true
    if (!target.requireCurrentCopy || !plan) {
      setGate({ ok: true })
      return
    }
    void currentCopyGate(currentCopy, env.storage.getItem(DATA_KEY), plan.baseGeneration).then((g) => live && setGate(g))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCopy, plan, sandbox, target.requireCurrentCopy])
  const settle = async () => {
    setBusy(true)
    try {
      const r = await settleJournal(env)
      if ((r.kind === 'sin-escribir' || r.kind === 'escrita-sin-cerrar') && r.closeError) setCloseError(r.closeError)
      else if (r.kind === 'cerrada') setCloseError(undefined)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {target.back && <TopBar back={target.back} backLabel={target.back === '#/' ? 'PROYECTOS' : 'Exportar'} />}
      <Title kicker={<Label>Recuperar</Label>} sub="Desde una copia hecha en Exportar. Primero ves qué cambiaría; nada se escribe sin tu confirmación, y lo que había queda guardado.">
        Recuperar desde una copia
      </Title>

      <Banner tone="info">
        <span data-testid="target-note">
          {operational ? (
            <>
              Destino: <strong>tus datos de PROYECTOS {target.where ?? 'en este navegador'}</strong>. La recuperación, su diario y las versiones anteriores usan este mismo almacenamiento.
            </>
          ) : target.kind === 'prueba' ? (
            <>
              Destino: <strong>almacén de prueba separado</strong>. Esta pantalla de prueba no toca los datos de PROYECTOS de este dispositivo.
            </>
          ) : (
            <>
              Destino: <strong>claves operativas de PROYECTOS, en este perfil sintético desechable</strong>. La recuperación y su diario usan el mismo almacenamiento.
            </>
          )}
        </span>
      </Banner>

      {open && (
        <div className="mt-4 flex flex-col gap-2" data-testid="journal-open" data-kind={journal.kind}>
          <Banner tone="warn">
            {journal.kind === 'ilegible'
              ? `El diario de recuperación está dañado: ${journal.reason}. Se conserva tal cual, sin cerrarlo ni sobrescribirlo.`
              : journal.kind === 'desconocida'
                ? 'Una recuperación se interrumpió y después algo más escribió en el almacén. No se puede saber qué quedó: guarda la copia de antes y decide.'
                : journal.kind === 'sin-escribir'
                  ? 'Una recuperación se interrumpió antes de escribir: el almacén tiene exactamente el texto de antes.'
                  : 'Una recuperación se escribió y coincide con lo previsto, pero no llegó a cerrarse.'}
            {journal.kind !== 'ilegible' && <span className="mt-1 block">Empezó el {dateTime(journal.journal.startedAt)}: {journal.journal.summary}</span>}
            <span className="mt-1 block" data-testid="journal-blocks">
              Mientras no se resuelva, no se escribe nada en este almacén (tampoco desde otras pestañas o la app instalada).
            </span>
          </Banner>
          {closeError && (
            <Banner tone="error">
              <span data-testid="journal-close-error">{closeError}</span>
            </Banner>
          )}
          {(journal.kind === 'sin-escribir' || journal.kind === 'escrita-sin-cerrar') && (
            <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy} data-testid="journal-settle" onClick={settle}>
              Comprobarla otra vez y cerrarla
            </Button>
          )}
          {journal.kind === 'ilegible' && damage && (
            <div data-testid="journal-damaged">
            <Card className="flex flex-col gap-2 px-4 py-4">
              <p className="text-[13px] text-ink-3">Diagnóstico: {damage.reason}. {damage.before ? 'El texto de antes sigue entero dentro del diario.' : 'No se puede extraer un texto de antes completo.'}</p>
              {journal.raw === null ? (
                <p className="text-[13px] text-[#b5531a]">El diario no se ha podido leer: no se puede guardar ni cerrar desde aquí. No se ha tocado.</p>
              ) : (
                <>
                  <Button
                    variant="choice"
                    className="h-10 px-3 text-[12px]"
                    disabled={busy}
                    data-testid="journal-save-damaged"
                    onClick={async () => {
                      const raw = journal.raw!
                      const r = await saveJsonFile(stampedName(`${prefix}-diario-danado`, now()), raw)
                      if (r.status === 'entregado') setDamage({ ...damage, delivered: raw, via: r.via, confirmed: false, outcome: r.via === 'compartir' ? 'Se ha enviado por la hoja de compartir.' : 'Se ha pedido la descarga.' })
                      else setDamage({ ...damage, delivered: undefined, confirmed: false, outcome: r.status === 'cancelado' ? 'Cancelado: no se ha guardado nada.' : `No se pudo guardar: ${r.message}` })
                    }}
                  >
                    Guardar el diario tal cual
                  </Button>
                  {damage.outcome && (
                    <p className="text-[13px] text-ink-3" data-testid="journal-save-outcome" data-delivered={damage.delivered === journal.raw ? '1' : '0'}>
                      {damage.outcome}
                    </p>
                  )}
                  {damage.delivered === journal.raw && (
                    <label className="flex items-start gap-3 text-[14px] text-ink-2">
                      <input type="checkbox" className="mt-0.5 size-5" checked={damage.confirmed} disabled={busy} data-testid="journal-damaged-confirm" onChange={(e) => setDamage({ ...damage, confirmed: e.target.checked })} />
                      <span>He comprobado que el archivo está guardado (en Archivos o en Descargas). La app no puede comprobarlo por sí sola.</span>
                    </label>
                  )}
                  <Button
                    variant="choice"
                    className="h-10 px-3 text-[12px]"
                    disabled={busy || damage.delivered !== journal.raw || !damage.confirmed}
                    data-testid="journal-close-damaged"
                    onClick={async () => {
                      setBusy(true)
                      try {
                        // R13-01 · the close applies only to the exact text delivered and confirmed.
                        const r = await dismissJournal(env, { savedDamaged: true, reviewed: damage.delivered! })
                        setCloseError(r.ok ? undefined : r.message)
                        if (!r.ok && r.reason === 'diario-cambiado') setDamage((prev) => prev && { reason: prev.reason, confirmed: false })
                        await refresh()
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Lo he guardado: cerrarlo
                  </Button>
                </>
              )}
              <p className="text-[12.5px] text-ink-4">Al cerrarlo, su texto se conserva dentro del diario cerrado{damage.before ? ', y «Volver a lo de antes» queda disponible con vista previa' : ''}.</p>
            </Card>
            </div>
          )}
        </div>
      )}

      {target.kind === 'prueba' && tools ? (
        tools(toolsContext)
      ) : (
        <Section label={operational ? 'Ahora en PROYECTOS' : 'Almacén operativo sintético'}>
          <StoreLine loaded={sandbox} />
        </Section>
      )}

      <Section label="1 · Elegir la copia">
        <Card className="flex flex-col gap-3 px-4 py-4">
          <label className="text-[14px] text-ink-2">
            Archivo .json de Exportar
            <input
              type="file"
              accept=".json,application/json"
              data-testid="restore-input"
              className="mt-2 block w-full text-[14px] text-ink-2 file:mr-3 file:h-10 file:rounded-full file:border file:border-[var(--line)] file:bg-[var(--surface-quiet)] file:px-4 file:text-ink"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {source && !source.read.ok && <ReadProblem read={source.read} />}
          {source?.read.ok && (
            <div data-testid="backup-ok">
              <Banner tone="ok">
                Copia verificada: la huella coincide{source.read.backup.file.origin === 'prueba-p2r1' ? ' (es del almacén de prueba)' : ''}.
              </Banner>
              <Card className="mt-2 px-4 py-1">
                <Field label="Archivo">
                  <Mono>{source.name}</Mono>
                </Field>
                <Field label="Exportada">{dateTime(source.read.backup.file.exportedAt)}</Field>
                <Field label="Generación">{String(source.read.backup.generation)}</Field>
                <Field label="Contenido">
                  {n(source.read.backup.data.projects.length, 'proyecto', 'proyectos')} · {n(source.read.backup.data.tasks.length, 'tarea', 'tareas')}
                </Field>
                <Field label="Huella">
                  <Mono>{shortHash(source.read.backup.storedSha256)}</Mono>
                </Field>
              </Card>
            </div>
          )}
          {source?.read.ok && sandbox && sandbox.kind !== 'ok' && sandbox.kind !== 'vacio' && (
            <Banner tone="error">
              {operational
                ? 'Los datos de PROYECTOS no se pueden leer: no se recupera encima de ellos. Expórtalos tal cual desde Exportar para conservarlos.'
                : target.kind === 'prueba'
                  ? 'El almacén de prueba no se puede leer: no se recupera encima de él. Bórralo primero.'
                  : 'El almacén no se puede leer: no se recupera encima de él.'}
            </Banner>
          )}
        </Card>
      </Section>

      {plan && (
        <Section label="2 · Qué cambiaría">
          <div className="flex flex-col gap-3" data-testid="restore-plan">
            <p className="text-[13px] leading-[1.5] text-ink-3">Por defecto no se recupera nada: lo de aquí se conserva. Marca lo que quieras traer de la copia.</p>
            <Card className="overflow-hidden">
              {plan.units.map((u) => (
                <UnitRow key={u.key} u={u} disabled={busy || mode === 'todo'} checked={mode === 'todo' ? u.state === 'distinta' || u.state === 'solo-en-copia' : chosen.includes(u.key)} onToggle={() => {
                    setSureFor(undefined)
                    setChosen((c) => (c.includes(u.key) ? c.filter((x) => x !== u.key) : [...c, u.key]))
                  }} />
              ))}
            </Card>
            {plan.globalChanges.length > 0 && <Banner tone="info">Solo con «todo»: {plan.globalChanges.join(' ')}</Banner>}
            <label className="flex items-start gap-3 text-[14px] text-ink-2">
              <input type="checkbox" className="mt-0.5 size-5" checked={mode === 'todo'} disabled={busy} data-testid="restore-all" onChange={(e) => {
                  setSureFor(undefined)
                  setMode(e.target.checked ? 'todo' : 'seleccion')
                }} />
              <span>
                Sustituir <strong>todo</strong> por la copia. Lo de aquí que no esté en ella desaparece del almacén (queda en el diario).
              </span>
            </label>
          </div>
        </Section>
      )}

      {plan && built && (
        <Section label="3 · Confirmar">
          <Card className="flex flex-col gap-3 px-4 py-4" data-testid="confirm-area">
            {built.ok ? (
              <>
                <p className="text-[14px] text-ink-2" data-testid="restore-summary">
                  Se recuperará: {built.summary}
                </p>
                {built.warnings.length > 0 && (
                  <Banner tone="info">
                    <span data-testid="restore-warnings">Avisos que ya existían y se conservan tal cual (no se reparan):</span>
                    <ul className="mt-1 list-disc pl-4">
                      {built.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </Banner>
                )}
                {target.requireCurrentCopy && sandbox?.kind === 'ok' && (
                  <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--line)] px-3 py-3" data-testid="current-copy">
                    <p className="text-[14px] text-ink-2">Antes de confirmar, guarda una copia de lo que hay ahora (fuera de este navegador).</p>
                    <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy} data-testid="current-copy-save" onClick={saveCurrent}>
                      Guardar una copia de lo actual
                    </Button>
                    {copyOutcome && (
                      <p className="text-[13px] text-ink-3" data-testid="current-copy-outcome" data-recorded={currentCopy ? '1' : '0'}>
                        {copyOutcome}
                      </p>
                    )}
                    {currentCopy && (
                      <label className="flex items-start gap-3 text-[14px] text-ink-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-5"
                          checked={currentCopy.confirmed}
                          disabled={busy}
                          data-testid="current-copy-confirm"
                          onChange={(e) => setCurrentCopy({ ...currentCopy, confirmed: e.target.checked })}
                        />
                        <span>He comprobado que la copia de lo actual está guardada (en Archivos o en Descargas). La app no puede comprobarlo por sí sola.</span>
                      </label>
                    )}
                    {!gate.ok && (
                      <p className="text-[12.5px] text-[#b5531a]" data-testid="current-copy-gate">
                        {gate.why}
                      </p>
                    )}
                  </div>
                )}
                <label className="flex items-start gap-3 text-[14px] text-ink-2">
                  <input type="checkbox" className="mt-0.5 size-5" checked={sure} disabled={busy} data-testid="restore-sure" onChange={(e) => setSureFor(e.target.checked ? choiceKey : undefined)} />
                  <span>He revisado lo que cambia. Lo de antes queda en el diario para volver atrás.</span>
                </label>
                <Button onClick={confirm} disabled={busy || !sure || !!open || !gate.ok} data-testid="restore-confirm" className="w-full">
                  {busy ? 'Recuperando…' : operational ? 'Recuperar en PROYECTOS' : target.kind === 'prueba' ? 'Recuperar en el almacén de prueba' : 'Recuperar en el perfil sintético'}
                </Button>
                {open && <p className="text-[12.5px] text-[#b5531a]">Primero revisa la recuperación sin cerrar de abajo.</p>}
                {refused && (
                  <Banner tone="error">
                    <span data-testid="restore-refused">No se ha recuperado nada. {refused}</span>
                  </Banner>
                )}
              </>
            ) : (
              <Banner tone="error">
                <span data-testid="restore-invalid">Lo elegido, en conjunto, no se puede recuperar así:</span>
                <ul className="mt-1 list-disc pl-4">
                  {built.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </Banner>
            )}
          </Card>
        </Section>
      )}

      {result && (
        <div className="mt-6" data-testid="restore-result" data-ok={result.ok} data-reason={result.ok ? undefined : result.reason}>
          {result.ok ? (
            <Banner tone="ok">
              Recuperado y comprobado al releerlo (generación {result.generation}). {result.summary}
            </Banner>
          ) : (
            <Banner tone="error">
              {result.written ? 'Algo se escribió pero no se pudo comprobar. ' : 'No se ha recuperado nada. '}
              {result.message}
              {result.details && (
                <ul className="mt-1 list-disc pl-4">
                  {result.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </Banner>
          )}
        </div>
      )}

      {journal && journal.kind !== 'ninguna' && journal.kind !== 'ilegible' && (
        <Section label="Última recuperación">
          <Card className="flex flex-col gap-2 px-4 py-4" data-testid="journal" data-state={journal.journal.state}>
            <p className="text-[14px] text-ink-2">{journal.kind === 'cerrada' ? JOURNAL_LABEL[journal.journal.state] : 'Sin cerrar'}</p>
            <p className="text-[13px] text-ink-3">
              {dateTime(journal.journal.startedAt)} · {journal.journal.summary}
            </p>
            {journal.journal.error && <p className="text-[12.5px] text-ink-4">{journal.journal.error}</p>}
            {journal.journal.damaged !== undefined && (
              <Button
                variant="choice"
                className="h-10 px-3 text-[12px]"
                disabled={busy}
                data-testid="journal-save-damaged-closed"
                onClick={() => saveJsonFile(stampedName(`${prefix}-diario-danado`, journal.journal.startedAt), journal.journal.damaged!)}
              >
                Guardar el diario dañado que se cerró
              </Button>
            )}
            {journal.journal.before !== null ? (
              <div className="mt-1 flex flex-col gap-2">
                <Button
                  variant="choice"
                  className="h-10 px-3 text-[12px]"
                  disabled={busy}
                  data-testid="journal-save-before"
                  onClick={async () => {
                    const text = await journalAsCopy(journal.journal)
                    if (text) await saveJsonFile(stampedName(`${prefix}-antes-de-recuperar`, journal.journal.startedAt), text)
                  }}
                >
                  Guardar lo de antes
                </Button>
                <Button
                  variant="choice"
                  className="h-10 px-3 text-[12px]"
                  disabled={busy}
                  data-testid="journal-undo"
                  onClick={async () => {
                    const text = await journalAsCopy(journal.journal)
                    if (text) await usePlanFrom('lo de antes de la recuperación', text, 'diario')
                  }}
                >
                  Volver a lo de antes
                </Button>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-4">{journal.journal.damaged !== undefined ? 'Del diario dañado no se pudo extraer un texto de antes completo.' : 'Antes de esa recuperación el almacén estaba vacío.'}</p>
            )}
            {journal.kind === 'desconocida' && (
              <Button
                variant="choice"
                className="h-10 px-3 text-[12px]"
                disabled={busy}
                data-testid="journal-dismiss"
                onClick={async () => {
                  const r = await dismissJournal(env, { reviewed: journal.raw })
                  setCloseError(r.ok ? undefined : r.message)
                  await refresh()
                }}
              >
                La he revisado: cerrarla
              </Button>
            )}
            <p className="text-[12.5px] text-ink-4">«Volver a lo de antes» usa estos mismos pasos: vista previa, elección y confirmación.</p>
          </Card>
        </Section>
      )}
    </>
  )
}
