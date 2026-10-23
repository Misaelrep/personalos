/** How SISTEMA names a stored key and summarizes its value, for the preview. Display only. */

const DAY = /^personal-os:day:(\d{4})-(\d{2})-(\d{2})$/

export function keyLabel(key: string): string {
  if (key === 'personal-os:entry') return 'Entrada diaria'
  const day = DAY.exec(key)
  if (day) return `Día ${day[3]}/${day[2]}/${day[1]}`
  if (key.startsWith('elyum:learn:')) {
    const slot = key.split(':').pop()
    return slot === 'state' ? 'Aprender · intención y borrador' : slot === 'entry' ? 'Aprender · ritual de entrada' : `Aprender · ${slot}`
  }
  if (key.startsWith('elyum:projects:')) return `Proyectos · ${key.split(':').slice(3).join(':') || key}`
  return key
}

export function sizeLabel(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
}

/** "3 bloques registrados · 412 B" for a day; the size for anything else. */
export function valueSummary(key: string, value: string): string {
  if (DAY.test(key)) {
    try {
      const parsed = JSON.parse(value) as { records?: Record<string, unknown> }
      const n = parsed.records && typeof parsed.records === 'object' ? Object.keys(parsed.records).length : 0
      return `${n} ${n === 1 ? 'bloque registrado' : 'bloques registrados'} · ${sizeLabel(value)}`
    } catch {
      return `ilegible · ${sizeLabel(value)}`
    }
  }
  return sizeLabel(value)
}
