import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { isStandalone } from '../../../pwa/standalone'
import type { Locks } from '../store/store'
import { clearCheck, reportText, runLocksCheck, type Report, type StepResult } from './locksCheck'
import { Banner, Card, Section, Title, TopBar } from './parts'

/** P4a · The iPhone Web Locks check, on its own synthetic keys. */

const MARK: Record<StepResult, { sign: string; tone: string }> = {
  ok: { sign: '✓', tone: 'text-[#1f9d6a]' },
  falla: { sign: '✗', tone: 'text-[#d4421f]' },
  aviso: { sign: '·', tone: 'text-ink-3' },
}

export function LocksCheckView() {
  const [report, setReport] = useState<Report>()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cleared, setCleared] = useState<number>()

  async function run() {
    setBusy(true)
    setCopied(false)
    setCleared(undefined)
    const nav = navigator as Navigator & { locks?: Locks }
    setReport(
      await runLocksCheck({
        storage: window.localStorage,
        locks: nav.locks,
        now: () => new Date().toISOString(),
        where: isStandalone(window) ? 'app' : 'navegador',
        userAgent: navigator.userAgent,
        secure: window.isSecureContext,
        ...(navigator.storage?.persisted ? { persisted: () => navigator.storage.persisted() } : {}),
      }),
    )
    setBusy(false)
  }

  async function copy() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(reportText(report))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <TopBar back="#/" backLabel="Proyectos" />
      <Title kicker={<Label>Prueba del iPhone</Label>} sub="Comprueba Web Locks, escritura, conflicto, persistencia y solo lectura con datos sintéticos. No toca los datos de PROYECTOS.">
        Web Locks en este navegador
      </Title>

      <Button onClick={run} disabled={busy} className="w-full" data-testid="run-check">
        {busy ? 'Comprobando…' : report ? 'Repetir la prueba' : 'Hacer la prueba'}
      </Button>

      {report && (
        <div data-testid="check-report">
          <div className="mt-5">
            <Banner tone={report.steps.some((s) => s.result === 'falla') ? (report.locks ? 'error' : 'warn') : 'ok'}>{report.verdict}</Banner>
          </div>
          <Section label={report.where === 'app' ? 'App instalada' : 'Navegador'}>
            <Card className="px-4 py-1">
              {report.steps.map((s) => (
                <div key={s.id} className="flex gap-3 border-b border-[var(--line)] py-3 last:border-b-0" data-testid={`step-${s.id}`} data-result={s.result}>
                  <span className={`w-4 shrink-0 text-center text-[16px] leading-[1.35] ${MARK[s.result].tone}`}>{MARK[s.result].sign}</span>
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink">{s.label}</p>
                    <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-3">{s.detail}</p>
                  </div>
                </div>
              ))}
            </Card>
            <p className="mt-3 px-1 text-[12px] leading-[1.5] break-words text-ink-4">{report.userAgent}</p>
          </Section>
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="choice" onClick={copy}>
              {copied ? 'Copiado' : 'Copiar el resultado'}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setCleared(clearCheck(window.localStorage))
                setReport(undefined)
              }}
            >
              Borrar solo los datos de esta prueba
            </Button>
          </div>
        </div>
      )}
      {cleared !== undefined && (
        <div className="mt-4">
          <Banner tone="info">Borradas {cleared} claves de la prueba. Los datos de PROYECTOS no se han tocado.</Banner>
        </div>
      )}
    </>
  )
}
