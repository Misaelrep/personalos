import { useEffect, useRef, useState } from 'react'
import { Label } from '../../components/ui/Label'

interface ObjectiveFieldProps {
  objective?: string
  onSave: (objective: string) => void
}

/**
 * ¿Qué tiene que existir al terminar este bloque?
 * Project and time come from the routine; only the objective is editable.
 */
export function ObjectiveField({ objective, onSave }: ObjectiveFieldProps) {
  const [editing, setEditing] = useState(!objective)
  const [draft, setDraft] = useState(objective ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(objective ?? '')
  }, [objective, editing])

  const commit = () => {
    const value = draft.trim()
    if (value !== (objective ?? '')) onSave(value)
    setEditing(!value)
  }

  if (!editing && objective) {
    return (
      <div>
        <Label>Objetivo del bloque</Label>
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
          className="group mt-3 flex w-full items-start gap-3 text-left"
          aria-label={`Editar objetivo: ${objective}`}
        >
          <span className="text-[18px] leading-snug tracking-[-0.012em] text-ink sm:text-[20px]">{objective}</span>
          <PencilIcon className="mt-1.5 size-3.5 shrink-0 text-ink-4 transition-colors duration-200 group-hover:text-ink-2" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor="objective" className="block text-[15px] leading-snug text-ink-2">
        ¿Qué tiene que existir al terminar este bloque?
      </label>
      <input
        ref={inputRef}
        id="objective"
        value={draft}
        maxLength={120}
        autoComplete="off"
        placeholder="Un resultado concreto"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(objective ?? '')
            setEditing(!objective)
            e.currentTarget.blur()
          }
        }}
        className="mt-3 w-full border-b border-line bg-transparent pb-2.5 text-[18px] tracking-[-0.012em] text-ink transition-[border-color] duration-200 placeholder:text-ink-4 focus:border-accent focus:outline-none sm:text-[20px]"
      />
    </div>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M10.8 2.7 13.3 5.2 5.6 12.9 2.6 13.4 3.1 10.4Z" strokeLinejoin="round" />
    </svg>
  )
}
