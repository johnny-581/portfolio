import { describe, expect, it } from 'vitest'
import { buildContract } from '../src/toy/poses.ts'
import { buildTimeline, exitTimes } from '../src/toy/timeline.ts'

const c = buildContract()
const tl = buildTimeline(c.fall, c.fps)

describe('fall timeline', () => {
  it('holds: frame 1 and 12 for two ticks, the rest for one (14 ticks at 12fps)', () => {
    expect(tl.ticks).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11])
    expect(tl.duration).toBeCloseTo(14 / 12)
  })

  it('shows the right frame at tick boundaries', () => {
    const frameAt = (tick: number) => c.fall[tl.indexAt(tick / 12)].f
    expect(frameAt(0)).toBe(1)
    expect(frameAt(1)).toBe(1)
    expect(frameAt(2)).toBe(2)
    expect(frameAt(7)).toBe(7)
    expect(frameAt(13)).toBe(12)
    expect(frameAt(99)).toBe(12)
  })

  it('exit frames fire at their first tick: tomato 7, banana 9, radish 10', () => {
    const t = exitTimes(tl, c.exits)
    expect(t.tomato * 12).toBeCloseTo(7)
    expect(t.banana * 12).toBeCloseTo(9)
    expect(t.radish * 12).toBeCloseTo(10)
  })
})
