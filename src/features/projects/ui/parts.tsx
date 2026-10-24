import type { ReactNode } from 'react'
import { Label } from '../../../components/ui/Label'
import { STAGE_LABEL } from './labels'
import type { Stage } from './view'

/** P4a · Small pieces shared by the PROYECTOS screens. ELYUM tokens only. */

export const go = (hash: string) => {
  window.location.hash = hash
}

export function TopBar({ back, backLabel = 'Volver', right }: { back?: string; backLabel?: string; right?: ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between">
      {back !== undefined ? (
        <a href={back} className="hit -ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] text-ink-3 hover:text-ink">
          <svg aria-hidden viewBox="0 0 16 16" className="size-4">
            <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </a>
      ) : (
        <span />
      )}
      {right}
    </div>
  )
}

export function Title({ kicker, children, sub }: { kicker?: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="pb-6 pt-2">
      {kicker && <div className="mb-3">{kicker}</div>}
      <h1 className="font-display text-[30px] leading-[1.08] font-medium tracking-[-0.02em] text-ink display-reflection">{children}</h1>
      {sub && <p className="mt-3 text-[15px] leading-[1.5] text-ink-2">{sub}</p>}
    </header>
  )
}

export function Section({ label, count, children, aside }: { label: string; count?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <Label>
          {label}
          {count !== undefined && <span className="tabular ml-2 tracking-normal text-ink-4">{count}</span>}
        </Label>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface rounded-[22px] ${className}`}>{children}</div>
}

/** One honest line where there is nothing to show. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[18px] border border-dashed border-[var(--line)] px-4 py-3.5 text-[14px] leading-[1.5] text-ink-3">{children}</p>
}

const STAGE_TONE: Record<Stage, string> = {
  lista: 'text-electric bg-[color-mix(in_srgb,var(--color-electric)_10%,transparent)]',
  'por-verificar': 'text-[#6d4fd8] bg-[color-mix(in_srgb,var(--color-violet)_14%,transparent)]',
  bloqueada: 'text-[#b5531a] bg-[color-mix(in_srgb,var(--color-aurora)_14%,transparent)]',
  'por-clasificar': 'text-ink-3 border border-dashed border-[color-mix(in_srgb,var(--ink-3)_45%,transparent)]',
  'en-aprobacion': 'text-ink bg-[var(--line)]',
  cerrada: 'text-ink-4 bg-[var(--line)]',
}

export function StageChip({ stage }: { stage: Stage }) {
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-medium tracking-[0.02em] whitespace-nowrap ${STAGE_TONE[stage]}`}>{STAGE_LABEL[stage]}</span>
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'muted' | 'warn' }) {
  const t = tone === 'warn' ? 'text-[#b5531a] bg-[color-mix(in_srgb,var(--color-aurora)_14%,transparent)]' : tone === 'muted' ? 'text-ink-3 bg-[var(--line)]' : 'text-ink-2 border border-[var(--line)]'
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] tracking-[0.02em] whitespace-nowrap ${t}`}>{children}</span>
}

/** A key/value row: the value is the literal, or an explicit «sin asignar». */
export function Field({ label, children, missing }: { label: string; children?: ReactNode; missing?: string }) {
  const has = children !== undefined && children !== null && children !== ''
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--line)] py-3 last:border-b-0">
      <span className="text-[12px] tracking-[0.04em] text-ink-3">{label}</span>
      <span className={`text-[15px] leading-[1.45] ${has ? 'text-ink' : 'text-ink-4 italic'}`}>{has ? children : (missing ?? 'Sin dato')}</span>
    </div>
  )
}

export function Banner({ tone, children }: { tone: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const t =
    tone === 'error'
      ? 'border-[color-mix(in_srgb,#d4421f_40%,transparent)] bg-[color-mix(in_srgb,#d4421f_7%,var(--color-pearl))] text-[#8f2a12]'
      : tone === 'warn'
        ? 'border-[color-mix(in_srgb,var(--color-aurora)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-aurora)_9%,var(--color-pearl))] text-[#87400f]'
        : tone === 'ok'
          ? 'border-[color-mix(in_srgb,#1f9d6a_40%,transparent)] bg-[color-mix(in_srgb,#1f9d6a_7%,var(--color-pearl))] text-[#145f41]'
          : 'border-[var(--line)] bg-[var(--surface-quiet)] text-ink-2'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[16px] border px-4 py-3 text-[14px] leading-[1.5] ${t}`}>
      {children}
    </div>
  )
}

/** A row that opens something: the whole row is the target. */
export function RowLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <a href={href} data-testid={testId} className="hit flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0 active:bg-[var(--line)]">
      <div className="min-w-0 flex-1">{children}</div>
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-4">
        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

export const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[12.5px] tracking-[0] text-ink-3">{children}</span>
