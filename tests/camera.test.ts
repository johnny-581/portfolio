import { describe, expect, it } from 'vitest'
import { createCamera, distanceFor } from '../src/toy/camera.ts'

const tilt = 20
const cam = createCamera({ distance: distanceFor(1.25, tilt, 890), tilt })

describe('camera', () => {
  it('projects the Z = 0 plane at 1×, the origin at (0, 0)', () => {
    const o = cam.project({ x: 0, y: 0, z: 0 })
    expect(o.x).toBeCloseTo(0, 9)
    expect(o.y).toBeCloseTo(0, 9)
    expect(o.scale).toBeCloseTo(1, 9)
    expect(cam.floorScale(0)).toBeCloseTo(1, 9)
  })

  it('gives the requested near scale at the reference offset', () => {
    const p = cam.unprojectPlane(0, 890, 0)!
    expect(cam.project(p).scale).toBeCloseTo(1.25, 6)
  })

  it('round-trips screen → floor → screen', () => {
    for (const [x, y] of [
      [0, 10],
      [-300, 200],
      [420, 600],
      [-50, 880],
    ]) {
      const p = cam.unprojectPlane(x, y, 0)!
      expect(p.y).toBeCloseTo(0, 9)
      const back = cam.project(p)
      expect(back.x).toBeCloseTo(x, 6)
      expect(back.y).toBeCloseTo(y, 6)
    }
  })

  it('nearer things are bigger and move further on screen', () => {
    const near = cam.project({ x: 100, y: 0, z: 400 })
    const far = cam.project({ x: 100, y: 0, z: 0 })
    expect(near.scale).toBeGreaterThan(far.scale)
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x))
  })

  it('a lifted item rises less on screen the further away it is', () => {
    const rise = (z: number) => cam.project({ x: 0, y: 0, z }).y - cam.project({ x: 0, y: 100, z }).y
    expect(rise(400)).toBeGreaterThan(rise(0))
    expect(rise(0)).toBeGreaterThan(rise(-300))
  })

  it('floor circles look flattened by sin(tilt)', () => {
    expect(cam.floorAspect).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 9)
  })
})
