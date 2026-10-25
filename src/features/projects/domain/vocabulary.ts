import { APPROVAL_STATES, WORK_CLASSES, type ApprovalState, type ProjectsData, type Task, type Vocabulary, type WorkClass } from './types'

/**
 * The normalization layer: what the app understands by a dossier's words.
 * The words themselves stay on the records; these functions only read them.
 * An unknown word is `undefined` here and an error in validation — never a guess.
 */

export function vocabularyOf(data: ProjectsData, projectId: string): Vocabulary | undefined {
  const project = data.projects.find((p) => p.id === projectId)
  return project ? data.vocabularies[project.dossier] : undefined
}

export function workClassOf(data: ProjectsData, task: Pick<Task, 'projectId' | 'status'>): WorkClass | undefined {
  return vocabularyOf(data, task.projectId)?.status.find((s) => s.literal === task.status)?.workClass
}

/** 1 is the most urgent; a task without priority ranks last. */
export function priorityRank(data: ProjectsData, task: Pick<Task, 'projectId' | 'priority'>): number {
  if (task.priority === undefined) return Number.POSITIVE_INFINITY
  return vocabularyOf(data, task.projectId)?.priority.find((p) => p.literal === task.priority)?.rank ?? Number.POSITIVE_INFINITY
}

/** The normalized approval a dossier literal means in this vocabulary. */
export function approvalStateOf(vocabulary: Vocabulary, literal: string): ApprovalState | undefined {
  return vocabulary.approval.find((a) => a.literal === literal)?.state
}

/** Problems inside one vocabulary: repeated literals, unknown classes or states, invalid ranks. */
export function vocabularyIssues(name: string, v: Vocabulary): string[] {
  const issues: string[] = []
  const dup = (kind: string, literals: string[]) => {
    const seen = new Set<string>()
    for (const l of literals) {
      if (seen.has(l)) issues.push(`${name}: el ${kind} «${l}» está repetido`)
      seen.add(l)
    }
  }
  dup('estado', v.status.map((s) => s.literal))
  dup('valor de prioridad', v.priority.map((p) => p.literal))
  dup('valor de aprobación', v.approval.map((a) => a.literal))
  for (const s of v.status) if (!(WORK_CLASSES as readonly string[]).includes(s.workClass)) issues.push(`${name}: el estado «${s.literal}» no tiene una clase válida`)
  for (const p of v.priority) if (!Number.isInteger(p.rank) || p.rank < 1) issues.push(`${name}: la prioridad «${p.literal}» no tiene un rango válido`)
  for (const a of v.approval) if (!(APPROVAL_STATES as readonly string[]).includes(a.state)) issues.push(`${name}: la aprobación «${a.literal}» no tiene un estado válido`)
  return issues
}
