// Hit tests: circles, capsules and rotated rectangles. Pure math.

import type { Box, RotRect, Vec } from './types.ts'
import { rotate } from './poses.ts'

export function inCircle(p: Vec, c: Vec, r: number): boolean {
  return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= r * r
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

export function inCapsule(p: Vec, a: Vec, b: Vec, r: number): boolean {
  return distToSegment(p, a, b) <= r
}

/** Point in the rect's own (unrotated) frame, centered on it. */
function toRectLocal(p: Vec, r: RotRect): Vec {
  return rotate({ x: p.x - r.cx, y: p.y - r.cy }, -r.rot)
}

export function inRotRect(p: Vec, r: RotRect, pad = 0): boolean {
  const l = toRectLocal(p, r)
  return Math.abs(l.x) <= r.w / 2 + pad && Math.abs(l.y) <= r.h / 2 + pad
}

/** Distance from a point to the rect's edge (0 inside). */
export function distToRotRect(p: Vec, r: RotRect): number {
  const l = toRectLocal(p, r)
  const dx = Math.max(0, Math.abs(l.x) - r.w / 2)
  const dy = Math.max(0, Math.abs(l.y) - r.h / 2)
  return Math.hypot(dx, dy)
}

export function rotRectCorners(r: RotRect): Vec[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const v = rotate({ x: (sx * r.w) / 2, y: (sy * r.h) / 2 }, r.rot)
    return { x: r.cx + v.x, y: r.cy + v.y }
  })
}

export function rotRectAABB(r: RotRect): Box {
  const cs = rotRectCorners(r)
  const xs = cs.map((c) => c.x)
  const ys = cs.map((c) => c.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function circleHitsBox(c: Vec, r: number, b: Box): boolean {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w))
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h))
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r
}

export const inBox = (p: Vec, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
