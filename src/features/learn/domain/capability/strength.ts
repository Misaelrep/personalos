import { INDEPENDENT_PROVENANCES, SEPARATE_OCCASION_MS, type Evidence, type EvidenceStrength } from './model'

/**
 * How strong a piece of evidence is — derived from what the record holds, never chosen by the person ("my evidence is very
 * strong" is not an input). Conservative:
 *
 *   WEAK         it informs, but conditions are missing: recorded afterwards (RETROSPECTIVE), or without the test or the context
 *   MODERATE     a direct attempt with result, verdict, help and context all recorded
 *   STRONG       MODERATE, and either a reference a third party could check (an http(s) link), or corroborated by another
 *                direct attempt with the same verdict on a separate occasion (SEPARATE_OCCASION_MS)
 *   VERY_STRONG  STRONG and independently verified (INDEPENDENT_PROVENANCES). Nothing in B1 can produce it — on purpose.
 */

/** A link someone else could open: the minimum for "verifiable". */
export const isVerifiableReference = (ref: string | undefined) => !!ref && /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(ref.trim())

/** Recorded live, with the test, the context and the observed result. */
export const isDirect = (e: Evidence) =>
  e.capture === 'LIVE' && e.observedResult.trim().length > 0 && e.testStatement.trim().length > 0 && e.contextDescription.trim().length > 0

/** `others`: the rest of the effective evidence of the same skill. */
export function evidenceStrength(e: Evidence, others: readonly Evidence[]): EvidenceStrength {
  if (!isDirect(e)) return 'WEAK'
  const corroborated = others.some(
    (o) => o.id !== e.id && o.attemptId !== e.attemptId && isDirect(o) && o.criterionVerdict === e.criterionVerdict && Math.abs(o.occurredAt - e.occurredAt) >= SEPARATE_OCCASION_MS,
  )
  if (!corroborated && !isVerifiableReference(e.reference)) return 'MODERATE'
  return INDEPENDENT_PROVENANCES.includes(e.provenance) ? 'VERY_STRONG' : 'STRONG'
}
