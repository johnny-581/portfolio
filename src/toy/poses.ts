// The single source of truth for the bag's poses and every position derived from them.
// scripts/gen-placeholders.ts renders the SVGs from this and writes bag.json via buildContract().
// Pure data and math: no DOM, no Vite-only imports.

import type { Contract, Exit, FallFrame, Home, ItemId, ItemSpec, RightFrame, RotRect, Vec } from './types.ts'
import { ITEM_IDS } from './types.ts'

export const FRAME_SIZE: [number, number] = [1200, 1200]
export const FPS = 12

/** Tipping corner (bag-local origin) in frame pixels. */
export const PIVOT: Vec = { x: 720, y: 1040 }

// ---------------------------------------------------------------------------
// Bag geometry, bag-local: origin at the pivot, x right, y down (up = negative).
// 3/4 view: narrow side panel on the left, wide front face on the right.

export const BODY_H = 480

export const BAG = {
  A: { x: 0, y: 0 }, // side panel, bottom-left (the pivot)
  B: { x: 100, y: 8 }, // near bottom corner (side meets front)
  E: { x: 410, y: -6 }, // front face, bottom-right (rocking corner)
  F: { x: 410, y: -486 }, // front face, top-right
  C: { x: 100, y: -472 }, // near top corner
  D: { x: 0, y: -480 }, // side panel, top-left
  G: { x: 310, y: -494 }, // back wall, top-right
} as const

/** Upright bag + contents bounding box, bag-local. */
const UPRIGHT_BOX_LOCAL = { x: -100, y: -660, w: 590, h: 676 }

/** Front rim height at local x (the line C→F). Used to check what peeks over the rim. */
export function frontRimY(x: number): number {
  const t = (x - BAG.C.x) / (BAG.F.x - BAG.C.x)
  return BAG.C.y + (BAG.F.y - BAG.C.y) * t
}

// ---------------------------------------------------------------------------
// Items

export const ITEM_SPECS: Record<ItemId, ItemSpec> = {
  tomato: {
    size: [160, 160],
    pivot: [80, 80],
    hit: { type: 'circle', x: 0, y: 0, r: 66 },
    zone: { r: 62, offset: [0, 0] },
    shadow: { w: 118, h: 26, offset: [0, 56], rotates: false },
    frames: { base: 'items/tomato.svg', squash: 'items/tomato-squash.svg' },
    highlight: 'items/tomato-highlight.svg',
  },
  radish: {
    size: [360, 360],
    pivot: [30, 180],
    hit: { type: 'capsule', ax: 16, ay: 0, bx: 270, by: 0, r: 42 },
    zone: { r: 78, offset: [150, 0] },
    shadow: { w: 290, h: 30, offset: [150, 34], rotates: true },
    frames: {
      roll1: 'items/radish-roll-1.svg',
      roll2: 'items/radish-roll-2.svg',
      roll3: 'items/radish-roll-3.svg',
    },
  },
  banana: {
    size: [260, 260],
    pivot: [130, 130],
    hit: { type: 'capsule', ax: -96, ay: 0, bx: 96, by: 0, r: 52 },
    zone: { r: 82, offset: [0, 0] },
    shadow: { w: 210, h: 34, offset: [0, 40], rotates: true },
    frames: { a: 'items/banana-a.svg', b: 'items/banana-b.svg' },
  },
}

/** Where each faller sits in the upright bag (bag-local), and the image it uses there. */
export const HOMES_LOCAL: Record<ItemId, { x: number; y: number; rot: number; scale: number; image: string }> = {
  // Tip deep inside, leaning out past the right edge above the rim (the cucumber in the reference).
  radish: { x: 300, y: -310, rot: -62, scale: 1, image: 'roll1' },
  // Sitting on top, center.
  tomato: { x: 215, y: -505, rot: 0, scale: 1, image: 'base' },
  // Front-right, stem up over the rim.
  banana: { x: 305, y: -540, rot: -76, scale: 1, image: 'a' },
}

/** Baked-in contents that never leave the bag (bag-local). */
export const MILK_LOCAL = { x: 122, y: -450, w: 86, h: 240 }
export const SCALLION_LOCAL = { x: 40, y: -380 }

/** Exit speeds in frame px/s along the bag's mouth direction. */
export const EXIT_SPEED: Record<ItemId, number> = { tomato: 1100, radish: 700, banana: 800 }

// ---------------------------------------------------------------------------
// Poses

