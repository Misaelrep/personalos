import type { ReactNode } from 'react'

/** A view that has nothing in it yet: one quiet sentence, no demo data. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <p className="max-w-[28ch] text-center text-[17px] leading-relaxed text-balance text-ink-3">{children}</p>
    </div>
  )
}
