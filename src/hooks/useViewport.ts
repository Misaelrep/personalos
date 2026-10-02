import { useEffect, useState } from 'react'

export interface Viewport {
  width: number
  height: number
}

const read = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight })

/** Window size in CSS px, updated on resize and rotation. */
export function useViewport(): Viewport {
  const [size, setSize] = useState(read)
  useEffect(() => {
    let frame = 0
    const onResize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSize(read()))
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return size
}
