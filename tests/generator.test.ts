import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderAll } from '../scripts/gen-placeholders.ts'
import { EXIT_FRAME, FALL_POSES, FPS, POSE0, bakedItem, buildContract, isBaked, toFrame } from '../src/toy/poses.ts'
import { ITEM_IDS } from '../src/toy/types.ts'

const c = buildContract()

describe('generated contract', () => {
  it.each(ITEM_IDS)('%s: last baked world position + one tick of velocity = its exit (±1 unit)', (id) => {
    const e = c.exits[id]
    const b = bakedItem(id, FALL_POSES[e.frame - 1])
    expect(Math.abs(b.world.x + e.vx / FPS - e.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(b.world.y + e.vy / FPS - e.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(b.world.z + e.vz / FPS - e.z)).toBeLessThanOrEqual(1)
    expect(Math.abs(b.rot - e.rot)).toBeLessThanOrEqual(0.5)
  })

  it.each(ITEM_IDS)('%s: the loose sprite starts at the size it was drawn at (±2%)', (id) => {
    const e = c.exits[id]
    const before = bakedItem(id, FALL_POSES[e.frame - 1]).scale
    expect(Math.abs(toFrame(e).scale / before - 1)).toBeLessThan(0.02)
  })

  it.each(ITEM_IDS)('%s: pose 0 matches its home in the upright bag', (id) => {
    const b = bakedItem(id, POSE0)
    const h = c.homes[id]
    expect(b.world.x).toBeCloseTo(h.x, 0)
    expect(b.world.y).toBeCloseTo(h.y, 0)
    expect(b.world.z).toBeCloseTo(h.z, 0)
    expect(b.rot).toBeCloseTo(h.rot, 0)
  })

  it('the bag falls toward the viewer and to the left', () => {
    const up = c.scrub.up
    const rest = c.scrub.rest
    // Upright mouth is above the origin; lying, it is to the left (around 180°).
    expect(up).toBeLessThan(-60)
    expect(up).toBeGreaterThan(-120)
    expect(Math.abs(rest)).toBeGreaterThan(150)
    expect(c.fallDir[0]).toBeLessThan(0)
    expect(c.fallDir[1]).toBeGreaterThan(0)
  })

  it('poses tip slowly at first, then faster (real toppling)', () => {
    const steps = FALL_POSES.slice(1, 7).map((p, i) => p.tip - FALL_POSES[i].tip)
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1])
  })

  it('each faller is baked only before its exit frame', () => {
    for (const id of ITEM_IDS) {
      for (let f = 1; f <= 10; f++) expect(isBaked(id, f)).toBe(f < EXIT_FRAME[id])
    }
  })

  it('renders 39 SVGs: 2 upright + 10 fall + 10 empty + 11 shadows + 6 items', () => {
    const { files } = renderAll()
    expect(files.size).toBe(39)
    expect([...files.keys()].filter((k) => k.startsWith('bag/shadow/'))).toHaveLength(11)
  })

  it('public/art/bag.json is up to date (run `npm run gen` if this fails)', () => {
    const path = new URL('../public/art/bag.json', import.meta.url)
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(c)))
  })
})
