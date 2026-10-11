// Measures the page: where the bag goes (.bag-anchor), the headline, the gutter and the first
// screen. Produces the frame→stage mapping, the camera in stage pixels, and the landing zone.

import { createCamera, type Camera, type Ray } from './camera.ts'
import { config } from './config.ts'
import type { Box, Contract, RotRect, Vec, Vec3 } from './types.ts'
import type { Zone } from './zone.ts'

export interface Layout {
  stageW: number
  stageH: number
  /** Frame pixels → stage pixels. */
  scale: number
  /** Stage position of frame pixel (0, 0). */
  origin: Vec
  /** Stage position of the world origin. */
  worldOrigin: Vec
  /** Bag body height in stage pixels. */
  bagH: number
  headline: Box | null
  zone: Zone
  camera: Camera
}

const relBox = (r: DOMRect, s: DOMRect): Box => ({ x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height })

export function frameToStage(l: Layout, p: Vec): Vec {
  return { x: l.origin.x + p.x * l.scale, y: l.origin.y + p.y * l.scale }
}

export function rectToStage(l: Layout, r: RotRect): RotRect {
  const c = frameToStage(l, { x: r.cx, y: r.cy })
  return { cx: c.x, cy: c.y, w: r.w * l.scale, h: r.h * l.scale, rot: r.rot }
}

/** World → stage pixels, with the stage scale at that point. */
export function project(l: Layout, p: Vec3): { x: number; y: number; scale: number } {
  const q = l.camera.project(p)
  return { x: l.worldOrigin.x + q.x * l.scale, y: l.worldOrigin.y + q.y * l.scale, scale: q.scale * l.scale }
}

/** Ray from the camera through a stage point. */
export function stageRay(l: Layout, p: Vec): Ray {
  return l.camera.ray((p.x - l.worldOrigin.x) / l.scale, (p.y - l.worldOrigin.y) / l.scale)
}

/** Stage point → the world point under it on the plane Y = height. */
export function unproject(l: Layout, p: Vec, height = 0): Vec3 | null {
  return l.camera.unprojectPlane((p.x - l.worldOrigin.x) / l.scale, (p.y - l.worldOrigin.y) / l.scale, height)
}

export function measure(stage: HTMLElement, anchor: HTMLElement, headlineEl: HTMLElement | null, c: Contract): Layout {
  const s = stage.getBoundingClientRect()
  const a = anchor.getBoundingClientRect()
  const ub = c.uprightBox
  const scale = a.height / ub.h
  const origin = { x: a.left - s.left - ub.x * scale, y: a.top - s.top - ub.y * scale }
  const worldOrigin = { x: origin.x + c.origin[0] * scale, y: origin.y + c.origin[1] * scale }

  const l = {
    stageW: s.width,
    stageH: s.height,
    scale,
    origin,
    worldOrigin,
    bagH: c.bodyHeight * scale,
    headline: headlineEl ? relBox(headlineEl.getBoundingClientRect(), s) : null,
    camera: createCamera(c.camera),
  } as Layout

  const gutter = parseFloat(getComputedStyle(stage).getPropertyValue('--gutter')) || 24
  // "First screen": the stage is the hero, but never count anything below the viewport.
  const firstScreen = Math.min(s.height, window.innerHeight)

  l.zone = {
    left: gutter,
    right: frameToStage(l, { x: ub.x + ub.w, y: 0 }).x,
    // The floor line through the tipping corner: nothing rests further back than the bag.
    back: worldOrigin.y,
    front: firstScreen - config.zoneFrontMargin,
    footprint: c.footprint.map(([x, z]) => project(l, { x, y: 0, z })),
    footprintPad: config.footprintPad,
    headline: l.headline,
  }
  return l
}
