import { useEffect, useState } from 'react'
import { Button } from '../../../../components/ui/Button'
import {
  activateObjective,
  addSkill,
  archiveSkill,
  attemptInProgress,
  confirmAttempt,
  correctEvidence,
  discardAttempt,
  effectiveEvidence,
  hasEvidence,
  markPerformed,
  newSkillDefaults,
  objectiveOf,
  openAttemptFor,
  recordComplete,
  saveAttemptRecord,
  setObjectiveStatus,
  skillHasEvidence,
  skillOf,
  startAttempt,
  updateObjective,
  updateSkill,
  type Result,
} from '../../domain/capability/commands'
import { bestAssistanceMet } from '../../domain/capability/dimensions'
import {
  AUTONOMY_HINT,
  AUTONOMY_LABEL,
  AUTONOMY_PHRASE,
  CONTEXT_HINT,
  CONTEXT_LABEL,
  CONTEXT_PHRASE,
  ISSUE_TEXT,
  VERDICT_LABEL,
  errorText,
  shortSkill,
  templateSentence,
  whatWeDontKnow,
  whatWeKnow,
} from '../../domain/capability/language'
import { AUTONOMY_LEVELS, CONTEXT_RELATIONS, CRITERION_VERDICTS, MAX_SKILLS, SUGGESTED_SKILLS, type Attempt, type Autonomy, type CapabilityData, type CapabilityObjective, type ContextRelation, type CriterionVerdict, type Evidence, type ObjectiveDefinition, type Skill } from '../../domain/capability/model'
import { skillPicture } from '../../domain/capability/nextTest'
import { activeSkillsOf, templateIssues, type TemplateFields } from '../../domain/capability/validate'
import { newId, type CapabilityApi } from '../../hooks/useCapability'
import { nowMs } from '../../../../state/clock'
import type { FlowStep } from '../../storage/capabilityCodec'
import { Choice } from './Choice'
import { Field } from './Field'
import { Notice, Part, Step } from './Step'

/**
 * DESARROLLAR — from "quiero poder hacer X" to the next useful test, as a structured conversation: one main decision per
 * screen, a way back from each, everything saved as it is written.
 *
 *   (intent →) observable → skills → (pick →) attempt → record → result (→ attempt …)
 *
 * With the person's words already written, it opens on «Hazlo observable» (the words stay editable there). One skill is enough
 * to try; the rest of the map can be completed later. An attempt done but not yet judgeable is saved as pending evaluation —
 * no evidence until it is evaluated.
 *
 * Nothing here is generated: the person writes the capability and its skills; the engine only checks them, records what
 * happened, and derives — from that record alone — what we know, what we do not know yet, the current gap and the next test.
 * No percentages, no levels, no bars.
 */

const LABEL = 'Desarrollar'
const autonomyOptions = AUTONOMY_LEVELS.map((v) => ({ value: v, label: AUTONOMY_LABEL[v], hint: AUTONOMY_HINT[v] }))
const contextOptions = CONTEXT_RELATIONS.map((v) => ({ value: v, label: CONTEXT_LABEL[v], hint: CONTEXT_HINT[v] }))
const verdictOptions = CRITERION_VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] }))

const PLACEHOLDER = {
  action: 'p. ej. presentar una propuesta en inglés',
  result: 'p. ej. una presentación de 10 minutos',
  context: 'p. ej. una reunión con un cliente',
  criterion: 'p. ej. me entienden sin pedir traducción',
}

const when = (ms: number) => new Date(ms).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

interface StepProps {
  cap: CapabilityApi
  objective: CapabilityObjective
  go: (step: FlowStep, skillId?: string) => void
}

