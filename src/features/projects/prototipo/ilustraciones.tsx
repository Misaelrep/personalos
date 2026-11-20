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
      <path {...common} d="M14 48h36M18 48c2-3 5-4 8-4m12 4c2-3 5-4 8-4" opacity={0.6} />
      <g className="pl-sway">
        <path {...common} d="M32 48V30" />
        <path {...common} d="M32 36c0-6-4-10-10-10 0 6 4 10 10 10Z" />
        <path {...common} d="M32 32c0-5 3-9 9-9 0 5-3 9-9 9Z" />
      </g>
      <path className="pl-drop" fill={ACCENT} opacity={0.85} d="M44 14c1.6 2.2 3 3.8 3 5.4a3 3 0 0 1-6 0c0-1.6 1.4-3.2 3-5.4Z" />
    </>
  )
}

function Taller() {
  return (
    <>
      <ellipse className="pl-spin" {...common} cx={32} cy={47} rx={16} ry={3.5} strokeDasharray="4 5" opacity={0.7} />
      <g className="pl-float">
        <path {...common} d="M25 22h14M27 22c-1 4-6 8-6 14 0 5 5 9 11 9s11-4 11-9c0-6-5-10-6-14" />
        <path {...common} d="M24 34c5 2 11 2 16 0" stroke={ACCENT} />
      </g>
    </>
  )
}

function Boletin() {
  return (
    <>
      <path {...common} d="M16 26h32v20H16Z" />
      <path {...common} d="m16 26 16 11 16-11" />
      <g className="pl-rise">
        <path {...common} d="M22 22V12h20v10" />
        <path {...common} d="M26 16h12M26 19h8" stroke={ACCENT} />
      </g>
    </>
  )
}

function Web() {
  return (
    <>
      <path {...common} d="M13 16h38v30H13ZM13 22h38" />
      <circle cx={17} cy={19} r={0.9} fill={INK} />
      <circle cx={20} cy={19} r={0.9} fill={INK} />
      <rect className="pl-blink" x={18} y={27} width={8} height={7} rx={1.5} fill={ACCENT} opacity={0.6} />
      <rect className="pl-blink" style={{ animationDelay: '1.6s' }} x={28} y={27} width={8} height={7} rx={1.5} fill={ACCENT} opacity={0.6} />
      <rect className="pl-blink" style={{ animationDelay: '3.2s' }} x={38} y={27} width={8} height={7} rx={1.5} fill={ACCENT} opacity={0.6} />
      <path {...common} d="M18 39h28" opacity={0.5} />
    </>
  )
}

function Recetas() {
  return (
    <>
      <path {...common} d="M32 20c-4-3-10-4-16-3v27c6-1 12 0 16 3 4-3 10-4 16-3V17c-6-1-12 0-16 3Zm0 0v27" />
      <g className="pl-rise">
        <path {...common} d="M21 25h6M21 29h6M37 25h6" stroke={ACCENT} />
      </g>
      <path {...common} d="M37 29h6M21 33h6M37 33h4" opacity={0.5} />
    </>
  )
}

function App() {
  return (
    <>
      <path {...common} d="M24 12h16a2 2 0 0 1 2 2v36a2 2 0 0 1-2 2H24a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2Z" />
      <path {...common} d="M30 48h4" />
      <circle className="pl-spin" {...common} cx={32} cy={30} r={7} strokeDasharray="30 14" stroke={ACCENT} />
      <path {...common} d="m29 30 2 2 4-4" />
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
