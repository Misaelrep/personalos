/**
 * PROTOTYPE · One quiet vector illustration per invented project, drawn inside
 * the purpose orb. They only suggest what the project is for; the movement is
 * slow, stays inside the orb and stops with reduced movement (.pl-anim).
 */

const INK = '#4b5270'
const ACCENT = 'var(--color-electric)'

const common = { fill: 'none', stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function Huerto() {
  return (
    <>
      {/* sun, turning slowly */}
      <g className="pl-spin" style={{ transformOrigin: '14px 14px' }} opacity={0.75}>
        <circle {...common} cx={14} cy={14} r={4} stroke={ACCENT} />
        <path {...common} d="M14 6v2M14 20v2M6 14h2M20 14h2M8.3 8.3l1.4 1.4M18.3 18.3l1.4 1.4M19.7 8.3l-1.4 1.4M9.7 18.3l-1.4 1.4" stroke={ACCENT} strokeWidth={1.2} />
      </g>
      <path {...common} d="M10 50h44" opacity={0.6} />
      <path {...common} d="M16 50c2-3 5-4 8-4m22 4c2-3 5-4 8-4" opacity={0.45} />
      {/* two plants: one grows, one sways */}
      <g className="pl-sway">
        <path {...common} d="M30 50V30" />
        <path {...common} d="M30 38c0-6-4-10-10-10 0 6 4 10 10 10Z" />
        <path {...common} d="M30 33c0-5 3-9 9-9 0 5-3 9-9 9Z" />
      </g>
      <g className="pl-grow" style={{ transformOrigin: '46px 50px' }}>
        <path {...common} d="M46 50V40" />
        <path {...common} d="M46 43c0-4-3-6-7-6 0 4 3 6 7 6Z" />
        <path {...common} d="M46 41c0-3 2-5 6-5 0 3-2 5-6 5Z" />
      </g>
      {/* rain */}
      <path className="pl-drop" fill={ACCENT} opacity={0.85} d="M24 8c1.4 2 2.6 3.4 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-1.4 1.2-2.8 2.6-4.8Z" />
      <path className="pl-drop" style={{ animationDelay: '1.6s' }} fill={ACCENT} opacity={0.85} d="M40 6c1.4 2 2.6 3.4 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-1.4 1.2-2.8 2.6-4.8Z" />
      <path className="pl-drop" style={{ animationDelay: '3.1s' }} fill={ACCENT} opacity={0.85} d="M52 10c1.2 1.7 2.2 3 2.2 4.1a2.2 2.2 0 0 1-4.4 0c0-1.1 1-2.4 2.2-4.1Z" />
    </>
  )
}

function Taller() {
  return (
    <>
      {/* heat rising from the kiln */}
      <path className="pl-steam" {...common} d="M44 22c-2-2 2-4 0-6" stroke={ACCENT} opacity={0.7} />
      <path className="pl-steam" style={{ animationDelay: '1.4s' }} {...common} d="M50 24c-2-2 2-4 0-6" stroke={ACCENT} opacity={0.7} />
      {/* the vessel takes shape on the wheel */}
      <g className="pl-grow" style={{ transformOrigin: '28px 46px' }}>
        <path {...common} d="M21 20h14M23 20c-1 4-5 8-5 14 0 5 4 9 10 9s10-4 10-9c0-6-4-10-5-14" />
        <path {...common} d="M20 32c5 2 11 2 16 0" stroke={ACCENT} />
      </g>
      <ellipse {...common} cx={28} cy={47} rx={18} ry={4} opacity={0.5} />
      <ellipse className="pl-spin" {...common} cx={28} cy={47} rx={18} ry={4} strokeDasharray="5 7" stroke={ACCENT} />
      {/* kiln */}
      <path {...common} d="M42 46V30a6 6 0 0 1 12 0v16Z" opacity={0.85} />
      <path className="pl-blink" fill={ACCENT} opacity={0.6} d="M45 46v-5a3 3 0 0 1 6 0v5Z" />
    </>
  )
}

function Boletin() {
  return (
    <>
      <path {...common} d="M12 30h40v22H12Z" />
      <path {...common} d="m12 30 20 14 20-14" />
      {/* issues leaving the envelope, one after another */}
      <g className="pl-rise">
        <path {...common} d="M20 26V12h24v14" />
        <path {...common} d="M25 17h14M25 21h9" stroke={ACCENT} />
      </g>
      <g className="pl-rise" style={{ animationDelay: '2.4s' }} opacity={0.5}>
        <path {...common} d="M18 26V14" />
        <path {...common} d="M46 26V14" />
      </g>
      {/* a delivery travelling to the neighbours */}
      <circle className="pl-fly" cx={52} cy={20} r={2.4} fill={ACCENT} />
      <circle className="pl-fly" style={{ animationDelay: '1.7s' }} cx={52} cy={20} r={1.8} fill={ACCENT} opacity={0.7} />
    </>
  )
}

function Web() {
  return (
    <>
      <path {...common} d="M10 14h44v36H10ZM10 21h44" />
      <circle cx={14} cy={17.5} r={1} fill={INK} />
      <circle cx={18} cy={17.5} r={1} fill={INK} />
      <circle cx={22} cy={17.5} r={1} fill={INK} />
      <rect className="pl-blink" x={14} y={26} width={11} height={9} rx={2} fill={ACCENT} opacity={0.6} />
      <rect className="pl-blink" style={{ animationDelay: '1.2s' }} x={27} y={26} width={11} height={9} rx={2} fill={ACCENT} opacity={0.6} />
      <rect className="pl-blink" style={{ animationDelay: '2.4s' }} x={40} y={26} width={10} height={9} rx={2} fill={ACCENT} opacity={0.6} />
      <path {...common} d="M14 41h36M14 45h22" opacity={0.5} />
      {/* the cursor visits each block */}
      <g className="pl-cursor">
        <path d="M0 0l9 4-4 1.4L3.4 10Z" fill={INK} stroke="#fff" strokeWidth={1} strokeLinejoin="round" />
      </g>
    </>
  )
}

function Recetas() {
  return (
    <>
      <path {...common} d="M32 20c-4-3-10-4-18-3v28c8-1 14 0 18 3 4-3 10-4 18-3V17c-8-1-14 0-18 3Zm0 0v28" />
      {/* a page turns over */}
      <g className="pl-flip" style={{ transformOrigin: '32px 34px' }}>
        <path {...common} d="M32 20c-4-3-10-4-18-3v28c8-1 14 0 18 3Z" fill="rgba(255,255,255,0.55)" stroke={ACCENT} />
        <path {...common} d="M19 26h8M19 31h8M19 36h5" opacity={0.7} />
      </g>
      <path {...common} d="M38 27h8M38 32h8M38 37h5" opacity={0.55} />
      {/* steam from the dish */}
      <path className="pl-steam" {...common} d="M20 13c-2-2 2-3 0-5" stroke={ACCENT} opacity={0.7} />
      <path className="pl-steam" style={{ animationDelay: '1.3s' }} {...common} d="M26 12c-2-2 2-3 0-5" stroke={ACCENT} opacity={0.7} />
    </>
  )
}

function App() {
  return (
    <>
      <path {...common} d="M22 8h20a3 3 0 0 1 3 3v42a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z" />
      <path {...common} d="M29 51h6" />
      <circle {...common} cx={32} cy={26} r={8} opacity={0.4} />
      <circle className="pl-spin" {...common} cx={32} cy={26} r={8} strokeDasharray="26 25" stroke={ACCENT} />
      <path {...common} d="m28.5 26 2.5 2.5 4.5-5" />
      {/* a streak of habits lighting up day after day */}
      <circle className="pl-blink" cx={25} cy={40} r={2} fill={ACCENT} />
      <circle className="pl-blink" style={{ animationDelay: '0.8s' }} cx={32} cy={40} r={2} fill={ACCENT} />
      <circle className="pl-blink" style={{ animationDelay: '1.6s' }} cx={39} cy={40} r={2} fill={ACCENT} />
    </>
  )
}

function Generic() {
  return (
    <>
      <circle {...common} cx={32} cy={32} r={14} opacity={0.6} />
      <circle className="pl-rise" {...common} cx={32} cy={32} r={6} stroke={ACCENT} />
    </>
  )
}

const BY_NAME: Record<string, () => React.ReactElement> = {
  'Huerto comunitario': Huerto,
  'Taller de cerámica': Taller,
  'Boletín del barrio': Boletin,
  'Web de la tienda': Web,
  'Archivo de recetas': Recetas,
  'App de hábitos': App,
}

export function Ilustracion({ project, className = 'size-16' }: { project: string; className?: string }) {
  const Art = BY_NAME[project] ?? Generic
  return (
    <svg aria-hidden viewBox="0 0 64 64" className={`pl-anim overflow-visible ${className}`}>
      <Art />
    </svg>
  )
}
