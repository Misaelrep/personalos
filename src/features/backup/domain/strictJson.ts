/**
 * JSON that means one thing only. `JSON.parse` keeps the last of two equal
 * keys, so `{"a":1,"a":2}` would show one value and hash another reading.
 * This scanner walks the text once (RFC 8259 grammar), rejects a repeated key
 * in any object, and only then hands the text to `JSON.parse`.
 */
export type StrictJsonResult = { ok: true; value: unknown } | { ok: false; reason: 'syntax' | 'duplicate-key' | 'too-deep'; message: string }

const MAX_DEPTH = 64

export function parseStrictJson(text: string): StrictJsonResult {
  let i = 0
  const fail = (reason: 'syntax' | 'duplicate-key' | 'too-deep', message: string): StrictJsonResult => ({ ok: false, reason, message })
  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++
      else break
    }
  }

  // Returns the decoded string, or null on a syntax error.
  const string = (): string | null => {
    if (text[i] !== '"') return null
    const start = i
    i++
    while (i < text.length) {
      const c = text.charCodeAt(i)
      if (c === 0x22) {
        i++
        return JSON.parse(text.slice(start, i)) as string
      }
      if (c < 0x20) return null
      if (c === 0x5c) {
        const e = text[i + 1]
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) return null
          i += 6
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) i += 2
        else return null
      } else i++
    }
    return null
  }

  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

  let error: StrictJsonResult | null = null
  const value = (depth: number): boolean => {
    if (depth > MAX_DEPTH) {
      error = fail('too-deep', 'El archivo anida demasiados niveles.')
      return false
    }
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      const seen = new Set<string>()
      ws()
      if (text[i] === '}') {
        i++
        return true
      }
      for (;;) {
        ws()
        const key = string()
        if (key === null) return false
        if (seen.has(key)) {
          error = fail('duplicate-key', `La clave «${key.slice(0, 80)}» aparece dos veces en el mismo objeto.`)
          return false
        }
        seen.add(key)
        ws()
        if (text[i] !== ':') return false
        i++
        if (!value(depth + 1)) return false
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === '}') {
          i++
          return true
        }
        return false
      }
    }
    if (c === '[') {
      i++
      ws()
      if (text[i] === ']') {
        i++
        return true
      }
      for (;;) {
        if (!value(depth + 1)) return false
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === ']') {
          i++
          return true
        }
        return false
      }
    }
    if (c === '"') return string() !== null
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        i += word.length
        return true
      }
    }
    NUMBER.lastIndex = i
    const m = NUMBER.exec(text)
    if (m && m[0].length > 0) {
      i += m[0].length
      return true
    }
    return false
  }

  // A byte-order mark is not JSON; a file saved by another editor may carry one.
  if (text.charCodeAt(0) === 0xfeff) i = 1
  const ok = value(0)
  if (!ok) return error ?? fail('syntax', 'El archivo no es JSON válido (¿está incompleto o editado?).')
  ws()
  if (i !== text.length) return fail('syntax', 'Hay contenido después del final del JSON.')
  return { ok: true, value: JSON.parse(text.slice(text.charCodeAt(0) === 0xfeff ? 1 : 0)) }
}
