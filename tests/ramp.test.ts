import { describe, expect, it } from 'vitest'
import { createCamera, distanceFor } from '../src/toy/camera.ts'
import { rampPoint, type RampSpec } from '../src/toy/ramp.ts'

const cam = createCamera({ distance: distanceFor(1.25, 20, 890), tilt: 20 })
const spec: RampSpec = { base: 60, wallZ: 0, radius: 72 }

/** Cursor offsets from far above the bag down to the bottom of the first screen. */
const sweep = Array.from({ length: 400 }, (_, i) => -700 + i * 4)

describe('drag ramp', () => {
  it('always projects back to the cursor', () => {
    for (const y of sweep) {
      for (const x of [-400, 0, 250]) {
        const p = rampPoint(cam.ray(x, y), spec)
        const back = cam.project(p)
        expect(back.x).toBeCloseTo(x, 4)
        expect(back.y).toBeCloseTo(y, 4)
      }
    }
  })

  it('goes floor → curve → wall as the cursor moves up, with no jumps', () => {
    const pts = sweep.map((y) => rampPoint(cam.ray(0, y), spec)).reverse()
    expect(pts[0].part).toBe('floor')
    expect(pts.at(-1)!.part).toBe('wall')
    expect(pts.some((p) => p.part === 'curve')).toBe(true)
    for (let i = 1; i < pts.length; i++) {
      const step = Math.hypot(pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z)
      expect(step).toBeLessThan(40)
    }
  })

  it('is smooth: the direction of travel never turns sharply', () => {
    const pts = sweep.map((y) => rampPoint(cam.ray(0, y), spec)).reverse()
    for (let i = 2; i < pts.length; i++) {
      const a = { y: pts[i - 1].y - pts[i - 2].y, z: pts[i - 1].z - pts[i - 2].z }
      const b = { y: pts[i].y - pts[i - 1].y, z: pts[i].z - pts[i - 1].z }
      const la = Math.hypot(a.y, a.z)
      const lb = Math.hypot(b.y, b.z)
      if (la < 1e-6 || lb < 1e-6) continue
      const cos = (a.y * b.y + a.z * b.z) / (la * lb)
      expect(cos).toBeGreaterThan(Math.cos((20 * Math.PI) / 180))
    }
  })

  it('freezes depth on the wall and floor height on the floor', () => {
    const wall = rampPoint(cam.ray(0, -600), spec)
    expect(wall.part).toBe('wall')
    expect(wall.z).toBeCloseTo(0, 6)
    expect(cam.project(wall).scale).toBeCloseTo(cam.project({ x: 0, y: 300, z: 0 }).scale, 1)
    const floor = rampPoint(cam.ray(0, 500), spec)
    expect(floor.part).toBe('floor')
    expect(floor.y).toBeCloseTo(60, 6)
  })
})