export function DevelopFlow({ cap, onExit }: { cap: CapabilityApi; onExit: () => void }) {
  const objective = cap.flow.objectiveId ? objectiveOf(cap.data, cap.flow.objectiveId) : undefined
  const step: FlowStep = cap.flow.step ?? 'intent'

  // Each screen starts at its top.
  useEffect(() => {
    document.querySelector('[data-learn]')?.scrollTo({ top: 0 })
  }, [step, cap.flow.skillId])

  if (!objective) return null
  const go = (next: FlowStep, skillId?: string) => cap.go({ objectiveId: objective.id, step: next, ...(skillId ? { skillId } : {}) })
  const props = { cap, objective, go }

  return (
    <div data-develop={step} className="flex flex-col gap-8">
      <div className="-ml-3">
        <Button variant="secondary" onClick={onExit}>
          ← Ahora
        </Button>
      </div>
      {/* Keyed by screen and skill: a screen's own buffers never carry over to another. */}
      <div key={`${step}:${cap.flow.skillId ?? ''}`} className="contents">
      {step === 'intent' && <IntentStep {...props} />}
      {step === 'observable' && <ObservableStep {...props} />}
      {step === 'skills' && <SkillsStep {...props} />}
      {step === 'pick' && <PickStep {...props} />}
      {step === 'attempt' && <AttemptStep {...props} skill={cap.flow.skillId ? skillOf(cap.data, cap.flow.skillId) : undefined} />}
      {step === 'record' && <RecordStep {...props} skill={cap.flow.skillId ? skillOf(cap.data, cap.flow.skillId) : undefined} />}
      {step === 'result' && <ResultStep {...props} skill={cap.flow.skillId ? skillOf(cap.data, cap.flow.skillId) : undefined} />}
      </div>
    </div>
  )
}

const REVISION_NOTE = 'Cambiar esta definición crea una nueva versión. Tus intentos anteriores se conservan.'

/**
 * The objective's definition as it is being edited. Before any evidence every change is saved as it is written. After, the
 * definition is versioned: it is edited apart and applied once, on going on — one change, one new revision (never one per keystroke).
 */
function useDefinition(cap: CapabilityApi, objective: CapabilityObjective) {
  const versioned = hasEvidence(cap.data, objective.id)
  const [draft, setDraft] = useState<ObjectiveDefinition>(() => ({ rawIntent: objective.rawIntent, action: objective.action, result: objective.result, context: objective.context, criterion: objective.criterion, targetAutonomy: objective.targetAutonomy }))
  const value: ObjectiveDefinition = versioned ? draft : objective
  const change = (patch: Partial<ObjectiveDefinition>) => (versioned ? setDraft((d) => ({ ...d, ...patch })) : cap.run((d, now) => updateObjective(d, objective.id, patch, now)))
  /** Apply what was written (a new revision if it changed); the reason it was refused, if it was. */
  const commit = (): string | undefined => {
    if (!versioned) return undefined
    const r = cap.run((d, now) => updateObjective(d, objective.id, draft, now))
    return r.ok ? undefined : errorText(r.error)
  }
  return { versioned, value, change, commit }
}

/* —— 1 · ¿Qué quieres poder hacer? —— */

