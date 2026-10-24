/** How SISTEMA names a stored key, for people. Display only. */

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

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "25/10/2026, 21:04" from the copy's local ISO time, as written (no time-zone conversion). */
export function createdLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}, ${m[4]}:${m[5]}` : iso
}
