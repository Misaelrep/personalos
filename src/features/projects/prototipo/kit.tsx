import type { ReactNode } from 'react'
import { Inline } from '../ui/inline'

/** PROTOTYPE · Compact pieces: ELYUM's tokens, less height, one primary action per screen. */

export const go = (hash: string) => {
  window.location.hash = hash
}

export function Back({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="hit -ml-2 inline-flex h-10 items-center gap-1 rounded-full px-2 text-[14px] text-ink-3">
      <svg aria-hidden viewBox="0 0 16 16" className="size-4">
        <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Inline text={label} />
    </a>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-[11px] tracking-[0.12em] text-ink-3 uppercase">{children}</p>
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-[26px] leading-[1.12] font-medium tracking-[-0.02em] text-ink">{children}</h1>
}

export function Box({ children, className = '', tone = 'surface', testId }: { children: ReactNode; className?: string; tone?: 'surface' | 'quiet' | 'focus'; testId?: string }) {
  const t =
    tone === 'focus'
      ? 'surface border border-[color-mix(in_srgb,var(--color-electric)_30%,transparent)]'
      : tone === 'quiet'
        ? 'surface-quiet'
        : 'surface'
  return (
    <div className={`${t} rounded-[18px] px-4 py-3 ${className}`} data-testid={testId}>
      {children}
    </div>
  )
}

export function Primary({ children, onClick, disabled, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="hit inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--control)] px-5 text-[14px] font-medium text-[var(--control-ink)] shadow-[0_10px_30px_-12px_rgba(8,26,50,0.45)] active:scale-[0.985] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function Secondary({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="hit inline-flex h-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-quiet)] px-4 text-[13.5px] text-ink active:scale-[0.985]">
      {children}
    </button>
  )
}

export function TextLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <a href={href} data-testid={testId} className="text-[14px] text-electric">
      {children}
    </a>
  )
}

/** A row that opens something. */
export function Row({ href, title, sub, right, testId, done }: { href: string; title: string; sub?: ReactNode; right?: ReactNode; testId?: string; done?: boolean }) {
  return (
    <a href={href} data-testid={testId} className="hit flex items-center gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0 active:opacity-70">
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] leading-[1.35] ${done ? 'text-ink-4 line-through' : 'text-ink'}`}>
          <Inline text={title} />
        </p>
        {sub && <p className="mt-0.5 text-[12.5px] leading-[1.4] text-ink-3">{sub}</p>}
      </div>
      {right}
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-4">
        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

/** A secondary section, closed until opened. */
export function More({ title, count, children, testId }: { title: string; count?: number; children: ReactNode; testId?: string }) {
  return (
    <details className="group border-b border-[var(--line)] last:border-b-0" data-testid={testId}>
      <summary className="hit flex cursor-pointer list-none items-center justify-between gap-3 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="text-[14.5px] text-ink-2">
          {title}
          {count !== undefined && <span className="tabular ml-1.5 text-ink-4">{count}</span>}
        </span>
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-90">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  )
}

/** Marks a SIMULATED AI output so it is never read as a decision. */
export function AiTag({ who = 'IA' }: { who?: string }) {
  return <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-[color-mix(in_srgb,var(--color-violet)_16%,transparent)] px-2 align-middle text-[10.5px] font-medium tracking-[0.03em] whitespace-nowrap text-[#6d4fd8]">{who === 'Grok' ? 'Simulación · Grok' : 'Sugerencia simulada · IA'}</span>
}

/** Marks a LOCAL CALCULATION: a fact of the data, computed on the device, not an AI opinion. */
export function LocalTag() {
  return <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-[var(--line)] px-2 align-middle text-[10.5px] font-medium tracking-[0.03em] whitespace-nowrap text-ink-3">Cálculo local</span>
}

/** Marks a HUMAN DECISION: something the person approved or confirmed. */
export function HumanTag() {
  return <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-[color-mix(in_srgb,#1f9d6b_14%,transparent)] px-2 align-middle text-[10.5px] font-medium tracking-[0.03em] whitespace-nowrap text-[#167a53]">Decisión tuya</span>
}

const KIND_STYLE: Record<string, string> = {
  ejecutable: 'bg-[color-mix(in_srgb,var(--color-electric)_14%,transparent)] text-electric',
  decision: 'bg-[color-mix(in_srgb,#d98a00_16%,transparent)] text-[#a86a00]',
  bloqueada: 'bg-[var(--line)] text-ink-3',
  revision: 'bg-[color-mix(in_srgb,#1f9d6b_16%,transparent)] text-[#167a53]',
  terminada: 'bg-transparent text-ink-4',
}

/** What a planned action is right now: can be done, needs a decision, blocked, waiting for review. */
export function KindTag({ kind, label }: { kind: string; label: string }) {
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-medium whitespace-nowrap ${KIND_STYLE[kind] ?? ''}`}>{label}</span>
}

/** Done / pending / to confirm, as one thin bar. */
export function StateBar({ counts }: { counts: { terminado: number; pendiente: number; confirmar: number } }) {
  const total = counts.terminado + counts.pendiente + counts.confirmar || 1
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]" aria-hidden>
      <span style={{ width: `${(counts.terminado / total) * 100}%` }} className="bg-ink-3" />
      <span style={{ width: `${(counts.confirmar / total) * 100}%` }} className="bg-[#e0a43a]" />
      <span style={{ width: `${(counts.pendiente / total) * 100}%` }} className="bg-[color-mix(in_srgb,var(--color-electric)_45%,transparent)]" />
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, testId }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className="flex rounded-full bg-[var(--line)] p-1" role="tablist" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`hit h-9 flex-1 rounded-full text-[13.5px] transition-colors ${o.value === value ? 'bg-[var(--color-pearl)] font-medium text-ink shadow-[0_1px_3px_rgba(8,26,50,0.12)]' : 'text-ink-3'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