export interface Pose {
  /** Degrees. Negative tips forward-left around PIVOT, positive leans back around the rocking corner. */
  angle: number
  /** Squash in bag-local axes, about the pivot. */
  sx: number
  sy: number
  /** Mouth flares open (0–1). */
  flare: number
  /** Rim crumple (0–1). */
  crumple: number
  /** Scallion leaves flop toward the floor (0–1). */
  flop: number
  /** Baked milk bottle slides toward the mouth (bag-local px). */
  milk: number
  /** Fallers slide toward the mouth before they exit (bag-local px). */
  slide: Partial<Record<ItemId, number>>
}

function pose(angle: number, p: Partial<Pose> = {}): Pose {
  return { angle, sx: 1, sy: 1, flare: 0, crumple: 0, flop: 0, milk: 0, slide: {}, ...p }
}

/** Pose 0: neutral upright. Matches the layered upright-back/upright-front pair. */
export const POSE0 = pose(0)

/** Fall poses, index 1–12 (index 0 is POSE0). */
export const FALL_POSES: Pose[] = [
  POSE0,
  /* 1 wind-up    */ pose(3, { sy: 0.98 }),
  /* 2 tip starts */ pose(-5),
  /* 3            */ pose(-10, { flop: 0.05 }),
  /* 4 tomato up  */ pose(-20, { slide: { tomato: 25 }, flop: 0.1 }),
  /* 5            */ pose(-35, { slide: { tomato: 45, banana: 10 }, flop: 0.2 }),
  /* 6 blur       */ pose(-55, { sx: 0.97, sy: 1.04, slide: { tomato: 70, banana: 20, radish: 10 }, flop: 0.3 }),
  /* 7 impact     */ pose(-90, { sy: 0.94, flare: 1, crumple: 0.6, slide: { banana: 40, radish: 25 }, flop: 0.6, milk: 20 }),
  /* 8 squash     */ pose(-90, { sy: 0.9, flare: 0.9, crumple: 0.8, slide: { banana: 70, radish: 45 }, flop: 0.8, milk: 35 }),
  /* 9 rebound    */ pose(-84, { sy: 0.98, flare: 0.7, crumple: 0.7, slide: { radish: 75 }, flop: 0.9, milk: 45 }),
  /* 10 drops     */ pose(-90, { flare: 0.6, crumple: 0.7, flop: 1, milk: 50 }),
  /* 11 bounce    */ pose(-87, { flare: 0.5, crumple: 0.7, flop: 1, milk: 50 }),
  /* 12 rest      */ pose(-90, { flare: 0.5, crumple: 0.7, flop: 1, milk: 50 }),
]

export const HOLDS: Record<number, number> = { 1: 2, 12: 2 }

/** Righting in-between: rest → 55°, nothing left inside to slide back. */
export const POSE_L1 = pose(-70, { flare: 0.25, crumple: 0.35, flop: 0.6, milk: 25 })

/** Frame at which each faller leaves (drawn only in earlier frames). */
export const EXIT_FRAME: Record<ItemId, number> = { tomato: 7, banana: 9, radish: 10 }

export const RIGHT_SEQUENCE: (number | 'L1')[] = [12, 'L1', 6, 5, 4, 3, 2]

export const REST_ANGLE = -90

// ---------------------------------------------------------------------------
// Pose math

const RAD = Math.PI / 180

