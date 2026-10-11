// Every tunable number. Mutable on purpose: the ?debug Tweakpane panel edits it live.
// Pure data, no DOM, so the tests and the generator can import it.

import type { ItemId } from './types.ts'

export interface ItemMotion {
  /** Landing distance band, in multiples of the bag's body height. */
  dist: [number, number]
  /** Seconds for the ground travel from the mouth to the landing spot. */
  travel: number
  /** Bounces after the first landing. */
  hops: number
  restitution: number
  /** Path bow as a fraction of its length. 0 = straight. */
  curve: number
  settleAmp: number
  settleFreq: number
  settleDecay: number
}

export const config = {
  // trigger
  wobbleRadius: 60,
  bumpSpeed: 400,
  wobbleKick: 0.012,
  wobbleMax: 3,
  wobbleK: 140,
  wobbleC: 6,

  // righting
  scrubThreshold: 0.6,
  uprightK: 170,
  uprightC: 11,
  lowerK: 110,
  lowerC: 21,

  // messy
  getUpInterval: 4,
  getUpAngle: 6,
  getUpDuration: 0.7,

  // tidy
  rearmDelay: 2,

  // snapping home
  snapDuration: 0.35,
  snapArc: 70,
  mouthTolerance: 1.5,

  // drag feel
  dragLift: 1.06,
  liftHeight: 14,
  tiltMax: 10,
  tiltFactor: 0.012,
  springK: 300,
  springC: 22,
  rotK: 180,
  rotC: 20,

  // depth: scale at the bag's base line → scale at the bottom of the first screen
  depthFar: 0.92,
  depthNear: 1.0,

  // falling
  gravity: 5200, // frame px / s²
  bumpOffMin: 40,
  bumpOffMax: 80,

  // landing zone
  zoneFrontMargin: 24,
  footprintPad: 16,
  itemGap: 10,
  shortenStep: 8,
  maxTries: 10,
  /** Launch fan from the fallen mouth, degrees in screen space (180 = left, 90 = straight down). */
  fanMin: 132,
  fanMax: 176,

  maxDt: 0.05,
  /** Debug: slow motion (1 = real time). */
  timeScale: 1,

  items: {
    tomato: {
      dist: [1.0, 1.6],
      travel: 1.1,
      hops: 2,
      restitution: 0.42,
      curve: 0,
      settleAmp: 6,
      settleFreq: 2.2,
      settleDecay: 4.5,
    },
    radish: {
      dist: [0.6, 1.0],
      travel: 0.9,
      hops: 1,
      restitution: 0.28,
      curve: 0.32,
      settleAmp: 4,
      settleFreq: 2.4,
      settleDecay: 5,
    },
    banana: {
      dist: [0.3, 0.6],
      travel: 0.7,
      hops: 1,
      restitution: 0.34,
      curve: 0.08,
      settleAmp: 8,
      settleFreq: 2.6,
      settleDecay: 3.5,
    },
  } as Record<ItemId, ItemMotion>,
}

export type Config = typeof config
