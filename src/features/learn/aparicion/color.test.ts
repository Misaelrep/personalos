import { describe, expect, it } from 'vitest'
import { mix, parseHex, rgba } from './color'

describe('color arithmetic', () => {
  it('reads #rrggbb and nothing else', () => {
    expect(parseHex('#FF8A3D')).toEqual([255, 138, 61])
    expect(parseHex('#071328')).toEqual([7, 19, 40])
    expect(() => parseHex('rgb(1,2,3)')).toThrow()
    expect(() => parseHex('#fff')).toThrow()
  })

  it('thins a palette color out to the opacity asked, within 0..1', () => {
    expect(rgba('#FFFFFF', 0.5)).toBe('rgba(255,255,255,0.5)')
    expect(rgba('#071328', 2)).toBe('rgba(7,19,40,1)')
    expect(rgba('#071328', -1)).toBe('rgba(7,19,40,0)')
  })

  it('mixes two colors like color-mix does, in sRGB', () => {
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000')
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#ffffff')
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(mix('#FF0000', '#0000FF', 0.25)).toBe('#bf0040')
  })
})
