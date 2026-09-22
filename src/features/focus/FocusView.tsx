import { m } from 'framer-motion'
import { useEffect } from 'react'
import { Label } from '../../components/ui/Label'
import { blockDescription } from '../../domain/labels'
import { atMinutes, formatTimer } from '../../domain/time'
import type { ScheduledBlock } from '../../domain/types'
import { EASE } from '../../motion/tokens'
import { useNow } from '../../state/clock'

interface FocusViewProps {
  block: ScheduledBlock
  /** The timer fades first when the block is being closed. */
  closing: boolean
  onFinish: () => void
  onLeave: () => void
}

/**
 * FOCUS: timer · project · objective · finish. Nothing else.
 */
export function FocusView({ block, closing, onFinish, onLeave }: FocusViewProps) {
  const now = useNow(1000)
  const endsAt = atMinutes(now, block.endMin)
  const startsAt = atMinutes(now, block.startMin)
  const remaining = endsAt - now.getTime()
  const progress = Math.min(Math.max((now.getTime() - startsAt) / (endsAt - startsAt), 0), 1)
  const timer = formatTimer(remaining)
  const minuteLabel = timer.slice(0, timer.length - 3)

  useEffect(() => {
    document.title = `${minuteLabel} · ${block.title}`
  }, [minuteLabel, block.title])

  return (
    <m.div
      className="tone-ink fixed inset-0 z-10 flex flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: EASE } }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="relative grid size-[min(88vw,58vh,560px)] place-items-center">
        <Orbit progress={progress} closing={closing} />
        <m.div
          className="relative flex flex-col items-center text-center"
          animate={{ opacity: closing ? 0 : 1, scale: closing ? 0.98 : 1, filter: closing ? 'blur(4px)' : 'blur(0px)' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <Label className="text-ink-2">{block.title}</Label>
          <div
            role="timer"
            aria-label={remaining >= 0 ? 'Tiempo restante del bloque' : 'Tiempo excedido'}
            className="tabular mt-5 text-[clamp(50px,13.5vw,108px)] leading-none font-extralight tracking-[-0.045em] text-ink"
          >
            {timer}
          </div>
          <p className="mt-6 max-w-[26ch] text-[16px] leading-snug text-balance text-ink-2 sm:text-[19px]">
            {block.objective ?? blockDescription(block)}
          </p>
        </m.div>
      </div>

      <m.div
        className="mt-8 flex flex-col items-center gap-3 sm:mt-10"
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <button
          type="button"
          onClick={onFinish}
          disabled={closing}
          className={`h-14 rounded-full border border-[rgba(234,242,255,0.22)] bg-[rgba(234,242,255,0.06)] px-9 text-[12px] font-medium tracking-[0.28em] text-ink uppercase backdrop-blur-md transition-[background-color,border-color,transform] duration-200 ease-astral hover:border-[rgba(234,242,255,0.4)] hover:bg-[rgba(234,242,255,0.12)] active:scale-[0.985] ${
            remaining < 0 ? 'border-[rgba(105,165,255,0.6)]' : ''
          }`}
        >
          Finalizar bloque
        </button>
        <button
          type="button"
          onClick={onLeave}
          disabled={closing}
          className="h-10 rounded-full px-4 text-[12px] tracking-[0.06em] text-ink-3 transition-colors duration-200 hover:text-ink"
        >
          Salir sin cerrar
        </button>
      </m.div>
    </m.div>
  )
}

/** ORBIT — continuity: a quiet ring and a point travelling with the block's time. */
function Orbit({ progress, closing }: { progress: number; closing: boolean }) {
  const r = 48
  const c = 2 * Math.PI * r
  const angle = progress * 2 * Math.PI - Math.PI / 2
  return (
    <m.svg
      aria-hidden
      viewBox="0 0 100 100"
      className="absolute inset-0 size-full overflow-visible"
      animate={{ opacity: closing ? 0 : 1, scale: closing ? 1.06 : 1 }}
      transition={{ duration: 1.2, ease: EASE }}
    >
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(234,242,255,0.08)" strokeWidth="0.25" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="rgba(105,165,255,0.5)"
        strokeWidth="0.3"
        strokeLinecap="round"
        strokeDasharray={`${c * progress} ${c}`}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 1s linear' }}
      />
      <circle
        cx={50 + r * Math.cos(angle)}
        cy={50 + r * Math.sin(angle)}
        r="0.9"
        fill="#EAF2FF"
        style={{ filter: 'drop-shadow(0 0 1.5px rgba(105,165,255,0.9))', transition: 'cx 1s linear, cy 1s linear' }}
      />
    </m.svg>
  )
}
