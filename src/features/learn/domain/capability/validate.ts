import { MAX_SKILLS, MIN_SKILLS, type Autonomy, type CapabilityData, type CapabilityObjective, type Skill } from './model'

/**
 * When something can be activated, and why not. Deterministic and explicit: nothing reads meaning into the text, it only
 * checks that each part of the template is there and that the action is something one can be seen doing.
 */

export type Issue =
  | 'MISSING_ACTION'
  | 'NOT_OBSERVABLE'
  | 'MISSING_RESULT'
  | 'RESULT_SAME_AS_ACTION'
  | 'MISSING_CONTEXT'
  | 'MISSING_CRITERION'
  | 'TOO_FEW_SKILLS'
  | 'TOO_MANY_SKILLS'
  | 'DUPLICATE_SKILL'
  | 'INVALID_SKILL'

/** The template's parts: the same for an objective and for a skill. */
export interface TemplateFields {
  action: string
  result: string
  context: string
  criterion: string
  targetAutonomy: Autonomy
}

/** Shorter than this, a part is not there. */
const MIN_PART = 3

/** Text compared as meaning-free tokens: no accents, no case, no punctuation, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Wishes in front of the action are not the action ("quiero poder…", "ser capaz de…"). */
const WISH = /^(?:(?:yo )?quiero |querria |me gustaria |deseo |necesito )?(?:poder |ser capaz de |llegar a |saber como )?/

/**
 * Verbs of consuming or knowing, not of doing: "aprender inglés", "entender estadística". They describe a wish or a state of
 * mind, so they cannot be observed — the question becomes "¿qué harías para demostrarlo?". A short, closed list.
 */
export const NOT_OBSERVABLE_VERBS = ['aprender', 'estudiar', 'saber', 'entender', 'comprender', 'conocer', 'dominar', 'repasar'] as const

export function actionCore(action: string): string {
  return normalize(action).replace(WISH, '').trim()
}

export function isObservableAction(action: string): boolean {
  const first = actionCore(action).split(' ')[0] ?? ''
  return first.length > 0 && !(NOT_OBSERVABLE_VERBS as readonly string[]).includes(first)
}

const present = (s: string) => s.trim().length >= MIN_PART

/** What is missing from the template, in the order it is read. */
export function templateIssues(f: TemplateFields): Issue[] {
  const issues: Issue[] = []
  if (!present(f.action)) issues.push('MISSING_ACTION')
  else if (!isObservableAction(f.action)) issues.push('NOT_OBSERVABLE')
  if (!present(f.result)) issues.push('MISSING_RESULT')
  else if (normalize(f.result) === actionCore(f.action)) issues.push('RESULT_SAME_AS_ACTION')
  if (!present(f.context)) issues.push('MISSING_CONTEXT')
  if (!present(f.criterion)) issues.push('MISSING_CRITERION')
  return issues
}

/** Two skills are the same skill when every part of the template is the same, normalized. */
export const skillKey = (f: TemplateFields) => [f.action, f.result, f.context, f.criterion].map(normalize).join('|') + `|${f.targetAutonomy}`

/** Revisions another record replaces: history, not part of the current decomposition. */
export const supersededSkillIds = (data: CapabilityData) => new Set(data.skills.map((s) => s.supersedesSkillId).filter((x): x is string => !!x))

/** The current decomposition: the latest revision of each skill, not archived. */
export function activeSkillsOf(data: CapabilityData, objectiveId: string): Skill[] {
  const superseded = supersededSkillIds(data)
  return data.skills.filter((s) => s.objectiveId === objectiveId && s.archivedAt === undefined && !superseded.has(s.id))
}

/** Everything that stands between this objective and ACTIVE (empty: it can be activated). The limit of active objectives is checked apart. */
export function activationIssues(data: CapabilityData, objective: CapabilityObjective): Issue[] {
  const issues = templateIssues(objective)
  const skills = activeSkillsOf(data, objective.id)
  if (skills.length < MIN_SKILLS) issues.push('TOO_FEW_SKILLS')
  if (skills.length > MAX_SKILLS) issues.push('TOO_MANY_SKILLS')
  if (skills.some((s) => templateIssues(s).length > 0)) issues.push('INVALID_SKILL')
  if (new Set(skills.map(skillKey)).size < skills.length) issues.push('DUPLICATE_SKILL')
  return issues
}
