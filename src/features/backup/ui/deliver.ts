import { isStandalone } from '../../../pwa/standalone'

export type Delivery = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hand a file to the person, out of the app. On a phone (and in the installed
 * app, where downloads are unreliable on iOS) the share sheet: «Guardar en
 * Archivos», iCloud Drive, AirDrop… Elsewhere, an ordinary download.
 */
export async function deliverFile(name: string, text: string): Promise<Delivery> {
  const file = new File([text], name, { type: 'application/json' })
  const touch = window.matchMedia?.('(pointer: coarse)').matches || isStandalone(window)
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}

/** "iPhone · app instalada", "Mac · navegador"… to tell copies apart. Never sent anywhere. */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo'
  return `${kind} · ${isStandalone(window) ? 'app instalada' : 'navegador'}`
}

/** Read a chosen file as text. */
export function readFileText(file: File): Promise<string> {
  return file.text()
}
