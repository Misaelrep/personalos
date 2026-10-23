import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { applyWrites, changedSincePreview, overwrittenAfterImport, type ApplyReport } from '../domain/apply'
import { canonicalJson } from '../domain/canonical'
import { collectModules } from '../domain/collect'
import { backupFileName, createBackup, localIsoString, serializeBackup } from '../domain/create'
import { keyLabel, valueSummary } from '../domain/describe'
import { MODULE_IDS, MODULE_LABEL, type BackupFile, type ModuleId } from '../domain/format'
import { shortHash } from '../domain/integrity'
import { parseBackup } from '../domain/parse'
import { carrySelection, defaultSelection, planImport, plannedWrites, type ImportPlan, type ImportSelection } from '../domain/plan'
import { ownRestores, restoreInProgressElsewhere, writeMarker } from '../storage/restore'
import { browserStorage } from '../storage/storage'
import { daysSince, loadMeta, saveMeta } from '../storage/system'
import { deliverFile, deviceLabel } from './deliver'
import { leaveImportNotice, useStorageHealth } from './health'

interface CopiasProps {
  /** An import is being prepared or written: no update reload may happen meanwhile. */
  onBusy: (busy: boolean) => void
}

type ImportState =
  | { step: 'idle' }
  | { step: 'rejected'; message: string }
  | {
      step: 'preview'
      file: BackupFile
      plan: ImportPlan
      selection: ImportSelection
      safety?: SafetyCopy
      confirmed: boolean
      /** Keys that changed on this device after an earlier preview: this one replaces it. */
      changed?: string[]
      /** Another tab is restoring: this one waits. */
      elsewhere?: boolean
    }
  | { step: 'failed'; report: ApplyReport }
  | { step: 'writing' }
  | { step: 'done'; written: number; reloading: boolean; overwritten: string[] }

