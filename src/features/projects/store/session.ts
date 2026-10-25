import type { ProjectsData } from '../domain/types'
import { readDossierFile, type DossierFile } from '../import/readers'
import { applyImport, planImport, type ImportDecisions, type ImportPlan, type Resolutions } from '../import/plan'
import type { Loaded, ProjectsStore, SaveResult } from './store'

/**
 * P3 · One open PROYECTOS: the data as last read, the generation it came
 * from, and the last error — always visible, never swallowed. Every change
 * goes through `change`, which saves against that generation; nothing is
 * kept in memory as if it were saved.
 */

export const CYCLE = { start: '2026-10-26', end: '2027-01-23' }

export function emptyProjectsData(): ProjectsData {
  return { version: 1, cycle: { ...CYCLE }, vocabularies: {}, projects: [], milestones: [], tasks: [], atlas: [], sources: [], references: [], imports: [], routineLinks: [], weeks: [], history: [] }
}

export type SessionState =
  | { status: 'listo'; data: ProjectsData; generation: number; writable: boolean; readOnlyReason?: string; warnings: string[] }
  | { status: 'ilegible' | 'version-futura'; reason: string; raw: string }

export interface PreviewedImport {
  plan: ImportPlan
  decisions: ImportDecisions
  /** Generation the preview was computed on: confirming refuses if the store moved. */
  baseGeneration: number
}

export class ProjectsSession {
  state: SessionState | undefined
  lastError: SaveResult | undefined

  constructor(
    private store: ProjectsStore,
    private now: () => string,
    private random?: () => string,
  ) {}

  private fromLoaded(l: Loaded): SessionState {
    const writable = this.store.mode === 'escritura'
    const ro = this.store.readOnlyReason ? { readOnlyReason: this.store.readOnlyReason } : {}
    if (l.kind === 'vacio') return { status: 'listo', data: emptyProjectsData(), generation: 0, writable, ...ro, warnings: [] }
    if (l.kind === 'ok') return { status: 'listo', data: l.data, generation: l.generation, writable, ...ro, warnings: l.warnings }
    if (l.kind === 'ilegible') return { status: 'ilegible', reason: l.reason, raw: l.raw }
    return { status: 'version-futura', reason: `formato ${l.format}`, raw: l.raw }
  }

  async open(): Promise<SessionState> {
    this.state = this.fromLoaded(await this.store.load())
    return this.state
  }

  /** Apply a pure change and save it. On failure the data stays as stored and the error is kept. */
  async change(fn: (d: ProjectsData) => ProjectsData): Promise<SaveResult> {
    const s = this.state
    if (!s || s.status !== 'listo') return this.fail({ ok: false, reason: 'almacen-ilegible', message: 'PROYECTOS no está abierto con datos legibles.' })
    if (!s.writable) return this.fail({ ok: false, reason: 'solo-lectura', message: s.readOnlyReason ?? 'Solo lectura.' })
    const next = fn(s.data)
    return this.saveAt(next, s.generation)
  }

  private async saveAt(next: ProjectsData, generation: number): Promise<SaveResult> {
    const r = await this.store.save(next, generation)
    if (!r.ok) return this.fail(r)
    this.lastError = undefined
    const s = this.state as Extract<SessionState, { status: 'listo' }>
    this.state = { ...s, data: next, generation: r.generation }
    return r
  }

  private fail(r: Extract<SaveResult, { ok: false }>): SaveResult {
    this.lastError = r
    return r
  }

  /** Read the file and plan the import. Writes nothing. */
  async previewImport(file: DossierFile, decisions: ImportDecisions): Promise<{ ok: true; preview: PreviewedImport } | { ok: false; error: string }> {
    const s = this.state
    if (!s || s.status !== 'listo') return { ok: false, error: 'PROYECTOS no está abierto con datos legibles.' }
    const read = await readDossierFile(file)
    if (!read.ok) return read
    const plan = planImport(s.data, read.bundle, decisions, { now: this.now(), ...(this.random ? { random: this.random } : {}) })
    return { ok: true, preview: { plan, decisions, baseGeneration: s.generation } }
  }

  /** Confirm a previewed import. Refused if the store changed after the preview. */
  async confirmImport(p: PreviewedImport, resolutions: Resolutions = {}): Promise<SaveResult> {
    const s = this.state
    if (!s || s.status !== 'listo') return this.fail({ ok: false, reason: 'almacen-ilegible', message: 'PROYECTOS no está abierto con datos legibles.' })
    if (!s.writable) return this.fail({ ok: false, reason: 'solo-lectura', message: s.readOnlyReason ?? 'Solo lectura.' })
    if (s.generation !== p.baseGeneration)
      return this.fail({ ok: false, reason: 'conflicto', message: 'Los datos cambiaron después de la vista previa. Vuelve a generarla.', storedGeneration: s.generation })
    let next: ProjectsData
    try {
      next = applyImport(s.data, p.plan, p.decisions, { now: this.now(), ...(this.random ? { random: this.random } : {}) }, resolutions)
    } catch (e) {
      return this.fail({ ok: false, reason: 'datos-no-validos', message: e instanceof Error ? e.message : String(e) })
    }
    return this.saveAt(next, p.baseGeneration)
  }
}
