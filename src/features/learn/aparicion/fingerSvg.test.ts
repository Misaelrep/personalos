import { describe, expect, it } from 'vitest'
import { LEARN_THEMES } from '../atmosphere/themes'
import { FINGER_BOX, fingerSvg } from './fingerSvg'

const scene = LEARN_THEMES['learn-sunset'].scene!

describe('the fingertip as an image', () => {
  const svg = fingerSvg(scene)

  it('is a self-contained SVG: concrete colors only (an image has no CSS variables), balanced tags', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).not.toContain('var(')
    expect(svg).not.toContain('color-mix')
    expect(svg).toContain('rgba(')
    for (const tag of ['g', 'defs', 'mask', 'filter', 'linearGradient', 'radialGradient']) {
      expect((svg.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length, tag).toBe((svg.match(new RegExp(`</${tag}>`, 'g')) ?? []).length)
    }
  })

  it('uses the scene’s palette: its night for the shadow, its vermilion for the light behind, its ember for the pad, its cyan for the fringe', () => {
    for (const color of [scene.night, scene.vermilion, scene.ember, scene.cyan]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
      expect(svg, color).toContain(`rgba(${r},${g},${b},`)
    }
  })

  it('has the parts that make it a finger: the body, a nail, creases at the joints, a pad', () => {
    expect(svg.match(/<ellipse/g)?.length).toBe(2) // the nail and its glint
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg.match(/<path /g)?.length).toBeGreaterThanOrEqual(10)
  })

  it('scales: the same drawing at another size, tip at the same relative place', () => {
    const big = fingerSvg(scene, 2)
    expect(big).toContain(`width="${FINGER_BOX.width * 2}"`)
    expect(big).toContain(`viewBox="${svg.match(/viewBox="([^"]+)"/)![1]}"`)
  })
})
