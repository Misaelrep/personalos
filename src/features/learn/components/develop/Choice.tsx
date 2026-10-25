import { useId } from 'react'

/** One answer among a few, as quiet lines (like the suggestions) — a radio group, keyboard and screen-reader friendly. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  options: { value: T; label: string; hint?: string }[]
  value: T | undefined
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className="text-[13px] text-ink-3">
        {label}
      </p>
      <ul className="mt-1 flex flex-col">
        {options.map((o) => {
          const on = o.value === value
          return (
            <li key={o.value}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onChange(o.value)}
                className="hit flex min-h-11 w-full items-start gap-3 py-2 text-left disabled:opacity-60"
              >
                <span aria-hidden className={`mt-[7px] size-2.5 shrink-0 rounded-full border transition-colors duration-200 ${on ? 'border-accent bg-accent' : 'border-ink-4'}`} />
                <span>
                  <span className={`block text-[15px] tracking-[-0.005em] ${on ? 'text-ink' : 'text-ink-2'}`}>{o.label}</span>
                  {o.hint && <span className="block text-[12.5px] text-ink-4">{o.hint}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
