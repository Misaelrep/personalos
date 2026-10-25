import { describe, expect, it } from 'vitest'
import { EMPTY_STATE, MAX_INTENTION_LENGTH, commitIntention, restartIntention, setDraft } from './state'
import { KNOWLEDGE_KINDS, LEARN_ROUTES, type KnowledgeKind, type MentalModel } from './types'

describe('APRENDER state: the intention', () => {
  it('starts empty: no draft, no intention', () => {
    expect(EMPTY_STATE).toEqual({ draft: '' })
  })

  it('the draft follows the composer and is capped', () => {
    expect(setDraft(EMPTY_STATE, 'hola').draft).toBe('hola')
    expect(setDraft(EMPTY_STATE, 'x'.repeat(MAX_INTENTION_LENGTH + 50)).draft).toHaveLength(MAX_INTENTION_LENGTH)
  })

  it('committing saves the trimmed words and the route, and empties the draft', () => {
    const next = commitIntention(setDraft(EMPTY_STATE, '  entender pesos  '), 'develop', '  entender pesos  ', 1234)
    expect(next).toEqual({ draft: '', intention: { text: 'entender pesos', route: 'develop', savedAt: 1234 } })
  })

  it('a route can be chosen without words', () => {
    expect(commitIntention(EMPTY_STATE, 'orient', '', 1).intention).toEqual({ text: '', route: 'orient', savedAt: 1 })
  })

  it('the route is always the one given — never inferred from what was written', () => {
    for (const route of LEARN_ROUTES) {
      expect(commitIntention(EMPTY_STATE, route, 'quiero orientarme, desarrollar y explorar', 1).intention?.route).toBe(route)
    }
  })

  it('starting over returns the previous words to the composer and clears the intention', () => {
    const saved = commitIntention(EMPTY_STATE, 'explore', 'algo sobre el sueño', 1)
    expect(restartIntention(saved)).toEqual({ draft: 'algo sobre el sueño' })
  })

  it('starting over with nothing saved keeps the draft', () => {
    expect(restartIntention({ draft: 'a medias' })).toEqual({ draft: 'a medias' })
  })
})

describe('APRENDER domain types', () => {
  it('KnowledgeKind is exactly principle · procedure · heuristic · observation', () => {
    expect([...KNOWLEDGE_KINDS]).toEqual(['principle', 'procedure', 'heuristic', 'observation'])
  })

  it('a MentalModel is not a kind of knowledge', () => {
    expect(KNOWLEDGE_KINDS as readonly string[]).not.toContain('model')
    expect(KNOWLEDGE_KINDS as readonly string[]).not.toContain('mental-model')
    // Type-level: neither of these may compile (tsc fails if the expectation stops holding).
    // @ts-expect-error 'model' is not a KnowledgeKind
    const notAKind: KnowledgeKind = 'model'
    // @ts-expect-error a MentalModel carries no `kind`: it is a separate, composed object
    const notKnowledge: MentalModel = { id: 'm', kind: 'principle' }
    expect([notAKind, notKnowledge]).toHaveLength(2)
  })

  it('there are three routes of one flow', () => {
    expect([...LEARN_ROUTES]).toEqual(['orient', 'develop', 'explore'])
  })
})
