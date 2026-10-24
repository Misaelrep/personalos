import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalJson } from './domain/canonical'
import { moduleOf, placeOf, readSnapshot } from './domain/collect'
import { backupFileName, createBackup, localIsoString } from './domain/create'
import { MAX_BACKUP_BYTES, MAX_BACKUP_KEYS, type BackupFile } from './domain/format'
import { coveredByTotal, sha256Hex } from './domain/integrity'
import { sha256Bytes } from './domain/sha256'
import { keyStatusOf } from './domain/keyStatus'
import { parseStrictJson } from './domain/strictJson'
import { compareWithDevice, verifyBackupText } from './domain/verify'
import type { ReadableStorage } from './storage/storage'

/**
 * P2-E · export and verification. Synthetic data only. Every negative case
 * must be rejected with its own reason; a check that passes a broken file is
 * a failing test.
 */

/** Readable storage over a plain map. Its write methods throw: P2-E must never call them. */
function storageOf(entries: Record<string, string>): ReadableStorage & { writes: number } {
  const keys = Object.keys(entries)
  const s = {
    writes: 0,
    get length() {
      return keys.length
    },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => (Object.hasOwn(entries, k) ? entries[k] : null),
    setItem() {
      s.writes++
      throw new Error('write')
    },
    removeItem() {
      s.writes++
      throw new Error('write')
    },
    clear() {
      s.writes++
      throw new Error('write')
    },
  }
  return s
}