function IntentStep({ cap, objective, go }: StepProps) {
  const def = useDefinition(cap, objective)
  const [error, setError] = useState<string>()
  return (
    <Step
      label={LABEL}
      title="¿Qué quieres poder hacer?"
      lead="Con tus palabras, como lo dirías. Después lo haremos observable."
      actions={
        <Button
          disabled={!def.value.rawIntent.trim()}
          onClick={() => {
            const refused = def.commit()
            setError(refused)
            if (!refused) go('observable')
          }}
        >
          Continuar
        </Button>
      }
    >
      <Field label="Quiero poder…" value={def.value.rawIntent} placeholder="p. ej. hablar en inglés en el trabajo" onChange={(rawIntent) => def.change({ rawIntent })} />
      {def.versioned && <p className="text-[13px] text-ink-3">{REVISION_NOTE}</p>}
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

/* —— 2 · Hazlo observable —— */

function TemplateFieldsEditor({ value, onChange, readOnly = false }: { value: TemplateFields; onChange: (patch: Partial<TemplateFields>) => void; readOnly?: boolean }) {
  // "aprender…" is said to be unobservable as soon as it is written, under the action itself.
  const unobservable = value.action.trim().length >= 3 && templateIssues(value).includes('NOT_OBSERVABLE')
  return (
    <div className="flex flex-col gap-6">
      <Field label="Acción · qué harías" value={value.action} readOnly={readOnly} placeholder={PLACEHOLDER.action} problem={unobservable ? ISSUE_TEXT.NOT_OBSERVABLE : undefined} onChange={(action) => onChange({ action })} />
      <Field label="Resultado · qué quedaría hecho" value={value.result} readOnly={readOnly} placeholder={PLACEHOLDER.result} onChange={(result) => onChange({ result })} />
      <Field label="Contexto · dónde, con qué, para quién" value={value.context} readOnly={readOnly} placeholder={PLACEHOLDER.context} onChange={(context) => onChange({ context })} />
      <Field label="Criterio · cómo sabrías que salió bien" value={value.criterion} readOnly={readOnly} placeholder={PLACEHOLDER.criterion} onChange={(criterion) => onChange({ criterion })} />
      <Choice label="Autonomía objetivo · con cuánta ayuda" options={autonomyOptions} value={value.targetAutonomy} disabled={readOnly} onChange={(targetAutonomy) => onChange({ targetAutonomy })} />
    </div>
  )
}

/** The template, built from what is written: the missing parts stay as their placeholder. */
function Sentence({ fields }: { fields: TemplateFields }) {
  return <p className="border-l border-line pl-4 text-[16px] leading-relaxed text-ink-2">{templateSentence(fields)}</p>
}

function ObservableStep({ cap, objective, go }: StepProps) {
  const def = useDefinition(cap, objective)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string>()
  const issues = templateIssues(def.value)
  // After trying to go on: what is missing, next to the button (the unobservable action is already said under the action).
  const shown = tried ? issues.find((i) => i !== 'NOT_OBSERVABLE') ?? issues[0] : undefined
  return (
    <Step
      label={LABEL}
      title="Hazlo observable."
      lead="¿Qué harías, y cómo se vería que salió bien?"
      actions={
        <Button
          onClick={() => {
            setTried(true)
            if (issues.length) return
            const refused = def.commit()
            setError(refused)
            if (!refused) go('skills')
          }}
        >
          Continuar
        </Button>
      }
    >
      <Field label="Quiero poder…" value={def.value.rawIntent} placeholder="p. ej. hablar en inglés en el trabajo" onChange={(rawIntent) => def.change({ rawIntent })} />
      <TemplateFieldsEditor value={def.value} onChange={def.change} />
      <Sentence fields={def.value} />
      {def.versioned && <p className="text-[13px] text-ink-3">{REVISION_NOTE}</p>}
      {shown && <Notice>{ISSUE_TEXT[shown]}</Notice>}
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

/* —— 3 · ¿De qué habilidades depende? —— */

/**
 * A skill as it is written: action, result and criterion are the person's to write. Its context and target autonomy come from
 * the objective — shown as they are, in one compact line, never filled in silently — and «Ajustar» opens them to change.
 */
function SkillFieldsEditor({ value, onChange }: { value: TemplateFields; onChange: (patch: Partial<TemplateFields>) => void }) {
  const [adjusting, setAdjusting] = useState(false)
  const unobservable = value.action.trim().length >= 3 && templateIssues(value).includes('NOT_OBSERVABLE')
  return (
    <div className="flex flex-col gap-6">
      <Field label="Acción · qué harías" value={value.action} placeholder={PLACEHOLDER.action} problem={unobservable ? ISSUE_TEXT.NOT_OBSERVABLE : undefined} onChange={(action) => onChange({ action })} />
      <Field label="Resultado · qué quedaría hecho" value={value.result} placeholder={PLACEHOLDER.result} onChange={(result) => onChange({ result })} />
      <Field label="Criterio · cómo sabrías que salió bien" value={value.criterion} placeholder={PLACEHOLDER.criterion} onChange={(criterion) => onChange({ criterion })} />
      {adjusting ? (
        <>
          <Field label="Contexto · dónde, con qué, para quién" value={value.context} placeholder={PLACEHOLDER.context} onChange={(context) => onChange({ context })} />
          <Choice label="Autonomía objetivo · con cuánta ayuda" options={autonomyOptions} value={value.targetAutonomy} onChange={(targetAutonomy) => onChange({ targetAutonomy })} />
        </>
      ) : (
        <div data-inherited className="flex flex-col gap-1 text-[14px] leading-snug text-ink-3">
          <p>
            Contexto: <span className="text-ink-2">{value.context || 'sin escribir'}</span>
          </p>
          <p>
            Autonomía: <span className="text-ink-2">{AUTONOMY_LABEL[value.targetAutonomy].toLowerCase()}</span>
          </p>
          <div className="-ml-4">
            <Button variant="quiet" onClick={() => setAdjusting(true)}>
              Ajustar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SkillEditor({ title, lead, initial, onSave, onCancel, onRemove, versioned = false }: { title: string; lead: string; initial: TemplateFields; onSave: (f: TemplateFields) => Result; onCancel: () => void; onRemove?: () => Result; versioned?: boolean }) {
  const [fields, setFields] = useState(initial)
  const [error, setError] = useState<string>()
  const attempt = (r: Result) => (r.ok ? undefined : setError(errorText(r.error)))
  return (
    <Step
      label={LABEL}
      title={title}
      lead={lead}
      actions={
        <>
          <Button onClick={() => attempt(onSave(fields))}>Guardar</Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          {onRemove && (
            <Button variant="quiet" onClick={() => attempt(onRemove())}>
              Quitar
            </Button>
          )}
        </>
      }
    >
      <SkillFieldsEditor value={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} />
      <Sentence fields={fields} />
      {versioned && <p className="text-[13px] text-ink-3">{REVISION_NOTE}</p>}
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

const START_WITH_ONE = 'Puedes empezar con esta habilidad y completar el mapa después.'

function SkillsStep({ cap, objective, go }: StepProps) {
  const skills = activeSkillsOf(cap.data, objective.id)
  const [editing, setEditing] = useState<Skill | 'new'>()
  const [error, setError] = useState<string>()
  // No skill yet: the screen is the first skill itself.
  const first = skills.length === 0
  const current = editing ?? (first ? 'new' : undefined)

  if (current) {
    const close = (r: Result) => {
      if (r.ok) {
        setEditing(undefined)
        setError(undefined)
      }
      return r
    }
    return current === 'new' ? (
      <SkillEditor
        title={first ? 'Primera habilidad.' : 'Otra habilidad.'}
        lead={first ? `Algo que se pueda ver hacer, con su propio criterio. ${START_WITH_ONE}` : 'Algo que se pueda ver hacer, con su propio criterio.'}
        initial={newSkillDefaults(objective)}
        onCancel={() => (first ? go('observable') : setEditing(undefined))}
        onSave={(f) => close(cap.run((d, now) => addSkill(d, { ...f, id: newId('skill'), objectiveId: objective.id, now })))}
      />
    ) : (
      <SkillEditor
        title="Esta habilidad."
        lead="Algo que se pueda ver hacer, con su propio criterio."
        initial={current}
        versioned={skillHasEvidence(cap.data, current.id)}
        onCancel={() => setEditing(undefined)}
        onSave={(f) => close(cap.run((d, now) => updateSkill(d, current.id, f, now, newId('skill'))))}
        onRemove={() => close(cap.run((d, now) => archiveSkill(d, current.id, now)))}
      />
    )
  }

  /** Activate if needed, then go: to that one skill's test, or to the choice among several. */
  const proceed = (skillId?: string) => {
    const flow = skillId ? { objectiveId: objective.id, step: 'attempt' as const, skillId } : { objectiveId: objective.id, step: 'pick' as const }
    if (objective.status === 'ACTIVE') return cap.go(flow)
    const r = cap.run((d, now) => activateObjective(d, objective.id, now), flow)
    setError(r.ok ? undefined : errorText(r.error))
  }
  const only = skills.length === 1 ? skills[0] : undefined

  return (
    <Step
      label={LABEL}
      title={only ? 'Tu primera habilidad.' : '¿De qué habilidades depende?'}
      lead={only ? START_WITH_ONE : 'Cada una, algo que se pueda ver hacer. Si cambias una que ya tiene intentos, se crea una nueva versión y los anteriores se conservan.'}
      actions={
        <>
          <Button onClick={() => proceed(only?.id)}>{only ? 'Probar esta habilidad' : 'Elegir cuál probar'}</Button>
          {skills.length < MAX_SKILLS && (
            <Button variant="secondary" onClick={() => setEditing('new')}>
              Añadir otra habilidad
            </Button>
          )}
          <Button variant="secondary" onClick={() => go('observable')}>
            Volver
          </Button>
        </>
      }
    >
      <Sentence fields={objective} />
      <ol className="flex flex-col">
        {skills.map((s) => (
          <li key={s.id} className="border-t border-line first:border-t-0">
            <button type="button" onClick={() => setEditing(s)} className="hit block w-full py-3.5 text-left text-[15px] leading-snug text-ink-2 hover:text-ink">
              {templateSentence(s)}
              {s.revision > 1 && <span className="ml-2 text-[12px] text-ink-4">versión {s.revision}</span>}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-ink-4">
        Como orientación, muchas capacidades se apoyan en {SUGGESTED_SKILLS.from} a {SUGGESTED_SKILLS.to} habilidades. No hace falta tenerlas todas para empezar.
      </p>
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

/* —— 4 · ¿Cuál quieres comprobar? —— */

const PENDING = 'Pendiente de evaluar'

function skillLine(data: CapabilityData, skill: Skill): string {
  const open = openAttemptFor(data, skill.id)
  if (open) return open.performedAt === undefined ? 'Intento en curso.' : `${PENDING}.`
  const ev = effectiveEvidence(data).filter((e) => e.skillId === skill.id)
  if (!ev.length) return skill.revision > 1 ? 'Sin intentos en esta versión.' : 'Sin intentos todavía.'
  return skillPicture(skill, ev).current?.statement ?? 'Sin hueco abierto que B1 pueda comprobar.'
}

function PickStep({ cap, objective, go }: StepProps) {
  const skills = activeSkillsOf(cap.data, objective.id)
  const any = hasEvidence(cap.data, objective.id)
  const [error, setError] = useState<string>()
  const open = (s: Skill) => {
    if (openAttemptFor(cap.data, s.id)) return go('record', s.id)
    go(effectiveEvidence(cap.data).some((e) => e.skillId === s.id) ? 'result' : 'attempt', s.id)
  }
  return (
    <Step
      label={LABEL}
      title={any ? '¿Qué habilidad quieres comprobar?' : '¿Cuál quieres comprobar primero?'}
      lead={templateSentence(objective)}
      actions={
        <>
          <Button variant="secondary" onClick={() => go('skills')}>
            Ver la descomposición
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              const r = cap.run((d, now) => setObjectiveStatus(d, objective.id, 'PAUSED', now), {})
              setError(r.ok ? undefined : errorText(r.error))
            }}
          >
            Pausar esta capacidad
          </Button>
        </>
      }
    >
      <ul className="flex flex-col">
        {skills.map((s) => (
          <li key={s.id} className="border-t border-line first:border-t-0">
            <button type="button" onClick={() => open(s)} className="hit group block w-full py-3.5 text-left">
              <span className="block text-[16px] leading-snug text-ink-2 group-hover:text-ink">
                <span aria-hidden className="mr-2 text-ink-4 group-hover:text-accent">
                  →
                </span>
                {shortSkill(s)}
              </span>
              <span className="mt-1 block pl-6 text-[13px] leading-snug text-ink-3">{skillLine(cap.data, s)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

/* —— 5 · Intento (base o siguiente) —— */

function TestCard({ statement, criterion, maxAssistance, targetContext }: { statement: string; criterion: string; maxAssistance: Autonomy; targetContext: ContextRelation }) {
  return (
    <div className="flex flex-col gap-3 border-l border-line pl-4">
      <p className="text-[17px] leading-snug text-ink">{statement}</p>
      <p className="text-[14px] leading-snug text-ink-3">
        Se cumple si: <span className="text-ink-2">«{criterion}»</span>
      </p>
      <p className="text-[14px] leading-snug text-ink-3">
        Ayuda máxima: <span className="text-ink-2">{AUTONOMY_LABEL[maxAssistance].toLowerCase()}</span> · {CONTEXT_PHRASE[targetContext]}
      </p>
    </div>
  )
}

function AttemptStep({ cap, objective, go, skill }: StepProps & { skill?: Skill }) {
  const ev = skill ? effectiveEvidence(cap.data).filter((e) => e.skillId === skill.id) : []
  const { next, current } = skill ? skillPicture(skill, ev) : { next: undefined, current: undefined }
  // The skill's own context when the test is in it; a varied or new one is the person's to name.
  const [context, setContext] = useState(skill && next?.targetContext === 'SAME' ? skill.context : '')
  const [error, setError] = useState<string>()
  if (!skill) return <PickStep cap={cap} objective={objective} go={go} />
  if (openAttemptFor(cap.data, skill.id)) return <RecordStep cap={cap} objective={objective} go={go} skill={skill} />
  const inProgress = attemptInProgress(cap.data)
  if (!next || !current) return <ResultStep cap={cap} objective={objective} go={go} skill={skill} />
  const base = next.kind === 'BASE'
  const start = (capture: 'LIVE' | 'RETROSPECTIVE') => {
    const id = newId('attempt')
    const r = cap.run(
      (d, now) => startAttempt(d, { id, skillId: skill.id, testStatement: next.statement, contextDescription: context, gapId: next.gapId, capture, now }),
      { objectiveId: objective.id, step: 'record', skillId: skill.id },
    )
    setError(r.ok ? undefined : errorText(r.error))
  }
  return (
    <Step
      label={shortSkill(skill)}
      title={base ? 'Antes de estudiar, prueba.' : 'La próxima prueba.'}
      lead={base ? 'Inténtalo tal como estás ahora. Un intento que no sale también enseña algo: es evidencia.' : current.statement}
      actions={
        inProgress && inProgress.skillId !== skill.id ? (
          <Button onClick={() => go('record', inProgress.skillId)}>Ir al intento en curso</Button>
        ) : (
          <>
            <Button disabled={!context.trim()} onClick={() => start('LIVE')}>
              Empezar el intento
            </Button>
            {base && ev.length === 0 && (
              <Button variant="secondary" onClick={() => start('RETROSPECTIVE')}>
                Ya lo intenté antes
              </Button>
            )}
            <Button variant="quiet" onClick={() => go(ev.length ? 'result' : 'pick', skill.id)}>
              Volver
            </Button>
          </>
        )
      }
    >
      <TestCard statement={next.statement} criterion={next.successCriterion} maxAssistance={next.maxAssistance} targetContext={next.targetContext} />
      <Field
        label={next.targetContext === 'SAME' ? '¿Dónde lo vas a hacer?' : `¿Dónde lo vas a probar? (${CONTEXT_PHRASE[next.targetContext]})`}
        value={context}
        placeholder={next.targetContext === 'SAME' ? skill.context : 'p. ej. con otro cliente, otro tema, otro formato'}
        onChange={setContext}
      />
      {inProgress && inProgress.skillId !== skill.id && <Notice>Hay otro intento en curso: regístralo o descártalo antes de empezar este.</Notice>}
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

/* —— 6 · Registrar el resultado —— */

function RecordStep({ cap, objective, go, skill }: StepProps & { skill?: Skill }) {
  const [error, setError] = useState<string>()
  const attempt = skill ? openAttemptFor(cap.data, skill.id) : undefined
  if (!skill || !attempt) return skill ? <ResultStep cap={cap} objective={objective} go={go} skill={skill} /> : <PickStep cap={cap} objective={objective} go={go} />
  const save = (patch: Parameters<typeof saveAttemptRecord>[2]) => cap.run((d) => saveAttemptRecord(d, attempt.id, patch))
  const retro = attempt.capture === 'RETROSPECTIVE'
  // Done, not yet judged: what was done is kept; the evaluation is what is left.
  const pending = attempt.performedAt !== undefined
  const report = (r: Result) => setError(r.ok ? undefined : errorText(r.error))
  return (
    <Step
      label={retro ? 'Un intento anterior' : pending ? PENDING : 'Intento en curso'}
      title={retro ? '¿Qué pasó aquella vez?' : pending ? 'Continuar evaluación.' : 'Cuando termines, cuéntalo.'}
      lead={
        pending ? (
          <>
            {attempt.testStatement}
            <span className="mt-1 block text-[13px] text-ink-4">Hecho el {when(attempt.performedAt!)}. Todavía sin evaluar: no cuenta como evidencia.</span>
          </>
        ) : (
          attempt.testStatement
        )
      }
      actions={
        <>
          <Button
            disabled={!recordComplete(attempt)}
            onClick={() => report(cap.run((d, now) => confirmAttempt(d, attempt.id, newId('evidence'), now), { objectiveId: objective.id, step: 'result', skillId: skill.id }))}
          >
            Registrar
          </Button>
          {!retro && !pending && (
            <Button variant="secondary" disabled={!attempt.outcomeDescription.trim()} onClick={() => report(cap.run((d, now) => markPerformed(d, attempt.id, now), { objectiveId: objective.id, step: 'pick' }))}>
              Guardar y evaluar después
            </Button>
          )}
          {pending && (
            <Button variant="secondary" onClick={() => go('pick')}>
              Evaluar más tarde
            </Button>
          )}
          <Button variant="quiet" onClick={() => report(cap.run((d) => discardAttempt(d, attempt.id), { objectiveId: objective.id, step: 'attempt', skillId: skill.id }))}>
            Descartar este intento
          </Button>
        </>
      }
    >
      {retro && <WhenField value={attempt.occurredOn ?? ''} onChange={(occurredOn) => save({ occurredOn })} />}
      <Field label={pending ? 'Lo que hiciste' : '¿Qué ocurrió?'} value={attempt.outcomeDescription} placeholder="Lo que salió, tal cual: qué hiciste y qué quedó." onChange={(outcomeDescription) => save({ outcomeDescription })} />
      <Choice<CriterionVerdict> label={`¿Cumplió el criterio? «${skill.criterion}»`} options={verdictOptions} value={attempt.criterionVerdict} onChange={(criterionVerdict) => save({ criterionVerdict })} />
      <Choice<Autonomy> label="¿Con cuánta ayuda?" options={autonomyOptions} value={attempt.assistance} onChange={(assistance) => save({ assistance })} />
      <Choice<ContextRelation> label="¿En qué contexto?" options={contextOptions} value={attempt.contextRelation} onChange={(contextRelation) => save({ contextRelation })} />
      <Detail attempt={attempt} save={save} />
      <p className="text-[13px] text-ink-4">
        Un intento que no salió también es evidencia: se guarda igual.
        {!retro && !pending && ' Si todavía no puedes saber si cumplió el criterio, guárdalo y evalúalo después: hasta entonces no cuenta como evidencia.'}
      </p>
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

/** The explanation and the link: optional, one tap away. Open from the start if either was already written. */
function Detail({ attempt, save }: { attempt: Attempt; save: (patch: Parameters<typeof saveAttemptRecord>[2]) => Result }) {
  const [open, setOpen] = useState(Boolean(attempt.explanation.trim() || attempt.reference.trim()))
  if (!open)
    return (
      <div className="-ml-4">
        <Button variant="quiet" onClick={() => setOpen(true)}>
          + Añadir detalle o referencia
        </Button>
      </div>
    )
  return (
    <>
      <Field label="Explícalo con tus palabras (opcional)" value={attempt.explanation} hint="Se guarda tal cual. APRENDER todavía no evalúa la comprensión." onChange={(explanation) => save({ explanation })} />
      <Field label="Enlace al resultado (opcional)" value={attempt.reference} hint="Se guarda como referencia. No se verifica." onChange={(reference) => save({ reference })} />
    </>
  )
}

/** A record of an earlier attempt: the day, only if the person knows it. Left empty, the moment stays unknown — none is made up. */
function WhenField({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const today = new Date(nowMs())
  const max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return (
    <div>
      <label htmlFor="develop-when" className="block text-[13px] text-ink-3">
        ¿Cuándo fue? (aproximado, opcional)
      </label>
      <input
        id="develop-when"
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border-b border-line bg-transparent pb-2 text-[17px] text-ink focus:border-accent focus:outline-none"
      />
      <p className="mt-1.5 text-[12.5px] text-ink-4">{value ? 'Se guarda como día aproximado.' : 'Si no lo sabes, déjalo vacío: quedará como «fecha desconocida».'}</p>
    </div>
  )
}

/* —— 7 · Lo que sabemos, lo que no, el hueco y la próxima prueba —— */

const VERDICT_PHRASE: Record<CriterionVerdict, string> = { MET: 'cumplió el criterio', PARTIAL: 'lo cumplió en parte', NOT_MET: 'no cumplió el criterio' }

/** When it happened, as far as it is known. */
function moment(e: Evidence): string {
  if (e.occurredAt !== null) return when(e.occurredAt)
  const day = e.occurredOn ? new Date(`${e.occurredOn}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined
  return `${day ? `hacia el ${day}` : 'fecha desconocida'} (registrado el ${when(e.recordedAt)})`
}

function History({ cap, skill }: { cap: CapabilityApi; skill: Skill }) {
  // The whole lineage: the evidence of earlier revisions stays attached to the revision it was produced under.
  const revisions = new Map(cap.data.skills.filter((s) => s.lineageId === skill.lineageId).map((s) => [s.id, s.revision]))
  const all = cap.data.evidence.filter((e) => revisions.has(e.skillId)).sort((a, b) => (b.occurredAt ?? b.recordedAt) - (a.occurredAt ?? a.recordedAt) || b.recordedAt - a.recordedAt)
  const superseded = new Set(cap.data.evidence.map((e) => e.supersedes).filter(Boolean))
  const [correcting, setCorrecting] = useState<Evidence>()
  if (correcting) return <CorrectionEditor cap={cap} evidence={correcting} onDone={() => setCorrecting(undefined)} />
  if (!all.length) return null
  return (
    <details className="group">
      <summary className="hit flex min-h-11 cursor-pointer list-none items-center text-[13px] text-ink-3 hover:text-ink-2">Lo que ya has intentado</summary>
      <ol className="mt-2 flex flex-col gap-4">
        {all.map((e) => (
          <li key={e.id} className={`border-l pl-4 text-[14px] leading-snug ${superseded.has(e.id) ? 'border-line text-ink-4 line-through' : 'border-line text-ink-2'}`}>
            <span className="block text-ink-3">
              {moment(e)} · {e.capture === 'RETROSPECTIVE' ? 'registrado después' : 'intento directo'} · {AUTONOMY_PHRASE[e.assistance]} · {CONTEXT_PHRASE[e.contextRelation]}
              {revisions.get(e.skillId) !== skill.revision && ` · versión ${revisions.get(e.skillId)} de la habilidad`}
            </span>
            <span className="block">
              {e.observedResult} — {VERDICT_PHRASE[e.criterionVerdict]}.
            </span>
            {e.supersedes && <span className="block text-ink-3 no-underline">Corrige un registro anterior: {e.correctionReason}</span>}
            {!superseded.has(e.id) && (
              <button type="button" onClick={() => setCorrecting(e)} className="hit mt-1 min-h-11 text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline">
                Corregir este registro
              </button>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}

function CorrectionEditor({ cap, evidence, onDone }: { cap: CapabilityApi; evidence: Evidence; onDone: () => void }) {
  const [f, setF] = useState({ observedResult: evidence.observedResult, criterionVerdict: evidence.criterionVerdict, assistance: evidence.assistance, contextRelation: evidence.contextRelation, reason: '' })
  const [error, setError] = useState<string>()
  return (
    <Step
      label="Corregir un registro"
      title="El registro original no se borra."
      lead="Se guarda una corrección que lo sustituye, con su motivo. Las dos quedan en la historia."
      actions={
        <>
          <Button
            onClick={() => {
              const r = cap.run((d, now) => correctEvidence(d, evidence.id, { ...f, newId: newId('evidence'), now }))
              if (r.ok) onDone()
              else setError(errorText(r.error))
            }}
          >
            Guardar la corrección
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancelar
          </Button>
        </>
      }
    >
      <Field label="¿Por qué lo corriges?" value={f.reason} onChange={(reason) => setF({ ...f, reason })} />
      <Field label="¿Qué ocurrió?" value={f.observedResult} onChange={(observedResult) => setF({ ...f, observedResult })} />
      <Choice<CriterionVerdict> label="¿Cumplió el criterio?" options={verdictOptions} value={f.criterionVerdict} onChange={(criterionVerdict) => setF({ ...f, criterionVerdict })} />
      <Choice<Autonomy> label="¿Con cuánta ayuda?" options={autonomyOptions} value={f.assistance} onChange={(assistance) => setF({ ...f, assistance })} />
      <Choice<ContextRelation> label="¿En qué contexto?" options={contextOptions} value={f.contextRelation} onChange={(contextRelation) => setF({ ...f, contextRelation })} />
      {error && <Notice>{error}</Notice>}
    </Step>
  )
}

function ResultStep({ cap, objective, go, skill }: StepProps & { skill?: Skill }) {
  if (!skill) return <PickStep cap={cap} objective={objective} go={go} />
  const ev = effectiveEvidence(cap.data).filter((e) => e.skillId === skill.id)
  const { dimensions, current, next } = skillPicture(skill, ev)
  const pending = openAttemptFor(cap.data, skill.id)?.performedAt !== undefined
  const best = bestAssistanceMet(ev)
  const known = whatWeKnow(skill, dimensions, ev, best)
  const unknown = whatWeDontKnow(skill, dimensions)
  const list = (items: string[]) => (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="text-[15px] leading-snug text-ink-2">
          {t}
        </li>
      ))}
    </ul>
  )
  return (
    <Step
      label={shortSkill(skill)}
      title="Esto es lo que muestra."
      actions={
        <>
          {pending ? <Button onClick={() => go('record', skill.id)}>Continuar evaluación</Button> : next && <Button onClick={() => go('attempt', skill.id)}>Hacer esta prueba</Button>}
          <Button variant="secondary" onClick={() => go('pick')}>
            Otra habilidad
          </Button>
        </>
      }
    >
      {pending && <Notice>{PENDING}: un intento hecho todavía no cuenta. Lo que sigue no lo incluye.</Notice>}
      <Part title="Lo que sabemos">{known.length ? list(known) : <p className="text-[15px] text-ink-3">Todavía nada: no hay un intento directo.</p>}</Part>
      <Part title="Lo que todavía no sabemos">{list(unknown)}</Part>
      <Part title="Hueco actual">
        <p className="text-[16px] leading-snug text-ink">{current ? current.statement : 'No hay un hueco abierto en ejecución, autonomía, transferencia ni consistencia.'}</p>
      </Part>
      <Part title="Próxima prueba">
        {next ? (
          <>
            <TestCard statement={next.statement} criterion={next.successCriterion} maxAssistance={next.maxAssistance} targetContext={next.targetContext} />
            {next.rationale && <p className="mt-3 text-[13.5px] leading-snug text-ink-3">{next.rationale}</p>}
          </>
        ) : (
          <p className="text-[15px] text-ink-3">Por ahora, ninguna que B1 pueda proponer. APRENDER todavía no evalúa la comprensión.</p>
        )}
      </Part>
      <History cap={cap} skill={skill} />
    </Step>
  )
}
