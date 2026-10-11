import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/toy/motion.ts'
import { clampIntoZone, fits, landingSpot, type Placed, type Zone } from '../src/toy/zone.ts'

// Zones measured from the running page (?debug, window.__toy.layout) at three sizes.
const SIZES: Record<string, { zone: Zone; mouth: { x: number; y: number }; bagH: number; scale: number }> = {
  desktop: {
    zone: {
      left: 64,
      right: 1030,
      back: 497,
      front: 876,
      footprint: { x: 572, y: 295, w: 254, h: 218 },
      headline: { x: 64, y: 798, w: 629, h: 63 },
    },
    mouth: { x: 585, y: 497 },
    bagH: 217,
    scale: 0.453,
  },
  tablet: {
    zone: {
      left: 64,
      right: 711,
      back: 565,
      front: 1000,
      footprint: { x: 191, y: 338, w: 284, h: 243 },
      headline: { x: 64, y: 941, w: 437, h: 44 },
    },
    mouth: { x: 205, y: 565 },
    bagH: 247,
    scale: 0.515,
  },
  mobile: {
    zone: {
      left: 24,
      right: 356,
      back: 305,
      front: 788,
      footprint: { x: 69, y: 175, w: 168, h: 146 },
      headline: { x: 24, y: 693, w: 351, h: 87 },
    },
    mouth: { x: 84, y: 305 },
    bagH: 133,
    scale: 0.277,
  },
}

const ITEMS = [
  { id: 'tomato', r: 62, dist: [1.0, 1.6] as [number, number] },
  { id: 'banana', r: 82, dist: [0.3, 0.6] as [number, number] },
  { id: 'radish', r: 78, dist: [0.6, 1.0] as [number, number] },
]

describe.each(Object.entries(SIZES))('landing zone (%s)', (_name, s) => {
  it('1,000 falls: every spot fits the zone and nothing overlaps', () => {
    const rand = mulberry32(42)
    for (let fall = 0; fall < 1000; fall++) {
      const placed: Placed[] = []
      for (const item of ITEMS) {
        const r = item.r * s.scale * (1 / 0.92)
        const p = landingSpot({
          mouth: s.mouth,
          bagH: s.bagH,
          dist: item.dist,
          fanMin: 132,
          fanMax: 176,
          r,
          zone: s.zone,
          placed,
          rand,
          step: 8,
          tries: 10,
          gap: 10,
          fallback: { x: s.mouth.x - s.bagH, y: s.mouth.y + s.bagH * 0.5 },
        })
        expect(fits(s.zone, p, r, placed, 10)).toBe(true)
        const h = s.zone.headline!
        expect(p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h).toBe(false)
        placed.push({ x: p.x, y: p.y, r })
      }
    }
  })

  it('clampIntoZone pulls an outside point to the nearest spot that fits', () => {
    const r = 20
    const outside = { x: s.zone.left - 50, y: s.zone.back - 80 }
    const p = clampIntoZone(outside, r, s.zone)
    expect(fits(s.zone, p, r)).toBe(true)
    const inside = { x: (s.zone.left + s.zone.right) / 2, y: s.zone.back + 60 }
    expect(clampIntoZone(inside, r, s.zone)).toEqual(inside)
  })
})

describe('fits', () => {
  const z = SIZES.desktop.zone
  it('rejects centers on the headline but allows overlapping its edge', () => {
    const h = z.headline!
    expect(fits(z, { x: h.x + 100, y: h.y + 10 }, 20)).toBe(false)
    expect(fits(z, { x: h.x + 100, y: h.y - 15 }, 20)).toBe(true)
  })
  it('rejects anything behind the bag base line or on the fallen footprint', () => {
    expect(fits(z, { x: 300, y: z.back - 10 }, 20)).toBe(false)
    expect(fits(z, { x: z.footprint.x + 20, y: z.footprint.y + z.footprint.h + 5 }, 20)).toBe(false)
  })
})
