import { useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { addEvidence, classifyStatus, decideApproval, setCondition, setNextAction, setOwner, setVerification } from '../domain/ops'
import { changeStatus, statusChoices } from '../domain/operations'
import type { ConditionState, Owner, ProjectsData, Task, WorkClass } from '../domain/types'
import { WORK_CLASSES } from '../domain/types'
import { workClassOf } from '../domain/vocabulary'
import { WORK_CLASS_LABEL } from './labels'
import { Card } from './parts'
import { useWrite } from './write'

/**
 * P4b · What the person can do on a task. Each control is one explicit
 * change with its own button; nothing changes as a side effect of another.
 */

const now = () => new Date().toISOString()
const ctx = () => ({ now: now() })

/** The person who uses this ELYUM. */
export const ME: Owner = { kind: 'humano', name: 'Misael' }
export const AGENTS: Owner[] = [
  { kind: 'agente', name: 'Claude Code' },
  { kind: 'agente', name: 'Codex' },
]

const input = 'h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-quiet)] px-3 text-[15px] text-ink'
const small = 'h-10 min-w-0 px-4 text-[11.5px]'

/** A row of choices; the current one is marked and cannot be chosen again. */
export function Choices<T extends string>({ options, current, onPick, disabled, testId }: { options: { value: T; label: string }[]; current?: T; onPick(v: T): void; disabled?: boolean; testId?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled || o.value === current}
          aria-pressed={o.value === current}
          onClick={() => onPick(o.value)}
          className={`hit h-9 rounded-full border px-3.5 text-[13px] transition-colors ${
            o.value === current ? 'border-transparent bg-[var(--control)] text-[var(--control-ink)]' : 'border-[var(--line)] bg-[var(--surface-quiet)] text-ink-2 hover:text-ink'
          } disabled:cursor-default ${o.value !== current ? 'disabled:opacity-40' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Panel({ title, hint, children, testId }: { title: string; hint?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div className="border-t border-[var(--line)] px-4 py-3.5 first:border-t-0" data-testid={testId}>
      <p className="text-[12px] tracking-[0.04em] text-ink-3">{title}</p>
      {hint && <p className="mt-0.5 text-[12.5px] leading-[1.45] text-ink-4">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

/** Status: the project's words (and ELYUM's), and classifying a word nobody classified yet. */
export function StatusControl({ data, t }: { data: ProjectsData; t: Task }) {
  const { write, busy } = useWrite()
  const choices = statusChoices(data, t.projectId)
  const [pick, setPick] = useState(t.status)
  const cls = workClassOf(data, t)
  const project = data.projects.find((p) => p.id === t.projectId)
  const sameWord = data.tasks.filter((x) => x.projectId === t.projectId && x.status === t.status).length
  const [klass, setKlass] = useState<WorkClass>('pendiente')
  return (
    <>
      <Panel title="Estado" hint="Cambia el estado de esta tarea. El literal del dossier queda en el historial y en la procedencia." testId="status-control">
        <div className="flex gap-2">
          <select aria-label="Nuevo estado" className={`${input} min-w-0 flex-1`} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="status-select">
            {choices.map((c) => (
              <option key={c.literal} value={c.literal}>
                {c.literal} · {WORK_CLASS_LABEL[c.workClass]}
                {c.fromElyum ? ' (ELYUM)' : ''}
              </option>
            ))}
          </select>
          <Button variant="choice" className={small} disabled={busy || pick === t.status} onClick={() => write(`Estado «${pick}»`, (d) => changeStatus(d, t.id, pick, ctx()))} data-testid="status-save">
            Cambiar
          </Button>
        </div>
      </Panel>
      {cls === 'sin-decidir' && project && (
        <Panel title={`Clasificar «${t.status}»`} hint={`Decide qué significa esta palabra del dossier. Afecta a ${sameWord} ${sameWord === 1 ? 'tarea' : 'tareas'} de este proyecto que la usan.`} testId="classify-control">
          <div className="flex gap-2">
            <select aria-label="Clase" className={`${input} min-w-0 flex-1`} value={klass} onChange={(e) => setKlass(e.target.value as WorkClass)}>
              {WORK_CLASSES.filter((c) => c !== 'sin-decidir').map((c) => (
                <option key={c} value={c}>
                  {WORK_CLASS_LABEL[c]}
                </option>
              ))}
            </select>
            <Button variant="choice" className={small} disabled={busy} onClick={() => write(`«${t.status}» = ${WORK_CLASS_LABEL[klass]}`, (d) => classifyStatus(d, project.dossier, t.status, klass, ctx()))}>
              Clasificar
            </Button>
          </div>
        </Panel>
      )}
    </>
  )
}

/** Verified and approved: two separate decisions. Approving needs the task executed; returning needs a reason. */
export function DecisionControl({ data, t }: { data: ProjectsData; t: Task }) {
  const { write, busy } = useWrite()
  const [note, setNote] = useState('')
  const executed = workClassOf(data, t) === 'ejecutada'
  const v = t.verification?.state
  return (
    <>
      <Panel title="Verificación" hint="¿Alguien comprobó el resultado? Es independiente de la aprobación." testId="verify-control">
        <Choices
          current={v === 'verificada' ? 'verificada' : v === 'sin-verificar' ? 'sin-verificar' : undefined}
          disabled={busy}
          options={[
            { value: 'verificada', label: 'Verificada' },
            { value: 'sin-verificar', label: 'Sin verificar' },
          ]}
          onPick={(state) => write(state === 'verificada' ? 'Verificada' : 'Sin verificar', (d) => setVerification(d, t.id, { state }, ctx()))}
        />
      </Panel>
      <Panel
        title="Aprobación"
        hint={executed ? 'Tu decisión. Aprobada cierra la tarea; devuelta la reabre con tu motivo.' : 'Se decide cuando la tarea esté ejecutada. Nada se aprueba solo.'}
        testId="approval-control"
      >
        {executed ? (
          <div className="flex flex-col gap-2">
            <input className={input} placeholder="Motivo o nota (obligatorio para devolver)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="approval-note" />
            <div className="flex gap-2">
              <Button variant="choice" className={`${small} flex-1`} disabled={busy || t.approval.state === 'aprobada'} onClick={async () => (await write('Aprobada', (d) => decideApproval(d, t.id, 'aprobada', ctx(), note.trim() || undefined))) && setNote('')} data-testid="approve">
                Aprobar
              </Button>
              <Button variant="choice" className={`${small} flex-1`} disabled={busy || !note.trim()} onClick={async () => (await write('Devuelta', (d) => decideApproval(d, t.id, 'devuelta', ctx(), note.trim()))) && setNote('')} data-testid="return">
                Devolver
              </Button>
            </div>
            {t.approval.note && <p className="text-[12.5px] text-ink-3">Última nota: {t.approval.note}</p>}
          </div>
        ) : (
          <p className="text-[13px] text-ink-4">Estado de aprobación: {t.approval.state === 'sin-dato' ? 'sin dato' : t.approval.state}.</p>
        )}
      </Panel>
    </>
  )
}

/** One condition of a requirement: the person says whether it holds. */
export function ConditionButtons({ t, requirementId, optionIndex, state }: { t: Task; requirementId: string; optionIndex: number; state: ConditionState }) {
  const { write, busy, writable } = useWrite()
  if (!writable) return null
  return (
    <div className="mt-1.5">
      <Choices
        testId="condition-control"
        current={state}
        disabled={busy}
        options={[
          { value: 'cumplida', label: 'Cumplida' },
          { value: 'no-cumplida', label: 'No cumplida' },
          { value: 'por-verificar', label: 'Por verificar' },
        ]}
        onPick={(s) => write(`Condición ${s.replace('-', ' ')}`, (d) => setCondition(d, t.id, requirementId, optionIndex, s, ctx()))}
      />
    </div>
  )
}

/** Who does it: the person, an agent (an «encargo»), or nobody yet. And the next physical action. */
export function OwnerControl({ t }: { t: Task }) {
  const { write, busy } = useWrite()
  const [next, setNext] = useState(t.nextAction ?? '')
  const current = !t.owner ? 'nadie' : t.owner.kind === 'humano' ? 'yo' : t.owner.name
  const options = [{ value: 'nadie', label: 'Sin asignar' }, { value: 'yo', label: `Yo (${ME.name})` }, ...AGENTS.map((a) => ({ value: a.name, label: a.name }))]
  return (
    <>
      <Panel title="Responsable" hint="Un encargo a un agente se distingue de tus tareas y no cuenta en tu carga semanal." testId="owner-control">
        <Choices
          current={current}
          disabled={busy}
          options={options}
          onPick={(v) => {
            const owner = v === 'nadie' ? undefined : v === 'yo' ? ME : AGENTS.find((a) => a.name === v)
            return write(owner ? (owner.kind === 'agente' ? `Encargo a ${owner.name}` : `Responsable: ${owner.name}`) : 'Sin responsable', (d) => setOwner(d, t.id, owner, ctx()))
          }}
        />
      </Panel>
      <Panel title={t.owner?.kind === 'agente' ? `Instrucción para ${t.owner.name} (siguiente acción)` : 'Siguiente acción'} hint="Lo próximo, físico y concreto." testId="next-control">
        <div className="flex flex-col gap-2">
          <textarea rows={2} className={`${input} h-auto py-2.5`} value={next} onChange={(e) => setNext(e.target.value)} data-testid="next-input" />
          <Button variant="choice" className={small} disabled={busy || next.trim() === (t.nextAction ?? '')} onClick={() => write('Siguiente acción', (d) => setNextAction(d, t.id, next, ctx()))} data-testid="next-save">
            Guardar siguiente acción
          </Button>
        </div>
      </Panel>
    </>
  )
}

/** Evidence: a note or a link that shows the result. Added, never edited. */
export function EvidenceForm({ t }: { t: Task }) {
  const { write, busy } = useWrite()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const validUrl = !url.trim() || /^https?:\/\/\S+$/i.test(url.trim())
  return (
    <Card className="mt-2 flex flex-col gap-2 px-4 py-3.5" >
      <p className="text-[12px] tracking-[0.04em] text-ink-3">Añadir evidencia</p>
      <input className={input} placeholder="Qué acredita (nota)" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="evidence-label" />
      <input className={input} placeholder="Enlace opcional (https://…)" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="evidence-url" />
      {!validUrl && <p className="text-[12.5px] text-[#b5531a]">El enlace debe empezar por http:// o https://</p>}
      <Button
        variant="choice"
        className={small}
        disabled={busy || !label.trim() || !validUrl}
        data-testid="evidence-save"
        onClick={async () => {
          const ok = await write('Evidencia', (d) => addEvidence(d, t.id, url.trim() ? { kind: 'enlace', label: label.trim(), url: url.trim() } : { kind: 'nota', label: label.trim() }, ctx()))
          if (ok) {
            setLabel('')
            setUrl('')
          }
        }}
      >
        Añadir
      </Button>
    </Card>
  )
}
