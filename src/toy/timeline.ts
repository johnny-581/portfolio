// Turns the contract's fall list (frames + holds at a fixed fps) into a tick timeline.

import type { Exit, FallFrame, ItemId } from './types.ts'

export interface Timeline {
  fps: number
  /** Index into `fall` for every tick. */
  ticks: number[]
  /** Seconds. */
  duration: number
  /** Index into `fall` shown at time t (clamped to the last frame). */
  indexAt(t: number): number
  /** First tick on which frame number f is shown. */
  tickOf(f: number): number
}

export function buildTimeline(fall: FallFrame[], fps: number): Timeline {
  const ticks: number[] = []
  fall.forEach((fr, i) => {
    for (let h = 0; h < Math.max(1, fr.hold); h++) ticks.push(i)
  })
  return {
    fps,
    ticks,
    duration: ticks.length / fps,
    indexAt(t) {
      const tick = Math.floor(t * fps + 1e-9)
      return ticks[Math.min(ticks.length - 1, Math.max(0, tick))]
    },
    tickOf(f) {
      const i = fall.findIndex((fr) => fr.f === f)
      return ticks.indexOf(i)
    },
  }
}

/** Seconds into the fall at which each item's loose sprite takes over. */
export function exitTimes(tl: Timeline, exits: Record<ItemId, Exit>): Record<ItemId, number> {
  const out = {} as Record<ItemId, number>
  for (const id of Object.keys(exits) as ItemId[]) out[id] = tl.tickOf(exits[id].frame) / tl.fps
  return out
}
