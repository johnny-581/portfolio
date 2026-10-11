// The landing zone: where loose items are allowed to end up. Pure math; layout.ts measures
// the page and builds a Zone, everything here is in stage pixels.

import type { Box, Vec } from './types.ts'
import { circleHitsBox, inBox } from './hit.ts'

export interface Zone {
  left: number
  right: number
  /** The bag's base line. Nothing rests further back than this. */
  back: number
  /** Bottom of the first screen minus the margin (item radius is subtracted per item). */
  front: number
  /** Fallen bag footprint, already padded. */
  footprint: Box
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

export function fits(zone: Zone, p: Vec, r: number, placed: readonly Placed[] = [], gap = 0): boolean {
  if (p.x - r < zone.left || p.x + r > zone.right) return false
  if (p.y - r * BACK_DEPTH < zone.back || p.y + r > zone.front) return false
  if (circleHitsBox(p, r, zone.footprint)) return false
  if (zone.headline && inBox(p, zone.headline)) return false
  for (const o of placed) {
    if (Math.hypot(p.x - o.x, p.y - o.y) < r + o.r + gap) return false
  }
  return true
}

export interface LandingOptions {
  /** Roll origin on the floor, just past the fallen mouth. */
  mouth: Vec
  /** Bag body height in stage pixels. Distances are multiples of it. */
  bagH: number
  dist: [number, number]
  /** Launch fan in degrees (screen space: 180 = left, 90 = straight down). */
  fanMin: number
  fanMax: number
  r: number
  zone: Zone
  placed: readonly Placed[]
  rand: () => number
  step: number
  tries: number
  gap: number
  /** Hand-picked spot if nothing in the fan fits (it gets clamped into the zone). */
  fallback: Vec
}

export interface Landing extends Vec {
  /** True when nothing in the fan fit and the fallback spot was used. */
  fallback: boolean
}

/**
 * Later rounds widen the fan: first toward straight down, then a little past it. Narrow screens
 * leave no room to the left of the fallen mouth, so the items tumble forward instead.
 */
const WIDER_FANS = [90, 50]

/**
 * Simulate the throw, then check it: pick a direction and distance, and if the end point
 * doesn't fit, shorten along the same direction (as if it stopped early). Retry with a new
 * direction a few times (widening the fan toward straight down), then use the fallback.
 */
export function landingSpot(o: LandingOptions): Landing {
  const minD = o.dist[0] * o.bagH
  const maxD = o.dist[1] * o.bagH
  const rounds = [o.fanMin, ...WIDER_FANS.filter((f) => f < o.fanMin)]
  for (let i = 0; i < o.tries * rounds.length; i++) {
    const lo = rounds[Math.floor(i / o.tries)]
    const a = ((lo + (o.fanMax - lo) * o.rand()) * Math.PI) / 180
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    for (let d = minD + (maxD - minD) * o.rand(); d >= minD; d -= o.step) {
      const p = { x: o.mouth.x + dx * d, y: o.mouth.y + dy * d }
      if (fits(o.zone, p, o.r, o.placed, o.gap)) return { ...p, fallback: false }
    }
  }
  return { ...clampIntoZone(o.fallback, o.r, o.zone, o.placed, o.gap), fallback: true }
}

/** Nearest point that fits, searching outward in rings. Returns `p` if it already fits. */
export function clampIntoZone(p: Vec, r: number, zone: Zone, placed: readonly Placed[] = [], gap = 0): Vec {
  if (fits(zone, p, r, placed, gap)) return p
  const ringStep = 6
  const maxRing = 400
  for (let ring = 1; ring <= maxRing; ring++) {
    const rad = ring * ringStep
    const n = Math.min(64, Math.max(12, Math.round((2 * Math.PI * rad) / ringStep)))
    let best: Vec | null = null
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * rad, y: p.y + Math.sin(a) * rad }
      if (!fits(zone, q, r, placed, gap)) continue
      // Prefer forward (lower on screen) when tied: it reads as "rolled a bit further".
      const d = rad - q.y * 1e-3
      if (d < bestD) {
        bestD = d
        best = q
      }
    }
    if (best) return best
  }
  // Zone too small for this item: keep it inside the outer bounds at least.
  return {
    x: Math.min(zone.right - r, Math.max(zone.left + r, p.x)),
    y: Math.min(zone.front - r, Math.max(zone.back + r * BACK_DEPTH, p.y)),
  }
}
