import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Inline } from '../ui/inline'

/** PROTOTYPE · Compact pieces: ELYUM's tokens, less height, one primary action per screen. */

export const go = (hash: string) => {
  window.location.hash = hash
}

export function Back({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="hit -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[16px] text-ink-3">
      <svg aria-hidden viewBox="0 0 16 16" className="size-4">
        <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Inline text={label} />
    </a>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="inline-flex items-center gap-2 text-[14px] font-medium tracking-[0.07em] text-ink-3 uppercase before:h-px before:w-4 before:bg-[linear-gradient(90deg,rgba(167,139,250,0.9),rgba(58,130,246,0.7))] before:content-['']">{children}</p>
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-[31px] leading-[1.1] font-medium tracking-[-0.025em] text-balance text-ink">{children}</h1>
}

export function Box({ children, className = '', tone = 'surface', testId, style }: { children: ReactNode; className?: string; tone?: 'surface' | 'quiet' | 'focus'; testId?: string; style?: CSSProperties }) {
  const t =
    tone === 'focus'
      ? 'surface shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-electric)_32%,transparent),0_24px_46px_-24px_rgba(58,130,246,0.45)]'
      : tone === 'quiet'
        ? 'surface-quiet'
        : 'surface'
  return (
    <div className={`${t} rounded-[18px] px-4 py-3 ${className}`} style={style} data-testid={testId}>
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
      className="hit inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[var(--control)] py-2 text-center leading-[1.25] bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.04)_46%,rgba(0,0,0,0.18)_100%)] px-5 text-[17px] font-medium tracking-[0.005em] text-[var(--control-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_0_0_1px_rgba(255,255,255,0.08),0_12px_28px_-12px_rgba(8,26,50,0.55),0_2px_4px_rgba(8,26,50,0.25)] active:scale-[0.985] active:brightness-110 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function Secondary({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="hit inline-flex min-h-12 items-center justify-center rounded-full border py-2 text-center leading-[1.25] border-[rgba(255,255,255,0.85)] bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(236,238,245,0.7))] px-5 text-[16px] text-ink shadow-[inset_0_1px_0_#fff,0_8px_18px_-12px_rgba(30,34,60,0.4),0_0_0_1px_rgba(120,128,156,0.14)] active:scale-[0.985]">
      {children}
    </button>
  )
}

export function TextLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <a href={href} data-testid={testId} className="hit text-[16px] text-electric underline decoration-[color-mix(in_srgb,var(--color-electric)_35%,transparent)] underline-offset-4">
      {children}
    </a>
  )
}

/** A row that opens something. `big`: a project name with its purpose below. */
export function Row({ href, title, sub, right, testId, done, big }: { href: string; title: string; sub?: ReactNode; right?: ReactNode; testId?: string; done?: boolean; big?: boolean }) {
  return (
    <a href={href} data-testid={testId} className="hit flex min-h-14 items-center gap-3 border-b border-[var(--line)] py-3 last:border-b-0 active:opacity-70">
      <div className="min-w-0 flex-1">
        <p className={`${big ? 'text-[20px] leading-[1.3] font-medium' : 'text-[17px] leading-[1.4]'} ${done ? 'text-ink-4 line-through' : 'text-ink'}`}>
          <Inline text={title} />
        </p>
        {sub && <div className={`mt-1 ${big ? 'text-[16px]' : 'text-[15px]'} leading-[1.45] text-ink-3`}>{sub}</div>}
      </div>
      {right}
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-4">
        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

/** Sections opened in this visit, so coming back from a task or the map finds them as they were (memory only). */
const opened = new Set<string>()

/**
 * A section closed until opened: a clear name, an optional one-line summary, the detail inside.
 * Opening it brings its content in one piece after another (brief; none with reduced movement).
 */
export function More({ title, count, hint, lead, children, testId, id, big }: { title: ReactNode; count?: number; hint?: ReactNode; lead?: ReactNode; children: ReactNode; testId?: string; id?: string; big?: boolean }) {
  const [anim, setAnim] = useState(false)
  const asked = useRef(false)
  return (
    <details
      className="group border-b border-[var(--line)] last:border-b-0"
      data-testid={testId}
      data-anim={anim ? 'true' : undefined}
      open={id ? opened.has(id) : undefined}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open
        if (id) (open ? opened.add(id) : opened.delete(id))
        // Only a section the person opens now comes in piece by piece; one restored on return is simply there.
        if (open && asked.current) {
          setAnim(true)
          setTimeout(() => setAnim(false), 700)
        }
        asked.current = false
      }}
    >
      <summary onClick={() => (asked.current = true)} className="hit flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 select-none [&::-webkit-details-marker]:hidden">
        {lead}
        <span className="min-w-0 flex-1">
          <span className={`block ${big ? 'text-[22px] leading-[1.3] font-medium' : 'text-[17px] leading-[1.35] font-medium'} text-ink`}>
            {title}
            {count !== undefined && <span className="tabular ml-1.5 font-normal text-ink-3">{count}</span>}
          </span>
          {hint && <span className="mt-0.5 block text-[15px] leading-[1.4] text-ink-3">{hint}</span>}
        </span>
        <svg aria-hidden viewBox="0 0 16 16" className="size-5 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-90">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pl-open pb-4">{children}</div>
    </details>
  )
}

