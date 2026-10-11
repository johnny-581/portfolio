// Shared types for the art contract (public/art/bag.json) and the toy runtime.
// Pure types only: imported by the app, the generator script and the tests.

export type ItemId = 'tomato' | 'radish' | 'banana'

/** In-bag stacking order, back → front. */
export const ITEM_IDS: readonly ItemId[] = ['radish', 'tomato', 'banana']

export interface Vec {
  x: number
  y: number
}

/** World point or vector: X right, Y up, Z toward the viewer. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Rectangle of size w×h centered on (cx, cy), rotated `rot` degrees (clockwise, y down). */
export interface RotRect {
  cx: number
  cy: number
  w: number
  h: number
  rot: number
}

/** Hit shapes are in item-local frame pixels, relative to the item's pivot. */
export type HitShape =
  | { type: 'circle'; x: number; y: number; r: number }
  | { type: 'capsule'; ax: number; ay: number; bx: number; by: number; r: number }

export interface ItemSpec {
  /** Canvas size in frame pixels. */
  size: [number, number]
  /** Rotation/scale origin inside the canvas. Center for most items, the tip for the radish. */
  pivot: [number, number]
  hit: HitShape
  /** Circle used by the landing zone and overlap checks, offset from the pivot in item-local pixels. */
  zone: { r: number; offset: [number, number] }
  /** Soft ellipse under the item. `rotates` = follows the item's rotation (long items). */
  shadow: { w: number; h: number; offset: [number, number]; rotates: boolean }
  /** Named images for this item. tomato: base, squash · radish: roll1–3 · banana: a, b */
  frames: Record<string, string>
  /** Gloss layer that follows position and scale but never rotation (tomato). */
  highlight?: string
}

export interface FallFrame {
  f: number
  src: string
  /** Same pose without the fallers, used while righting. */
  empty: string
  hold: number
  /** Nominal bag angle in degrees (negative = tipped forward-left). */
  angle: number
}

export interface RightFrame {
  f: number | string
  src: string
  angle: number
}

export interface Exit {
  frame: number
  x: number
  y: number
  rot: number
  /** Frame pixels per second. */
  vx: number
  vy: number
  /** Image the loose sprite starts with. */
  image: string
}

export interface Home {
  x: number
  y: number
  rot: number
  scale: number
  /** Image shown while the item sits in the bag. */
  image: string
}

export interface Contract {
  version: 1
  frameSize: [number, number]
  /** Tipping corner for negative angles (forward-left). */
  pivot: [number, number]
  /** Rocking corner for positive angles (leaning back). */
  rockPivot: [number, number]
  /** Height of the bag body in frame pixels; landing distances are multiples of it. */
  bodyHeight: number
  /** Bounding box of the upright bag + contents; mapped onto the page's .bag-anchor. */
  uprightBox: Box
  fps: number
  upright: { back: string; front: string }
  fall: FallFrame[]
  right: RightFrame[]
  restAngle: number
  exits: Record<ItemId, Exit>
  homes: Record<ItemId, Home>
  mouth: { upright: { x: number; y: number; w: number }; fallen: { x: number; y: number } }
  hitboxes: { upright: RotRect; fallen: RotRect }
  items: Record<ItemId, ItemSpec>
}
