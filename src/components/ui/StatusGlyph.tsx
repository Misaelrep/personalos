import type { BlockStatus } from '../../domain/types'

export const STATUS_LABEL: Record<BlockStatus, string> = {
  proximo: 'Próximo',
  activo: 'Activo',
  'en-focus': 'En focus',
  completado: 'Completado',
  parcial: 'Parcial',
  omitido: 'Omitido',
}

/** ✓ completado · ◐ parcial · – omitido · ● activo · ○ próximo */
export function StatusGlyph({ status, className = '' }: { status: BlockStatus; className?: string }) {
  if (status === 'activo' || status === 'en-focus') {
    return (
      <span className={`inline-flex size-4 items-center justify-center ${className}`}>
        <span className="pulse-dot" />
      </span>
    )
  }
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-4 shrink-0 ${className}`}>
      {status === 'completado' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" opacity="0.12" />
          <path d="M5.2 8.3 7.1 10.1 10.9 6.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === 'parcial' && (
        <>
          <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 2.2a5.8 5.8 0 0 1 0 11.6Z" fill="currentColor" />
        </>
      )}
      {status === 'omitido' && (
        <>
          <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
          <path d="M5.4 8h5.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
      {status === 'proximo' && <circle cx="8" cy="8" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  )
}
