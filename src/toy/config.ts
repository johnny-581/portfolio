// Every tunable number. Mutable on purpose: the ?debug Tweakpane panel edits it live.
// Pure data, no DOM, so the tests and the generator can import it.

import type { ItemId } from './types.ts'

export interface Material {
  /** Friction coefficient: low rolls far, high slides a little. */
  mu: number
  /** Bounce on touchdown (0 = none). */
  restitution: number
  bounces: number
  /** Ground path bow as a fraction of its length (the radish curves around its tip). */
  curve: number
  /** Degrees it rocks on its curve after stopping (banana). */
  rock: number
  /** Random spread on the exit throw: speed ±fraction, direction ±degrees. */
  speedJitter: number
  angleJitter: number
}

export const config = {
  // trigger
  bumpSpeed: 400,

  // righting
  scrubThreshold: 0.6,
  uprightK: 170,
  uprightC: 18,
  lowerK: 110,
  lowerC: 21,

  // tidy
  rearmDelay: 2,

  // putting things back: how far from the mouth still counts (× its half extents)
  mouthTolerance: 1.3,

  // holding
  heldLift: 10,
  liftK: 260,
  liftC: 32,
  /** Ramp curve radius, in bag heights. */
  rampCurve: 0.15,
  /** World units per second. */
  releaseCap: 600,

  // world
  gravity: 11000,

  // shadows
  contactShadow: 0.25,
  softShadow: 0.1,

  // dropped on the fallen bag
  bumpOffSpeed: 360,
  bumpOffUp: 240,

  // landing zone
  zoneFrontMargin: 24,
  footprintPad: 4,
  itemGap: 10,
  shortenStep: 8,
  maxTries: 10,
  /** Degrees either side of the throw direction a deflected landing may take. */
  fanSpread: 22,

  maxDt: 0.05,
  /** Debug: slow motion (1 = real time). */
  timeScale: 1,

  items: {
    tomato: { mu: 0.05, restitution: 0.25, bounces: 1, curve: 0, rock: 0, speedJitter: 0.15, angleJitter: 10 },
    radish: { mu: 0.12, restitution: 0, bounces: 0, curve: 0.3, rock: 0, speedJitter: 0.15, angleJitter: 12 },
    banana: { mu: 0.45, restitution: 0, bounces: 0, curve: 0, rock: 4, speedJitter: 0.15, angleJitter: 12 },
  } as Record<ItemId, Material>,
}

export type Config = typeof config
