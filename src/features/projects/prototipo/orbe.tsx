import { motion } from 'framer-motion'
import { useEffect, useRef, type ReactNode } from 'react'
import { useProto } from './store'

/**
 * PROTOTYPE · Orb Experience. The main forward actions of the sprint design are orbs of polished
 * platinum that respond like a living object:
 *  - Rest: a soft luminous breathing and slow reflections (the metal's own turning light).
 *  - Proximity: only where a pointer can hover (mouse, trackpad): the orb grows up to 12 %,
 *    gains depth and a halo as the cursor nears. On iPhone nothing pretends to sense a finger.
 *  - Press: immediate, a small compression on contact and a springy release.
 *  - Confirmation: a ring of light leaves the orb and stays on screen while the next scene
 *    comes in. Nothing waits for it: the action runs on the same tap.
 * The whole block (orb and its words) is one button: keyboard, focus ring and screen readers
 * see an ordinary button. With reduced movement the orb is still and only its light changes.
 * Explicit confirmations (approving the sprint, applying big changes) stay ordinary buttons.
 */

const finePointer = () => {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  } catch {
    return false
  }
}

/** The ring of light, outside React so it survives the scene that launched it. */
function wave(from: HTMLElement) {
  const r = from.getBoundingClientRect()
  const d = document.createElement('span')
  d.className = 'orbe-onda'
  d.setAttribute('aria-hidden', 'true')
  d.style.left = `${r.left + r.width / 2}px`
  d.style.top = `${r.top + r.height / 2}px`
  d.style.width = d.style.height = `${r.width}px`
  ;(document.querySelector('.platino') ?? document.body).appendChild(d)
  const done = () => d.remove()
  d.addEventListener('animationend', done)
  setTimeout(done, 1400)
}

export function Orb({ label, hint, onPress, testId, size = 88, children, disabled }: { label: ReactNode; hint?: ReactNode; onPress: () => void; testId?: string; size?: number; children?: ReactNode; disabled?: boolean }) {
  const { s } = useProto()
  const still = s.motion === 'reducido'
  const body = useRef<HTMLSpanElement>(null)

  // Proximity, only with a real hovering pointer: --near goes from 0 (far) to 1 (on the orb).
  useEffect(() => {
    const el = body.current
    if (!el || still || !finePointer()) return
    let raf = 0
    const on = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
        const near = Math.max(0, Math.min(1, 1 - (dist - r.width / 2) / 170))
        el.style.setProperty('--near', near.toFixed(3))
      })
    }
    const leave = () => el.style.setProperty('--near', '0')
    window.addEventListener('pointermove', on, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', on)
      document.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(raf)
    }
  }, [still])

  const press = (on: boolean) => body.current?.setAttribute('data-pressed', on ? 'true' : 'false')

  return (
    <button
      type="button"
      className="orbe"
      data-testid={testId}
      data-quieto={still ? 'true' : 'false'}
      disabled={disabled}
      onPointerDown={() => press(true)}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onPointerLeave={() => press(false)}
      onClick={() => {
        if (!still && body.current) wave(body.current)
        onPress()
      }}
    >
      <span ref={body} className="orbe-cuerpo" style={{ width: size, height: size }} aria-hidden>
        <span className="orbe-halo" />
        <span className="orbe-esfera pl-orb">{children}</span>
      </span>
      <span className="orbe-texto">{label}</span>
      {hint && <span className="orbe-pista">{hint}</span>}
    </button>
  )
}

/** The north star as an orb: it starts as a seed (scene 1), grows (scene 2) and leads the paths. Same layoutId, so it travels between scenes. */
export function StarOrb({ size, seed, halo }: { size: number; seed?: boolean; halo?: boolean }) {
  return (
    <motion.span layoutId="estrella" className="pl-hero relative inline-grid shrink-0" style={{ width: size, height: size }} transition={{ type: 'spring', stiffness: 170, damping: 24 }} aria-hidden data-testid="star-orb">
      {halo && (
        <>
          <span className="pl-halo" />
          <span className="pl-halo" data-i="2" />
        </>
      )}
      <span className="pl-orb pl-orb-hero grid size-full place-items-center">
        <svg viewBox="0 0 24 24" className={`transition-opacity duration-500 ${seed ? 'opacity-0' : 'opacity-100'}`} style={{ width: size * 0.36, height: size * 0.36 }}>
          <path d="M12 2.8l2.4 6.3 6.8.4-5.3 4.3 1.8 6.6L12 16.7l-5.7 3.7 1.8-6.6-5.3-4.3 6.8-.4z" fill="rgba(255,255,255,0.92)" stroke="#5d5893" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      </span>
    </motion.span>
  )
}

/** A pillar as a small metal node with its number. layoutId lets it travel from the three paths to the 90-day line. */
export function PillarNode({ i, size = 40, on }: { i: number; size?: number; on?: boolean }) {
  return (
    <motion.span layoutId={`pilar-${i}`} className="pl-node grid shrink-0 place-items-center text-[16px] font-semibold text-[#2c3350]" data-on={on ? 'true' : 'false'} style={{ width: size, height: size }} transition={{ type: 'spring', stiffness: 190, damping: 26 }} aria-hidden>
      {i + 1}
    </motion.span>
  )
}
