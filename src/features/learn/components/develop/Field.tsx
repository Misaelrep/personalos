import { useId, useLayoutEffect, useRef } from 'react'
import { MAX_FIELD_LENGTH } from '../../domain/capability/model'

/** A line to write on — the Composer's voice, smaller: no box, grows with the text, 17 px (iOS does not zoom on focus at ≥ 16). */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  readOnly = false,
  autoFocus = false,
  problem,
}: {
  label: string
  value: string
  onChange: (text: string) => void
  placeholder?: string
  hint?: string
  readOnly?: boolean
  autoFocus?: boolean
  /** Said right under the line, where the eye is: what is missing from what was written. */
  problem?: string
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] text-ink-3">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={1}
        value={value}
        readOnly={readOnly}
        autoFocus={autoFocus}
        maxLength={MAX_FIELD_LENGTH}
        placeholder={placeholder}
        aria-describedby={problem ? `${id}-problem` : hint ? `${id}-hint` : undefined}
        aria-invalid={problem ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full resize-none border-b border-line bg-transparent pb-2 text-[17px] leading-snug tracking-[-0.01em] text-ink transition-[border-color] duration-200 placeholder:text-ink-4 focus:border-accent focus:outline-none read-only:border-transparent"
      />
      {problem && (
        <p id={`${id}-problem`} role="status" className="mt-1.5 text-[13.5px] leading-snug text-(--learn-label)">
          {problem}
        </p>
      )}
      {hint && !problem && (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-ink-4">
          {hint}
        </p>
      )}
    </div>
  )
}
