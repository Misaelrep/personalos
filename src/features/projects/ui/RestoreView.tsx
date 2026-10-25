import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { exportProjects } from '../store/export'
import {
  buildRestore,
  dismissJournal,
  journalAsCopy,
  performRestore,
  planRestore,
  prefixedStorage,
  readBackup,
  settleJournal,
  type BackupRead,
  type JournalStatus,
  type RestoreEnv,
  type RestorePlan,
  type RestoreResult,
  type RestoreUnit,
} from '../store/restore'
import { emptyProjectsData } from '../store/session'
import { createStore, DATA_KEY, readEnvelope, type Loaded, type Locks } from '../store/store'
import { saveJsonFile, stampedName } from './files'
import { dateTime, shortHash } from './labels'
import { Banner, Card, Chip, Field, Mono, Section, Title, TopBar } from './parts'
import { clearSandbox, localChange, loseProject, syntheticSix } from './sandbox'

/**
 * P2-R1 · RECUPERAR: from a copy made in Exportar, back into a store.
 *
 * In this package the target is ONLY the separate test store
 * (`elyum:prueba-p2r1:*`). Recovering into PROYECTOS itself waits for the
 * independent audit and the physical test on the iPhone.
 *
 * Steps on screen: pick the file → its check → what it would change, by
 * project → choose (nothing is chosen by default) → confirm → the result,
 * read back. A journal keeps the text before; if a recovery is interrupted
 * the screen says what happened when it opens again.
 */

const now = () => new Date().toISOString()
const writer = `recuperar:${Math.random().toString(36).slice(2, 8)}`
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function sandboxEnv(): RestoreEnv {
  const nav = navigator as Navigator & { locks?: Locks }
  return { storage: prefixedStorage(window.localStorage), locks: nav.locks && typeof nav.locks.request === 'function' ? nav.locks : undefined, now, writer }
}

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
  if (loaded.kind !== 'ok') return <Banner tone="error">El almacén de prueba no se puede leer ({loaded.kind === 'ilegible' ? loaded.reason : loaded.format}).</Banner>
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
    <label className={`flex gap-3 border-t border-[var(--line)] px-4 py-3.5 first:border-t-0 ${u.selectable && !disabled ? 'cursor-pointer' : ''}`} data-testid="restore-unit" data-unit={u.key} data-state={u.state} data-selectable={u.selectable}>
      <input type="checkbox" className="mt-1 size-5 shrink-0" checked={checked} disabled={disabled || !u.selectable} onChange={onToggle} aria-label={`Recuperar ${u.label}`} />
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
        {u.localNewer > 0 && u.selectable && (
          <p className="mt-1 text-[12.5px] text-[#b5531a]">Aquí hay {n(u.localNewer, 'cambio posterior', 'cambios posteriores')} a la copia: recuperarla los deshace (quedan en el diario de esta recuperación).</p>
        )}
        {!u.selectable && u.state !== 'igual' && u.state !== 'solo-local' && <p className="mt-1 text-[12.5px] text-[#b5531a]">No se puede recuperar sola: {u.why.join(' ')}</p>}
      </div>
    </label>
  )
}

