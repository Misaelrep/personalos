import type { ReactNode } from 'react'

/** Spaced uppercase label: A H O R A, S I G U I E N T E… */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`label-spaced text-ink-3 ${className}`}>{children}</span>
}
