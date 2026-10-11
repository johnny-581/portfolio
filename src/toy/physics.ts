// World physics, closed form so any moment can be evaluated directly (and tested):
// a flight under gravity, small bounces, then a slide or roll that slows at a constant rate.
// Pure math: no DOM.

import type { Vec3 } from './types.ts'

/** Time for a body at height y0 moving up at vy to fall to height yEnd under gravity g. */
export function timeToHeight(y0: number, vy: number, g: number, yEnd: number): number {
  const dy = y0 - yEnd
  if (dy <= 0 && vy <= 0) return 0
  return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * dy))) / g
}

export interface Landing {
  /** Seconds until it touches down. */
  t: number
  p: Vec3
  /** Velocity at touchdown. */
  v: Vec3
}

/** Ballistic flight until the pivot reaches `restHeight`. */
export function flightLanding(p0: Vec3, v0: Vec3, g: number, restHeight: number): Landing {
  const t = timeToHeight(p0.y, v0.y, g, restHeight)
  return {
    t,
    p: { x: p0.x + v0.x * t, y: restHeight, z: p0.z + v0.z * t },
    v: { x: v0.x, y: v0.y - g * t, z: v0.z },
  }
}

export function flightAt(p0: Vec3, v0: Vec3, g: number, t: number): Vec3 {
  return { x: p0.x + v0.x * t, y: p0.y + v0.y * t - 0.5 * g * t * t, z: p0.z + v0.z * t }
}

/** How far something sliding at speed v travels before friction stops it. */
export function stoppingDistance(v: number, mu: number, g: number): number {
  return (v * v) / (2 * mu * g)
}

/** A slide or roll that covers exactly `dist` starting at speed `v` (constant deceleration). */
export interface Ground {
  v: number
  dist: number
  decel: number
  /** Seconds until it stops. */
  T: number
}

export function groundMotion(v: number, dist: number): Ground {
  if (dist <= 1e-6 || v <= 1e-6) return { v: 0, dist: 0, decel: 0, T: 0 }
  const decel = (v * v) / (2 * dist)
  return { v, dist, decel, T: v / decel }
}

/** Distance covered after t seconds (stops at dist). */
export function groundAt(g: Ground, t: number): number {
  if (g.T <= 0) return 0
  const k = Math.min(t, g.T)
  return Math.min(g.dist, g.v * k - 0.5 * g.decel * k * k)
}

/** Small bounces after touchdown: vertical speed `vy` (downward, positive), restitution `e`. */
export interface Bounces {
  /** Start times and launch speeds of each hop, relative to touchdown. */
  hops: { t0: number; v: number }[]
  end: number
}

export function bounces(vyDown: number, e: number, count: number, g: number): Bounces {
  const hops: { t0: number; v: number }[] = []
  let v = Math.abs(vyDown) * e
  let t = 0
  for (let i = 0; i < count && v > 30; i++) {
    hops.push({ t0: t, v })
    t += (2 * v) / g
    v *= e
  }
  return { hops, end: t }
}

/** Height above rest during the bounces, t relative to touchdown. */
export function bounceHeight(b: Bounces, g: number, t: number): number {
  for (const h of b.hops) {
    const k = t - h.t0
    const dur = (2 * h.v) / g
    if (k >= 0 && k <= dur) return h.v * k - 0.5 * g * k * k
  }
  return 0
}

export function capSpeed(v: Vec3, max: number): Vec3 {
  const s = Math.hypot(v.x, v.y, v.z)
  if (s <= max || s === 0) return v
  const k = max / s
  return { x: v.x * k, y: v.y * k, z: v.z * k }
}