interface SafetyCopy {
  hash: string
  delivered: 'shared' | 'downloaded'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * COPIAS DE SEGURIDAD. Everything ELYUM keeps on this device — days (HOY,
 * FOCUS, entry), APRENDER and PROYECTOS — to a file outside the app, and back.
 * An import shows exactly what it would do, requires a copy of the current
 * state saved outside first, never deletes, never overwrites without an
 * explicit choice, verifies every write and undoes everything if one fails.
 */
export function Copias({ onBusy }: CopiasProps) {
  const storage = browserStorage()
  const { health, recheck } = useStorageHealth()
  const [meta, setMeta] = useState(() => loadMeta(storage))
  const [exported, setExported] = useState<{ hash: string; counts: BackupFile['counts'] } | undefined>()
  const [exportError, setExportError] = useState<string>()
  const [working, setWorking] = useState(false)
  const [imp, setImp] = useState<ImportState>({ step: 'idle' })
  const input = useRef<HTMLInputElement>(null)
  const now = Date.now()
  const current = useMemo(() => (storage ? collectModules(storage) : undefined), [storage, imp, exported])

  // The copy is prepared ahead (hashing is asynchronous): iOS opens the share sheet only within the tap itself.
  const [prepared, setPrepared] = useState<{ file: BackupFile; canon: string }>()
  useEffect(() => {
    if (!storage) return
    let live = true
    void createBackup(storage, new Date(), deviceLabel()).then((file) => {
      if (live) setPrepared({ file, canon: canonicalJson(file.modules) })
    })
    return () => {
      live = false
    }
  }, [storage, imp.step, exported])

  const busy = imp.step === 'preview' || imp.step === 'writing' || imp.step === 'done' || working
  useEffect(() => onBusy(busy), [busy, onBusy])
  useEffect(() => () => onBusy(false), [onBusy])

  /** Build a copy of this device and hand it out of the app. */
  const exportNow = async (): Promise<{ hash: string; file: BackupFile; delivered: 'shared' | 'downloaded' } | undefined> => {
    if (!storage) {
      setExportError('Este navegador no permite leer los datos guardados.')
      return
    }
    setWorking(true)
    setExportError(undefined)
    try {
      const at = new Date()
      // Still exactly the data on this device? Then hand out the prepared copy at once; otherwise build it now.
      const ready = prepared && prepared.canon === canonicalJson(collectModules(storage)) ? { ...prepared.file, createdAt: localIsoString(at) } : undefined
      const file = ready ?? (await createBackup(storage, at, deviceLabel()))
      const delivered = await deliverFile(backupFileName(at), serializeBackup(file))
      if (delivered === 'cancelled') return
      if (!saveMeta(storage, { lastExport: { at: at.getTime(), hash: file.integrity.total } }))
        setExportError('La copia se exportó, pero no se pudo anotar en este dispositivo.')
      setMeta(loadMeta(storage))
      recheck()
      return { hash: file.integrity.total, file, delivered }
    } catch (error) {
      setExportError(`No se pudo exportar: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setWorking(false)
    }
  }

  const onExport = async () => {
    const r = await exportNow()
    if (r) setExported({ hash: r.hash, counts: r.file.counts })
  }

  const onChoose = async (f: File | undefined) => {
    if (!f || !storage) return
    const parsed = await parseBackup(await f.text())
    if (!parsed.ok) {
      setImp({ step: 'rejected', message: parsed.message })
      return
    }
    const plan = planImport(parsed.file, storage)
    setImp({ step: 'preview', file: parsed.file, plan, selection: defaultSelection(plan), confirmed: false })
  }

  const onSafetyCopy = async () => {
    if (imp.step !== 'preview') return
    const r = await exportNow()
    if (r) setImp({ ...imp, safety: { hash: r.hash, delivered: r.delivered }, confirmed: false })
  }

  /** The device changed since the preview: show the new one; the safety copy and the confirmation must be done again. */
  const reviewAgain = (prev: Extract<ImportState, { step: 'preview' }>, changed: string[]) => {
    if (!storage) return
    const plan = planImport(prev.file, storage)
    setImp({ step: 'preview', file: prev.file, plan, selection: carrySelection(plan, prev.selection), confirmed: false, changed })
  }

  const onApply = async () => {
    if (imp.step !== 'preview' || !storage || !imp.safety || !imp.confirmed) return
    const preview = imp
    if (restoreInProgressElsewhere(storage, Date.now(), ownRestores)) {
      setImp({ ...preview, elsewhere: true })
      return
    }
    // Exactly what the person reviewed: every key over the value the preview showed.
    const writes = plannedWrites(preview.plan, preview.selection)
    const before = changedSincePreview(storage, writes)
    if (before.length) return reviewAgain(preview, before)

    // Tell every other tab first, so they stop (and cannot save an old state) before anything is written.
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    ownRestores.add(id)
    try {
      writeMarker(storage, { id, phase: 'writing', at: Date.now() })
    } catch {
      setImp({ step: 'failed', report: { ok: false, written: 0, localSafetyCopy: false, failure: { kind: 'unavailable', message: 'No se pudo avisar a las demás pestañas de ELYUM: no se escribió nada.' } } })
      return
    }
    setImp({ step: 'writing' })
    await new Promise((r) => window.setTimeout(r, 400))

    const report = applyWrites(storage, writes, Date.now())
    try {
      writeMarker(storage, { id, phase: report.ok ? 'done' : 'failed', at: Date.now() })
    } catch {
      // Other tabs treat a restore that never ends as abandoned and reload anyway.
    }
    recheck()
    if (!report.ok) {
      if (report.failure?.kind === 'stale') return reviewAgain(preview, report.changed ?? [])
      setImp({ step: 'failed', report })
      return
    }
    saveMeta(storage, { lastImport: { at: Date.now(), hash: preview.file.integrity.total, written: report.written } })
    // Days and APRENDER are held in memory by their screens: reload so nothing stale is saved back over the restored data.
    const reload = writes.some((w) => w.key.startsWith('personal-os:') || w.key.startsWith('elyum:learn:'))
    setImp({ step: 'done', written: report.written, reloading: reload, overwritten: [] })
    // Once other tabs have had time to stop and reload: is everything still what was written?
    window.setTimeout(() => {
      const overwritten = overwrittenAfterImport(storage, writes)
      if (reload) {
        leaveImportNotice({ written: report.written, at: Date.now(), overwritten })
        window.location.reload()
      } else setImp({ step: 'done', written: report.written, reloading: false, overwritten })
    }, 1500)
  }

  const last = meta.lastExport
  const lastLine = !last ? 'Todavía no se ha exportado ninguna copia desde este dispositivo.' : `Última copia: ${dayWord(daysSince(last.at, now))} · huella ${shortHash(last.hash)}`
  const stale = !last || daysSince(last.at, now) >= 7

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {!health.ok && <Problem title="El almacenamiento falla">{health.message}</Problem>}

      {/* EXPORTAR */}
      <section aria-labelledby="export-title" className="surface rounded-[28px] px-6 pt-6 pb-6 sm:px-9 sm:pt-8 sm:pb-8">
        <Label className="text-ink-2">Exportar</Label>
        <h2 id="export-title" className="mt-4 text-[22px] leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">
          Una copia de todo, fuera del teléfono
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Días (HOY, FOCUS y entrada), Aprender y Proyectos en un archivo. Guárdalo en Archivos, iCloud Drive o el ordenador: una copia que solo vive
          en este dispositivo no protege nada.
        </p>
        {current && <p className="mt-3 text-[13px] text-ink-3">En este dispositivo: {countsLine(MODULE_IDS.map((id) => [id, Object.keys(current[id].keys).length]))}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button onClick={onExport} disabled={working || !storage}>
            Exportar copia
          </Button>
          <span className={`text-[13px] ${stale ? 'text-ink-2' : 'text-ink-3'}`}>{lastLine}</span>
        </div>
        {exported && (
          <p role="status" className="mt-4 text-[14px] text-ink-2">
            Copia exportada · {countsLine(MODULE_IDS.map((id) => [id, exported.counts[id]]))} · huella <span className="tabular text-ink">{shortHash(exported.hash)}</span>
          </p>
        )}
        {exportError && <Problem title="Exportación">{exportError}</Problem>}
      </section>

      {/* IMPORTAR */}
      <section aria-labelledby="import-title" className="surface-quiet rounded-[28px] px-6 pt-6 pb-6 sm:px-9 sm:pt-8 sm:pb-8">
        <Label className="text-ink-2">Importar</Label>
        <h2 id="import-title" className="mt-4 text-[22px] leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">
          Restaurar desde una copia
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Antes de escribir nada verás qué se añade, qué ya está igual y qué es distinto. No se borra nada; lo que solo está en este dispositivo se conserva.
        </p>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void onChoose(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {(imp.step === 'idle' || imp.step === 'rejected' || imp.step === 'failed') && (
          <div className="mt-6">
            <Button variant="choice" onClick={() => input.current?.click()} disabled={!storage}>
              Elegir copia
            </Button>
          </div>
        )}
        {imp.step === 'rejected' && <Problem title="No se importó nada">{imp.message}</Problem>}
        {imp.step === 'failed' && <FailedReport report={imp.report} />}
        {imp.step === 'preview' && (
          <Preview
            state={imp}
            working={working}
            onSelection={(selection) => setImp({ ...imp, selection })}
            onSafetyCopy={onSafetyCopy}
            onConfirm={(confirmed) => setImp({ ...imp, confirmed })}
            onApply={() => void onApply()}
            onCancel={() => setImp({ step: 'idle' })}
          />
        )}
        {imp.step === 'writing' && (
          <p role="status" className="mt-6 text-[15px] text-ink">
            Restaurando…
          </p>
        )}
        {imp.step === 'done' && (
          <p role="status" className="mt-6 text-[15px] text-ink">
            Restaurado: {plural(imp.written, 'dato escrito', 'datos escritos')} y verificados.{imp.reloading ? ' Recargando ELYUM…' : ''}
          </p>
        )}
        {imp.step === 'done' && imp.overwritten.length > 0 && <Overwritten keys={imp.overwritten} />}
      </section>
    </div>
  )
}

function Preview({
  state,
  working,
  onSelection,
  onSafetyCopy,
  onConfirm,
  onApply,
  onCancel,
}: {
  state: Extract<ImportState, { step: 'preview' }>
  working: boolean
  onSelection: (s: ImportSelection) => void
  onSafetyCopy: () => void
  onConfirm: (confirmed: boolean) => void
  onApply: () => void
  onCancel: () => void
}) {
  const { file, plan, selection, safety, confirmed, changed, elsewhere } = state
  const writes = plannedWrites(plan, selection)
  const toggleModule = (id: ModuleId, on: boolean) =>
    onSelection({ ...selection, modules: on ? [...selection.modules, id] : selection.modules.filter((m) => m !== id) })
  /** Choosing the copy for a conflict also selects its module; keeping this device's never needs it. */
  const toggleConflict = (id: ModuleId, key: string, take: boolean) =>
    onSelection({
      modules: take && !selection.modules.includes(id) ? [...selection.modules, id] : selection.modules,
      takeBackup: take ? [...selection.takeBackup, key] : selection.takeBackup.filter((k) => k !== key),
    })

  return (
    <div className="mt-6 flex flex-col gap-5">
      {changed && changed.length > 0 && (
        <Problem title="Este dispositivo cambió después de la vista previa">
          No se escribió nada. Cambió: {changed.map(keyLabel).join(', ')}. Esta es la vista previa actualizada: revísala, exporta otra vez el estado actual
          y confirma de nuevo.
        </Problem>
      )}
      {elsewhere && (
        <Problem title="Otra pestaña está restaurando una copia">
          No se escribió nada. Espera a que termine (las pestañas se recargan solas) y vuelve a intentarlo.
        </Problem>
      )}
      <div className="text-[14px] leading-relaxed text-ink-2">
        <p>
          Copia del <span className="text-ink">{formatCreated(file.createdAt)}</span>
          {file.device ? ` · ${file.device}` : ''}
        </p>
        <p>
          Integridad verificada · huella <span className="tabular text-ink">{shortHash(file.integrity.total)}</span>
        </p>
      </div>

      {MODULE_IDS.map((id) => {
        const m = plan.modules[id]
        const actionable = m.counts.new + m.counts.conflict > 0
        const on = selection.modules.includes(id)
        const conflicts = m.entries.filter((e) => e.kind === 'conflict')
        return (
          <fieldset key={id} className="rounded-2xl border border-line px-4 py-4 sm:px-5" disabled={!actionable}>
            <legend className="sr-only">{MODULE_LABEL[id]}</legend>
            <label className={`flex items-center gap-3 ${actionable ? 'cursor-pointer' : 'opacity-60'}`}>
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={on && actionable} onChange={(e) => toggleModule(id, e.target.checked)} />
              <span className="text-[15px] text-ink">{MODULE_LABEL[id]}</span>
            </label>
            <p className="mt-2 pl-8 text-[13px] leading-relaxed text-ink-3">
              {plural(m.counts.new, 'nuevo', 'nuevos')} · {plural(m.counts.identical, 'duplicado (igual)', 'duplicados (iguales)')} ·{' '}
              {m.counts.conflict} en conflicto · {m.counts['local-only']} solo en este dispositivo (se conservan)
            </p>
            {conflicts.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 pl-8">
                {conflicts.map((e) => {
                  const take = on && selection.takeBackup.includes(e.key)
                  return (
                    <li key={e.key} className="text-[13px] leading-snug">
                      <p className="text-ink-2">{keyLabel(e.key)}</p>
                      <p className="text-ink-3">
                        Aquí: {e.localEmpty ? 'vacío, sin registros' : valueSummary(e.key, e.local!)} · En la copia: {valueSummary(e.key, e.backup!)}
                      </p>
                      <label className="mt-1 flex cursor-pointer items-center gap-2 text-ink-2">
                        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={take} onChange={(ev) => toggleConflict(id, e.key, ev.target.checked)} />
                        {take ? 'Usar el de la copia (el de aquí queda guardado aparte)' : 'Conservar el de este dispositivo'}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>
        )
      })}

      <p className="text-[15px] text-ink">
        Se escribirán {plural(writes.length, 'dato', 'datos')}. No se borrará nada.
      </p>

      {writes.length > 0 && (
        <div className="rounded-2xl border border-line px-4 py-4 sm:px-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            <span className="text-ink">Antes de importar:</span> exporta el estado actual de este dispositivo y guárdalo fuera de él.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button variant="choice" onClick={onSafetyCopy} disabled={working}>
              {safety ? 'Exportar de nuevo' : 'Exportar el estado actual'}
            </Button>
            {safety && (
              <span className="text-[13px] text-ink-3">
                {safety.delivered === 'shared' ? 'Compartida' : 'Descargada'} · huella <span className="tabular">{shortHash(safety.hash)}</span>
              </span>
            )}
          </div>
          {safety && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-ink">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
              He guardado esa copia fuera de este dispositivo.
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onApply} disabled={writes.length === 0 || !safety || !confirmed}>
          Importar
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function Overwritten({ keys }: { keys: string[] }) {
  return (
    <Problem title="La restauración no se conservó entera">
      Otra pestaña de ELYUM cambió {keys.map(keyLabel).join(', ')} durante la restauración. Cierra las demás pestañas y vuelve a importar la copia: lo que
      había antes sigue en la copia que exportaste.
    </Problem>
  )
}

function FailedReport({ report }: { report: ApplyReport }) {
  const f = report.failure
  return (
    <Problem title="La importación no se completó">
      {f?.message}
      {f?.key ? ` (${keyLabel(f.key)})` : ''}{' '}
      {report.rolledBack
        ? 'Todo lo que esta importación había escrito se devolvió a su estado anterior: tus datos están como antes.'
        : `No se pudieron devolver a su estado anterior: ${report.rollbackFailures?.map(keyLabel).join(', ')}. Restaura con la copia que exportaste antes de importar.`}
    </Problem>
  )
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="mt-4 border-l-2 border-[#e5484d] py-1 pl-4 text-[14px] leading-relaxed text-ink">
      <p className="font-medium">{title}</p>
      <p className="text-ink-2">{children}</p>
    </div>
  )
}

function countsLine(entries: [ModuleId, number][]): string {
  const n = Object.fromEntries(entries) as Record<ModuleId, number>
  return [`${plural(n.core, 'dato de días', 'datos de días')}`, `Aprender ${n.learn}`, `Proyectos ${n.projects}`].join(' · ')
}

function dayWord(days: number): string {
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`
}

function formatCreated(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}, ${m[4]}:${m[5]}` : iso
}
