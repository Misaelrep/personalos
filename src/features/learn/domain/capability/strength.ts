import { INDEPENDENT_PROVENANCES, type Evidence, type EvidenceStrength } from './model'

/**
 * How strong ONE piece of evidence is — derived from that record alone, never chosen by the person and never changed by
 * other records (an attempt is one attempt; what many attempts add up to is the dimensions' business, dimensions.ts).
 *
 *   WEAK         recorded afterwards (RETROSPECTIVE), or without the test, the context or the observed result
 *   MODERATE     a direct (LIVE) attempt with result, verdict, help and context all recorded — the most a self-report can be
 *   STRONG       reserved for a provenance that is really verifiable / independent (INDEPENDENT_PROVENANCES)
 *   VERY_STRONG  reserved for a higher standard still
 *
 * B1 only has SELF_REPORTED evidence, so it can only produce WEAK and MODERATE — on purpose. A link attached to the record
 * changes nothing: it may be irrelevant, unreachable, not show the criterion, and it was added by the same person.
 */

/** Recorded live, with the test, the context and the observed result. */
export const isDirect = (e: Evidence) =>
  e.capture === 'LIVE' && e.observedResult.trim().length > 0 && e.testStatement.trim().length > 0 && e.contextDescription.trim().length > 0

export function evidenceStrength(e: Evidence): EvidenceStrength {
  if (!isDirect(e)) return 'WEAK'
  // No independent provenance exists in B1 (the list is empty): a self-report stops at MODERATE.
  return INDEPENDENT_PROVENANCES.includes(e.provenance) ? 'STRONG' : 'MODERATE'
}
