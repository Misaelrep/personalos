import { useLayoutEffect, useRef, type FormEvent } from 'react'
import { MAX_INTENTION_LENGTH } from '../domain/state'

interface ComposerProps {
  value: string
  onChange: (text: string) => void
  /** The person finished writing (Enter, or the arrow). */
  onSubmit: () => void
}

/**
 * ¿QUÉ TIENES EN MENTE? — the field. Same voice as HOY's objective: a line,
 * not a box. 18 px text (iOS does not zoom), "enviar" on the keyboard, grows
 * with what is written. Enter sends; Shift+Enter breaks the line.
 */
export function Composer({ value, onChange, onSubmit }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`
  }, [value])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit()
  }
  const empty = value.trim() === ''

  return (
    <form onSubmit={submit} className="relative">
      <textarea
        ref={ref}
        id="learn-intention"
        aria-labelledby="learn-prompt"
        rows={2}
        value={value}
        maxLength={MAX_INTENTION_LENGTH}
        enterKeyHint="send"
        autoComplete="off"
        placeholder="Cuéntame qué quieres aprender, hacer posible o explorar…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
        className="block w-full resize-none border-b border-line bg-transparent pr-12 pb-2.5 text-[18px] leading-snug tracking-[-0.012em] text-ink transition-[border-color] duration-200 placeholder:text-ink-4 focus:border-accent focus:outline-none sm:text-[20px]"
      />
      <button
        type="submit"
        aria-label="Continuar"
        disabled={empty}
        tabIndex={empty ? -1 : 0}
        className={`absolute right-0 bottom-0 grid size-11 place-items-center text-ink-3 transition-opacity duration-200 hover:text-ink ${empty ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 8h10M9 4.2 12.8 8 9 11.8" />
        </svg>
      </button>
    </form>
  )
}