export function rotate(v: Vec, deg: number): Vec {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

/** Rotation origin for an angle, bag-local (after squash). */
export function rotationOrigin(p: Pose): Vec {
  return p.angle > 0 ? { x: BAG.E.x * p.sx, y: BAG.E.y * p.sy } : { x: 0, y: 0 }
}

/** Bag-local point → bag-local point under a pose (still relative to the pivot). */
export function poseLocal(p: Pose, local: Vec): Vec {
  const q = { x: local.x * p.sx, y: local.y * p.sy }
  const o = rotationOrigin(p)
  const r = rotate({ x: q.x - o.x, y: q.y - o.y }, p.angle)
  return { x: r.x + o.x, y: r.y + o.y }
}

/** Bag-local point → frame pixels under a pose. */
export function poseApply(p: Pose, local: Vec): Vec {
  const l = poseLocal(p, local)
  return { x: PIVOT.x + l.x, y: PIVOT.y + l.y }
}

/** Where a faller is drawn (its pivot, in frame pixels) in a given pose. */
export function bakedItem(id: ItemId, p: Pose): { x: number; y: number; rot: number; scale: number } {
  const h = HOMES_LOCAL[id]
  const slide = p.slide[id] ?? 0
  const pos = poseApply(p, { x: h.x, y: h.y - slide })
  return { x: pos.x, y: pos.y, rot: h.rot + p.angle, scale: h.scale }
}

/** Is the faller still inside the bag (and so baked into) fall frame f? */
export function isBaked(id: ItemId, f: number): boolean {
  return f < EXIT_FRAME[id]
}

/** Exit = position in the frame before the exit frame, carried one tick along its velocity. */
export function exitFor(id: ItemId): Exit {
  const f = EXIT_FRAME[id]
  const prev = FALL_POSES[f - 1]
  const b = bakedItem(id, prev)
  const dir = rotate({ x: 0, y: -1 }, prev.angle)
  const vx = dir.x * EXIT_SPEED[id]
  const vy = dir.y * EXIT_SPEED[id]
  const spec = ITEM_SPECS[id]
  return {
    frame: f,
    x: round(b.x + vx / FPS),
    y: round(b.y + vy / FPS),
    rot: round(b.rot),
    vx: round(vx),
    vy: round(vy),
    image: spec.frames[HOMES_LOCAL[id].image],
  }
}

function rotRectFromLocal(p: Pose, cx: number, cy: number, w: number, h: number): RotRect {
  const c = poseApply(p, { x: cx, y: cy })
  return { cx: round(c.x), cy: round(c.y), w, h, rot: p.angle }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
export const fallSrc = (f: number) => `bag/fall/${pad2(f)}.svg`
export const fallEmptySrc = (f: number) => `bag/fall-empty/${pad2(f)}.svg`

function round(n: number): number {
  return Math.round(n * 10) / 10
}

export function buildContract(): Contract {
  const fall: FallFrame[] = []
  for (let f = 1; f <= 12; f++) {
    fall.push({ f, src: fallSrc(f), empty: fallEmptySrc(f), hold: HOLDS[f] ?? 1, angle: FALL_POSES[f].angle })
  }
  const right: RightFrame[] = RIGHT_SEQUENCE.map((f) =>
    f === 'L1'
      ? { f, src: 'bag/right/L1.svg', angle: POSE_L1.angle }
      : { f, src: fallEmptySrc(f), angle: FALL_POSES[f].angle },
  )

  const exits = {} as Record<ItemId, Exit>
  const homes = {} as Record<ItemId, Home>
  for (const id of ITEM_IDS) {
    exits[id] = exitFor(id)
    const h = HOMES_LOCAL[id]
    const b = bakedItem(id, POSE0)
    homes[id] = { x: b.x, y: b.y, rot: h.rot, scale: h.scale, image: ITEM_SPECS[id].frames[h.image] }
  }

  const rest = FALL_POSES[12]
  const mouthLocal = {
    x: (BAG.D.x + BAG.G.x + BAG.F.x + BAG.C.x) / 4,
    y: (BAG.D.y + BAG.G.y + BAG.F.y + BAG.C.y) / 4,
  }
  const mouthUp = poseApply(POSE0, mouthLocal)
  const mouthFallen = poseApply(rest, mouthLocal)

  return {
    version: 1,
    frameSize: FRAME_SIZE,
    pivot: [PIVOT.x, PIVOT.y],
    rockPivot: [PIVOT.x + BAG.E.x, PIVOT.y + BAG.E.y],
    bodyHeight: BODY_H,
    uprightBox: {
      x: PIVOT.x + UPRIGHT_BOX_LOCAL.x,
      y: PIVOT.y + UPRIGHT_BOX_LOCAL.y,
      w: UPRIGHT_BOX_LOCAL.w,
      h: UPRIGHT_BOX_LOCAL.h,
    },
    fps: FPS,
    upright: { back: 'bag/upright-back.svg', front: 'bag/upright-front.svg' },
    fall,
    right,
    restAngle: REST_ANGLE,
    exits,
    homes,
    mouth: {
      upright: { x: round(mouthUp.x), y: round(mouthUp.y), w: BAG.F.x - BAG.D.x },
      // Roll origin: on the floor line, just past the fallen mouth.
      fallen: { x: round(mouthFallen.x - 10), y: PIVOT.y },
    },
    hitboxes: {
      // Body plus everything poking out of it, so a bump on the produce counts.
      upright: rotRectFromLocal(POSE0, 195, -322, 590, 676),
      // Body only, lying on its side.
      fallen: rotRectFromLocal(rest, 205, -243, 410, 490),
    },
    items: ITEM_SPECS,
  }
}
