import { m } from 'framer-motion'
import { useEffect } from 'react'
import { Label } from '../../components/ui/Label'
import { fade, fadeGroup } from '../../motion/tokens'
import { Copias } from '../backup/ui/Copias'

interface SistemaProps {
  onBusy: (busy: boolean) => void
}

/** SISTEMA — how ELYUM keeps your data. For now, one thing: copies of it. */
export function Sistema({ onBusy }: SistemaProps) {
  useEffect(() => {
    document.title = 'Sistema · Copias de seguridad'
  }, [])

  return (
    <m.main
      className="tone-ink relative z-10 mx-auto w-full max-w-[860px] px-5 pt-[calc(env(safe-area-inset-top)+28px)] pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-10 sm:pt-12 lg:pl-[140px] lg:pt-16"
      variants={fadeGroup(0.09, 0.05)}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <m.header variants={fade}>
        <Label className="text-ink-2">Sistema</Label>
        <h1 className="mt-7 font-display text-[clamp(34px,4.2vw,48px)] leading-[1] font-[440] tracking-[-0.045em] text-ink sm:mt-10">
          Copias de seguridad
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-ink-2 sm:text-[17px]">
          ELYUM guarda tus datos solo en este dispositivo. Exporta una copia con regularidad y guárdala fuera de él.
        </p>
      </m.header>
      <m.div variants={fade} className="mt-8 sm:mt-11">
        <Copias onBusy={onBusy} />
      </m.div>
    </m.main>
  )
}
