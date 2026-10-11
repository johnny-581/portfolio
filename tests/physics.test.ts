import { describe, expect, it } from 'vitest'
import {
  bounceHeight,
  bounces,
  capSpeed,
  flightAt,
  flightLanding,
  groundAt,
  groundMotion,
  stoppingDistance,
} from '../src/toy/physics.ts'

const g = 11000

describe('physics', () => {
  it('a flight lands exactly at rest height, at the right time', () => {
    const p0 = { x: 0, y: 200, z: 0 }
    const v0 = { x: -300, y: 150, z: 400 }
    const land = flightLanding(p0, v0, g, 50)
    expect(land.p.y).toBe(50)
    const at = flightAt(p0, v0, g, land.t)
    expect(at.y).toBeCloseTo(50, 6)
    expect(at.x).toBeCloseTo(land.p.x, 6)
    expect(land.v.y).toBeLessThan(0)
  })

  it('a planned slide stops exactly on its distance and never goes back', () => {
    for (const [v, d] of [
      [800, 900],
      [300, 40],
      [1200, 1500],
    ]) {
      const m = groundMotion(v, d)
      expect(groundAt(m, m.T)).toBeCloseTo(d, 6)
      expect(groundAt(m, m.T + 5)).toBeCloseTo(d, 6)
      let prev = 0
      for (let t = 0; t <= m.T; t += m.T / 50) {
        const s = groundAt(m, t)
        expect(s).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = s
      }
    }
  })

  it('stopping distance follows v² / 2μg', () => {
    expect(stoppingDistance(600, 0.45, g)).toBeCloseTo((600 * 600) / (2 * 0.45 * g), 9)
  })

  it('a tomato bounces once, a radish not at all', () => {
    const tomato = bounces(900, 0.25, 1, g)
    expect(tomato.hops).toHaveLength(1)
    expect(bounceHeight(tomato, g, tomato.hops[0].v / g)).toBeGreaterThan(0)
    expect(bounceHeight(tomato, g, tomato.end + 0.1)).toBe(0)
    expect(bounces(900, 0, 1, g).hops).toHaveLength(0)
  })

  it('release speed is capped', () => {
    const v = capSpeed({ x: 3000, y: 400, z: -1000 }, 600)
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(600, 6)
    expect(capSpeed({ x: 10, y: 0, z: 0 }, 600)).toEqual({ x: 10, y: 0, z: 0 })
  })
})
