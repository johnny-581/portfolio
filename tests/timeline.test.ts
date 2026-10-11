import { describe, expect, it } from 'vitest'
import { buildContract } from '../src/toy/poses.ts'
import { buildTimeline, exitTimes } from '../src/toy/timeline.ts'

const c = buildContract()
const tl = buildTimeline(c.fall, c.fps)

describe('fall timeline', () => {
  it('10 frames at 12fps; frames 1, 2 and 10 held two ticks (13 ticks)', () => {
    expect(c.fps).toBe(12)
    expect(c.fall).toHaveLength(10)
    expect(tl.ticks).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9])
    expect(tl.duration).toBeCloseTo(13 / 12)
  })

  it('shows the right frame at tick boundaries', () => {
    const frameAt = (tick: number) => c.fall[tl.indexAt(tick / 12)].f
    expect(frameAt(0)).toBe(1)
    expect(frameAt(1)).toBe(1)
    expect(frameAt(2)).toBe(2)
    expect(frameAt(4)).toBe(3)
    expect(frameAt(12)).toBe(10)
    expect(frameAt(99)).toBe(10)
  })

  it('exit frames fire at their first tick: tomato 8, banana 9, radish 10', () => {
    const t = exitTimes(tl, c.exits)
    expect(t.tomato * 12).toBeCloseTo(8)
    expect(t.banana * 12).toBeCloseTo(9)
    expect(t.radish * 12).toBeCloseTo(10)
  })
})
