// mount(): builds the toy inside a stage element and returns destroy().
// Framework-free; React only calls mount/destroy from an effect.

import { loadAssets, type Assets } from './assets.ts'
import { Bag } from './bag.ts'
import { config } from './config.ts'
import { distToRotRect, inCircle, inRotRect } from './hit.ts'
import { Item } from './items.ts'
import { measure, type Layout } from './layout.ts'
import { createLoop } from './loop.ts'
import {
  canTip,
  initialState,
  isLoose,
  reduce,
  type DropTarget,
  type Effect,
  type MachineEvent,
  type MachineState,
} from './machine.ts'
import { mulberry32, nearestTurn, rand } from './motion.ts'
import { rotate } from './poses.ts'
import type { ItemId, Vec } from './types.ts'
import { ITEM_IDS } from './types.ts'
import { fits, landingSpot, type Placed } from './zone.ts'

export interface MountOptions {
  /** Where bag.json and the art live. */
  artBase?: string
  /** The page headline (items may slide under it, but their centers never land on it). */
  headline?: HTMLElement | null
  /** Show the debug overlay (zone, exits, hitboxes). */
  debug?: boolean
  /** Fixed seed for repeatable falls. */
  seed?: number
}

export interface StressResult {
  samples: number
  /** Spots outside the zone or overlapping another item. */
  violations: number
  /** Spots where nothing in the fan fit. */
  fallbacks: number
  /** Item centers inside the headline box. */
  underHeadline: number
  points: (Placed & { id: ItemId })[]
}

export interface Engine {
  readonly state: MachineState
  readonly layout: Layout
  readonly bag: Bag
  readonly items: Map<ItemId, Item>
  readonly loop: ReturnType<typeof createLoop>
  readonly assets: Assets
  readonly config: typeof config
  dispatch(e: MachineEvent): Effect[]
  /** Back to the tidy, armed idle state. */
  reset(): void
  /** Reset, then tip it over. */
  replay(): void
  /** Pick landing spots n times (same code path as a real fall) and check every one. */
  stress(n: number): StressResult
  wake(): void
  /** Re-measure the page (zone settings changed). */
  relayout(): void
  onTick: ((dt: number) => void) | null
  onLayout: (() => void) | null
}

export function mount(stage: HTMLElement, opts: MountOptions = {}): () => void {
  const ac = new AbortController()
  let destroyed = false
  let teardown: (() => void) | null = null

  loadAssets(opts.artBase ?? '/art/', ac.signal)
    .then((assets) => {
      if (destroyed) return
      teardown = build(stage, assets, opts)
    })
    .catch((err) => {
      if (!destroyed) console.error('[toy] failed to load art', err)
    })

  return () => {
    destroyed = true
    ac.abort()
    teardown?.()
    teardown = null
  }
}

