// The single source of truth for the bag's 3D poses and every position derived from them.
// scripts/gen-placeholders.ts draws the SVGs from this and writes bag.json via buildContract().
// Pure data and math: no DOM, no Vite-only imports.
//
// The bag is a box standing on the floor, turned so its wide front face looks toward the
// viewer's left and its narrow side panel shows on the right. It tips over its front bottom
// edge, so its top falls toward the viewer's bottom-left and it ends up lying on its front.

import { createCamera, distanceFor, type CameraSpec } from './camera.ts'
import type { Box, Contract, Exit, FallFrame, Home, ItemId, ItemSpec, RightFrame, RotRect, Vec, Vec3 } from './types.ts'
import { ITEM_IDS } from './types.ts'

export const FRAME_SIZE: [number, number] = [1200, 1200]
export const FPS = 12

/** Frame pixel where the world origin projects. */
export const ORIGIN: Vec = { x: 680, y: 800 }

// ---------------------------------------------------------------------------
// Camera and light

export const TILT = 20
/** How much bigger things are at the bottom of the first screen than at the bag. */
export const NEAR_SCALE = 1.5
/** How far below the origin (frame pixels) the bottom of the first screen sits on the reference desktop layout. */
export const REF_BOTTOM_OFFSET = 900
export const CAMERA: CameraSpec = { distance: Math.round(distanceFor(NEAR_SCALE, TILT, REF_BOTTOM_OFFSET)), tilt: TILT }
export const camera = createCamera(CAMERA)

/** Light travels down, to the right and toward the viewer (from the top-left, 45° up). */
export const LIGHT: Vec3 = normalize({ x: 0.8, y: -1, z: 0.6 })

// ---------------------------------------------------------------------------
// The bag, in bag-local coordinates: a along the front face (to the left), b into the bag
// (away from the front face), c up. Origin = the near bottom corner (front face meets side).

export const BAG_W = 300
export const BAG_D = 160
export const BAG_H = 480
export const YAW = 30

const yaw = (YAW * Math.PI) / 180
/** Front face's outward normal: toward the viewer's left. Also the fall direction. */
export const N: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) }
/** Along the front bottom edge (to the right): the tipping axis. */
export const E: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) }

export interface Local {
  a: number
  b: number
  c: number
}

/** Bag-local → world, upright. */
export function localToWorld(l: Local): Vec3 {
  return {
    x: -E.x * l.a - N.x * l.b,
    y: l.c,
    z: -E.z * l.a - N.z * l.b,
  }
}

// ---------------------------------------------------------------------------
// Items

export const ITEM_SPECS: Record<ItemId, ItemSpec> = {
  tomato: {
    size: [128, 128],
    pivot: [64, 64],
    restHeight: 50,
    // A tomato is slightly flattened, so it settles stem-up, give or take a little tilt.
    restAngles: [[-20, 20]],
    hit: { type: 'circle', x: 0, y: 0, r: 54 },
    zone: { r: 50, offset: [0, 0] },
    shadow: { w: 96, offset: [0, 0], rotates: false },
    frames: { base: 'items/tomato.svg' },
  },
  radish: {
    size: [340, 340],
    pivot: [24, 170],
    restHeight: 30,
    // Lying on its side, leaves to the right or to the left.
    restAngles: [
      [-16, 16],
      [164, 196],
    ],
    hit: { type: 'capsule', ax: 16, ay: 0, bx: 250, by: 0, r: 36 },
    zone: { r: 70, offset: [140, 0] },
    shadow: { w: 250, offset: [130, 0], rotates: true },
    frames: {
      roll1: 'items/radish-roll-1.svg',
      roll2: 'items/radish-roll-2.svg',
      roll3: 'items/radish-roll-3.svg',
    },
  },
  banana: {
    size: [240, 240],
    pivot: [120, 120],
    restHeight: 40,
    // Lying flat, stem to the right or to the left.
    restAngles: [
      [-12, 12],
      [168, 192],
    ],
    hit: { type: 'capsule', ax: -92, ay: 0, bx: 92, by: 0, r: 48 },
    zone: { r: 72, offset: [0, 0] },
    shadow: { w: 190, offset: [0, 6], rotates: true },
    frames: { a: 'items/banana-a.svg', b: 'items/banana-b.svg' },
  },
}

/**
 * Where each faller sits in the upright bag (bag-local), its screen rotation there, and the
 * image it uses. Left → right on screen: radish, banana, tomato, then the baked milk and
 * scallions.
 */
