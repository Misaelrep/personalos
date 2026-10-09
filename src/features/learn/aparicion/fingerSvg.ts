import type { SceneColors } from '../atmosphere/themes'
import { rgba } from './color'
import { FINGER_LENGTH, backPath, bodyPath, creasePath, padPath } from './fingerShape'

/** Where the tip is inside the image, and its size, in the finger's own units (before scaling). */
export const FINGER_BOX = { tipX: FINGER_LENGTH + 30, tipY: 120, width: FINGER_LENGTH + 60, height: 240 }

/**
 * The fingertip as an image (an SVG string with concrete colors): a glass form — a
 * bright back, a shadowed underside, the nail, the creases of its joints — with the
 * light that crosses it from behind, warm at the pad and fringed in cyan. It is drawn
 * once, into a sprite; moving it afterwards costs one image draw per frame.
 */
export function fingerSvg(c: SceneColors, scale = 1): string {
  const L = FINGER_LENGTH
  const body = bodyPath()
  const crease = [198, 212, 330, 344]
    .map((d) => `<path d="${creasePath(d)}" fill="none" stroke="${rgba(c.white, 0.3)}" stroke-width="1.1"/>`)
    .join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FINGER_BOX.width * scale}" height="${FINGER_BOX.height * scale}" viewBox="${-L - 30} -120 ${L + 60} 240">`,
    '<defs>',
    '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0" stop-color="${rgba(c.white, 0.88)}"/><stop offset="0.16" stop-color="${rgba(c.ice, 0.62)}"/>`,
    `<stop offset="0.5" stop-color="${rgba(c.steel, 0.8)}"/><stop offset="1" stop-color="${rgba(c.night, 0.92)}"/>`,
    '</linearGradient>',
    `<linearGradient id="f" x1="30" x2="${-L}" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="white"/><stop offset="0.72" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`,
    `<mask id="m" maskUnits="userSpaceOnUse" x="${-L - 30}" y="-120" width="${L + 60}" height="240"><rect x="${-L}" y="-120" width="${L + 30}" height="240" fill="url(#f)"/></mask>`,
    `<radialGradient id="p" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${rgba(c.hot, 0.9)}"/><stop offset="0.45" stop-color="${rgba(c.ember, 0.55)}"/><stop offset="1" stop-color="${rgba(c.ember, 0)}"/></radialGradient>`,
    '<filter id="s" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>',
    '<filter id="g" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>',
    '</defs>',
    '<g mask="url(#m)">',
    `<path d="${body}" filter="url(#g)" fill="${rgba(c.night, 0.4)}" transform="translate(10 18)"/>`,
    `<path d="${body}" filter="url(#g)" fill="${rgba(c.vermilion, 0.46)}" transform="translate(3 6)"/>`,
    `<path d="${body}" fill="url(#b)" stroke="${rgba(c.white, 0.8)}" stroke-width="1.4"/>`,
    `<path d="${backPath(40, 330, 0.5)}" filter="url(#s)" fill="none" stroke="${rgba(c.white, 0.85)}" stroke-width="5" stroke-linecap="round"/>`,
    `<ellipse cx="-33" cy="-7" rx="19" ry="9.5" transform="rotate(-6 -33 -7)" fill="${rgba(c.white, 0.22)}" stroke="${rgba(c.white, 0.7)}" stroke-width="1"/>`,
    `<ellipse cx="-38" cy="-10" rx="8" ry="2.6" transform="rotate(-8 -38 -10)" fill="${rgba(c.white, 0.8)}" filter="url(#s)"/>`,
    crease,
    `<path d="${backPath(50, 210, 0.4)}" filter="url(#s)" fill="none" stroke="${rgba(c.white, 0.72)}" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="${padPath(180)}" filter="url(#s)" fill="none" stroke="${rgba(c.ember, 0.85)}" stroke-width="2.4" stroke-linecap="round"/>`,
    `<path d="${padPath(180)}" fill="none" stroke="${rgba(c.cyan, 0.7)}" stroke-width="1" stroke-linecap="round" transform="translate(-2.2 -1.4)"/>`,
    '<circle cx="4" cy="2" r="46" fill="url(#p)"/>',
    '</g>',
    '</svg>',
  ].join('')
}
