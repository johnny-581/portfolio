import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderAll } from '../scripts/gen-placeholders.ts'
import { EXIT_FRAME, FALL_POSES, FPS, POSE0, bakedItem, buildContract, isBaked } from '../src/toy/poses.ts'
import { ITEM_IDS } from '../src/toy/types.ts'

const c = buildContract()

describe('generated contract', () => {
  it.each(ITEM_IDS)('%s: baked position before its exit = exit minus one tick of velocity (±2px)', (id) => {
    const e = c.exits[id]
    const b = bakedItem(id, FALL_POSES[e.frame - 1])
    expect(Math.abs(b.x - (e.x - e.vx / FPS))).toBeLessThanOrEqual(2)
    expect(Math.abs(b.y - (e.y - e.vy / FPS))).toBeLessThanOrEqual(2)
    expect(Math.abs(b.rot - e.rot)).toBeLessThanOrEqual(0.5)
  })

  it.each(ITEM_IDS)('%s: pose 0 matches its home in the layered upright bag', (id) => {
    const b = bakedItem(id, POSE0)
    const h = c.homes[id]
    expect(b.x).toBeCloseTo(h.x, 5)
    expect(b.y).toBeCloseTo(h.y, 5)
    expect(b.rot).toBeCloseTo(h.rot, 5)
  })

  it('frame 1 (first fall frame) is the upright pose plus the small wind-up lean only', () => {
    const p1 = FALL_POSES[1]
    expect(p1.angle).toBeGreaterThan(0)
    expect(p1.angle).toBeLessThanOrEqual(4)
    expect(Object.keys(p1.slide)).toHaveLength(0)
    expect(p1.flare + p1.crumple + p1.milk).toBe(0)
  })

  it('each faller is baked only before its exit frame', () => {
    for (const id of ITEM_IDS) {
      for (let f = 1; f <= 12; f++) expect(isBaked(id, f)).toBe(f < EXIT_FRAME[id])
    }
  })

  it('renders all 35 SVGs', () => {
    const { files } = renderAll()
    expect(files.size).toBe(35)
  })

  it('public/art/bag.json is up to date (run `npm run gen` if this fails)', () => {
    const path = new URL('../public/art/bag.json', import.meta.url)
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(c)))
  })
})
