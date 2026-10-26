import { describe, expect, it } from 'vitest'
import { confirmAttempt as confirmAttemptFn, saveAttemptRecord, startAttempt } from '../domain/capability/commands'
import { activeObjective, attempt, must, T0 } from '../domain/capability/fixtures'
import { EMPTY_STATE, commitIntention, setDraft } from '../domain/state'
import { CAPABILITY_SCHEMA, EMPTY_STORED } from './capabilityCodec'
import { createLearnStore, learnKeys, type StorageLike } from './learnStore'

class FakeStorage implements StorageLike {
  data: Record<string, string> = {}
  writes = 0
  getItem(key: string) {
    return key in this.data ? this.data[key] : null
  }
  setItem(key: string, value: string) {
    this.writes++
    this.data[key] = value
  }
}

const key = learnKeys(false)
const fresh = (storage: FakeStorage, simulated = false) => createLearnStore({ storage, simulated })

describe('DESARROLLAR persistence (elyum:learn:v1:capability)', () => {
  it('nothing stored (a Phase A install) reads as empty — no migration step, and Phase A data is untouched', () => {
    const storage = new FakeStorage()
    storage.data[key.state] = JSON.stringify({ v: 1, data: { draft: 'de la fase A', intention: { text: 'quiero', route: 'develop', savedAt: 1 } } })
    storage.data[key.entry] = JSON.stringify({ v: 1, data: { lastEntryDate: '2026-10-05' } })
    const before = { ...storage.data }
    const store = fresh(storage)
    expect(store.loadCapability()).toEqual({ status: 'empty', stored: EMPTY_STORED, dropped: 0 })
    store.saveCapability({ data: activeObjective(), flow: { objectiveId: 'o1', step: 'pick' } })
    expect(storage.data[key.state]).toBe(before[key.state])
    expect(storage.data[key.entry]).toBe(before[key.entry])
    expect(store.loadState()).toEqual({ draft: 'de la fase A', intention: { text: 'quiero', route: 'develop', savedAt: 1 } })
  })

  it('objective, skills, attempts and evidence survive a reload exactly; one write per save, in APRENDER’s envelope with its schema', () => {
    const storage = new FakeStorage()
    const data = attempt(activeObjective(), 's1', T0 + 3600_000, 'NOT_MET', 'GUIDED')
    fresh(storage).saveCapability({ data, flow: { objectiveId: 'o1', step: 'result', skillId: 's1' } })
    expect(storage.writes).toBe(1)
    expect(JSON.parse(storage.data[key.capability])).toMatchObject({ v: 1, data: { schema: CAPABILITY_SCHEMA } })
    expect(fresh(storage).loadCapability()).toEqual({ status: 'ok', stored: { data, flow: { objectiveId: 'o1', step: 'result', skillId: 's1' } }, dropped: 0 })
  })

  it('a reload in the middle of an attempt brings it back, with what had been written', () => {
    const storage = new FakeStorage()
    let data = must(startAttempt(activeObjective(), { id: 'a1', skillId: 's2', testStatement: 'Responder 5 preguntas', contextDescription: 'llamada', capture: 'LIVE', now: T0 }))
    data = must(saveAttemptRecord(data, 'a1', { outcomeDescription: 'Respondí 3 de 5', criterionVerdict: 'PARTIAL' }))
    fresh(storage).saveCapability({ data, flow: { objectiveId: 'o1', step: 'record', skillId: 's2' } })
    const back = fresh(storage).loadCapability()
    expect(back.stored.flow).toEqual({ objectiveId: 'o1', step: 'record', skillId: 's2' })
    expect(back.stored.data.attempts.find((a) => a.id === 'a1')).toMatchObject({ outcomeDescription: 'Respondí 3 de 5', criterionVerdict: 'PARTIAL' })
    expect(back.stored.data.attempts[0].completedAt).toBeUndefined()
  })

  it('corrupt content never breaks APRENDER: empty session, the raw text kept once in a backup, the draft untouched', () => {
    for (const raw of ['{not json', 'null', '[]', '{"v":1}', '{"v":1,"data":[]}', '{"v":1,"data":{"objectives":[]}}', '{"v":0,"data":{"schema":1}}']) {
      const storage = new FakeStorage()
      storage.data[key.state] = JSON.stringify({ v: 1, data: { draft: 'a salvo' } })
      storage.data[key.capability] = raw
      const store = fresh(storage)
      const r = store.loadCapability()
      expect(r.status, raw).toBe('corrupt')
      expect(r.stored).toEqual(EMPTY_STORED)
      expect(storage.data[`${key.capability}:backup`]).toBe(raw)
      expect(store.loadState()).toEqual({ draft: 'a salvo' })
      // writing afterwards does not overwrite the backup
      store.saveCapability({ data: activeObjective(), flow: {} })
      expect(storage.data[`${key.capability}:backup`]).toBe(raw)
    }
  })

  it('records that do not hold are dropped one by one; the rest are kept', () => {
    const storage = new FakeStorage()
    const good = attempt(activeObjective(), 's1', T0 + 3600_000, 'MET')
    const raw = { schema: 1, ...good, flow: { objectiveId: 'o1', step: 'nonsense', skillId: 'ghost' } }
    raw.evidence = [...good.evidence, { ...good.evidence[0], id: 'bad', criterionVerdict: 'MAYBE' }, { id: 'half' }] as typeof good.evidence
    raw.skills = [...good.skills, { id: 'x', objectiveId: 'o1', action: 7 }] as unknown as typeof good.skills
    raw.objectives = [...good.objectives, { ...good.objectives[0], id: 'o2', status: 'COMPLETED' }] as typeof good.objectives
    storage.data[key.capability] = JSON.stringify({ v: 1, data: raw })
    const r = fresh(storage).loadCapability()
    expect(r.status).toBe('ok')
    expect(r.dropped).toBe(4)
    expect(r.stored.data).toEqual(good)
    expect(r.stored.flow).toEqual({ objectiveId: 'o1' })
  })

  it('a newer version is neither read nor overwritten: it fails safe', () => {
    for (const raw of [JSON.stringify({ v: 2, data: { objectives: ['del futuro'] } }), JSON.stringify({ v: 1, data: { schema: 99, objectives: ['del futuro'] } })]) {
      const storage = new FakeStorage()
      storage.data[key.capability] = raw
      const store = fresh(storage)
      expect(store.loadCapability()).toEqual({ status: 'newer', stored: EMPTY_STORED, dropped: 0 })
      expect(store.saveCapability({ data: activeObjective(), flow: {} })).toBe(false)
      expect(storage.data[key.capability]).toBe(raw)
      // …even when the first thing that happens is a save
      expect(fresh(storage).saveCapability({ data: activeObjective(), flow: {} })).toBe(false)
      expect(storage.data[key.capability]).toBe(raw)
    }
  })

  it('simulation data never contaminates real data (and vice versa)', () => {
    const storage = new FakeStorage()
    const real = fresh(storage, false)
    const sim = fresh(storage, true)
    sim.saveCapability({ data: attempt(activeObjective(), 's1', T0, 'MET'), flow: { objectiveId: 'o1' } })
    expect(real.loadCapability().status).toBe('empty')
    real.saveCapability({ data: activeObjective(undefined, 'real'), flow: {} })
    expect(sim.loadCapability().stored.data.objectives.map((o) => o.id)).toEqual(['o1'])
    expect(real.loadCapability().stored.data.objectives.map((o) => o.id)).toEqual(['real'])
    expect(Object.keys(storage.data).sort()).toEqual(['elyum:learn:v1:capability', 'elyum:learn:v1:sim:capability'])
  })

  it('never touches a key of the core', () => {
    const storage = new FakeStorage()
    const core = { 'personal-os:entry': '{"dailyEntrySeenDate":"2026-10-05"}', 'personal-os:day:2026-10-05': '{"date":"2026-10-05","records":{}}' }
    Object.assign(storage.data, core)
    const store = fresh(storage)
    store.saveState(commitIntention(setDraft(EMPTY_STATE, 'x'), 'develop', 'x', 1))
    store.saveCapability({ data: attempt(activeObjective(), 's1', T0, 'MET'), flow: {} })
    for (const [k, v] of Object.entries(core)) expect(storage.data[k]).toBe(v)
    for (const k of Object.keys(storage.data).filter((k) => !(k in core))) expect(k.startsWith('elyum:learn:v1:')).toBe(true)
  })

  it('without usable storage the session keeps working from memory', () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('quota')
      },
    }
    const store = createLearnStore({ storage: broken, simulated: false })
    expect(store.loadCapability().status).toBe('empty')
    const data = activeObjective()
    expect(store.saveCapability({ data, flow: {} })).toBe(true)
    expect(store.loadCapability().stored.data).toEqual(data)
  })
})