/** Marks a SIMULATED AI output so it is never read as a decision. */
export function AiTag({ who = 'IA' }: { who?: string }) {
  return <span className="ml-1.5 inline-flex min-h-6 items-center rounded-full py-0.5 leading-[1.2] bg-[#ece6fb] px-2 align-middle text-[14px] font-medium tracking-[0.03em] whitespace-nowrap text-[#5634c4]">{who === 'Grok' ? 'Simulación · Grok' : 'Sugerencia simulada · IA'}</span>
}

/** Marks a LOCAL CALCULATION: a fact of the data, computed on the device, not an AI opinion. */
export function LocalTag() {
  return <span className="ml-1.5 inline-flex min-h-6 items-center rounded-full py-0.5 leading-[1.2] bg-[#e7e9ef] px-2 align-middle text-[14px] font-medium tracking-[0.03em] whitespace-nowrap text-ink-3">Cálculo local</span>
}

/** Marks a HUMAN DECISION: something the person approved or confirmed. */
export function HumanTag() {
  return <span className="ml-1.5 inline-flex min-h-6 items-center rounded-full py-0.5 leading-[1.2] bg-[#dff1e8] px-2 align-middle text-[14px] font-medium tracking-[0.03em] whitespace-nowrap text-[#094d33]">Decisión tuya</span>
}

const KIND_STYLE: Record<string, string> = {
  ejecutable: 'bg-[#e2eafa] text-electric',
  decision: 'bg-[#f7ead2] text-[#5f3a00]',
  bloqueada: 'bg-[#e7e9ef] text-ink-3',
  revision: 'bg-[#dff1e8] text-[#094d33]',
  terminada: 'bg-transparent text-ink-4',
}

/** What a planned action is right now: can be done, needs a decision, blocked, waiting for review. */
export function KindTag({ kind, label }: { kind: string; label: string }) {
  return <span className={`inline-flex min-h-6 items-center rounded-full py-0.5 leading-[1.2] px-2 text-[14px] font-medium whitespace-nowrap ${KIND_STYLE[kind] ?? ''}`}>{label}</span>
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
    <div className={`${options.length > 3 ? 'grid grid-cols-2 gap-1 rounded-[24px]' : 'flex rounded-full'} bg-[var(--line)] p-1`} role="tablist" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`hit min-h-11 flex-1 rounded-full px-2 text-[16px] leading-[1.2] ${o.value === value ? 'bg-[var(--color-pearl)] font-medium text-ink shadow-[0_1px_3px_rgba(8,26,50,0.12)]' : 'text-ink-3'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
