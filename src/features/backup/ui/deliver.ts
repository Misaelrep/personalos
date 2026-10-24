import { isStandalone } from '../../../pwa/standalone'

/**
 *   shared      the share sheet finished («Guardar en Archivos», AirDrop…)
 *   downloaded  the browser was asked to download it
 *   cancelled   the person closed the share sheet: nothing was saved
 *   blocked     the system refused to open the share sheet (on iOS, usually a lost tap): try again
 *   failed      sharing or downloading failed for another reason
 *
 * None of these proves the file exists afterwards: that is what verifying it is for.
 */
export type Delivery = { result: 'shared' | 'downloaded' | 'cancelled' | 'blocked' } | { result: 'failed'; message: string }

/** On a phone, and in the installed app (where iOS downloads are unreliable): the share sheet. */
export function prefersShare(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true || isStandalone(window)
}

export async function shareFile(name: string, text: string): Promise<Delivery> {
  const file = new File([text], name, { type: 'application/json' })
  if (!navigator.canShare?.({ files: [file] })) return { result: 'failed', message: 'Este navegador no puede compartir archivos.' }
  try {
    await navigator.share({ files: [file], title: name })
    return { result: 'shared' }
  } catch (error) {
    const kind = (error as { name?: string }).name
    if (kind === 'AbortError') return { result: 'cancelled' }
    if (kind === 'NotAllowedError') return { result: 'blocked' }
    return { result: 'failed', message: 'No se pudo compartir el archivo.' }
  }
}

export function downloadFile(name: string, text: string): Delivery {
  try {
    const url = URL.createObjectURL(new File([text], name, { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { result: 'downloaded' }
  } catch {
    return { result: 'failed', message: 'No se pudo descargar el archivo.' }
  }
}

/** "iPhone · app instalada", "Mac · navegador"… to tell copies apart. Never sent anywhere. */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo'
  return `${kind} · ${isStandalone(window) ? 'app instalada' : 'navegador'}`
}