const day = (date: string, records: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => JSON.stringify({ date, records, ...more })

const SAMPLE: Record<string, string> = {
  'personal-os:day:2026-10-20': day('2026-10-20', { 'tue-web-1000': { status: 'completado', objective: 'Texto sintético «ñ» 🌙' } }),
  'personal-os:day:2026-10-21': day('2026-10-21', { merkaba: { status: 'parcial', outcome: 'parcial', pendingNote: 'x' } }, { meditationMoved: true }),
  'personal-os:day:2026-10-22': '{"date":"2026-10-22","records":', // truncated: unreadable
  'personal-os:day:2026-10-23': day('2026-10-23', { a: { objective: 123 } }), // the app cannot use it (H07)
  'personal-os:entry': JSON.stringify({ dailyEntrySeenDate: '2026-10-21', lastActiveAt: 1, dailyMessage: { date: '2026-10-21', id: 'm1' } }),
  'elyum:learn:v1:state': JSON.stringify({ v: 1, data: { intention: 'sintética' } }),
  'elyum:learn:v1:entry': JSON.stringify({ v: 1, data: {} }),
  'elyum:projects:v1:data': JSON.stringify({ version: 1 }),
  'personal-os:sim:day:2026-10-20': day('2026-10-20'),
  'elyum:learn:v1:sim:state': '{}',
  'elyum:system:v1:meta': '{}',
  'otra-app:token': 'abc',
  'elyum:futuro:v1:x': '1',
}

const NOW = new Date(2026, 9, 25, 21, 4, 0)

function made(entries = SAMPLE) {
  const r = createBackup(readSnapshot(storageOf(entries)), NOW, 'Mac · navegador')
  if (!r.ok) throw new Error(r.error.message)
  return r.backup
}

/** Rewrite a field and re-sign everything, so only the targeted check can catch it. */
function resign(file: BackupFile): string {
  const { total: _drop, ...rest } = file.integrity
  void _drop
  const f = { ...file, integrity: { ...rest, total: sha256Hex(coveredByTotal({ ...file, integrity: rest })) } }
  return JSON.stringify(f)
}


describe('SHA-256', () => {
  const ref = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  it('matches the standard vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })
  it('matches Node on every length around the block boundaries and on random data', () => {
    for (let n = 0; n <= 200; n++) {
      const b = randomBytes(n)
      expect(hex(sha256Bytes(b)), `longitud ${n}`).toBe(ref(b))
    }
    for (const n of [1023, 4096, 65_537, 1_048_577]) {
      const b = randomBytes(n)
      expect(hex(sha256Bytes(b)), `longitud ${n}`).toBe(ref(b))
    }
  })
  it('hashes text as UTF-8', () => {
    const t = 'Día «ñ» 🌙 \u0000 \ud83c'
    expect(sha256Hex(t)).toBe(createHash('sha256').update(new TextEncoder().encode(t)).digest('hex'))
  })
})

describe('strict JSON', () => {
  it('accepts what JSON.parse accepts, with the same value', () => {
    for (const t of ['{}', '[]', '0', '-1.5e3', '"a\\u00f1\\n"', 'true', 'null', ' {"a":[1,{"b":null}],"c":"\\"x\\""} ', '﻿{"a":1}']) {
      const r = parseStrictJson(t)
      expect(r.ok, t).toBe(true)
      if (r.ok) expect(r.value).toEqual(JSON.parse(t.replace(/^﻿/, '')))
    }
  })
  it('rejects a repeated key at any depth', () => {
    for (const t of ['{"a":1,"a":2}', '{"x":{"b":1,"b":1}}', '[{"k":0,"k":0}]', '{"a":1,"\\u0061":2}']) {
      const r = parseStrictJson(t)
      expect(r.ok, t).toBe(false)
      if (!r.ok) expect(r.reason).toBe('duplicate-key')
    }
  })
  it('rejects malformed text', () => {
    for (const t of ['', '{', '{"a":1,}', '[1,]', '01', '{"a":1} x', "{'a':1}", '{"a":"\u0001"}', '"\\x"', 'NaN', '{"a" 1}']) expect(parseStrictJson(t).ok, t).toBe(false)
  })
  it('refuses absurd nesting instead of overflowing', () => {
    const r = parseStrictJson('['.repeat(5000) + ']'.repeat(5000))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too-deep')
  })
})

describe('what goes into a copy', () => {
  it('places every kind of key', () => {
    expect(moduleOf('personal-os:day:2026-10-20')).toBe('core')
    expect(moduleOf('personal-os:entry')).toBe('core')
    expect(moduleOf('elyum:learn:v1:state')).toBe('learn')
    expect(moduleOf('elyum:projects:v1:data')).toBe('projects')
    expect(placeOf('personal-os:sim:entry')).toEqual({ excluded: 'simulation' })
    expect(placeOf('elyum:learn:v1:sim:state')).toEqual({ excluded: 'simulation' })
    expect(placeOf('elyum:system:v1:meta')).toEqual({ excluded: 'system' })
    expect(placeOf('elyum:futuro:x')).toEqual({ excluded: 'unknownElyum' })
    expect(placeOf('__proto__')).toEqual({ excluded: 'foreign' })
  })
  it('reads a snapshot without writing, and reports what it left out', () => {
    const s = storageOf(SAMPLE)
    const snap = readSnapshot(s)
    expect(s.writes).toBe(0)
    expect(Object.keys(snap.modules.core.keys).sort()).toEqual(['personal-os:day:2026-10-20', 'personal-os:day:2026-10-21', 'personal-os:day:2026-10-22', 'personal-os:day:2026-10-23', 'personal-os:entry'])
    expect(Object.keys(snap.modules.learn.keys).sort()).toEqual(['elyum:learn:v1:entry', 'elyum:learn:v1:state'])
    expect(Object.keys(snap.modules.projects.keys)).toEqual(['elyum:projects:v1:data'])
    expect(snap.excluded).toEqual({ simulation: 2, system: 1, foreign: 1, unknownElyum: ['elyum:futuro:v1:x'] })
    for (const [k, v] of Object.entries(snap.modules.core.keys)) expect(v).toBe(SAMPLE[k])
  })
  it('a storage that refuses to be read throws, it does not produce an empty copy', () => {
    const broken: ReadableStorage = {
      get length(): number {
        throw new DOMException('denied', 'SecurityError')
      },
      key: () => null,
      getItem: () => null,
    }
    expect(() => readSnapshot(broken)).toThrow()
  })
})

describe('status of each key', () => {
  it('follows what the app can consume', () => {
    expect(keyStatusOf('core', 'personal-os:day:2026-10-20', SAMPLE['personal-os:day:2026-10-20'])).toBe('valido')
    expect(keyStatusOf('core', 'personal-os:day:2026-10-21', SAMPLE['personal-os:day:2026-10-21'])).toBe('valido') // legacy ids are migrated on read
    expect(keyStatusOf('core', 'personal-os:day:2026-10-22', SAMPLE['personal-os:day:2026-10-22'])).toBe('ilegible')
    expect(keyStatusOf('core', 'personal-os:day:2026-10-23', SAMPLE['personal-os:day:2026-10-23'])).toBe('no-reconocido')
    expect(keyStatusOf('core', 'personal-os:day:2026-10-24', day('2026-10-25'))).toBe('no-reconocido') // loadDay ignores a day stored under another date
    expect(keyStatusOf('core', 'personal-os:day:2026-10-24', day('2026-10-24', { a: { status: 'hecho' } }))).toBe('no-reconocido')
    expect(keyStatusOf('core', 'personal-os:day:2026-10-24', day('2026-10-24', {}, { focus: { blockId: 'a' } }))).toBe('no-reconocido')
    expect(keyStatusOf('core', 'personal-os:entry', SAMPLE['personal-os:entry'])).toBe('valido')
    expect(keyStatusOf('core', 'personal-os:entry', '{"lastActiveAt":"ayer"}')).toBe('no-reconocido')
    expect(keyStatusOf('learn', 'elyum:learn:v1:state', SAMPLE['elyum:learn:v1:state'])).toBe('sin-validador')
    expect(keyStatusOf('learn', 'elyum:learn:v1:state', '{"data":1}')).toBe('no-reconocido')
    expect(keyStatusOf('projects', 'elyum:projects:v1:data', '{}')).toBe('sin-validador')
    expect(keyStatusOf('projects', 'elyum:projects:v1:data', 'no json')).toBe('ilegible')
  })
})

describe('creating a copy', () => {
  it('exports every ELYUM value byte for byte, unreadable ones included, and verifies itself', () => {
    const b = made()
    expect(b.file.version).toBe(2)
    expect(b.file.meta).toMatchObject({ createdAt: localIsoString(NOW), device: 'Mac · navegador', app: 'ELYUM', storage: 'localStorage' })
    expect(b.file.counts).toEqual({ core: 5, learn: 2, projects: 1 })
    expect(b.file.keyStatus['personal-os:day:2026-10-22']).toBe('ilegible')
    expect(b.file.modules.core.keys['personal-os:day:2026-10-22']).toBe(SAMPLE['personal-os:day:2026-10-22'])
    const v = verifyBackupText(b.text)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.statusCounts).toEqual({ valido: 3, 'no-reconocido': 1, ilegible: 1, 'sin-validador': 3 })
      expect(v.statusChanges).toEqual([])
    }
    expect(JSON.parse(b.text).modules.core.keys['personal-os:day:2026-10-20']).toBe(SAMPLE['personal-os:day:2026-10-20'])
  })
  it('an empty device gives a valid empty copy', () => {
    const b = made({})
    expect(b.file.counts).toEqual({ core: 0, learn: 0, projects: 0 })
    expect((verifyBackupText(b.text)).ok).toBe(true)
  })
  it('is deterministic for the same data and moment', () => {
    expect((made()).text).toBe((made()).text)
  })
  it('refuses more keys than the limit', () => {
    const many: Record<string, string> = {}
    for (let i = 0; i <= MAX_BACKUP_KEYS; i++) many[`elyum:projects:k${i}`] = '1'
    const r = createBackup(readSnapshot(storageOf(many)), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('too-large')
  })
  it('names the file by local date and time', () => {
    expect(backupFileName(NOW)).toBe('elyum-copia-2026-10-25-2104.json')
  })
})

describe('verifying a file: every alteration is caught, each by its own check', () => {
  const kindOf = (text: string) => {
    const r = verifyBackupText(text)
    return r.ok ? 'ok' : r.kind
  }
  it('a changed value', () => {
    const b = made()
    expect(kindOf(b.text.replace('Texto sintético', 'Texto sintetico'))).toBe('integrity')
  })
  it('changed metadata: date, device, exclusions (the hash covers them)', () => {
    const b = made()
    expect(kindOf(b.text.replace(localIsoString(NOW), '2026-10-26T09:00:00+00:00'))).toBe('integrity')
    expect(kindOf(b.text.replace('Mac · navegador', 'iPhone · app instalada'))).toBe('integrity')
    const f: BackupFile = JSON.parse(b.text)
    f.meta.excluded.foreign = 9
    expect(kindOf(JSON.stringify(f))).toBe('integrity')
  })
  it('a changed key status', () => {
    const f: BackupFile = JSON.parse((made()).text)
    f.keyStatus['personal-os:day:2026-10-22'] = 'valido'
    expect(kindOf(JSON.stringify(f))).toBe('integrity')
  })
  it('a repeated key, even when the text would hash the same', () => {
    const b = made()
    const dup = b.text.replace('"schema": "elyum.backup",', '"schema": "elyum.backup",\n  "schema": "elyum.backup",')
    expect(kindOf(dup)).toBe('duplicate-key')
  })
  it('truncated, empty or not JSON', () => {
    const b = made()
    expect(kindOf(b.text.slice(0, b.text.length / 2))).toBe('json')
    expect(kindOf('')).toBe('json')
    expect(kindOf('hola')).toBe('json')
  })
  it('another schema, an older or a newer version', () => {
    const f = JSON.parse((made()).text)
    expect(kindOf(JSON.stringify({ ...f, schema: 'otra.cosa' }))).toBe('schema')
    expect(kindOf(JSON.stringify({ ...f, version: 1 }))).toBe('version-old')
    expect(kindOf(JSON.stringify({ ...f, version: 3 }))).toBe('version-future')
    expect(kindOf(JSON.stringify({ ...f, version: '2' }))).toBe('shape')
  })
  it('the synthetic format-1 copy of the earlier test is recognized as old, not as broken', () => {
    const v1 = JSON.stringify({ schema: 'elyum.backup', version: 1, createdAt: 'x', modules: {}, counts: {}, integrity: {} })
    expect(kindOf(v1)).toBe('version-old')
  })
  it('missing or extra fields, re-signed so only the shape check can catch them', () => {
    const f: BackupFile = JSON.parse((made()).text)
    expect(kindOf(resign({ ...f, extra: 1 } as unknown as BackupFile))).toBe('shape')
    const { keyStatus: _k, ...noStatus } = f
    void _k
    expect(kindOf(resign(noStatus as unknown as BackupFile))).toBe('shape')
    expect(kindOf(resign({ ...f, meta: { ...f.meta, extra: 1 } } as unknown as BackupFile))).toBe('shape')
  })
  it('a key outside its module, a value that is not text, wrong counts — all re-signed', () => {
    const f: BackupFile = JSON.parse((made()).text)
    const moved = structuredClone(f)
    moved.modules.core.keys['elyum:system:v1:restore'] = '{}'
    moved.keyStatus['elyum:system:v1:restore'] = 'valido'
    moved.counts.core++
    expect(kindOf(resign(moved))).toBe('foreign-key')
    const notText = structuredClone(f) as unknown as { modules: { core: { keys: Record<string, unknown> } } }
    notText.modules.core.keys['personal-os:entry'] = { a: 1 }
    expect(kindOf(resign(notText as unknown as BackupFile))).toBe('shape')
    const counts = structuredClone(f)
    counts.counts.learn = 7
    expect(kindOf(resign(counts))).toBe('counts')
    const status = structuredClone(f)
    delete status.keyStatus['personal-os:entry']
    expect(kindOf(resign(status))).toBe('shape')
  })
  it('a file beyond the size limit is refused before parsing', () => {
    expect(kindOf(' '.repeat(MAX_BACKUP_BYTES + 1))).toBe('too-large')
  })
})

describe('comparing a verified copy with this device (read only)', () => {
  it('counts equal, different and missing keys', () => {
    const b = made()
    const now = readSnapshot(storageOf({ ...SAMPLE, 'personal-os:entry': '{}', 'personal-os:day:2026-10-24': day('2026-10-24') }))
    delete now.modules.learn.keys['elyum:learn:v1:entry']
    const c = compareWithDevice(b.file, now)
    expect(c).toEqual({ same: 6, different: ['personal-os:entry'], onlyInFile: ['elyum:learn:v1:entry'], onlyOnDevice: ['personal-os:day:2026-10-24'] })
  })
})

describe('P2-E scope: no writes and no restore in the shipped code', () => {
  const root = join(__dirname)
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : []
    })
  const sources = [...files(root), ...files(join(root, '../system'))].map((p) => ({ p, text: readFileSync(p, 'utf8') }))

  it('has sources to scan', () => {
    expect(sources.length).toBeGreaterThan(8)
  })
  it('never writes to any storage', () => {
    for (const { p, text } of sources) expect(text, p).not.toMatch(/setItem|removeItem|\.clear\(|indexedDB|sessionStorage|document\.cookie|caches\./)
  })
  it('only storage.ts touches localStorage, and only to return it', () => {
    for (const { p, text } of sources) {
      const uses = text.match(/window\.localStorage|\blocalStorage\s*[.[(]|globalThis\.localStorage/g)?.length ?? 0
      expect(uses, p).toBe(p.endsWith('storage/storage.ts') ? 1 : 0)
    }
  })
  it('defines no import, apply or restore operation', () => {
    for (const { p, text } of sources) expect(text, p).not.toMatch(/(function|const)\s+(apply|restore|import|rollback|plan)[A-Z]?\w*\s*[=(]/i)
  })
  it('canonical JSON is stable under key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }))
  })
})