export const HOMES_LOCAL: Record<ItemId, Local & { rot: number; scale: number; image: string }> = {
  // Tip deep inside, leaves leaning out past the left rim (the cucumber in the reference).
  radish: { a: 255, b: 70, c: 300, rot: -118, scale: 1, image: 'roll1' },
  // Stem up, slightly left.
  banana: { a: 196, b: 80, c: 505, rot: -98, scale: 1, image: 'a' },
  // Sitting on top, centre.
  tomato: { a: 118, b: 76, c: 515, rot: 0, scale: 1, image: 'base' },
}

/** Baked-in contents that never leave the bag (bag-local). */
export const MILK_LOCAL: Local & { w: number; h: number } = { a: 58, b: 104, c: 375, w: 78, h: 220 }
export const SCALLION_LOCAL: Local = { a: 14, b: 126, c: 300 }

/** Exit speeds (world units/s) along the bag's up axis. */
export const EXIT_SPEED: Record<ItemId, number> = { tomato: 1000, radish: 640, banana: 760 }

// ---------------------------------------------------------------------------
// Poses

export interface Pose {
  /** Degrees tipped over the front bottom edge (0 upright, 90 lying on its front). */
  tip: number
  /** Mouth flares open (0–1). */
  flare: number
  /** Rim crumple (0–1). */
  crumple: number
  /** Scallion leaves flop toward the floor (0–1). */
  flop: number
  /** Baked milk bottle slides toward the mouth (local units along c). */
  milk: number
  /** Fallers slide toward the mouth before they exit (local units along c). */
  slide: Partial<Record<ItemId, number>>
}

function pose(tip: number, p: Partial<Pose> = {}): Pose {
  return { tip, flare: 0, crumple: 0, flop: 0, milk: 0, slide: {}, ...p }
}

/** Pose 0: upright. Matches the layered upright-back / upright-front pair. */
export const POSE0 = pose(0)

/** Fall poses, index 1–10 (index 0 is POSE0). Slow start, then faster: real toppling. */
export const FALL_POSES: Pose[] = [
  POSE0,
  /* 1 teeter     */ pose(3, { slide: { tomato: 4 } }),
  /* 2 teeter     */ pose(8, { slide: { tomato: 10 }, flop: 0.05 }),
  /* 3 tip        */ pose(17, { slide: { tomato: 22, banana: 6 }, flop: 0.1 }),
  /* 4 tip        */ pose(32, { slide: { tomato: 40, banana: 14, radish: 6 }, flop: 0.2 }),
  /* 5 tip        */ pose(53, { slide: { tomato: 62, banana: 26, radish: 12 }, flop: 0.35 }),
  /* 6 tip        */ pose(77, { slide: { tomato: 86, banana: 40, radish: 22 }, flop: 0.55, milk: 10 }),
  /* 7 impact     */ pose(88, { flare: 1, crumple: 0.6, slide: { banana: 66, radish: 40 }, flop: 0.8, milk: 24 }),
  /* 8 settle     */ pose(90, { flare: 0.8, crumple: 0.75, slide: { radish: 84 }, flop: 0.95, milk: 34 }),
  /* 9 settle     */ pose(90, { flare: 0.6, crumple: 0.7, flop: 1, milk: 40 }),
  /* 10 rest      */ pose(90, { flare: 0.5, crumple: 0.7, flop: 1, milk: 40 }),
]

export const HOLDS: Record<number, number> = { 1: 2, 2: 2, 10: 2 }

/** Frame at which each faller leaves (drawn only in earlier frames). */
export const EXIT_FRAME: Record<ItemId, number> = { tomato: 7, banana: 8, radish: 9 }

/** Righting: rest, then back up through the tip frames; the upright layers finish it. */
export const RIGHT_SEQUENCE = [10, 6, 5, 4, 3, 2]

export const REST_ANGLE = -90

// ---------------------------------------------------------------------------
// Pose math

const RAD = Math.PI / 180

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/** Rotate a world vector about the tipping axis E by `deg` (positive tips the top toward N). */
export function tipVector(v: Vec3, deg: number): Vec3 {
  const t = deg * RAD
  const c = Math.cos(t)
  const s = Math.sin(t)
  const k = E
  const cross = { x: k.y * v.z - k.z * v.y, y: k.z * v.x - k.x * v.z, z: k.x * v.y - k.y * v.x }
  const dot = k.x * v.x + k.y * v.y + k.z * v.z
  return {
    x: v.x * c + cross.x * s + k.x * dot * (1 - c),
    y: v.y * c + cross.y * s + k.y * dot * (1 - c),
    z: v.z * c + cross.z * s + k.z * dot * (1 - c),
  }
}

