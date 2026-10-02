/**
 * SEMANA's atmosphere: exactly three large refractive veils — Champagne Mist,
 * Soft Peach, Muted Mauve / Lavender — over Pearl Ivory. Each drifts,
 * stretches and changes scale on its own slow cycle (40–90 s, never in step),
 * loses its defined edge and finds it again, and partly crosses the others:
 * light through optical glass and translucent silk, not a gradient that slides.
 * CSS only (transform / opacity); still under reduced motion.
 */
export function Veils() {
  return (
    <div aria-hidden className="sm-atmo">
      <div className="sm-ground" />
      <div className="sm-veil sm-veil-champagne">
        <i className="sm-veil-body" />
        <i className="sm-veil-edge" />
        <i className="sm-veil-silk" />
      </div>
      <div className="sm-veil sm-veil-peach">
        <i className="sm-veil-body" />
        <i className="sm-veil-edge" />
        <i className="sm-veil-silk" />
      </div>
      <div className="sm-veil sm-veil-mauve">
        <i className="sm-veil-body" />
        <i className="sm-veil-edge" />
        <i className="sm-veil-silk" />
      </div>
      <div className="sm-grain" />
    </div>
  )
}
