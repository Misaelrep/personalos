import type { CreatedBackup } from '../domain/create'
import type { Delivery } from './deliver'

/** What the export says after a tap. Plain words; never claims the file is saved. */
export interface ExportNote {
  kind: 'shared' | 'downloaded' | 'cancelled' | 'blocked' | 'failed' | 'not-created'
  text?: string
  hash?: string
  /** Offer a plain download when the share sheet could not be used. */
  offerDownload?: boolean
}

export function deliverFileNote(d: Delivery, backup: CreatedBackup, viaShare: boolean): ExportNote {
  const hash = backup.file.integrity.total
  switch (d.result) {
    case 'shared':
      return { kind: 'shared', hash, text: 'Copia entregada. Comprueba que quedó guardada: ábrela abajo, en «Comprobar una copia guardada».' }
    case 'downloaded':
      return { kind: 'downloaded', hash, text: 'Copia descargada. Comprueba que quedó guardada: ábrela abajo, en «Comprobar una copia guardada».' }
    case 'cancelled':
      return { kind: 'cancelled', text: 'No se guardó ninguna copia: cerraste el menú de compartir.' }
    case 'blocked':
      return { kind: 'blocked', text: 'El sistema no abrió el menú de compartir. Pulsa otra vez «Exportar copia».', offerDownload: viaShare }
    case 'failed':
      return { kind: 'failed', text: `${d.message} No se ha entregado ninguna copia.`, offerDownload: viaShare }
  }
}