function build(stage: HTMLElement, assets: Assets, opts: MountOptions): () => void {
  const c = assets.contract
  const anchor = stage.querySelector<HTMLElement>('.bag-anchor')
  if (!anchor) throw new Error('[toy] stage needs a .bag-anchor child')
  const headline = opts.headline ?? null
  let r = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random

  const cleanups: (() => void)[] = []
  const on = <K extends keyof WindowEventMap>(t: Window, type: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(type, fn, o)
    cleanups.push(() => t.removeEventListener(type, fn, o))
  }
  const onEl = <K extends keyof HTMLElementEventMap>(t: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
    t.addEventListener(type, fn)
    cleanups.push(() => t.removeEventListener(type, fn))
  }

  // ---------------------------------------------------------------------------
  // DOM

  const shadowLayer = div('toy-layer-shadows')
  const looseLayer = div('toy-layer-loose')
  const bag = new Bag(assets, {
    onExit: (id) => spawnItem(id),
    onFallDone: () => {
      dispatch({ type: 'fallDone' })
      scheduleGetUp()
    },
    onSettled: (upright) => {
      dispatch({ type: 'bagSettled', upright })
      if (!upright) scheduleGetUp()
    },
  })
  const items = new Map<ItemId, Item>()
  const created = [bag.el, bag.hitEl, shadowLayer, looseLayer]
  stage.append(...created)
  for (const id of ITEM_IDS) items.set(id, new Item(id, assets, bag, looseLayer, shadowLayer))
  cleanups.push(() => created.forEach((el) => el.remove()))

  // ---------------------------------------------------------------------------
  // State

  let state: MachineState = initialState()

  const dispatch = (e: MachineEvent): Effect[] => {
    const step = reduce(state, e)
    state = step.state
    for (const fx of step.effects) apply(fx)
    syncClasses()
    loop.wake()
    return step.effects
  }

  const syncClasses = () => {
    stage.dataset.toyState = state.name
    bag.hitEl.classList.toggle('is-tippable', canTip(state))
    bag.hitEl.classList.toggle('is-grabbable', state.armed && state.name === 'messy')
    bag.hitEl.classList.toggle('is-held', state.drag?.kind === 'bag')
    for (const [id, it] of items) {
      it.el.classList.toggle('is-grabbable', state.armed && isLoose(state, id))
      it.el.classList.toggle('is-held', state.drag?.kind === 'item' && state.drag.id === id)
    }
    document.documentElement.classList.toggle('toy-dragging', state.drag !== null)
  }

  const apply = (fx: Effect) => {
    switch (fx.type) {
      case 'startFall':
        clearTimeout(getUpTimer)
        bag.startFall()
        break
      case 'cancelRoll':
        items.get(fx.id)!.cancelRoll()
        break
      case 'snapHome':
        items.get(fx.id)!.snapHome()
        break
      case 'bumpOff': {
        const hb = bag.hitbox()
        items.get(fx.id)!.bumpOff({ x: hb.cx, y: hb.cy }, placedExcept(fx.id), r)
        scheduleGetUp()
        break
      }
      case 'settleItem':
        items.get(fx.id)!.settle(placedExcept(fx.id), r)
        scheduleGetUp()
        break
      case 'beginBagDrag':
        clearTimeout(getUpTimer)
        bag.beginScrub()
        break
      case 'raiseBag':
        bag.raise(bagDrag.vel)
        break
      case 'lowerBag':
        bag.lower(bagDrag.vel)
        break
      case 'startCooldown':
        clearTimeout(cooldownTimer)
        cooldownTimer = window.setTimeout(() => dispatch({ type: 'cooldownDone' }), config.rearmDelay * 1000)
        break
      case 'startWobble':
      case 'beginItemDrag':
      case 'enterIdle':
        break
    }
  }

  let getUpTimer = 0
  let cooldownTimer = 0
  const scheduleGetUp = () => {
    clearTimeout(getUpTimer)
    getUpTimer = window.setTimeout(() => {
      if (state.name === 'messy' && state.drag === null) {
        bag.startGetUp()
        loop.wake()
      }
      if (state.name === 'messy') scheduleGetUp()
    }, config.getUpInterval * 1000)
  }
  cleanups.push(() => {
    clearTimeout(getUpTimer)
    clearTimeout(cooldownTimer)
  })

  // ---------------------------------------------------------------------------
  // Layout

  let layout = measure(stage, anchor, headline, c)
  const applyLayout = () => {
    layout = measure(stage, anchor, headline, c)
    bag.setLayout(layout)
    for (const it of items.values()) it.setLayout(layout)
    if (state.name !== 'falling') for (const [id, it] of items) it.reclamp(placedExcept(id), r)
    engine.onLayout?.()
    loop.wake()
  }
  let layoutRaf = 0
  const scheduleLayout = () => {
    cancelAnimationFrame(layoutRaf)
    layoutRaf = requestAnimationFrame(applyLayout)
  }
  const ro = new ResizeObserver(scheduleLayout)
  ro.observe(stage)
  ro.observe(anchor)
  if (headline) ro.observe(headline)
  on(window, 'resize', scheduleLayout)
  cleanups.push(() => {
    ro.disconnect()
    cancelAnimationFrame(layoutRaf)
  })

  // ---------------------------------------------------------------------------
  // Landing spots

  /** Zone circles of every loose item except `id` (rolling ones count at their target). */
  const placedExcept = (id: ItemId): Placed[] => {
    const out: Placed[] = []
    for (const [oid, it] of items) {
      if (oid === id || !isLoose(state, oid)) continue
      if (it.landing) {
        const ctr = it.centerOf(it.landing, it.rot)
        out.push({ ...ctr, r: it.zoneRadius(it.landing.y) })
      } else out.push(it.placed())
    }
    return out
  }

  const mouthOrigin = (): Vec => {
    const m = c.mouth.fallen
    return { x: layout.origin.x + m.x * layout.scale, y: layout.origin.y + m.y * layout.scale }
  }

  /** Landing spot for an item's visual center, plus the rotation it ends at. */
  const pickTarget = (id: ItemId, placed: Placed[], rot0: number) => {
    const it = items.get(id)!
    const motion = config.items[id]
    const mouth = mouthOrigin()
    const idx = ITEM_IDS.indexOf(id)
    const mid = ((motion.dist[0] + motion.dist[1]) / 2) * layout.bagH
    const fallback = { x: mouth.x - mid * 0.85, y: mouth.y + layout.bagH * (0.25 + 0.2 * idx) }
    const k = layout.scale
    const spot = landingSpot({
      mouth,
      bagH: layout.bagH,
      dist: motion.dist,
      fanMin: config.fanMin,
      fanMax: config.fanMax,
      // Measured at the near end of the depth range, so it fits wherever it lands.
      r: it.spec.zone.r * k * (config.depthNear / config.depthFar),
      zone: layout.zone,
      placed,
      rand: r,
      step: config.shortenStep,
      tries: config.maxTries,
      gap: config.itemGap,
      fallback,
    })
    const center = { x: spot.x, y: spot.y }
    let finalRot = rot0
    if (id === 'radish') finalRot = rot0 + (r() < 0.5 ? -1 : 1) * rand(r, 70, 130)
    if (id === 'banana') finalRot = nearestTurn(r() < 0.5 ? 0 : 180, rot0) + rand(r, -12, 12)
    // Center → pivot (the radish pivots at its tip).
    const off = rotate({ x: it.spec.zone.offset[0] * k, y: it.spec.zone.offset[1] * k }, finalRot)
    const pivot = { x: center.x - off.x, y: center.y - off.y }
    return { center, pivot, finalRot, r: it.zoneRadius(pivot.y), fallback: spot.fallback }
  }

  const spawnItem = (id: ItemId) => {
    const it = items.get(id)!
    const exit = c.exits[id]
    const t = pickTarget(id, placedExcept(id), exit.rot + bag.rotor.x)
    const side = id === 'banana' ? (r() < 0.5 ? 'a' : 'b') : null
    it.spawn(exit, t.pivot, config.items[id], r, t.finalRot, side)
    dispatch({ type: 'itemSpawned', id })
  }

  // ---------------------------------------------------------------------------
  // Pointer input

  const toStage = (e: PointerEvent): Vec => {
    const s = stage.getBoundingClientRect()
    return { x: e.clientX - s.left, y: e.clientY - s.top }
  }

  // Proximity wobble + bump, from anywhere on the page.
  let lastMove: { p: Vec; t: number } | null = null
  let vel = { x: 0, y: 0 }
  let wasInside = false
  on(
    window,
    'pointermove',
    (e) => {
      const p = toStage(e)
      if (lastMove) {
        const dt = Math.max(1, e.timeStamp - lastMove.t) / 1000
        const k = 0.5
        vel = { x: vel.x * (1 - k) + ((p.x - lastMove.p.x) / dt) * k, y: vel.y * (1 - k) + ((p.y - lastMove.p.y) / dt) * k }
      }
      lastMove = { p, t: e.timeStamp }
      if (!canTip(state) || !bag.isLayered) {
        wasInside = false
        return
      }
      const d = distToRotRect(p, bag.hitbox())
      const inside = d === 0
      if (inside && !wasInside && Math.hypot(vel.x, vel.y) >= config.bumpSpeed) {
        wasInside = inside
        dispatch({ type: 'bump' })
        return
      }
      wasInside = inside
      if (d <= config.wobbleRadius) {
        if (state.name === 'idle') dispatch({ type: 'near' })
        bag.kick(vel.x)
        loop.wake()
      } else if (state.name === 'wobble') dispatch({ type: 'far' })
    },
    { passive: true },
  )

  // Bag: tap to tip, or grab to right it.
  const bagDrag = { pointer: -1, phi0: 0, a0: 0, lastA: 0, lastT: 0, vel: 0 }
  const pointerAngle = (p: Vec) => {
    const pv = bag.pivotStage()
    return (Math.atan2(p.y - pv.y, p.x - pv.x) * 180) / Math.PI
  }
  onEl(bag.hitEl, 'pointerdown', (e) => {
    if (state.drag) return
    const fx = dispatch({ type: 'pressBag' })
    if (!fx.some((f) => f.type === 'beginBagDrag')) return
    e.preventDefault()
    bag.hitEl.setPointerCapture(e.pointerId)
    const p = toStage(e)
    Object.assign(bagDrag, { pointer: e.pointerId, phi0: pointerAngle(p), a0: bag.angle, lastA: bag.angle, lastT: e.timeStamp, vel: 0 })
  })
  onEl(bag.hitEl, 'pointermove', (e) => {
    if (e.pointerId !== bagDrag.pointer || state.drag?.kind !== 'bag') return
    let delta = pointerAngle(toStage(e)) - bagDrag.phi0
    delta = ((delta + 540) % 360) - 180
    bag.scrubTo(bagDrag.a0 + delta)
    const dt = Math.max(1, e.timeStamp - bagDrag.lastT) / 1000
    bagDrag.vel = bagDrag.vel * 0.5 + ((bag.angle - bagDrag.lastA) / dt) * 0.5
    bagDrag.lastA = bag.angle
    bagDrag.lastT = e.timeStamp
    loop.wake()
  })
  const endBagDrag = (e: PointerEvent) => {
    if (e.pointerId !== bagDrag.pointer) return
    bagDrag.pointer = -1
    if (state.drag?.kind !== 'bag') return
    bagDrag.vel = Math.max(-400, Math.min(400, bagDrag.vel))
    dispatch({ type: 'releaseBag', progress: bag.progress() })
  }
  onEl(bag.hitEl, 'pointerup', endBagDrag)
  onEl(bag.hitEl, 'pointercancel', endBagDrag)
  onEl(bag.hitEl, 'lostpointercapture', endBagDrag)

  // Items: grab, drag, drop.
  const itemDrag = { pointer: -1, id: null as ItemId | null, el: null as HTMLElement | null, last: { x: 0, y: 0 }, lastT: 0, vx: 0 }
  for (const [id, it] of items) {
    onEl(it.hitEl, 'pointerdown', (e) => {
      if (state.drag) return
      const fx = dispatch({ type: 'grabItem', id })
      if (!fx.some((f) => f.type === 'beginItemDrag')) return
      e.preventDefault()
      e.stopPropagation()
      it.hitEl.setPointerCapture(e.pointerId)
      const p = toStage(e)
      Object.assign(itemDrag, { pointer: e.pointerId, id, el: it.hitEl, last: p, lastT: e.timeStamp, vx: 0 })
      it.beginDrag(p)
      loop.wake()
    })
    onEl(it.hitEl, 'pointermove', (e) => {
      if (e.pointerId !== itemDrag.pointer || itemDrag.id !== id) return
      const p = toStage(e)
      const dt = Math.max(1, e.timeStamp - itemDrag.lastT) / 1000
      itemDrag.vx = itemDrag.vx * 0.5 + ((p.x - itemDrag.last.x) / dt) * 0.5
      itemDrag.last = p
      itemDrag.lastT = e.timeStamp
      it.dragTo(p, itemDrag.vx)
      loop.wake()
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== itemDrag.pointer || itemDrag.id !== id) return
      dropHeldItem()
    }
    onEl(it.hitEl, 'pointerup', end)
    onEl(it.hitEl, 'pointercancel', end)
    onEl(it.hitEl, 'lostpointercapture', end)
  }

  const dropTarget = (it: Item): DropTarget => {
    const p = it.releaseCenter()
    if (state.name === 'upright' && bag.isLayered) {
      const m = bag.mouthStage()
      if (inCircle(p, m, m.r)) return 'mouth'
    }
    if (!bag.isLayered && inRotRect(p, bag.hitbox())) return 'bag'
    return 'floor'
  }

  const dropHeldItem = () => {
    const id = itemDrag.id
    itemDrag.pointer = -1
    itemDrag.id = null
    if (!id || state.drag?.kind !== 'item' || state.drag.id !== id) return
    const it = items.get(id)!
    dispatch({ type: 'dropItem', id, over: dropTarget(it) })
  }

  // Window losing focus mid-drag counts as a drop where it is.
  on(window, 'blur', () => {
    if (state.drag?.kind === 'item') dropHeldItem()
    if (state.drag?.kind === 'bag') {
      bagDrag.pointer = -1
      dispatch({ type: 'releaseBag', progress: bag.progress() })
    }
  })

  // ---------------------------------------------------------------------------
  // Loop

  const tick = (rawDt: number) => {
    const dt = rawDt * config.timeScale
    let active = bag.tick(dt)
    for (const [id, it] of items) {
      const wasRolling = it.isRolling
      if (it.tick(dt, (aid) => dispatch({ type: 'snapArrived', id: aid }))) active = true
      // A roll that finished after a resize might sit outside the new zone.
      if (wasRolling && !it.isRolling && state.name !== 'falling') {
        it.reclamp(placedExcept(id), r)
        if (it.isRolling) active = true
      }
    }
    engine.onTick?.(dt)
    return active
  }
  const loop = createLoop(tick)
  cleanups.push(() => loop.destroy())

  const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? loop.resume() : loop.pause()))
  io.observe(stage)
  cleanups.push(() => io.disconnect())

  // ---------------------------------------------------------------------------
  // Reduced motion: static tidy bag, trigger off.

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onMotionPref = () => {
    if (mq.matches) {
      engine.reset()
      dispatch({ type: 'disarm' })
    } else dispatch({ type: 'arm' })
  }
  mq.addEventListener('change', onMotionPref)
  cleanups.push(() => mq.removeEventListener('change', onMotionPref))

  // ---------------------------------------------------------------------------
  // Engine handle (debug + tests)

  const engine: Engine = {
    get state() {
      return state
    },
    get layout() {
      return layout
    },
    bag,
    items,
    loop,
    assets,
    config,
    dispatch,
    wake: () => loop.wake(),
    relayout: () => applyLayout(),
    reset() {
      clearTimeout(getUpTimer)
      clearTimeout(cooldownTimer)
      for (const it of items.values()) it.goHome()
      bag.resetUpright()
      const armed = state.armed
      state = { ...initialState(), armed }
      syncClasses()
      loop.wake()
    },
    replay() {
      engine.reset()
      dispatch({ type: 'bump' })
    },
    stress(n) {
      const points: (Placed & { id: ItemId })[] = []
      let violations = 0
      let fallbacks = 0
      let underHeadline = 0
      const saved = r
      r = mulberry32(1234)
      for (let i = 0; i < n; i++) {
        const placed: Placed[] = []
        for (const id of ['tomato', 'banana', 'radish'] as ItemId[]) {
          const t = pickTarget(id, placed, c.exits[id].rot)
          const p = { ...t.center, r: t.r }
          if (!fits(layout.zone, p, p.r, placed, 0)) violations++
          if (t.fallback) fallbacks++
          const h = layout.headline
          if (h && p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h) underHeadline++
          placed.push(p)
          points.push({ ...p, id })
        }
      }
      r = saved
      return { samples: n * 3, violations, fallbacks, underHeadline, points }
    },
    onTick: null,
    onLayout: null,
  }

  applyLayout()
  syncClasses()
  if (!mq.matches) dispatch({ type: 'arm' })

  let disposed = false
  if (opts.debug) {
    import('./debug.ts').then(({ attachDebug }) => {
      if (!disposed) cleanups.push(attachDebug(stage, engine))
    })
    const w = window as unknown as { __toy?: Engine }
    w.__toy = engine
    cleanups.push(() => {
      if (w.__toy === engine) delete w.__toy
    })
  }

  return () => {
    disposed = true
    document.documentElement.classList.remove('toy-dragging')
    for (const f of cleanups.splice(0).reverse()) f()
  }
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}
