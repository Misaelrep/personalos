import type { ReactNode } from 'react'

/** One screen of DESARROLLAR: a quiet label, one question, what it needs, and its way on. */
export function Step({ label, title, lead, children, actions }: { label: string; title: string; lead?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-7" aria-labelledby="develop-title">
      <div>
        <p className="label-spaced text-(--learn-label)" style={{ fontSize: 11, lineHeight: 1.7 }}>
          {label}
        </p>
        <h2 id="develop-title" className="mt-3 font-display text-[clamp(24px,6vw,32px)] leading-tight font-normal tracking-[-0.03em] text-balance text-ink">
          {title}
        </h2>
        {lead && <div className="mt-3 text-[15px] leading-relaxed text-ink-3">{lead}</div>}
      </div>
      {children}
      {actions && <div className="flex flex-wrap items-center gap-x-2 gap-y-3">{actions}</div>}
    </section>
  )
}

/** A short line that says why something cannot go on yet. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-[14px] leading-snug text-(--learn-label)">
      {children}
    </p>
  )
}

/** A heading inside the result: small, spaced. */
export function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="label-spaced text-ink-3" style={{ fontSize: 11 }}>
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}
