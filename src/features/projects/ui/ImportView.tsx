import { Inline } from './inline'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { APPROVAL_STATES, WORK_CLASSES, type ApprovalState, type ProjectsData, type WorkClass } from '../domain/types'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER_V2, SYNTHETIC_DOSSIER_V2_NAME } from '../import/fixtures'
import type { DossierField, ImportDecisions, PlanItem, Resolutions } from '../import/plan'
import type { DossierBundle } from '../import/bundle'
import { readDossierFile, type DossierFile } from '../import/readers'
import type { PreviewedImport } from '../store/session'
import { APPROVAL_LABEL, dateTime, FIELD_LABEL, fieldText, shortHash, WORK_CLASS_LABEL } from './labels'
import { Banner, Card, Chip, Empty, Mono, Section, Title, TopBar } from './parts'
import type { Projects } from './useProjects'

/**
 * P4a · IMPORTAR: the P3 import, controlled. Read the file, decide what only
 * the person can decide (target, classes of new status words), look at the
 * preview — new, unchanged, changed, conflicts, no longer in the dossier —
 * and only then confirm. Nothing is written before the confirmation.
 */

const KIND_LABEL: Record<PlanItem['kind'], string> = { nueva: 'Nueva', igual: 'Sin cambios', cambiada: 'Cambiada', conflicto: 'Conflicto' }
const KINDS: PlanItem['kind'][] = ['conflicto', 'cambiada', 'nueva', 'igual']

type Target = { kind: 'existente'; projectId: string } | { kind: 'nuevo'; name: string }

const encoder = new TextEncoder()
const synthetic = (name: string, text: string): DossierFile => ({ name, bytes: encoder.encode(text) })

/**
 * The target suggested on screen (the person can change it before confirming):
 * the project that already uses this file, else the one that already holds
 * tasks with these IDs (a later version of its dossier), else a new one.
 */
function defaultTarget(data: ProjectsData, bundle: DossierBundle): { target: Target; why?: string } {
  const same = data.projects.find((p) => p.dossier === bundle.dossier.name)
  if (same) return { target: { kind: 'existente', projectId: same.id }, why: 'Este proyecto ya usa este archivo.' }
  const ids = new Set(bundle.tasks.map((t) => t.sourceId))
  const holder = data.tasks.find((t) => t.sourceId !== undefined && ids.has(t.sourceId))
  if (holder) return { target: { kind: 'existente', projectId: holder.projectId }, why: `Este proyecto ya tiene tareas con estos IDs (${holder.sourceId}…): parece una versión nueva de su dossier.` }
  // The dossier's title without its generic prefix.
  return { target: { kind: 'nuevo', name: (bundle.project.name ?? bundle.dossier.name.replace(/\.md$/i, '')).replace(/^dossier operativo\s*[—–-]\s*/i, '') } }
}

