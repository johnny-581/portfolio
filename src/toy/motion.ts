// Motion helpers: springs, easings, damped wobble, hops, curves. Pure math.

import type { Vec } from './types.ts'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
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

/** Ease from 0→1 that starts at normalized speed m0 (so a handoff keeps its velocity) and ends at rest. */
export function hermite01(t: number, m0: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2)
}

export function hermite01Deriv(t: number, m0: number): number {
  return (3 * t * t - 4 * t + 1) * m0 + (-6 * t * t + 6 * t)
}

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

export function quadBezierDeriv(p0: Vec, c: Vec, p1: Vec, u: number): Vec {
  return {
    x: 2 * (1 - u) * (c.x - p0.x) + 2 * u * (p1.x - c.x),
    y: 2 * (1 - u) * (c.y - p0.y) + 2 * u * (p1.y - c.y),
  }
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

/**
 * Height above the floor over time: a fall from h0 with upward speed vh0, then `hops`
 * smaller bounces. Closed form, so any time can be evaluated directly.
 */
export function hopProfile(h0: number, vh0: number, g: number, hops: number, restitution: number) {
  interface Seg {
    t0: number
    h0: number
    v0: number
    t1: number
  }
  const segs: Seg[] = []
  // Initial flight: h0 + v t - g t²/2 = 0
  const t1 = (vh0 + Math.sqrt(Math.max(0, vh0 * vh0 + 2 * g * Math.max(0, h0)))) / g
  segs.push({ t0: 0, h0: Math.max(0, h0), v0: vh0, t1 })
  let impact = Math.abs(vh0 - g * t1)
  let t = t1
  for (let i = 0; i < hops; i++) {
    const v = impact * restitution
    const dur = (2 * v) / g
    if (dur < 0.02) break
    segs.push({ t0: t, h0: 0, v0: v, t1: t + dur })
    t += dur
    impact = v
  }
  return {
    end: t,
    landTimes: segs.map((s) => s.t1),
    /** Apex time of each bounce after the first landing. */
    apexTimes: segs.slice(1).map((s) => s.t0 + s.v0 / g),
    height(time: number): number {
      for (const s of segs) {
        if (time <= s.t1) {
          const k = Math.max(0, time - s.t0)
          return Math.max(0, s.h0 + s.v0 * k - 0.5 * g * k * k)
        }
      }
      return 0
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