export function RestoreView() {
  const [sandbox, setSandbox] = useState<Loaded>()
  const [journal, setJournal] = useState<JournalStatus>()
  const [source, setSource] = useState<{ name: string; read: BackupRead }>()
  const [plan, setPlan] = useState<RestorePlan>()
  const [mode, setMode] = useState<'seleccion' | 'todo'>('seleccion')
  const [chosen, setChosen] = useState<string[]>([])
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RestoreResult>()
  const [note, setNote] = useState<string>()
  const env = sandboxEnv()

  const refresh = useCallback(async () => {
    const e = sandboxEnv()
    setSandbox(await createStore(e).load())
    setJournal(await settleJournal(e))
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  function resetChoice() {
    setMode('seleccion')
    setChosen([])
    setSure(false)
  }

  async function usePlanFrom(name: string, text: string) {
    setResult(undefined)
    setNote(undefined)
    resetChoice()
    const read = await readBackup(text)
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

  async function confirm() {
    if (!plan) return
    setBusy(true)
    try {
      const r = await performRestore(env, plan, mode === 'todo' ? { mode: 'todo' } : { mode: 'seleccion', units: chosen }, source?.name)
      setResult(r)
      setPlan(undefined)
      resetChoice()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  /** Test-store tools. Each writes only `elyum:prueba-p2r1:*` through the same store (lock and generation). */
  async function sandboxWrite(label: string, make: (current: Loaded) => Promise<Parameters<ReturnType<typeof createStore>['save']>[0] | undefined>) {
    setBusy(true)
    setNote(undefined)
    try {
      const store = createStore(env)
      const current = await store.load()
      const next = await make(current)
      if (!next) return
      const r = await store.save(next, current.kind === 'ok' || current.kind === 'vacio' ? current.generation : -1)
      setNote(r.ok ? `${label}: hecho (generación ${r.generation}).` : `${label}: no se ha guardado (${r.message}).`)
      setPlan(undefined)
      setSource(undefined)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const sandboxData = sandbox?.kind === 'ok' ? sandbox.data : undefined
  const built = plan && (mode === 'todo' || chosen.length) ? buildRestore(plan, mode === 'todo' ? { mode: 'todo' } : { mode: 'seleccion', units: chosen }, now()) : undefined
  const open = journal && (journal.kind === 'desconocida' || journal.kind === 'escrita-sin-cerrar' || journal.kind === 'sin-escribir' || journal.kind === 'ilegible')

  return (
    <>
      <TopBar back="#/exportar" backLabel="Exportar" />
      <Title kicker={<Label>Recuperar</Label>} sub="Desde una copia hecha en Exportar. Primero ves qué cambiaría; nada se escribe sin tu confirmación, y lo que había queda guardado.">
        Recuperar desde una copia
      </Title>

      <Banner tone="info">
        <span data-testid="target-note">
          Destino: <strong>almacén de prueba separado</strong>. Esta versión no toca los datos de PROYECTOS de este dispositivo; eso llegará tras la auditoría independiente y tu prueba física.
        </span>
      </Banner>

      {open && (
        <div className="mt-4" data-testid="journal-open" data-kind={journal.kind}>
          <Banner tone="warn">
            {journal.kind === 'ilegible'
              ? 'Hay un diario de recuperación que no se puede leer.'
              : journal.kind === 'desconocida'
                ? 'Una recuperación se interrumpió y después algo más escribió en el almacén. No se puede saber qué quedó: guarda la copia de antes y decide.'
                : 'Hay una recuperación sin cerrar en otra pestaña o en la app instalada.'}
            {journal.kind !== 'ilegible' && <span className="mt-1 block">Empezó el {dateTime(journal.journal.startedAt)}: {journal.journal.summary}</span>}
          </Banner>
        </div>
      )}

      <Section label="Almacén de prueba">
        <Card className="flex flex-col gap-3 px-4 py-4">
          <StoreLine loaded={sandbox} />
          <div className="flex flex-col gap-2">
            <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy || sandbox?.kind !== 'vacio'} data-testid="sandbox-fill" onClick={() => sandboxWrite('Datos sintéticos', async () => syntheticSix(now))}>
              Cargar datos sintéticos
            </Button>
            <Button
              variant="choice"
              className="h-10 px-3 text-[12px]"
              disabled={busy || sandbox?.kind !== 'vacio'}
              data-testid="sandbox-copy-main"
              onClick={() =>
                sandboxWrite('Copia de PROYECTOS', async () => {
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
            <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy || !sandboxData?.projects.length} data-testid="sandbox-lose" onClick={() => sandboxWrite('Simular pérdida', async () => loseProject(sandboxData!, sandboxData!.projects[0].id))}>
              Perder el primer proyecto
            </Button>
            <Button variant="choice" className="h-10 px-3 text-[12px]" disabled={busy || !sandboxData?.tasks.length} data-testid="sandbox-change" onClick={() => sandboxWrite('Cambio local', async () => localChange(sandboxData!, now))}>
              Hacer un cambio local
            </Button>
            <Button
              variant="choice"
              className="h-10 px-3 text-[12px]"
              disabled={busy || sandbox?.kind !== 'ok'}
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
              disabled={busy}
              data-testid="sandbox-clear"
              onClick={async () => {
                const count = clearSandbox(window.localStorage)
                setNote(`Borradas ${count} claves elyum:prueba-p2r1:* (solo el almacén de prueba y su diario).`)
                setPlan(undefined)
                setSource(undefined)
                setResult(undefined)
                await refresh()
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
          {source?.read.ok && sandbox && sandbox.kind !== 'ok' && sandbox.kind !== 'vacio' && <Banner tone="error">El almacén de prueba no se puede leer: no se recupera encima de él. Bórralo primero.</Banner>}
        </Card>
      </Section>

      {plan && (
        <Section label="2 · Qué cambiaría">
          <div className="flex flex-col gap-3" data-testid="restore-plan">
            <p className="text-[13px] leading-[1.5] text-ink-3">Por defecto no se recupera nada: lo de aquí se conserva. Marca lo que quieras traer de la copia.</p>
            <Card className="overflow-hidden">
              {plan.units.map((u) => (
                <UnitRow key={u.key} u={u} disabled={busy || mode === 'todo'} checked={mode === 'todo' ? u.state === 'distinta' || u.state === 'solo-en-copia' : chosen.includes(u.key)} onToggle={() => setChosen((c) => (c.includes(u.key) ? c.filter((x) => x !== u.key) : [...c, u.key]))} />
              ))}
            </Card>
            {plan.globalChanges.length > 0 && <Banner tone="info">Solo con «todo»: {plan.globalChanges.join(' ')}</Banner>}
            <label className="flex items-start gap-3 text-[14px] text-ink-2">
              <input type="checkbox" className="mt-0.5 size-5" checked={mode === 'todo'} disabled={busy} data-testid="restore-all" onChange={(e) => setMode(e.target.checked ? 'todo' : 'seleccion')} />
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
                <label className="flex items-start gap-3 text-[14px] text-ink-2">
                  <input type="checkbox" className="mt-0.5 size-5" checked={sure} disabled={busy} data-testid="restore-sure" onChange={(e) => setSure(e.target.checked)} />
                  <span>He revisado lo que cambia. Lo de antes queda en el diario para volver atrás.</span>
                </label>
                <Button onClick={confirm} disabled={busy || !sure || !!open} data-testid="restore-confirm" className="w-full">
                  {busy ? 'Recuperando…' : 'Recuperar en el almacén de prueba'}
                </Button>
                {open && <p className="text-[12.5px] text-[#b5531a]">Primero revisa la recuperación sin cerrar de abajo.</p>}
              </>
            ) : (
              <Banner tone="error">
                Lo elegido dejaría datos no válidos; no se puede recuperar así:
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
            {journal.journal.before !== null ? (
              <div className="mt-1 flex flex-col gap-2">
                <Button
                  variant="choice"
                  className="h-10 px-3 text-[12px]"
                  disabled={busy}
                  data-testid="journal-save-before"
                  onClick={async () => {
                    const text = await journalAsCopy(journal.journal)
                    if (text) await saveJsonFile(stampedName('elyum-prueba-antes-de-recuperar', journal.journal.startedAt), text)
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
                    if (text) await usePlanFrom('lo de antes de la recuperación', text)
                  }}
                >
                  Volver a lo de antes
                </Button>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-4">Antes de esa recuperación el almacén estaba vacío.</p>
            )}
            {open && (
              <Button
                variant="choice"
                className="h-10 px-3 text-[12px]"
                disabled={busy}
                data-testid="journal-dismiss"
                onClick={async () => {
                  await dismissJournal(env)
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
