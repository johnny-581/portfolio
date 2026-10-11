// One requestAnimationFrame loop. It runs only while something moves: tick() returns false
// when everything is at rest and the loop sleeps until wake(). pause() stops it entirely
// (hero offscreen); dt is capped so nothing teleports on resume.

import { config } from './config.ts'

export interface Loop {
  wake(): void
  pause(): void
  resume(): void
  destroy(): void
  readonly running: boolean
  /** Frames ticked since mount (the debug panel shows it to confirm sleeping). */
  readonly frames: number
}

export function createLoop(tick: (dt: number) => boolean): Loop {
  let raf = 0
  let last = 0
  let running = false
  let paused = false
  let dead = false
  let frames = 0

  const step = (now: number) => {
    const dt = Math.min(config.maxDt, Math.max(0, (now - last) / 1000))
    last = now
    frames++
    const more = tick(dt)
    if (more && !paused && !dead) {
      raf = requestAnimationFrame(step)
    } else {
      running = false
    }
  }

  const wake = () => {
    if (running || paused || dead) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(step)
  }

  return {
    wake,
    pause() {
      paused = true
      cancelAnimationFrame(raf)
      running = false
    },
    resume() {
      if (!paused) return
      paused = false
      wake()
    },
    destroy() {
      dead = true
      cancelAnimationFrame(raf)
      running = false
    },
    get running() {
      return running
    },
    get frames() {
      return frames
    },
  }
}