/** Bag-local point → world, in a pose (the tipping axis passes through the origin). */
export function poseWorld(p: Pose, l: Local): Vec3 {
  return tipVector(localToWorld(l), p.tip)
}

/** World → frame pixels + scale. */
export function toFrame(w: Vec3): { x: number; y: number; scale: number } {
  const q = camera.project(w)
  return { x: ORIGIN.x + q.x, y: ORIGIN.y + q.y, scale: q.scale }
}

/** Screen angle of the bag's up axis in a pose (degrees, 0 = straight up, clockwise positive). */
export function bagScreenAngle(p: Pose): number {
  const a = toFrame(poseWorld(p, { a: BAG_W / 2, b: BAG_D / 2, c: 0 }))
  const b = toFrame(poseWorld(p, { a: BAG_W / 2, b: BAG_D / 2, c: BAG_H }))
  return Math.atan2(b.x - a.x, -(b.y - a.y)) / RAD
}

/** Where a faller is drawn in a pose: world pivot, frame pixels, scale, screen rotation. */
export function bakedItem(id: ItemId, p: Pose) {
  const h = HOMES_LOCAL[id]
  const world = poseWorld(p, { a: h.a, b: h.b, c: h.c + (p.slide[id] ?? 0) })
  const f = toFrame(world)
  return { world, x: f.x, y: f.y, scale: f.scale * h.scale, rot: h.rot + bagScreenAngle(p) }
}

/** Is the faller still inside the bag (and so baked into) fall frame f? */
export function isBaked(id: ItemId, f: number): boolean {
  return f < EXIT_FRAME[id]
}

/** Exit = the faller's world position one tick past its last baked frame, with its velocity. */
export function exitFor(id: ItemId): Exit {
  const f = EXIT_FRAME[id]
  const prev = FALL_POSES[f - 1]
  const b = bakedItem(id, prev)
  const dir = tipVector({ x: 0, y: 1, z: 0 }, prev.tip)
  const v = { x: dir.x * EXIT_SPEED[id], y: dir.y * EXIT_SPEED[id], z: dir.z * EXIT_SPEED[id] }
  return {
    frame: f,
    x: round(b.world.x + v.x / FPS),
    y: round(b.world.y + v.y / FPS),
    z: round(b.world.z + v.z / FPS),
    vx: round(v.x),
    vy: round(v.y),
    vz: round(v.z),
    rot: round(b.rot),
    image: ITEM_SPECS[id].frames[HOMES_LOCAL[id].image],
  }
}

/** The bag box's 8 corners (local). */
export const BOX_CORNERS: Local[] = [0, BAG_W].flatMap((a) =>
  [0, BAG_D].flatMap((b) => [0, BAG_H].map((c) => ({ a, b, c }))),
)

/** Bounding box (frame px) of a set of frame points, padded. */
function bounds(pts: Vec[], pad = 0): Box {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x: round(x), y: round(y), w: round(Math.max(...xs) + pad - x), h: round(Math.max(...ys) + pad - y) }
}

/** Frame-pixel points that outline what's drawn in a pose (box, handles, contents). */
export function poseOutline(p: Pose, withFallers: boolean): Vec[] {
  const pts: Vec[] = BOX_CORNERS.map((c) => toFrame(poseWorld(p, c)))
  // Handles reach ~100 above the rim.
  for (const a of [70, 230]) for (const b of [0, BAG_D]) pts.push(toFrame(poseWorld(p, { a, b, c: BAG_H + 100 })))
  if (withFallers) {
    for (const id of ITEM_IDS) {
      const it = bakedItem(id, p)
      const spec = ITEM_SPECS[id]
      const reach = Math.hypot(spec.size[0] - spec.pivot[0], spec.size[1] - spec.pivot[1]) * it.scale * 0.8
      const ang = (it.rot * Math.PI) / 180
      pts.push({ x: it.x + Math.cos(ang) * reach, y: it.y + Math.sin(ang) * reach }, { x: it.x, y: it.y })
    }
  }
  // Scallion leaves hang ~140 past the right rim.
  pts.push(toFrame(poseWorld(p, { a: -120, b: SCALLION_LOCAL.b, c: BAG_H + 120 })))
  return pts
}

