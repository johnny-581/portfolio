// Measures the page: where the bag goes (.bag-anchor), the headline, the gutter and the first
// screen. Produces the frame→stage mapping and the landing zone, all in stage pixels.

import { config } from './config.ts'
import { rotRectAABB } from './hit.ts'
import type { Box, Contract, RotRect, Vec } from './types.ts'
import type { Zone } from './zone.ts'

export interface Layout {
  stageW: number
  stageH: number
  /** Frame pixels → stage pixels. */
  scale: number
  /** Stage position of frame pixel (0, 0). */
  origin: Vec
  /** Bag body height in stage pixels (landing distances are multiples of it). */
  bagH: number
  headline: Box | null
  zone: Zone
}

const relBox = (r: DOMRect, s: DOMRect): Box => ({ x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height })

export function frameToStage(l: Layout, p: Vec): Vec {
  return { x: l.origin.x + p.x * l.scale, y: l.origin.y + p.y * l.scale }
}

export function rectToStage(l: Layout, r: RotRect): RotRect {
  const c = frameToStage(l, { x: r.cx, y: r.cy })
  return { cx: c.x, cy: c.y, w: r.w * l.scale, h: r.h * l.scale, rot: r.rot }
}

export function measure(stage: HTMLElement, anchor: HTMLElement, headlineEl: HTMLElement | null, c: Contract): Layout {
  const s = stage.getBoundingClientRect()
  const a = anchor.getBoundingClientRect()
  const ub = c.uprightBox
  const scale = a.height / ub.h
  const origin = { x: a.left - s.left - ub.x * scale, y: a.top - s.top - ub.y * scale }

  const base: Omit<Layout, 'zone'> = {
    stageW: s.width,
    stageH: s.height,
    scale,
    origin,
    bagH: c.bodyHeight * scale,
    headline: headlineEl ? relBox(headlineEl.getBoundingClientRect(), s) : null,
  }
  const l = base as Layout

  const gutter = parseFloat(getComputedStyle(stage).getPropertyValue('--gutter')) || 24
  // "First screen": the stage is the hero, but never count anything below the viewport.
  const firstScreen = Math.min(s.height, window.innerHeight)
  const pivot = frameToStage(l, { x: c.pivot[0], y: c.pivot[1] })
  const fallen = rotRectAABB(rectToStage(l, c.hitboxes.fallen))
  const pad = config.footprintPad

  l.zone = {
    left: gutter,
    right: frameToStage(l, { x: ub.x + ub.w, y: 0 }).x,
    back: pivot.y,
    front: firstScreen - config.zoneFrontMargin,
    footprint: { x: fallen.x - pad, y: fallen.y - pad, w: fallen.w + 2 * pad, h: fallen.h + 2 * pad },
    headline: l.headline,
  }
  return l
}

/** Depth factor relative to the bag: 1 at the bag's base line, larger toward the viewer. */
export function depthFactor(l: Layout, groundY: number): number {
  const t = Math.min(1, Math.max(0, (groundY - l.zone.back) / Math.max(1, l.zone.front - l.zone.back)))
  return (config.depthFar + (config.depthNear - config.depthFar) * t) / config.depthFar
}
