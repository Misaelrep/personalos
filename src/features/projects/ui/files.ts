/** Save a JSON text as a file: on iPhone through the share sheet (Files / iCloud), elsewhere as a download. */
export async function saveJsonFile(name: string, text: string): Promise<void> {
  const blob = new Blob([text], { type: 'application/json' })
  const file = new File([blob], name, { type: 'application/json' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const stampedName = (base: string, at: string) => `${base}-${at.slice(0, 19).replace(/[:T]/g, '-')}.json`