/** Convex hull of world points seen from above (X, Z), counter-clockwise. */
function hullXZ(ws: Vec3[]): { x: number; z: number }[] {
  const ps = ws.map((w) => ({ x: w.x, z: w.z })).sort((a, b) => a.x - b.x || a.z - b.z)
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lower: { x: number; z: number }[] = []
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: { x: number; z: number }[] = []
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function rectFrom(b: Box): RotRect {
  return { cx: round(b.x + b.w / 2), cy: round(b.y + b.h / 2), w: b.w, h: b.h, rot: 0 }
}

/** Screen angle (deg, y down) from the origin to the mouth centre. */
function mouthAngle(p: Pose): number {
  const m = toFrame(poseWorld(p, { a: BAG_W / 2, b: BAG_D / 2, c: BAG_H }))
  return Math.atan2(m.y - ORIGIN.y, m.x - ORIGIN.x) / RAD
}

const pad2 = (n: number) => String(n).padStart(2, '0')
export const fallSrc = (f: number) => `bag/fall/${pad2(f)}.svg`
export const fallEmptySrc = (f: number) => `bag/fall-empty/${pad2(f)}.svg`
export const shadowSrc = (f: number) => `bag/shadow/${pad2(f)}.svg`

export function round(n: number): number {
  return Math.round(n * 10) / 10
}

export function buildContract(): Contract {
  const fall: FallFrame[] = []
  for (let f = 1; f < FALL_POSES.length; f++) {
    fall.push({
      f,
      src: fallSrc(f),
      empty: fallEmptySrc(f),
      shadow: shadowSrc(f),
      hold: HOLDS[f] ?? 1,
      angle: -FALL_POSES[f].tip,
    })
  }
  const right: RightFrame[] = RIGHT_SEQUENCE.map((f) => ({
    f,
    src: fallEmptySrc(f),
    shadow: shadowSrc(f),
    angle: -FALL_POSES[f].tip,
  }))

  const exits = {} as Record<ItemId, Exit>
  const homes = {} as Record<ItemId, Home>
  for (const id of ITEM_IDS) {
    exits[id] = exitFor(id)
    const h = HOMES_LOCAL[id]
    const b = bakedItem(id, POSE0)
    homes[id] = {
      x: round(b.world.x),
      y: round(b.world.y),
      z: round(b.world.z),
      rot: h.rot,
      scale: h.scale,
      image: ITEM_SPECS[id].frames[h.image],
    }
  }

  const rest = FALL_POSES.at(-1)!
  const mouthC = localToWorld({ a: BAG_W / 2, b: BAG_D / 2, c: BAG_H })
  const rock = toFrame(poseWorld(POSE0, { a: 0, b: BAG_D, c: 0 }))
  const upBox = bounds(poseOutline(POSE0, true), 12)
  const restBox = bounds(BOX_CORNERS.map((c) => toFrame(poseWorld(rest, c))), 4)

  return {
    version: 2,
    frameSize: FRAME_SIZE,
    camera: CAMERA,
    origin: [ORIGIN.x, ORIGIN.y],
    rockPivot: [round(rock.x), round(rock.y)],
    light: [round(LIGHT.x * 1000) / 1000, round(LIGHT.y * 1000) / 1000, round(LIGHT.z * 1000) / 1000],
    fallDir: [round(N.x * 1000) / 1000, round(N.z * 1000) / 1000],
    bodyHeight: BAG_H,
    uprightBox: upBox,
    fps: FPS,
    upright: { back: 'bag/upright-back.svg', front: 'bag/upright-front.svg', shadow: shadowSrc(0) },
    fall,
    right,
    restAngle: REST_ANGLE,
    scrub: { up: round(mouthAngle(POSE0)), rest: round(mouthAngle(rest)) },
    exits,
    homes,
    mouth: {
      x: round(mouthC.x),
      z: round(mouthC.z),
      // Opening's extent along world X and Z (a yawed rectangle, approximated by its box).
      halfX: round((Math.abs(E.x) * BAG_W + Math.abs(N.x) * BAG_D) / 2),
      halfZ: round((Math.abs(E.z) * BAG_W + Math.abs(N.z) * BAG_D) / 2),
      rimY: BAG_H,
    },
    hitboxes: { upright: rectFrom(upBox), fallen: rectFrom(restBox) },
    footprint: hullXZ(BOX_CORNERS.map((c) => poseWorld(rest, c))).map((p) => [round(p.x), round(p.z)] as [number, number]),
    items: ITEM_SPECS,
  }
}
