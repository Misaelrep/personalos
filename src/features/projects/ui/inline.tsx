import type { ReactNode } from 'react'

/**
 * P4a · How a literal from a dossier is SHOWN. The literal itself stays as
 * stored (and as it is in «Procedencia · Fila original»); only its inline
 * Markdown is presented: `\|` → |, `*x*` → x in italics, `**x**` → bold,
 * `` `x` `` → code. No HTML is ever interpreted.
 */

export type Segment = { text: string; em?: true; strong?: true; code?: true }

const ESCAPABLE = new Set(['\\', '`', '*', '_', '|', '[', ']', '(', ')', '#', '+', '-', '.', '!', '{', '}', '<', '>'])

export function inlineSegments(literal: string): Segment[] {
  const out: Segment[] = []
  const push = (s: Segment) => {
    const last = out[out.length - 1]
    if (last && !!last.em === !!s.em && !!last.strong === !!s.strong && !!last.code === !!s.code) last.text += s.text
    else out.push(s)
  }
  let em = false
  let strong = false
  let i = 0
  // A delimiter only opens before a non-space and closes after one, and only if it closes later.
  const closes = (from: number, d: string) => {
    for (let j = from; j < literal.length; j++) {
      if (literal[j] === '\\') {
        j++
        continue
      }
      if (literal.startsWith(d, j) && literal[j - 1] !== ' ' && j > from) return true
    }
    return false
  }
  while (i < literal.length) {
    const c = literal[i]
    if (c === '\\' && i + 1 < literal.length && ESCAPABLE.has(literal[i + 1])) {
      push({ text: literal[i + 1], ...(em ? { em: true } : {}), ...(strong ? { strong: true } : {}) })
      i += 2
      continue
    }
    if (c === '`') {
      const end = literal.indexOf('`', i + 1)
      if (end > i + 1) {
        push({ text: literal.slice(i + 1, end), code: true })
        i = end + 1
        continue
      }
    }
    if (literal.startsWith('**', i) || literal.startsWith('__', i)) {
      const d = literal.slice(i, i + 2)
      if (strong || (literal[i + 2] && literal[i + 2] !== ' ' && closes(i + 2, d))) {
        strong = !strong
        i += 2
        continue
      }
    }
    if (c === '*' || c === '_') {
      const word = c === '_' && /\w/.test(literal[i - 1] ?? '') && /\w/.test(literal[i + 1] ?? '') // snake_case stays
      if (!word && (em || (literal[i + 1] && literal[i + 1] !== ' ' && closes(i + 1, c)))) {
        em = !em
        i += 1
        continue
      }
    }
    push({ text: c, ...(em ? { em: true } : {}), ...(strong ? { strong: true } : {}) })
    i += 1
  }
  return out
}

/** The literal as read: no Markdown marks. */
export const plainText = (literal: string) =>
  inlineSegments(literal)
    .map((s) => s.text)
    .join('')

export function Inline({ text }: { text: string | undefined }) {
  if (text === undefined) return null
  return (
    <>
      {inlineSegments(text).map((s, i) => {
        if (s.code)
          return (
            <code key={i} className="rounded-[6px] bg-[var(--line)] px-1 font-mono text-[0.9em]">
              {s.text}
            </code>
          )
        let node: ReactNode = s.text
        if (s.em) node = <em>{node}</em>
        if (s.strong) node = <strong className="font-semibold">{node}</strong>
        return <span key={i}>{node}</span>
      })}
    </>
  )
}

/** For a `Field`: the literal shown, or nothing (so the field says «Sin dato»). */
export const lit = (s: string | undefined) => (s === undefined || s === '' ? undefined : <Inline text={s} />)
