import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { readSnapshot, type Snapshot } from '../domain/collect'
import { backupFileName, createBackup, type CreatedBackup } from '../domain/create'
import { createdLabel, keyLabel, plural, sizeLabel } from '../domain/describe'
import { KEY_STATUS_LABEL, KEY_STATUSES, MAX_BACKUP_BYTES, MODULE_IDS, MODULE_LABEL, type BackupFile, type ModuleId } from '../domain/format'
import { shortHash } from '../domain/integrity'
import { compareWithDevice, verifyBackupText, type Comparison, type VerifyResult } from '../domain/verify'
import { browserStorage } from '../storage/storage'
import { deliverFileNote, type ExportNote } from './notes'
import { deviceLabel, downloadFile, prefersShare, shareFile } from './deliver'

type Device = { status: 'reading' } | { status: 'ok'; snapshot: Snapshot } | { status: 'unreadable' }

type Verification =
  | { status: 'idle' }
  | { status: 'reading'; name: string }
  | { status: 'done'; name: string; result: VerifyResult; comparison: Comparison | null }
  | { status: 'unread'; name: string; message: string }

const READ_ERROR = 'No se puede leer el almacenamiento de este navegador (¿modo privado o bloqueado?). No se puede generar una copia.'

function snapshotNow(): { ok: true; snapshot: Snapshot } | { ok: false } {
  try {
    return { ok: true, snapshot: readSnapshot(browserStorage()) }
  } catch {
    return { ok: false }
  }
}

const countsLine = (counts: [ModuleId, number][]) => counts.map(([id, n]) => `${MODULE_LABEL[id]}: ${n}`).join(' · ')
const countsOf = (file: Pick<BackupFile, 'counts'>) => MODULE_IDS.map((id) => [id, file.counts[id]] as [ModuleId, number])
const snapshotCounts = (s: Snapshot) => MODULE_IDS.map((id) => [id, Object.keys(s.modules[id].keys).length] as [ModuleId, number])

/**
 * COPIAS DE SEGURIDAD (P2-E): exporting and verifying only. Everything ELYUM
 * keeps on this device goes to a file outside it, checked before it is handed
 * over; a saved file can be opened again and checked. Nothing here writes to
 * the storage: there is no import and no restore in this version.
 */
