/**
 * P2-R1.3 · F04 · What happened when a file was handed over. The app can only
 * know that it ASKED for the file to be delivered (share sheet completed, or
 * download started); it cannot see whether the file is in Files. Cancelling
 * the share sheet is not saving. Callers that need the person to have kept the
 * file must ask them explicitly.
 */
export type SaveOutcome = { status: 'entregado'; via: 'compartir' | 'descarga' } | { status: 'cancelado' } | { status: 'error'; message: string }

/** Save a JSON text as a file: on iPhone through the share sheet (Files / iCloud), elsewhere as a download. */
export async function saveJsonFile(name: string, text: string): Promise<SaveOutcome> {
  try {
    const blob = new Blob([text], { type: 'application/json' })
    const file = new File([blob], name, { type: 'application/json' })
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name })
        return { status: 'entregado', via: 'compartir' }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return { status: 'cancelado' }
        // Any other refusal: fall back to a download.
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { status: 'entregado', via: 'descarga' }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

export const stampedName = (base: string, at: string) => `${base}-${at.slice(0, 19).replace(/[:T]/g, '-')}.json`