describe('B1.1 · storage: schema 2, and schema 1 read with explicit defaults', () => {
  it('writes schema 2; a retrospective record round-trips with its unknown moment (null) and its approximate day', () => {
    const storage = new FakeStorage()
    let data = must(startAttempt(activeObjective(), { id: 'r1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'RETROSPECTIVE', now: T0 }))
    data = must(saveAttemptRecord(data, 'r1', { outcomeDescription: 'antes', criterionVerdict: 'MET', assistance: 'GUIDED', contextRelation: 'SAME', occurredOn: '2026-09-01' }))
    const { confirmAttempt } = { confirmAttempt: (d: typeof data) => must(confirmAttemptFn(d, 'r1', 'er1', T0 + 3600_000)) }
    data = confirmAttempt(data)
    fresh(storage).saveCapability({ data, flow: {} })
    expect(JSON.parse(storage.data[key.capability]).data.schema).toBe(2)
    const back = fresh(storage).loadCapability()
    expect(back.status).toBe('ok')
    expect(back.stored.data).toEqual(data)
    expect(back.stored.data.evidence[0]).toMatchObject({ occurredAt: null, occurredOn: '2026-09-01' })
  })

  it('schema 1 (B1): revisions default to 1, and a retrospective record loses the moment it never had', () => {
    const storage = new FakeStorage()
    const v1 = {
      schema: 1,
      objectives: [{ id: 'o1', rawIntent: 'x', action: 'Presentar algo', result: 'una presentación', context: 'una reunión', criterion: 'se entiende', targetAutonomy: 'AUTONOMOUS', status: 'ACTIVE', skillIds: ['s1'], createdAt: 1, updatedAt: 1 }],
      skills: [{ id: 's1', objectiveId: 'o1', action: 'Explicar algo', result: 'una explicación', context: 'una llamada', criterion: 'sin pausas', targetAutonomy: 'AUTONOMOUS', createdAt: 1, updatedAt: 1 }],
      attempts: [],
      evidence: [
        { id: 'e1', attemptId: 'a1', objectiveId: 'o1', skillId: 's1', observedResult: 'r', criterionVerdict: 'MET', assistance: 'GUIDED', contextRelation: 'SAME', occurredAt: 5, recordedAt: 5, provenance: 'SELF_REPORTED', capture: 'LIVE', testStatement: 't', contextDescription: 'c' },
        { id: 'e2', attemptId: 'a2', objectiveId: 'o1', skillId: 's1', observedResult: 'r', criterionVerdict: 'MET', assistance: 'GUIDED', contextRelation: 'SAME', occurredAt: 9, recordedAt: 9, provenance: 'SELF_REPORTED', capture: 'RETROSPECTIVE', testStatement: 't', contextDescription: 'c' },
      ],
      flow: {},
    }
    storage.data[key.capability] = JSON.stringify({ v: 1, data: v1 })
    const r = fresh(storage).loadCapability()
    expect(r.status).toBe('ok')
    expect(r.dropped).toBe(0)
    expect(r.stored.data.objectives[0]).toMatchObject({ revision: 1, previousRevisions: [] })
    expect(r.stored.data.skills[0]).toMatchObject({ lineageId: 's1', revision: 1 })
    expect(r.stored.data.evidence[0]).toMatchObject({ occurredAt: 5, objectiveRevision: 1 })
    expect(r.stored.data.evidence[1]).toMatchObject({ occurredAt: null, recordedAt: 9, objectiveRevision: 1 })
  })

  it('schema 2 refuses a retrospective record with a stored exact moment, and a live one without it', () => {
    const storage = new FakeStorage()
    const good = attempt(activeObjective(), 's1', T0, 'MET')
    const bad = [{ ...good.evidence[0], id: 'x1', capture: 'RETROSPECTIVE', occurredAt: T0 }, { ...good.evidence[0], id: 'x2', occurredAt: null }]
    storage.data[key.capability] = JSON.stringify({ v: 1, data: { schema: 2, ...good, evidence: [...good.evidence, ...bad], flow: {} } })
    const r = fresh(storage).loadCapability()
    expect(r.dropped).toBe(2)
    expect(r.stored.data.evidence).toEqual(good.evidence)
  })
})
