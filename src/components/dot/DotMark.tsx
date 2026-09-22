/**
 * Placeholder mark: a quiet 3 × 3 point matrix. There is no product name
 * yet — identity comes from the dot system, not from a logo.
 */
export function DotMark({ size = 20, className }: { size?: number; className?: string }) {
  const cells = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ row, col })))
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 30 30" className={className}>
      {cells.map(({ row, col }) => {
        const center = row === 1 && col === 1
        const corner = (row + col) % 2 === 0
        return (
          <circle
            key={`${row}-${col}`}
            cx={5 + col * 10}
            cy={5 + row * 10}
            r={center ? 3.2 : 2.6}
            fill={center ? 'var(--color-aurora)' : 'currentColor'}
            opacity={center ? 1 : corner ? 0.9 : 0.35}
          />
        )
      })}
    </svg>
  )
}