export function ImportView({ p }: { p: Projects }) {
  const s = p.state
  const [file, setFile] = useState<DossierFile>()
  const [readError, setReadError] = useState<string>()
  const [target, setTarget] = useState<Target>()
  const [targetWhy, setTargetWhy] = useState<string>()
  const [classes, setClasses] = useState<Record<string, WorkClass>>({})
  const [approvals, setApprovals] = useState<Record<string, ApprovalState>>({})
  const [resolutions, setResolutions] = useState<Resolutions>({})
  const [preview, setPreview] = useState<PreviewedImport>()
  const [result, setResult] = useState<{ ok: true; projectId: string } | { ok: false; message: string; conflict: boolean }>()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const data = s?.status === 'listo' ? s.data : undefined
  const decisions: ImportDecisions | undefined = target && {
    target: target.kind === 'existente' ? { projectId: target.projectId } : { create: { name: target.name } },
    statusClasses: classes,
    approvalStates: approvals,
  }

  // The preview follows every decision. It writes nothing.
  const key = JSON.stringify([file?.name, file?.bytes.length, decisions, s?.status === 'listo' ? s.generation : -1])
  useEffect(() => {
    let live = true
    if (!file || !decisions) return
    void p.session.previewImport(file, decisions).then((r) => {
      if (!live) return
      if (r.ok) {
        setPreview(r.preview)
        setReadError(undefined)
      } else {
        setPreview(undefined)
        setReadError(r.error)
      }
    })
    return () => {
      live = false
    }
  }, [key])

  async function choose(f: DossierFile) {
    if (!data) return
    reset()
    const read = await readDossierFile(f)
    if (!read.ok) {
      setReadError(read.error)
      return
    }
    setFile(f)
    const t = defaultTarget(data, read.bundle)
    setTarget(t.target)
    setTargetWhy(t.why)
  }

  function reset() {
    setFile(undefined)
    setReadError(undefined)
    setTarget(undefined)
    setTargetWhy(undefined)
    setClasses({})
    setApprovals({})
    setResolutions({})
    setPreview(undefined)
    setResult(undefined)
    if (input.current) input.current.value = ''
  }

  async function confirm() {
    if (!preview) return
    setBusy(true)
    const r = await p.session.confirmImport(preview, resolutions)
    setBusy(false)
    p.sync()
    if (r.ok) setResult({ ok: true, projectId: preview.plan.projectId })
    else {
      setResult({ ok: false, message: r.message, conflict: r.reason === 'conflicto' })
      // Someone else saved: read the newer data; the preview recalculates on it.
      if (r.reason === 'conflicto') await p.reload()
    }
  }

  if (!s) return null
  if (s.status !== 'listo')
    return (
      <>
        <TopBar back="#/" backLabel="Proyectos" />
        <Banner tone="error">Los datos guardados no se pueden leer ({s.reason}). No se importa nada encima. Exporta la copia tal cual desde Exportar.</Banner>
      </>
    )

  const plan = preview?.plan
  const existingNames = data!.projects.filter((x) => target?.kind === 'nuevo' && x.name.trim().toLowerCase() === target.name.trim().toLowerCase())
  const vocab = plan ? data!.vocabularies[plan.dossierKey] : undefined
  const approvalLiterals = plan ? [...new Set(plan.bundle.tasks.flatMap((t) => (t.approvalLiteral !== undefined ? [t.approvalLiteral] : [])))].filter((l) => !vocab?.approval.some((a) => a.literal === l)) : []
  const conflicts = plan?.items.filter((i) => i.kind === 'conflicto') ?? []
  const choice = (taskId: string, f: DossierField) => resolutions[taskId]?.[f] ?? 'mantener-elyum'

  return (
    <>
      <TopBar back="#/" backLabel="Proyectos" />
      <Title kicker={<Label>Importar</Label>} sub="Vista previa primero. No se guarda nada hasta que confirmes.">
        Importar un dossier
      </Title>

      {!s.writable && <Banner tone="warn">Solo lectura: {s.readOnlyReason ?? 'este navegador no permite escribir con seguridad'}. Puedes ver la vista previa, pero no confirmarla.</Banner>}

      {result?.ok ? (
        <div className="flex flex-col gap-3" data-testid="import-done">
          <Banner tone="ok">Importación guardada y releída. Generación {s.generation}.</Banner>
          <a href={`#/proyecto/${encodeURIComponent(result.projectId)}`} className="block">
            <Button className="w-full">Abrir el proyecto</Button>
          </a>
          <Button variant="quiet" onClick={reset}>
            Importar otro dossier
          </Button>
        </div>
      ) : (
        <>
          <Section label="1 · Archivo">
            <Card className="flex flex-col gap-3 px-4 py-4">
              <label className="text-[14px] text-ink-2">
                Dossier en Markdown (.md)
                <input
                  ref={input}
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  data-testid="file-input"
                  className="mt-2 block w-full text-[14px] text-ink-2 file:mr-3 file:h-10 file:rounded-full file:border file:border-[var(--line)] file:bg-[var(--surface-quiet)] file:px-4 file:text-ink"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (f) await choose({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                <span className="w-full text-[12.5px] text-ink-3">Datos sintéticos para probar:</span>
                <Button variant="choice" className="h-10 min-w-0 px-4 text-[11.5px]" onClick={() => choose(synthetic(SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER))}>
                  Huerto v1
                </Button>
                <Button variant="choice" className="h-10 min-w-0 px-4 text-[11.5px]" onClick={() => choose(synthetic(SYNTHETIC_DOSSIER_V2_NAME, SYNTHETIC_DOSSIER_V2))}>
                  Huerto v2 · cambios
                </Button>
              </div>
            </Card>
            {readError && (
              <div className="mt-3">
                <Banner tone="error">No se puede importar este archivo: {readError}</Banner>
              </div>
            )}
          </Section>

          {file && plan && target && (
            <>
              <Section label="2 · Destino">
                <Card className="flex flex-col gap-3 px-4 py-4">
                  <p className="text-[14px] text-ink-2">
                    <Mono>{plan.bundle.dossier.name}</Mono>
                    <span className="block text-[12.5px] text-ink-4">
                      {plan.bundle.dossier.bytes} bytes · huella {shortHash(plan.bundle.dossier.sha256)} · {plan.bundle.dossier.reader}
                    </span>
                  </p>
                  <select
                    data-testid="target"
                    className="h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface-quiet)] px-3 text-[15px] text-ink"
                    value={target.kind === 'existente' ? target.projectId : ''}
                    onChange={(e) => {
                      setTargetWhy(undefined)
                      setTarget(e.target.value ? { kind: 'existente', projectId: e.target.value } : defaultTarget({ ...data!, projects: [], tasks: [] }, plan.bundle).target)
                    }}
                  >
                    <option value="">Proyecto nuevo</option>
                    {data!.projects.map((x) => (
                      <option key={x.id} value={x.id}>
                        En «{x.name}»
                      </option>
                    ))}
                  </select>
                  {targetWhy && <p className="text-[13px] leading-[1.5] text-ink-3">{targetWhy}</p>}
                  {target.kind === 'nuevo' && (
                    <input
                      aria-label="Nombre del proyecto nuevo"
                      className="h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface-quiet)] px-3 text-[15px] text-ink"
                      value={target.name}
                      onChange={(e) => setTarget({ kind: 'nuevo', name: e.target.value })}
                    />
                  )}
                  {existingNames.length > 0 && <Banner tone="warn">Ya existe un proyecto llamado «{existingNames[0].name}». Si es el mismo, elígelo arriba: así no se duplica.</Banner>}
                </Card>
              </Section>

              {(plan.newStatusLiterals.length > 0 || approvalLiterals.length > 0) && (
                <Section label="3 · Palabras nuevas del dossier">
                  <Card className="flex flex-col gap-3 px-4 py-4">
                    <p className="text-[13px] leading-[1.5] text-ink-3">ELYUM no adivina qué significa cada estado. Lo que no decidas queda «sin decidir» y la tarea no podrá ser candidata.</p>
                    {plan.newStatusLiterals.map((l) => (
                      <label key={l.literal} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 text-[15px] text-ink">
                          «{l.literal}» <span className="text-[12.5px] text-ink-4">{l.tasks.join(', ')}</span>
                        </span>
                        <select
                          data-testid={`class-${l.literal}`}
                          className="h-10 shrink-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface-quiet)] px-2 text-[14px] text-ink"
                          value={classes[l.literal] ?? 'sin-decidir'}
                          onChange={(e) => setClasses({ ...classes, [l.literal]: e.target.value as WorkClass })}
                        >
                          {WORK_CLASSES.map((c) => (
                            <option key={c} value={c}>
                              {WORK_CLASS_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    {approvalLiterals.map((l) => (
                      <label key={l} className="flex items-center justify-between gap-3">
                        <span className="text-[15px] text-ink">Aprobación «{l}»</span>
                        <select
                          className="h-10 shrink-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface-quiet)] px-2 text-[14px] text-ink"
                          value={approvals[l] ?? 'sin-dato'}
                          onChange={(e) => setApprovals({ ...approvals, [l]: e.target.value as ApprovalState })}
                        >
                          {APPROVAL_STATES.map((a) => (
                            <option key={a} value={a}>
                              {APPROVAL_LABEL[a]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </Card>
                </Section>
              )}

              <Section label="Vista previa">
                <div className="flex flex-col gap-3" data-testid="preview">
                  {plan.errors.length > 0 && (
                    <Banner tone="error">
                      <strong className="font-medium">No se puede importar.</strong>
                      <ul className="mt-1 list-disc pl-4">
                        {plan.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </Banner>
                  )}
                  {plan.sameFile && <Banner tone="info">Este mismo archivo ya se importó en este proyecto. Volver a importarlo no cambia nada que no hayas cambiado tú.</Banner>}
                  <div className="grid grid-cols-3 gap-2" data-testid="counts">
                    {[
                      ['Nuevas', plan.counts.new],
                      ['Cambiadas', plan.counts.changed],
                      ['Conflictos', plan.counts.conflicts],
                      ['Sin cambios', plan.counts.unchanged],
                      ['Ya no están', plan.counts.missing],
                      ['Referencias', plan.counts.references],
                    ].map(([label, n]) => (
                      <div key={label} className="surface-quiet rounded-[16px] px-3 py-2.5">
                        <div className="tabular font-display text-[20px] leading-none text-ink">{n}</div>
                        <div className="mt-1 text-[11.5px] text-ink-3">{label}</div>
                      </div>
                    ))}
                  </div>
                  {plan.warnings.length > 0 && (
                    <details className="surface-quiet rounded-[16px] px-4 py-3 text-[13.5px] text-ink-2">
                      <summary className="cursor-pointer">{plan.warnings.length} avisos</summary>
                      <ul className="mt-2 flex flex-col gap-1 text-ink-3">
                        {plan.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </Section>

              {conflicts.length > 0 && (
                <Section label="Conflictos" count={conflicts.length}>
                  <p className="mb-3 px-1 text-[13px] leading-[1.5] text-ink-3">Cambiaron a la vez el dossier y ELYUM. Por defecto se conserva lo de ELYUM.</p>
                  <div className="flex flex-col gap-3">
                    {conflicts.map((it) => (
                      <Card key={it.taskId} className="px-4 py-3">
                        <Mono>{it.sourceId}</Mono>
                        {it.changes
                          .filter((c) => c.conflict)
                          .map((c) => (
                            <fieldset key={c.field} className="mt-2 border-t border-[var(--line)] pt-2" data-testid="conflict">
                              <legend className="text-[12.5px] text-ink-3">{FIELD_LABEL[c.field]}</legend>
                              {(['mantener-elyum', 'usar-dossier'] as const).map((opt) => (
                                <label key={opt} className="mt-1.5 flex items-start gap-2.5 text-[14.5px] text-ink">
                                  <input
                                    type="radio"
                                    className="mt-1 accent-[var(--color-electric)]"
                                    name={`${it.taskId}:${c.field}`}
                                    checked={choice(it.taskId, c.field) === opt}
                                    onChange={() => setResolutions({ ...resolutions, [it.taskId]: { ...resolutions[it.taskId], [c.field]: opt } })}
                                  />
                                  <span>
                                    <span className="text-[12px] text-ink-3">{opt === 'mantener-elyum' ? 'Mantener ELYUM' : 'Usar el dossier'}</span>
                                    <span className="block"><Inline text={fieldText(opt === 'mantener-elyum' ? c.current : c.incoming)} /></span>
                                  </span>
                                </label>
                              ))}
                            </fieldset>
                          ))}
                      </Card>
                    ))}
                  </div>
                </Section>
              )}

              <Section label="Tareas del dossier" count={plan.items.length}>
                <Card className="overflow-hidden">
                  {KINDS.flatMap((k) => plan.items.filter((i) => i.kind === k)).map((it) => (
                    <div key={it.taskId} className="border-b border-[var(--line)] px-4 py-3 last:border-b-0" data-testid="plan-item" data-kind={it.kind}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Mono>{it.sourceId}</Mono>
                          <p className="text-[14.5px] leading-[1.4] text-ink"><Inline text={it.draft.title} /></p>
                        </div>
                        <Chip tone={it.kind === 'conflicto' ? 'warn' : it.kind === 'igual' ? 'muted' : 'plain'}>{KIND_LABEL[it.kind]}</Chip>
                      </div>
                      {it.kind === 'cambiada' && (
                        <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-ink-3">
                          {it.changes.map((c) => (
                            <li key={c.field}>
                              {FIELD_LABEL[c.field]}: <Inline text={fieldText(c.current)} /> → <span className="text-ink-2"><Inline text={fieldText(c.incoming)} /></span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {it.editedInElyum.length > 0 && <p className="mt-1 text-[12.5px] text-ink-4">Se conserva lo editado en ELYUM: {it.editedInElyum.map((f) => FIELD_LABEL[f]).join(', ')}</p>}
                      {it.readings.length > 0 && <p className="mt-1 text-[12.5px] text-ink-4">Dependencia leída como {it.readings.join('; ')}</p>}
                    </div>
                  ))}
                  {plan.items.length === 0 && <Empty>El dossier no tiene tareas.</Empty>}
                </Card>
              </Section>

              {plan.missing.length > 0 && (
                <Section label="Ya no están en el dossier" count={plan.missing.length}>
                  <p className="mb-3 px-1 text-[13px] text-ink-3">No se borran. Siguen en ELYUM tal como están.</p>
                  <Card className="px-4 py-1">
                    {plan.missing.map((m) => (
                      <p key={m.taskId} className="border-b border-[var(--line)] py-2.5 text-[14px] last:border-b-0">
                        <Mono>{m.sourceId}</Mono> <span className="text-ink"><Inline text={m.title} /></span>
                      </p>
                    ))}
                  </Card>
                </Section>
              )}

              <div className="mt-8 border-t border-[var(--line)] pt-6" data-testid="confirm-area">
                {result && !result.ok && (
                  <div className="mb-3">
                    <Banner tone="error">
                      {result.message}
                      {result.conflict && ' La vista previa se ha recalculado con los datos nuevos; revísala antes de confirmar.'}
                    </Banner>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Button data-testid="confirm" disabled={!plan.ok || !s.writable || busy || preview?.baseGeneration !== s.generation} onClick={confirm} className="w-full">
                    {plan.creating ? `Crear «${target.kind === 'nuevo' ? target.name : ''}» e importar` : 'Confirmar importación'}
                  </Button>
                  <Button variant="quiet" onClick={reset} data-testid="cancel">
                    Cancelar · no se guarda nada
                  </Button>
                </div>
                {data!.imports && data!.imports.length > 0 && <p className="mt-2 text-center text-[12px] text-ink-4">Última importación: {dateTime(data!.imports[data!.imports.length - 1].at)}</p>}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
