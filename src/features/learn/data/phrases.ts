import type { Phrase } from '../domain/phrase'

/**
 * PHRASE LIBRARY — DEVELOPMENT SEED.
 *
 * These three lines exist only to exercise the mechanism (one phrase per local
 * date, stable all day, short and long wrapping). They are NOT the editorial
 * library: none is a quotation, none carries an author, every one is flagged
 * `seed`. The curated, verified library replaces this file's contents later;
 * selection (domain/phrase.ts) does not change.
 */
export const PHRASES: Phrase[] = [
  { id: 'seed-01', quote: 'Una idea aparece. Se disuelve. Deja espacio para la tuya.', author: null, seed: true },
  { id: 'seed-02', quote: 'Lo que todavía no entiendes también es una forma de empezar.', author: null, seed: true },
  {
    id: 'seed-03',
    quote: 'Aprender no es acumular respuestas: es afinar, poco a poco, las preguntas que merecen quedarse.',
    author: null,
    seed: true,
  },
]
