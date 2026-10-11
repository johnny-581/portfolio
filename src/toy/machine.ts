// The toy's state machine as a pure reducer: (state, event) → { state, effects }.
// It decides what input is accepted in each state (see "Input rules per state" in docs/PLAN.md);
// index.ts measures geometry, sends events and carries out the effects.

import { config } from './config.ts'
import type { ItemId } from './types.ts'
import { ITEM_IDS } from './types.ts'

export type StateName = 'idle' | 'wobble' | 'falling' | 'messy' | 'righting' | 'upright' | 'tidy'

export type Drag = null | { kind: 'item'; id: ItemId } | { kind: 'bag' }

export interface MachineState {
  name: StateName
  /** Assets decoded and motion allowed. The trigger does nothing until then. */
  armed: boolean
  drag: Drag
  /** Items that are home or on their way home (no longer grabbable). */
  homed: ItemId[]
  /** Items that have finished their snap. */
  arrived: ItemId[]
  /** Items that have left the bag during the current fall. */
  spawned: ItemId[]
}

export type DropTarget = 'mouth' | 'bag' | 'floor'

export type MachineEvent =
  | { type: 'arm' }
  | { type: 'disarm' }
  | { type: 'near' }
  | { type: 'far' }
  | { type: 'bump' }
  | { type: 'pressBag' }
  | { type: 'itemSpawned'; id: ItemId }
  | { type: 'fallDone' }
  | { type: 'grabItem'; id: ItemId }
  | { type: 'dropItem'; id: ItemId; over: DropTarget }
  | { type: 'releaseBag'; progress: number }
  | { type: 'bagSettled'; upright: boolean }
  | { type: 'snapArrived'; id: ItemId }
  | { type: 'cooldownDone' }

export type Effect =
  | { type: 'startWobble' }
  | { type: 'startFall' }
  | { type: 'cancelRoll'; id: ItemId }
  | { type: 'beginItemDrag'; id: ItemId }
  | { type: 'snapHome'; id: ItemId }
  | { type: 'bumpOff'; id: ItemId }
  | { type: 'settleItem'; id: ItemId }
  | { type: 'beginBagDrag' }
  | { type: 'raiseBag' }
  | { type: 'lowerBag' }
  | { type: 'startCooldown' }
  | { type: 'enterIdle' }

export interface Step {
  state: MachineState
  effects: Effect[]
}

export function initialState(): MachineState {
  return { name: 'idle', armed: false, drag: null, homed: [...ITEM_IDS], arrived: [...ITEM_IDS], spawned: [] }
}

const LOOSE_STATES: StateName[] = ['falling', 'messy', 'upright']

export function isLoose(s: MachineState, id: ItemId): boolean {
  return LOOSE_STATES.includes(s.name) && s.spawned.includes(id) && !s.homed.includes(id)
}

export function canGrabItem(s: MachineState, id: ItemId): boolean {
  return s.armed && s.drag === null && isLoose(s, id)
}

export function canGrabBag(s: MachineState): boolean {
  return s.armed && s.drag === null && s.name === 'messy'
}

/** Can the bag be bumped or tapped over right now? */
export function canTip(s: MachineState): boolean {
  return s.armed && (s.name === 'idle' || s.name === 'wobble')
}

export function reduce(s: MachineState, e: MachineEvent): Step {
  const none: Step = { state: s, effects: [] }
  const to = (patch: Partial<MachineState>, effects: Effect[] = []): Step => ({ state: { ...s, ...patch }, effects })

  switch (e.type) {
    case 'arm':
      return to({ armed: true })
    case 'disarm':
      return s.name === 'idle' || s.name === 'wobble' ? to({ armed: false, name: 'idle' }) : to({ armed: false })

    case 'near':
      return s.armed && s.name === 'idle' ? to({ name: 'wobble' }, [{ type: 'startWobble' }]) : none
    case 'far':
      return s.name === 'wobble' ? to({ name: 'idle' }) : none

    case 'bump':
    case 'pressBag':
      if (canTip(s)) {
        return to({ name: 'falling', homed: [], arrived: [], spawned: [], drag: null }, [{ type: 'startFall' }])
      }
      if (e.type === 'pressBag' && canGrabBag(s)) {
        return to({ name: 'righting', drag: { kind: 'bag' } }, [{ type: 'beginBagDrag' }])
      }
      return none

    case 'itemSpawned':
      return s.name === 'falling' && !s.spawned.includes(e.id) ? to({ spawned: [...s.spawned, e.id] }) : none

    case 'fallDone':
      return s.name === 'falling' ? to({ name: 'messy' }) : none

    case 'grabItem':
      if (!canGrabItem(s, e.id)) return none
      return to({ drag: { kind: 'item', id: e.id } }, [
        { type: 'cancelRoll', id: e.id },
        { type: 'beginItemDrag', id: e.id },
      ])

    case 'dropItem': {
      if (s.drag?.kind !== 'item' || s.drag.id !== e.id) return none
      if (s.name === 'upright' && e.over === 'mouth') {
        return to({ drag: null, homed: [...s.homed, e.id] }, [{ type: 'snapHome', id: e.id }])
      }
      if ((s.name === 'falling' || s.name === 'messy') && e.over === 'bag') {
        return to({ drag: null }, [{ type: 'bumpOff', id: e.id }])
      }
      return to({ drag: null }, [{ type: 'settleItem', id: e.id }])
    }

    case 'releaseBag':
      if (s.name !== 'righting' || s.drag?.kind !== 'bag') return none
      return to({ drag: null }, [{ type: e.progress >= config.scrubThreshold ? 'raiseBag' : 'lowerBag' }])

    case 'bagSettled':
      if (s.name !== 'righting' || s.drag !== null) return none
      return to({ name: e.upright ? 'upright' : 'messy' })

    case 'snapArrived': {
      if (!s.homed.includes(e.id) || s.arrived.includes(e.id)) return none
      const arrived = [...s.arrived, e.id]
      if (s.name === 'upright' && ITEM_IDS.every((id) => arrived.includes(id))) {
        return to({ name: 'tidy', arrived }, [{ type: 'startCooldown' }])
      }
      return to({ arrived })
    }

    case 'cooldownDone':
      return s.name === 'tidy' ? to({ name: 'idle', spawned: [] }, [{ type: 'enterIdle' }]) : none
  }
}
