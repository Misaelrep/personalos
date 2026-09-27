/**
 * HOY in SEMANA: the 3 × 3 modular point, small and quiet — Deep Ink with a
 * cool pearl center. No badge, no electric blue.
 */
const CELLS = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ row, col })))

export function Modular() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="sm-modular">
      {CELLS.map(({ row, col }) => {
        const center = row === 1 && col === 1
        const corner = row !== 1 && col !== 1
        return (
          <circle
            key={`${row}-${col}`}
            cx={2 + col * 4}
            cy={2 + row * 4}
            r={center ? 1.35 : corner ? 0.7 : 0.85}
            fill={center ? '#7F93B2' : '#172034'}
            opacity={center ? 1 : corner ? 0.32 : 0.55}
          />
        )
      })}
    </svg>
  )
}
