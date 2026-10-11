// Motion helpers: springs, damped settle, curves, a seedable PRNG. Pure math.

import type { Vec } from './types.ts'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (t: number) => t * t * (3 - 2 * t)

export interface Spring {
  x: number
  v: number
}

/** Damped spring toward `target`. Substeps keep stiff springs stable at low frame rates. */
export function spring(s: Spring, target: number, dt: number, k: number, c: number): void {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    const a = k * (target - s.x) - c * s.v
    s.v += a * h
    s.x += s.v * h
  }
}

export const springAtRest = (s: Spring, target: number, eps = 0.01) =>
  Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10

/** Decaying wobble that starts at 0 and settles to 0. */
export function dampedSine(t: number, amp: number, freq: number, decay: number): number {
  if (t <= 0) return 0
  return amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t)
}

export function quadBezier(p0: Vec, c: Vec, p1: Vec, u: number): Vec {
  const a = (1 - u) * (1 - u)
  const b = 2 * (1 - u) * u
  const d = u * u
  return { x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y }
}

/** Arc length along a parametric curve, sampled once, queried by parameter. */
export function arcLengthTable(fn: (u: number) => Vec, samples = 48) {
  const lens = [0]
  let prev = fn(0)
  for (let i = 1; i <= samples; i++) {
    const p = fn(i / samples)
    lens.push(lens[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y))
    prev = p
  }
  const total = lens[samples]
  return {
    total,
    at(u: number): number {
      const f = clamp(u, 0, 1) * samples
      const i = Math.min(samples - 1, Math.floor(f))
      return lens[i] + (lens[i + 1] - lens[i]) * (f - i)
    },
  }
}

/** Small, fast, seedable PRNG (tests and the stress run use seeds). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `target` shifted by whole turns to be nearest `current` (no multi-turn spins). */
export function nearestTurn(target: number, current: number): number {
  return target + 360 * Math.round((current - target) / 360)
}

export const rand = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r()

/** The nearest angle to `deg` inside any of the ranges (any number of whole turns away). */
export function snapToRest(deg: number, ranges: readonly [number, number][]): number {
  let best = deg
  let bestD = Infinity
  for (const [a, b] of ranges) {
    const k = Math.round((deg - (a + b) / 2) / 360)
    for (const turn of [k - 1, k, k + 1]) {
      const lo = a + 360 * turn
      const hi = b + 360 * turn
      const v = Math.min(hi, Math.max(lo, deg))
      if (Math.abs(v - deg) < bestD) {
        bestD = Math.abs(v - deg)
        best = v
      }
    }
  }
  return best
}
