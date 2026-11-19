import type { Icon } from './mapa-modelo'

/** PROTOTYPE · Simple line icons for the map (24×24, stroke = currentColor). */
const PATHS: Record<Icon, string> = {
  gota: 'M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10Z',
  brote: 'M12 20v-8m0 0c0-3.5-2.5-6-6.5-6 0 3.5 2.5 6 6.5 6Zm0 0c0-3 2-5.5 6-5.5 0 3-2 5.5-6 5.5ZM7 20h10',
  personas: 'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5 0a2.5 2.5 0 1 0 0-5M3.5 19c.5-3 2.5-5 5-5s4.5 2 5 5m2-4.8c2 .3 3.6 2 4 4.8',
  casa: 'M4 11 12 4.5 20 11M6 9.5V19h12V9.5M10 19v-5h4v5',
  documento: 'M7 3.5h7l4 4V20H7ZM14 3.5V8h4M9.5 12h6m-6 3.5h6',
  llama: 'M12 20.5c-3.5 0-6-2.5-6-5.5 0-3.5 3-5 3.5-9 2 1.5 3 3 3 5 1-1 1.5-2 1.5-3.5 2.5 2 4 4.5 4 7.5 0 3-2.5 5.5-6 5.5Z',
  megafono: 'M4 10v4h3l7 4V6l-7 4Zm13-1.5a4 4 0 0 1 0 7M7 14l1 5h2.5l-1-4.5',
  conversacion: 'M4.5 6.5h11v7h-6l-3.5 3v-3H4.5ZM15.5 9.5h4v7h-1.5v2.5L15 16.5h-4',
  herramienta: 'M14.5 5a4 4 0 0 0 4.5 5.5l-8.5 8.5a2 2 0 0 1-3-3l8.5-8.5A4 4 0 0 0 14.5 5Z',
  carta: 'M4 6.5h16v11H4Zm0 0 8 6 8-6',
  grafico: 'M4.5 19.5h15M7 16v-4m5 4V8m5 8v-6',
  diana: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-4a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-3.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
  estrella: 'm12 4 2.3 4.9 5.2.6-3.9 3.6 1 5.2L12 15.7l-4.6 2.6 1-5.2-3.9-3.6 5.2-.6Z',
  carpeta: 'M3.5 7.5h6l2 2h9v9h-17Z',
  lupa: 'M10.5 16.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm4.5-1.5 4.5 4.5',
  movil: 'M8 3.5h8v17H8Zm3 14h2',
  codigo: 'm9 8-4 4 4 4m6-8 4 4-4 4',
  cohete: 'M12 3.5c3 2 4.5 5 4.5 9l-2 3h-5l-2-3c0-4 1.5-7 4.5-9Zm0 6.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM9.5 15.5 7 19m7.5-3.5L17 19',
  paleta: 'M12 4a8 8 0 1 0 0 16c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 3-3c0-5-4-9-8-9Z',
}

export function MapIcon({ name, className = 'size-5' }: { name: Icon; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
