// The drag surface: the floor curving smoothly up into a wall at the bag's depth, like a
// skate ramp seen from the side. A held item sits where the line from the camera through the
// cursor meets it, so it always stays under the cursor; dragging down slides it toward the
// viewer, dragging up past the bag's base lifts it instead of pushing it further back.
// Pure math: no DOM.

import type { Ray } from './camera.ts'
import type { Vec3 } from './types.ts'

export interface RampSpec {
  /** Height of the item's pivot when it slides along the floor (rest height + held lift). */
  base: number
  /** Depth of the wall (the bag's front plane). */
  wallZ: number
  /** Radius of the curve joining floor and wall. */
  radius: number
}

export type RampPart = 'floor' | 'curve' | 'wall'

export interface RampHit extends Vec3 {
  part: RampPart
}

/** Where a ray meets the ramp. The ramp is only defined in Y–Z; X follows the ray. */
export function rampPoint(ray: Ray, spec: RampSpec): RampHit {
  const { o, d } = ray
  const { base, wallZ, radius: R } = spec
  const at = (t: number, part: RampPart): RampHit => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, part })

  // Floor first: it's in front of everything else.
  if (d.y < 0) {
    const t = (base - o.y) / d.y
    if (o.z + d.z * t >= wallZ + R) return at(t, 'floor')
  }
  // Wall: above the curve.
  if (d.z < 0) {
    const t = (wallZ - o.z) / d.z
    if (o.y + d.y * t >= base + R) return at(t, 'wall')
  }
  // Curve: quarter circle centred at (y = base + R, z = wallZ + R), lower-back quadrant.
  const cy = base + R
  const cz = wallZ + R
  const py = o.y - cy
  const pz = o.z - cz
  const a = d.y * d.y + d.z * d.z
  const b = 2 * (py * d.y + pz * d.z)
  const c = py * py + pz * pz - R * R
  const disc = b * b - 4 * a * c
  if (a > 1e-12 && disc >= 0) {
    // The ray crosses the open (air) side first; the surface is where it leaves the circle.
    const t = (-b + Math.sqrt(disc)) / (2 * a)
    return at(t, 'curve')
  }
  // Grazing ray: fall back to the floor plane.
  const t = d.y < 0 ? (base - o.y) / d.y : 0
  return at(t, 'floor')
}
