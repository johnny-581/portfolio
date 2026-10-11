import { describe, expect, it } from 'vitest'
import { initialState, reduce, type MachineEvent, type MachineState } from '../src/toy/machine.ts'
import type { ItemId } from '../src/toy/types.ts'

const run = (events: MachineEvent[], from: MachineState = initialState()) => {
  let s = from
  const effects: string[] = []
  for (const e of events) {
    const step = reduce(s, e)
    s = step.state
    effects.push(...step.effects.map((f) => f.type))
  }
  return { s, effects }
}

const spawnAll: MachineEvent[] = (['tomato', 'banana', 'radish'] as ItemId[]).map((id) => ({ type: 'itemSpawned', id }))
const armed = run([{ type: 'arm' }]).s
const falling = run([{ type: 'bump' }], armed).s
const messy = run([...spawnAll, { type: 'fallDone' }], falling).s
const upright = run([{ type: 'pressBag' }, { type: 'releaseBag', progress: 0.8 }, { type: 'bagSettled', upright: true }], messy).s

describe('idle / wobble', () => {
  it('does nothing until armed (assets decoded, motion allowed)', () => {
    expect(run([{ type: 'bump' }]).s.name).toBe('idle')
    expect(run([{ type: 'near' }]).s.name).toBe('idle')
  })
  it('proximity wobbles, leaving the radius returns to idle', () => {
    const { s } = run([{ type: 'near' }], armed)
    expect(s.name).toBe('wobble')
    expect(run([{ type: 'far' }], s).s.name).toBe('idle')
  })
  it('a bump or a tap tips it over, from idle or wobble', () => {
    expect(run([{ type: 'bump' }], armed)).toMatchObject({ s: { name: 'falling' }, effects: ['startFall'] })
    expect(run([{ type: 'near' }, { type: 'pressBag' }], armed).s.name).toBe('falling')
  })
  it('homed items are not draggable', () => {
    expect(run([{ type: 'grabItem', id: 'tomato' }], armed).s.drag).toBeNull()
  })
})

describe('falling', () => {
  it('ignores bag input', () => {
    expect(run([{ type: 'pressBag' }, { type: 'bump' }], falling).s).toEqual(falling)
  })
  it('items are draggable as soon as they spawn, and grabbing cancels the roll', () => {
    expect(run([{ type: 'grabItem', id: 'tomato' }], falling).s.drag).toBeNull()
    const { s, effects } = run([{ type: 'itemSpawned', id: 'tomato' }, { type: 'grabItem', id: 'tomato' }], falling)
    expect(s.drag).toEqual({ kind: 'item', id: 'tomato' })
    expect(effects).toEqual(['cancelRoll', 'beginItemDrag'])
  })
  it('reaching the rest frame → messy (even mid-drag)', () => {
    const { s } = run([{ type: 'itemSpawned', id: 'tomato' }, { type: 'grabItem', id: 'tomato' }, { type: 'fallDone' }], falling)
    expect(s.name).toBe('messy')
    expect(s.drag).toEqual({ kind: 'item', id: 'tomato' })
  })
  it('dropping on the fallen bag bumps the item off', () => {
    const { effects } = run([...spawnAll, { type: 'grabItem', id: 'banana' }, { type: 'dropItem', id: 'banana', over: 'bag' }], falling)
    expect(effects).toContain('bumpOff')
  })
})

describe('messy', () => {
  it('items drop on the floor (stay) or on the bag (bump off)', () => {
    const floor = run([{ type: 'grabItem', id: 'radish' }, { type: 'dropItem', id: 'radish', over: 'floor' }], messy)
    expect(floor.effects).toEqual(['cancelRoll', 'beginItemDrag', 'settleItem'])
    const bag = run([{ type: 'grabItem', id: 'radish' }, { type: 'dropItem', id: 'radish', over: 'bag' }], messy)
    expect(bag.effects).toContain('bumpOff')
  })
  it('the mouth is not a target while the bag is down', () => {
    const { effects, s } = run([{ type: 'grabItem', id: 'tomato' }, { type: 'dropItem', id: 'tomato', over: 'mouth' }], messy)
    expect(effects).toContain('settleItem')
    expect(s.homed).toEqual([])
  })
  it('grabbing the bag starts righting; only one drag at a time', () => {
    const { s } = run([{ type: 'pressBag' }], messy)
    expect(s).toMatchObject({ name: 'righting', drag: { kind: 'bag' } })
    expect(run([{ type: 'grabItem', id: 'tomato' }], s).s.drag).toEqual({ kind: 'bag' })
    const holding = run([{ type: 'grabItem', id: 'tomato' }], messy).s
    expect(run([{ type: 'pressBag' }], holding).s.name).toBe('messy')
  })
})

describe('righting', () => {
  const righting = run([{ type: 'pressBag' }], messy).s
  it('release ≥ 0.6 raises, < 0.6 lowers', () => {
    expect(run([{ type: 'releaseBag', progress: 0.6 }], righting).effects).toEqual(['raiseBag'])
    expect(run([{ type: 'releaseBag', progress: 0.59 }], righting).effects).toEqual(['lowerBag'])
  })
  it('settles upright → upright, settles down → messy', () => {
    const released = run([{ type: 'releaseBag', progress: 0.9 }], righting).s
    expect(run([{ type: 'bagSettled', upright: true }], released).s.name).toBe('upright')
    expect(run([{ type: 'bagSettled', upright: false }], released).s.name).toBe('messy')
  })
  it('items stay locked until the bag settles', () => {
    const released = run([{ type: 'releaseBag', progress: 0.9 }], righting).s
    expect(run([{ type: 'grabItem', id: 'tomato' }], released).s.drag).toBeNull()
  })
})

describe('upright', () => {
  it('bumps, taps and wobble are ignored while items are missing', () => {
    expect(run([{ type: 'bump' }, { type: 'pressBag' }, { type: 'near' }], upright).s).toEqual(upright)
  })
  it('mouth drop snaps home; floor drop stays', () => {
    const snap = run([{ type: 'grabItem', id: 'tomato' }, { type: 'dropItem', id: 'tomato', over: 'mouth' }], upright)
    expect(snap.effects).toContain('snapHome')
    expect(snap.s.homed).toEqual(['tomato'])
    expect(run([{ type: 'grabItem', id: 'tomato' }], snap.s).s.drag).toBeNull()
    const floor = run([{ type: 'grabItem', id: 'tomato' }, { type: 'dropItem', id: 'tomato', over: 'floor' }], upright)
    expect(floor.effects).toContain('settleItem')
  })
  it('a pointercancel mid-drag is just a drop where the item is', () => {
    // The engine turns pointercancel / lost capture / window blur into dropItem.
    const { s } = run([{ type: 'grabItem', id: 'banana' }, { type: 'dropItem', id: 'banana', over: 'floor' }], upright)
    expect(s.drag).toBeNull()
  })
  it('all three home → tidy → (2s) → idle, re-armed', () => {
    const ids: ItemId[] = ['tomato', 'banana', 'radish']
    const events: MachineEvent[] = ids.flatMap((id) => [
      { type: 'grabItem', id },
      { type: 'dropItem', id, over: 'mouth' },
      { type: 'snapArrived', id },
    ] as MachineEvent[])
    const { s, effects } = run(events, upright)
    expect(s.name).toBe('tidy')
    expect(effects).toContain('startCooldown')
    expect(run([{ type: 'bump' }], s).s.name).toBe('tidy')
    const idle = run([{ type: 'cooldownDone' }], s).s
    expect(idle.name).toBe('idle')
    expect(run([{ type: 'bump' }], idle).s.name).toBe('falling')
  })
})
