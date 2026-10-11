// The landing zone: where loose items may come to rest. The zone itself is measured on the
// page (stage pixels); landing spots are searched on the floor (world X, Z) and checked
// through a projection the caller supplies. Pure math.

import type { Box, Vec } from './types.ts'
import { circleHitsPolygon, inBox } from './hit.ts'

export interface Zone {
  left: number
  right: number
  /** The bag's base line. Nothing rests further back than this. */
  back: number
  /** Bottom of the first screen minus the margin (item radius is subtracted per item). */
  front: number
  /** Fallen bag's outline on the floor (stage pixels). */
  footprint: Vec[]
  /** Clearance kept around the footprint. */
  footprintPad: number
  /** Item centers can't land in here (items may still slide partly under the text). */
  headline: Box | null
}

export interface Placed {
  x: number
  y: number
  r: number
}

/** How far a circle's center must sit in front of the back line, as a fraction of its radius. */
const BACK_DEPTH = 0.35

/** Does an item's on-screen circle fit the zone, clear of the others? */
export function fits(zone: Zone, p: Vec, r: number, placed: readonly Placed[] = [], gap = 0): boolean {
  if (p.x - r < zone.left || p.x + r > zone.right) return false
  if (p.y - r * BACK_DEPTH < zone.back || p.y + r > zone.front) return false
  if (circleHitsPolygon(p, r + zone.footprintPad, zone.footprint)) return false
  if (zone.headline && inBox(p, zone.headline)) return false
  for (const o of placed) {
    if (Math.hypot(p.x - o.x, p.y - o.y) < r + o.r + gap) return false
  }
  return true
}

/** A point on the floor (world X, Z). */
export interface FloorPoint {
  x: number
  z: number
}

export interface SpotOptions {
  /** Where it touches down. */
  from: FloorPoint
  /** Direction of travel on the floor, radians (atan2(z, x)). */
  heading: number
  /** How far friction would carry it. */
  dist: number
  /** Would the item fit, resting here? */
  fit: (p: FloorPoint) => boolean
  rand: () => number
  /** Shortening step, world units. */
  step: number
  tries: number
  /** Degrees either side of the heading a deflected landing may take. */
  spread: number
}

export interface Spot extends FloorPoint {
  /** True when nothing along any tried direction fit and the nearest fitting point was used. */
  fallback: boolean
}

/** Straight down the screen, toward the viewer. */
const TOWARD_VIEWER = Math.PI / 2

/**
 * Where a sliding item comes to rest. Its own path first: if the natural stop doesn't fit,
 * shorten along the same direction (as if it stopped early). Then deflected directions
 * around the heading, widening toward the viewer (narrow screens leave no room to the side).
 * Last, the nearest fitting point.
 */
export function settleSpot(o: SpotOptions): Spot {
  const along = (h: number, d: number): Spot | null => {
    const steps = Math.floor(d / o.step)
    for (let i = 0; i <= steps + 1; i++) {
      const s = Math.max(0, d - i * o.step)
      const p = { x: o.from.x + Math.cos(h) * s, z: o.from.z + Math.sin(h) * s }
      if (o.fit(p)) return { ...p, fallback: false }
      if (s === 0) break
    }
    return null
  }
  const exact = along(o.heading, o.dist)
  if (exact) return exact

  const spread = (o.spread * Math.PI) / 180
  for (const w of [0, 0.5, 1]) {
    const center = o.heading + angleTo(o.heading, TOWARD_VIEWER) * w
    for (let i = 0; i < o.tries; i++) {
      const h = center + (o.rand() * 2 - 1) * spread
      // A deflected item may skid a little further than its own path allowed.
      const d = Math.max(o.dist, o.step * 8) * (0.6 + 0.6 * o.rand())
      const p = along(h, d)
      if (p) return p
    }
  }
  return { ...nearestFit(o.from, o.fit, o.step), fallback: true }
}

/** Signed shortest turn from angle a to angle b (radians). */
function angleTo(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

/** Nearest floor point that fits, searching outward in rings. Returns `p` if it already fits. */
export function nearestFit(p: FloorPoint, fit: (q: FloorPoint) => boolean, step = 8, maxRing = 300): FloorPoint {
  if (fit(p)) return p
  for (let ring = 1; ring <= maxRing; ring++) {
    const rad = ring * step
    const count = Math.min(64, Math.max(12, Math.round((2 * Math.PI * rad) / step)))
    let best: FloorPoint | null = null
    let bestScore = Infinity
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * rad, z: p.z + Math.sin(a) * rad }
      if (!fit(q)) continue
      // Prefer toward the viewer when tied: it reads as "rolled a bit further".
      const score = rad - q.z * 1e-3
      if (score < bestScore) {
        bestScore = score
        best = q
      }
    }
    if (best) return best
  }
  return p
}
