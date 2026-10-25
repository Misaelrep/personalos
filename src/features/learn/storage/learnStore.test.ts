import { describe, expect, it } from 'vitest'
import { commitIntention, setDraft, EMPTY_STATE } from '../domain/state'
import { LEARN_STORAGE_VERSION, createLearnStore, learnKeys, type StorageLike } from './learnStore'

class FakeStorage implements StorageLike {
  data: Record<string, string> = {}
  getItem(key: string) {
    return key in this.data ? this.data[key] : null
  }
  setItem(key: string, value: string) {
    this.data[key] = value
  }
}

const CORE_KEYS = {
  'personal-os:day:2026-10-05': '{"date":"2026-10-05","records":{"x":{"status":"completado"}}}',
  'personal-os:entry': '{"dailyEntrySeenDate":"2026-10-05"}',
  'personal-os:sim:day:2026-09-30': '{"date":"2026-09-30","records":{}}',
}

describe('APRENDER storage: its own, versioned namespace', () => {
  it('uses exactly elyum:learn:v1:state and elyum:learn:v1:entry', () => {
    expect(LEARN_STORAGE_VERSION).toBe(1)
    expect(learnKeys(false)).toEqual({ state: 'elyum:learn:v1:state', entry: 'elyum:learn:v1:entry' })
  })

  it('a simulated session has its own namespace', () => {
    expect(learnKeys(true)).toEqual({ state: 'elyum:learn:v1:sim:state', entry: 'elyum:learn:v1:sim:entry' })
  })

  it('stores a versioned envelope', () => {
    const storage = new FakeStorage()
    createLearnStore({ storage, simulated: false }).saveState(setDraft(EMPTY_STATE, 'algo'))
    expect(JSON.parse(storage.data['elyum:learn:v1:state'])).toEqual({ v: 1, data: { draft: 'algo' } })
  })

  it('nothing stored → an empty state and empty entry memory', () => {
    const store = createLearnStore({ storage: new FakeStorage(), simulated: false })
    expect(store.loadState()).toEqual({ draft: '' })
    expect(store.loadEntry()).toEqual({})
  })
})

describe('APRENDER persistence', () => {
  it('the draft and the intention survive a reload (a new store over the same storage)', () => {
    const storage = new FakeStorage()
    const first = createLearnStore({ storage, simulated: false })
    first.saveState(setDraft(EMPTY_STATE, 'quiero entender'))
    expect(createLearnStore({ storage, simulated: false }).loadState()).toEqual({ draft: 'quiero entender' })

    first.saveState(commitIntention(EMPTY_STATE, 'explore', 'el sueño', 99))
    expect(createLearnStore({ storage, simulated: false }).loadState()).toEqual({
      draft: '',
      intention: { text: 'el sueño', route: 'explore', savedAt: 99 },
    })
  })

  it('entry memory merges: the ritual date and the day’s phrase are kept together', () => {
    const storage = new FakeStorage()
    const store = createLearnStore({ storage, simulated: false })
    store.saveEntry({ phrase: { date: '2026-10-05', id: 'seed-02' } })
    store.saveEntry({ lastEntryDate: '2026-10-05' })
    expect(createLearnStore({ storage, simulated: false }).loadEntry()).toEqual({
      lastEntryDate: '2026-10-05',
      phrase: { date: '2026-10-05', id: 'seed-02' },
    })
  })

  it('a simulated session never reads or changes the real memory (and vice versa)', () => {
    const storage = new FakeStorage()
    const real = createLearnStore({ storage, simulated: false })
    const sim = createLearnStore({ storage, simulated: true })
    real.saveState(setDraft(EMPTY_STATE, 'real'))
    real.saveEntry({ lastEntryDate: '2026-10-05' })
    expect(sim.loadState()).toEqual({ draft: '' })
    expect(sim.loadEntry()).toEqual({})
    sim.saveState(setDraft(EMPTY_STATE, 'simulado'))
    sim.saveEntry({ lastEntryDate: '2026-09-30' })
    expect(real.loadState()).toEqual({ draft: 'real' })
    expect(real.loadEntry()).toEqual({ lastEntryDate: '2026-10-05' })
    expect(Object.keys(storage.data).sort()).toEqual([
      'elyum:learn:v1:entry',
      'elyum:learn:v1:sim:entry',
      'elyum:learn:v1:sim:state',
      'elyum:learn:v1:state',
    ])
  })
})

describe('APRENDER never touches the core’s keys', () => {
  it('only writes under elyum:learn:v1:, and leaves every core key byte-identical', () => {
    const storage = new FakeStorage()
    Object.assign(storage.data, CORE_KEYS)
    const store = createLearnStore({ storage, simulated: false })
    store.saveState(commitIntention(setDraft(EMPTY_STATE, 'x'), 'orient', 'x', 1))
    store.saveEntry({ lastEntryDate: '2026-10-05', phrase: { date: '2026-10-05', id: 'seed-01' } })
    for (const [key, value] of Object.entries(CORE_KEYS)) expect(storage.data[key]).toBe(value)
    const added = Object.keys(storage.data).filter((k) => !(k in CORE_KEYS))
    expect(added.length).toBeGreaterThan(0)
    for (const key of added) expect(key.startsWith('elyum:learn:v1:')).toBe(true)
  })
})

describe('APRENDER storage is forgiving', () => {
  const key = learnKeys(false)

  it('another envelope version is ignored, not misread and not destroyed', () => {
    const storage = new FakeStorage()
    storage.data[key.state] = JSON.stringify({ v: 2, data: { draft: 'del futuro' } })
    const store = createLearnStore({ storage, simulated: false })
    expect(store.loadState()).toEqual({ draft: '' })
    expect(storage.data[key.state]).toContain('del futuro')
  })

  it('corrupt or unexpected content falls back to empty', () => {
    const storage = new FakeStorage()
    const store = createLearnStore({ storage, simulated: false })
    for (const raw of ['not json', '{"v":1}', 'null', '[]', '{"v":1,"data":42}']) {
      storage.data[key.state] = raw
      expect(store.loadState()).toEqual({ draft: '' })
    }
  })

  it('invalid fields are dropped one by one, valid ones kept', () => {
    const storage = new FakeStorage()
    const store = createLearnStore({ storage, simulated: false })
    storage.data[key.state] = JSON.stringify({ v: 1, data: { draft: 7, intention: { text: 'a', route: 'nope', savedAt: 1 } } })
    expect(store.loadState()).toEqual({ draft: '' })
    storage.data[key.state] = JSON.stringify({ v: 1, data: { draft: 'ok', intention: { text: 'a', route: 'orient', savedAt: 'x' } } })
    expect(store.loadState()).toEqual({ draft: 'ok' })
    storage.data[key.entry] = JSON.stringify({ v: 1, data: { lastEntryDate: 'ayer', phrase: { date: '2026-10-05', id: 3 } } })
    expect(store.loadEntry()).toEqual({})
  })

  it('without usable storage the session still works from memory', () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('quota')
      },
    }
    for (const storage of [broken, undefined]) {
      const store = createLearnStore({ storage, simulated: false })
      store.saveState(setDraft(EMPTY_STATE, 'en memoria'))
      store.saveEntry({ lastEntryDate: '2026-10-05' })
      expect(store.loadState()).toEqual({ draft: 'en memoria' })
      expect(store.loadEntry()).toEqual({ lastEntryDate: '2026-10-05' })
    }
  })
})