export function Copias() {
  const [device, setDevice] = useState<Device>({ status: 'reading' })
  const [note, setNote] = useState<ExportNote | null>(null)
  const [last, setLast] = useState<CreatedBackup | null>(null)
  const [verification, setVerification] = useState<Verification>({ status: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  // What this device holds, for the counts on screen. The copy itself is read again at the tap.
  const refresh = useCallback(() => {
    const read = snapshotNow()
    setDevice(read.ok ? { status: 'ok', snapshot: read.snapshot } : { status: 'unreadable' })
  }, [])

  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  // One synchronous pass inside the tap: read, sign, check, hand over. Nothing
  // can be saved in between, and iOS opens the share sheet because no wait
  // separates it from the gesture.
  const onExport = async () => {
    const read = snapshotNow()
    if (!read.ok) {
      setDevice({ status: 'unreadable' })
      return setNote({ kind: 'not-created', text: READ_ERROR })
    }
    setDevice({ status: 'ok', snapshot: read.snapshot })
    const now = new Date()
    const made = createBackup(read.snapshot, now, deviceLabel())
    if (!made.ok) return setNote({ kind: 'not-created', text: `${made.error.message} No se ha entregado ninguna copia.` })
    setLast(made.backup)
    const name = backupFileName(now)
    const share = prefersShare()
    const delivery = share ? await shareFile(name, made.backup.text) : downloadFile(name, made.backup.text)
    setNote(deliverFileNote(delivery, made.backup, share))
  }

  // The same copy the share sheet could not take, as a plain download.
  const onDownloadInstead = () => {
    if (!last) return
    setNote(deliverFileNote(downloadFile(backupFileName(new Date()), last.text), last, false))
  }

  const onChoose = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES)
      return setVerification({ status: 'unread', name: file.name, message: `El archivo ocupa ${sizeLabel(file.size)}; una copia de ELYUM no pasa de ${sizeLabel(MAX_BACKUP_BYTES)}. No se ha leído.` })
    setVerification({ status: 'reading', name: file.name })
    let text: string
    try {
      text = await file.text()
    } catch {
      return setVerification({ status: 'unread', name: file.name, message: 'No se pudo leer el archivo. Si está en iCloud, espera a que se descargue y vuelve a elegirlo.' })
    }
    let result: VerifyResult
    try {
      result = verifyBackupText(text)
    } catch {
      result = { ok: false, kind: 'json', message: 'No se pudo verificar el archivo.' }
    }
    const here = snapshotNow()
    setVerification({ status: 'done', name: file.name, result, comparison: result.ok && here.ok ? compareWithDevice(result.file, here.snapshot) : null })
  }

  const snapshot = device.status === 'ok' ? device.snapshot : null

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section aria-labelledby="export-title" className="surface rounded-[28px] px-6 pt-6 pb-6 sm:px-9 sm:pt-8 sm:pb-8">
        <Label className="text-ink-2">Exportar</Label>
        <h2 id="export-title" className="mt-4 text-[22px] leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">
          Una copia de todo lo que ELYUM guarda aquí
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Días (HOY, FOCUS y entrada), Aprender y Proyectos, en un archivo que se comprueba antes de entregártelo.</p>

        <Limits />

        {snapshot && (
          <p data-testid="device-counts" className="mt-5 text-[13px] text-ink-3">
            En este dispositivo: {countsLine(snapshotCounts(snapshot))}
            {snapshot.excluded.unknownElyum.length > 0 && (
              <> · {plural(snapshot.excluded.unknownElyum.length, 'clave desconocida no copiada', 'claves desconocidas no copiadas')}: {snapshot.excluded.unknownElyum.join(', ')}</>
            )}
          </p>
        )}
        {device.status === 'unreadable' && (
          <p role="alert" className="mt-5 text-[14px] text-ink">
            {READ_ERROR}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button onClick={() => void onExport()} disabled={device.status !== 'ok'}>
            Exportar copia
          </Button>
          {note?.offerDownload && (
            <Button variant="secondary" onClick={onDownloadInstead}>
              Descargar en su lugar
            </Button>
          )}
        </div>
        {note && (
          <p role="status" data-testid="export-note" className="mt-4 text-[14px] leading-relaxed text-ink-2">
            {note.text}
            {note.hash && (
              <>
                {' '}
                Huella <span className="tabular text-ink">{shortHash(note.hash)}</span>.
              </>
            )}
          </p>
        )}
      </section>

      <section aria-labelledby="verify-title" className="surface-quiet rounded-[28px] px-6 pt-6 pb-6 sm:px-9 sm:pt-8 sm:pb-8">
        <Label className="text-ink-2">Verificar</Label>
        <h2 id="verify-title" className="mt-4 text-[22px] leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">
          Comprobar una copia guardada
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Elige el archivo donde lo guardaste (Archivos, iCloud…). Se comprueba que está completo y sin cambios. No se restaura ni se escribe nada en ELYUM.
        </p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Archivo de copia para verificar"
          data-testid="verify-input"
          onChange={(e) => void onChoose(e.target.files?.[0])}
        />
        <div className="mt-6">
          <Button variant="choice" onClick={() => input.current?.click()} disabled={verification.status === 'reading'}>
            Elegir un archivo
          </Button>
        </div>
        <VerificationView v={verification} />
      </section>
    </div>
  )
}

function Limits() {
  return (
    <div className="mt-5 rounded-2xl border border-line px-4 py-4 sm:px-5" data-testid="limits">
      <p className="text-[14px] text-ink">Lo que la copia es, y lo que no</p>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2">
        <li>Contiene lo que este dispositivo tiene <span className="text-ink">guardado</span> ahora. Un cambio que no llegó a guardarse (almacenamiento lleno o bloqueado) no está en la copia, y ELYUM no puede saberlo.</li>
        <li>Es de este almacenamiento: Safari y la app instalada guardan sus datos por separado.</li>
        <li>Si un día guardado estaba dañado, la app puede haberlo sustituido por uno vacío al abrirse. Exporta con regularidad.</li>
        <li>La huella comprueba que el archivo no ha cambiado; no prueba quién lo hizo.</li>
        <li>
          <span className="text-ink">Restaurar todavía no está disponible.</span> El formato está versionado, pero no se garantiza que una versión futura pueda leer todos los datos.
        </li>
        <li>Compartir o descargar no prueba que el archivo quedó guardado: verifícalo abajo.</li>
      </ul>
    </div>
  )
}

function VerificationView({ v }: { v: Verification }) {
  if (v.status === 'idle') return null
  if (v.status === 'reading')
    return (
      <p role="status" className="mt-5 text-[14px] text-ink-2">
        Leyendo {v.name}…
      </p>
    )
  if (v.status === 'unread')
    return (
      <p role="alert" data-testid="verify-result" data-ok="false" className="mt-5 text-[14px] leading-relaxed text-ink">
        {v.message}
      </p>
    )
  const { result, comparison } = v
  if (!result.ok)
    return (
      <div role="alert" data-testid="verify-result" data-ok="false" data-kind={result.kind} className="mt-5 text-[14px] leading-relaxed">
        <p className="text-ink">No es una copia válida: {v.name}</p>
        <p className="mt-1 text-ink-2">{result.message}</p>
        <p className="mt-1 text-ink-3">No se ha escrito nada.</p>
      </div>
    )
  const { file } = result
  const problems = MODULE_IDS.flatMap((id) => Object.keys(file.modules[id].keys)).filter((k) => file.keyStatus[k] !== 'valido')
  return (
    <div role="status" data-testid="verify-result" data-ok="true" className="mt-5 flex flex-col gap-2 text-[14px] leading-relaxed text-ink-2">
      <p className="text-ink">
        Copia íntegra · huella <span className="tabular">{shortHash(file.integrity.total)}</span>
      </p>
      <p>
        Del {createdLabel(file.meta.createdAt)}
        {file.meta.device ? ` · ${file.meta.device}` : ''} · {sizeLabel(result.bytes)}
      </p>
      <p>{countsLine(countsOf(file))}</p>
      <p data-testid="verify-statuses">
        Claves:{' '}
        {KEY_STATUSES.filter((s) => result.statusCounts[s] > 0)
          .map((s) => plural(result.statusCounts[s], ...KEY_STATUS_LABEL[s]))
          .join(' · ') || 'ninguna'}
      </p>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-4 text-[13px] text-ink-3">
          {problems.map((k) => (
            <li key={k}>
              {keyLabel(k)}: {KEY_STATUS_LABEL[file.keyStatus[k]][0]}
            </li>
          ))}
        </ul>
      )}
      {comparison ? (
        <div data-testid="verify-comparison" className="text-[13px] text-ink-3">
          <p>
            Frente a este dispositivo: {comparison.same} iguales · {comparison.different.length} distintas · {comparison.onlyInFile.length} solo en el archivo · {comparison.onlyOnDevice.length} solo aquí
          </p>
          {comparison.different.length + comparison.onlyInFile.length + comparison.onlyOnDevice.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 pl-4">
              {comparison.different.map((k) => (
                <li key={k}>{keyLabel(k)}: distinta</li>
              ))}
              {comparison.onlyInFile.map((k) => (
                <li key={k}>{keyLabel(k)}: solo en el archivo</li>
              ))}
              {comparison.onlyOnDevice.map((k) => (
                <li key={k}>{keyLabel(k)}: solo aquí</li>
              ))}
            </ul>
          )}
          {comparison.different.includes('personal-os:entry') && (
            <p className="mt-1">La entrada diaria anota la hora de actividad cada 30 segundos: es normal que difiera.</p>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">No se pudo comparar con este dispositivo.</p>
      )}
      <p className="text-[13px] text-ink-3">Solo se ha verificado: no se ha restaurado ni escrito nada.</p>
    </div>
  )
}
