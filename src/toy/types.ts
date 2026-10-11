// Shared types for the art contract (public/art/bag.json) and the toy runtime.
// Pure types only: imported by the app, the generator script and the tests.

import type { CameraSpec } from './camera.ts'

export type ItemId = 'tomato' | 'radish' | 'banana'

/** In-bag stacking order, back → front. */
export const ITEM_IDS: readonly ItemId[] = ['radish', 'banana', 'tomato']

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
  /** Height of the pivot above the floor when the item lies still (world units). */
  restHeight: number
  /**
   * Screen rotations (degree ranges) the item can come to rest at: the stable ways it lies on
   * the floor. A roll ends on the nearest one (a radish lies on its side, a tomato sits stem-up
   * or on its side).
   */
  restAngles: [number, number][]
  hit: HitShape
  /** Circle used by the landing zone and overlap checks, offset from the pivot in item-local pixels. */
  zone: { r: number; offset: [number, number] }
  /** Floor shadow: width of the contact shadow, centred under `offset`; long items turn it with them. */
  shadow: { w: number; offset: [number, number]; rotates: boolean }
  /** Named images for this item. tomato: base · radish: roll1–3 · banana: a, b */
  frames: Record<string, string>
}

export interface FallFrame {
  f: number
  src: string
  /** Same pose without the fallers, used while righting. */
  empty: string
  /** Generated soft floor shadow for this pose. */
  shadow: string
  hold: number
  /** Nominal bag angle in degrees (0 upright, −90 lying). */
  angle: number
}

export interface RightFrame {
  f: number
  src: string
  shadow: string
  angle: number
}

export interface Exit {
  frame: number
  /** World position of the item's pivot one tick after its last baked frame. */
  x: number
  y: number
  z: number
  /** World velocity (units per second). */
  vx: number
  vy: number
  vz: number
  /** Screen rotation in degrees. */
  rot: number
  /** Image the loose sprite starts with. */
  image: string
}

export interface Home {
  /** World position of the item's pivot in the upright bag. */
  x: number
  y: number
  z: number
  /** Screen rotation in degrees. */
  rot: number
  scale: number
  /** Image shown while the item sits in the bag. */
  image: string
}

export interface Contract {
  version: 2
  frameSize: [number, number]
  /** The camera every frame is drawn through; the runtime projects through the same one. */
  camera: CameraSpec
  /** Frame pixel where the world origin (the tipping corner on the floor) projects. */
  origin: [number, number]
  /** Frame pixel of the corner an upright bag rocks back on. */
  rockPivot: [number, number]
  /** Direction light travels (world). Shadows are cast along it. */
  light: [number, number, number]
  /** Floor direction (world X, Z) the bag falls toward. */
  fallDir: [number, number]
  /** Height of the bag body in world units. */
  bodyHeight: number
  /** Bounding box of the upright bag + contents in frame pixels; mapped onto the page's .bag-anchor. */
  uprightBox: Box
  fps: number
  upright: { back: string; front: string; shadow: string }
  fall: FallFrame[]
  right: RightFrame[]
  restAngle: number
  /** Screen angles (degrees, y down) from the origin to the mouth, upright and lying. A drag around the origin maps onto the righting frames with these. */
  scrub: { up: number; rest: number }
  exits: Record<ItemId, Exit>
  homes: Record<ItemId, Home>
  /** The upright bag's opening (world): centre, half extents along X and Z, rim height. */
  mouth: { x: number; z: number; halfX: number; halfZ: number; rimY: number }
  hitboxes: { upright: RotRect; fallen: RotRect }
  /** Floor outline (world X, Z) of the bag lying at rest: nothing comes to rest on it. */
  footprint: [number, number][]
  items: Record<ItemId, ItemSpec>
}
