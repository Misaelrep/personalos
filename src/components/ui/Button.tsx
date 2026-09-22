import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'choice' | 'quiet'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const base =
  'inline-flex items-center justify-center gap-3 select-none whitespace-nowrap ' +
  'transition-[background-color,color,box-shadow,transform,opacity,border-color] duration-200 ease-astral ' +
  'disabled:opacity-40 disabled:pointer-events-none active:scale-[0.985]'

const variants: Record<Variant, string> = {
  primary:
    'h-14 rounded-full px-8 bg-[var(--control)] text-[var(--control-ink)] ' +
    'text-[12px] font-medium tracking-[0.26em] uppercase ' +
    'shadow-[0_10px_30px_-12px_rgba(8,26,50,0.45)] hover:shadow-[0_14px_40px_-10px_rgba(58,130,246,0.55)]',
  choice:
    'h-12 min-w-24 rounded-full px-6 border border-[var(--line)] bg-[var(--surface-quiet)] text-ink ' +
    'text-[13px] font-medium tracking-[0.18em] uppercase hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]',
  quiet:
    'h-10 rounded-full px-4 text-ink-3 text-[13px] font-medium tracking-[0.06em] hover:text-ink hover:bg-[var(--line)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={`${base} ${variants[variant]} ${className}`} {...rest} />
})
