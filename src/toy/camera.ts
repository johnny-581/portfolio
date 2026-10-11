// The one camera the generator draws through and the runtime projects through.
// World: origin at the bag's tipping corner on the floor, X right, Y up, Z toward the viewer.
// 1 unit = 1 frame pixel at Z = 0. The camera looks at the origin from `distance`, tilted
// down by `tilt`; its focal length equals `distance`, so anything at Z = 0 projects at 1×.
// Pure math: no DOM.

import type { Vec3 } from './types.ts'

export interface CameraSpec {
  /** World units from the camera to the origin. */
  distance: number
  /** Degrees the camera looks down. */
  tilt: number
}

export interface Projected {
  /** Frame pixels relative to where the origin projects. */
  x: number
  y: number
  /** Size multiplier at that point (1 at Z = 0). */
  scale: number
}

export interface Ray {
  o: Vec3
  d: Vec3
}

export interface Camera {
  readonly spec: CameraSpec
  /** sin(tilt): how flat a floor circle looks (height / width). */
  readonly floorAspect: number
  readonly position: Vec3
  project(p: Vec3): Projected
  /** Ray from the camera through a screen offset (frame pixels relative to the origin). */
  ray(x: number, y: number): Ray
  /** Where the ray through a screen offset meets the plane Y = height (null above the horizon). */
  unprojectPlane(x: number, y: number, height?: number): Vec3 | null
  /** Scale of a floor point at depth z. */
  floorScale(z: number): number
}

export function createCamera(spec: CameraSpec): Camera {
  const D = spec.distance
  const s = Math.sin((spec.tilt * Math.PI) / 180)
  const c = Math.cos((spec.tilt * Math.PI) / 180)
  const C: Vec3 = { x: 0, y: D * s, z: D * c }

  const project = (p: Vec3): Projected => {
    const dx = p.x - C.x
    const dy = p.y - C.y
    const dz = p.z - C.z
    // Camera basis: forward (0, -s, -c), up (0, c, -s), right (1, 0, 0).
    const zc = -s * dy - c * dz
    const yc = c * dy - s * dz
    const k = D / zc
    return { x: dx * k, y: -yc * k, scale: k }
  }

  const ray = (x: number, y: number): Ray => {
    const d = { x, y: -y * c - D * s, z: y * s - D * c }
    const len = Math.hypot(d.x, d.y, d.z)
    return { o: C, d: { x: d.x / len, y: d.y / len, z: d.z / len } }
  }

  return {
    spec,
    floorAspect: s,
    position: C,
    project,
    ray,
    unprojectPlane(x, y, height = 0) {
      const r = ray(x, y)
      if (r.d.y >= 0) return null
      const t = (height - r.o.y) / r.d.y
      return { x: r.o.x + r.d.x * t, y: height, z: r.o.z + r.d.z * t }
    },
    floorScale(z) {
      return D / (D - z * c)
    },
  }
}

/**
 * Camera distance that gives `nearScale` at a floor point `offsetY` frame pixels below the
 * origin (the bottom of the first screen on the reference layout).
 */
export function distanceFor(nearScale: number, tilt: number, offsetY: number): number {
  // Floor: scale = D / (D − z·cos), y = D·z·sin / (D − z·cos)  ⇒  y = (scale − 1)·D·tan
  return offsetY / ((nearScale - 1) * Math.tan((tilt * Math.PI) / 180))
}
