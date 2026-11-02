/**
 * P3 · Pipe tables of a Markdown text, with the heading path above each and
 * the exact text of every row. Nothing is interpreted here.
 */

export interface MdRow {
  /** 1-based line in the file. */
  line: number
  /** The line exactly as written (without its line break). */
  raw: string
  cells: string[]
}

export interface MdTable {
  section: string
  /** Line of the header row. */
  line: number
  columns: string[]
  rows: MdRow[]
}

export interface MdDocument {
  /** Text of the first level-1 heading. */
  title?: string
  lines: string[]
  tables: MdTable[]
}

/** Cells of a table row: split on unescaped pipes; `\|` stays inside the cell as written. */
export function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '\\|'
      i++
    } else if (s[i] === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += s[i]
  }
  cells.push(cur.trim())
  return cells
}

const DELIMITER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/

export function readMarkdown(text: string): MdDocument {
  const lines = text.split(/\r?\n/)
  const tables: MdTable[] = []
  const path: string[] = []
  let title: string | undefined
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      const level = h[1].length
      path.length = level - 1
      path[level - 1] = h[2]
      if (level === 1 && title === undefined) title = h[2]
      continue
    }
    if (line.trim().startsWith('|') && DELIMITER.test(lines[i + 1] ?? '')) {
      const table: MdTable = { section: path.filter(Boolean).join(' > '), line: i + 1, columns: splitRow(line), rows: [] }
      let j = i + 2
      for (; j < lines.length && lines[j].trim().startsWith('|'); j++) table.rows.push({ line: j + 1, raw: lines[j], cells: splitRow(lines[j]) })
      tables.push(table)
      i = j - 1
    }
  }
  return { title, lines, tables }
}

/** Header names compared loosely (case, spaces, «…» vs «...»); the literal header is what is kept. */
export const sameHeader = (a: string, b: string) => norm(a) === norm(b)
const norm = (s: string) => s.replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase()
