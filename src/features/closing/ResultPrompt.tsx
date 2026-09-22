import { AnimatePresence, m } from 'framer-motion'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { Outcome } from '../../domain/types'
import { expand } from '../../motion/tokens'

interface ResultPromptProps {
  onAnswer: (outcome: Outcome, note?: string) => void
  onCancel?: () => void
  align?: 'start' | 'center'
}

const CHOICES: { value: Outcome; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'no', label: 'No' },
]

/**
 * ¿Se consiguió el resultado? — Sí / Parcial / No.
 * Partial asks for one short line of what is left. Nothing is rescheduled.
 */
export function ResultPrompt({ onAnswer, onCancel, align = 'start' }: ResultPromptProps) {
  const [partial, setPartial] = useState(false)
  const [note, setNote] = useState('')
  const center = align === 'center'

  return (
    <div className={center ? 'text-center' : ''}>
      <p className="text-[20px] tracking-[-0.018em] text-ink sm:text-[22px]">¿Se consiguió el resultado?</p>
      <div className={`mt-6 flex flex-wrap gap-2.5 ${center ? 'justify-center' : ''}`} role="group" aria-label="Resultado">
        {CHOICES.map((c) => (
          <Button
            key={c.value}
            variant="choice"
            aria-pressed={c.value === 'parcial' && partial}
            className={c.value === 'parcial' && partial ? 'border-[color-mix(in_srgb,var(--accent)_60%,transparent)]' : ''}
            onClick={() => (c.value === 'parcial' ? setPartial(true) : onAnswer(c.value))}
          >
            {c.label}
          </Button>
        ))}
        {onCancel && !partial && (
          <Button variant="quiet" onClick={onCancel} className={center ? '' : 'sm:ml-auto'}>
            Cancelar
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {partial && (
          <m.form
            variants={expand}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault()
              onAnswer('parcial', note)
            }}
          >
            <label htmlFor="pending" className="mt-8 block text-[15px] text-ink-2">
              ¿Qué quedó pendiente?
            </label>
            <input
              id="pending"
              autoFocus
              value={note}
              maxLength={140}
              autoComplete="off"
              placeholder="Una frase breve"
              onChange={(e) => setNote(e.target.value)}
              className={`mt-3 w-full border-b border-line bg-transparent pb-2.5 text-[18px] text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none ${center ? 'text-center' : ''}`}
            />
            <div className={`mt-6 flex gap-2 ${center ? 'justify-center' : ''}`}>
              <Button type="submit" variant="primary" className="h-12 px-7">
                Guardar
              </Button>
              <Button variant="quiet" onClick={() => setPartial(false)}>
                Volver
              </Button>
            </div>
          </m.form>
        )}
      </AnimatePresence>
    </div>
  )
}
