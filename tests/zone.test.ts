import { describe, expect, it } from 'vitest'
import { createCamera, distanceFor } from '../src/toy/camera.ts'
import { mulberry32 } from '../src/toy/motion.ts'
import { fits, nearestFit, settleSpot, type FloorPoint, type Placed, type Zone } from '../src/toy/zone.ts'

// Representative zones for a desktop, tablet and phone layout (shape taken from window.__toy.layout).
const SIZES: Record<string, { zone: Zone; origin: { x: number; y: number }; scale: number }> = {
  desktop: {
    zone: { left: 64, right: 1063, back: 541, front: 876, footprint: [{ x: 500, y: 400 }, { x: 900, y: 400 }, { x: 900, y: 690 }, { x: 500, y: 690 }], footprintPad: 16, headline: { x: 64, y: 798, w: 629, h: 63 } },
    origin: { x: 950, y: 541 },
    scale: 0.66,
  },
  tablet: {
    zone: { left: 64, right: 712, back: 610, front: 1000, footprint: [{ x: 300, y: 450 }, { x: 720, y: 450 }, { x: 720, y: 750 }, { x: 300, y: 750 }], footprintPad: 16, headline: { x: 64, y: 941, w: 437, h: 44 } },
    origin: { x: 600, y: 610 },
    scale: 0.7,
  },
  mobile: {
    zone: { left: 24, right: 356, back: 330, front: 788, footprint: [{ x: 110, y: 240 }, { x: 340, y: 240 }, { x: 340, y: 400 }, { x: 110, y: 400 }], footprintPad: 16, headline: { x: 24, y: 693, w: 351, h: 87 } },
    origin: { x: 300, y: 330 },
    scale: 0.38,
  },
}

const cam = createCamera({ distance: distanceFor(1.25, 20, 900), tilt: 20 })
const ITEMS = [
  { r: 50, rest: 50, mu: 0.05, speed: 900 },
  { r: 72, rest: 38, mu: 0.45, speed: 650 },
  { r: 70, rest: 30, mu: 0.12, speed: 560 },
]

describe.each(Object.entries(SIZES))('landing spots (%s)', (_name, s) => {
  const toStage = (p: FloorPoint, rest: number, r: number): Placed => {
    const q = cam.project({ x: p.x, y: rest, z: p.z })
    return { x: s.origin.x + q.x * s.scale, y: s.origin.y + q.y * s.scale, r: r * q.scale * s.scale }
  }

  it('1,000 falls: every resting spot fits the zone and nothing overlaps', () => {
    const rand = mulberry32(42)
    for (let fall = 0; fall < 1000; fall++) {
      const placed: Placed[] = []
      for (const item of ITEMS) {
        const heading = (110 + rand() * 40) * (Math.PI / 180)
        const from = { x: -350 - rand() * 80, z: 250 + rand() * 120 }
        const v = item.speed * (0.85 + rand() * 0.3)
        const fit = (p: FloorPoint) => {
          const c = toStage(p, item.rest, item.r)
          return fits(s.zone, c, c.r, placed, 10)
        }
        const spot = settleSpot({ from, heading, dist: (v * v) / (2 * item.mu * 11000), fit, rand, step: 8, tries: 10, spread: 22 })
        const c = toStage(spot, item.rest, item.r)
        expect(fits(s.zone, c, c.r, placed, 10)).toBe(true)
        placed.push(c)
      }
    }
  })
})

describe('settleSpot', () => {
  const open = () => true
  it('keeps the natural stop when it fits', () => {
    const p = settleSpot({ from: { x: 0, z: 0 }, heading: 0, dist: 100, fit: open, rand: Math.random, step: 8, tries: 10, spread: 20 })
    expect(p.x).toBeCloseTo(100, 6)
    expect(p.z).toBeCloseTo(0, 6)
    expect(p.fallback).toBe(false)
  })

  it('shortens along the same direction before trying another', () => {
    const p = settleSpot({ from: { x: 0, z: 0 }, heading: 0, dist: 100, fit: (q) => q.x <= 60, rand: Math.random, step: 8, tries: 10, spread: 20 })
    expect(p.z).toBeCloseTo(0, 6)
    expect(p.x).toBeLessThanOrEqual(60)
    expect(p.x).toBeGreaterThan(50)
  })

  it('falls back to the nearest fitting point when no direction works', () => {
    const fit = (q: FloorPoint) => Math.hypot(q.x - 300, q.z - 300) < 20
    const p = settleSpot({ from: { x: 0, z: 0 }, heading: 0, dist: 50, fit, rand: Math.random, step: 8, tries: 4, spread: 10 })
    expect(p.fallback).toBe(true)
    expect(fit(p)).toBe(true)
    expect(fit(nearestFit({ x: 0, z: 0 }, fit))).toBe(true)
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
    expect(fits(z, { x: z.footprint[0].x + 20, y: z.footprint[2].y + 5 }, 20)).toBe(false)
  })
})
