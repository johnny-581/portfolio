// mount(): builds the toy inside a stage element and returns destroy().
// Framework-free; React only calls mount/destroy from an effect.

import { loadAssets, type Assets } from './assets.ts'
import { Bag } from './bag.ts'
import { config } from './config.ts'
import { distToRotRect, inRotRect } from './hit.ts'
import { Item, type ThrowOptions } from './items.ts'
import { measure, stageRay, unproject, type Layout } from './layout.ts'
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
import { flightLanding, stoppingDistance } from './physics.ts'
import type { ItemId, Vec, Vec3 } from './types.ts'
import { ITEM_IDS } from './types.ts'
import { fits, nearestFit, settleSpot, type FloorPoint, type Placed } from './zone.ts'

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
  /** Spots where nothing along any tried direction fit. */
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
  /** Throw all three out n times (same code path as a real fall) and check every resting spot. */
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

interface Planned {
  target: FloorPoint
  fallback: boolean
  circle: Placed
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
    onFallDone: () => dispatch({ type: 'fallDone' }),
    onSettled: (upright) => dispatch({ type: 'bagSettled', upright }),
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
        bag.startFall()
        break
      case 'snapHome':
        items.get(fx.id)!.dropIn()
        break
      case 'bumpOff':
        bumpOff(fx.id)
        break
      case 'settleItem': {
        const it = items.get(fx.id)!
        throwItem(it, it.releaseVelocity())
        break
      }
      case 'beginBagDrag':
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
      case 'cancelRoll':
      case 'beginItemDrag':
      case 'enterIdle':
        break
    }
  }

  let cooldownTimer = 0
  cleanups.push(() => clearTimeout(cooldownTimer))

  // ---------------------------------------------------------------------------
  // Layout

  let layout = measure(stage, anchor, headline, c)
  const applyLayout = () => {
    layout = measure(stage, anchor, headline, c)
    bag.setLayout(layout)
    for (const it of items.values()) it.setLayout(layout)
    if (state.name !== 'falling') for (const it of items.values()) reclamp(it)
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
  // Throws and landing spots

  /** Resting circles of every loose item except `id` (moving ones count where they'll stop). */
  const placedExcept = (id: ItemId): Placed[] => {
    const out: Placed[] = []
    for (const [oid, it] of items) {
      if (oid === id || !isLoose(state, oid) || it.kind === 'held' || it.kind === 'home') continue
      out.push(it.placed())
    }
    return out
  }

  /** Where a throw from p0 with velocity v0 comes to rest, given the zone and the others. */
  const planThrow = (it: Item, p0: Vec3, v0: Vec3, placed: Placed[], rotEnd: number): Planned => {
    const land = flightLanding({ ...p0, y: Math.max(p0.y, it.spec.restHeight) }, v0, config.gravity, it.spec.restHeight)
    const speed = Math.hypot(land.v.x, land.v.z)
    const [fx, fz] = c.fallDir
    const heading = speed > 1 ? Math.atan2(land.v.z, land.v.x) : Math.atan2(fz, fx)
    const fit = (p: FloorPoint) => {
      const circle = it.restCircle(p, rotEnd)
      return fits(layout.zone, circle, circle.r, placed, config.itemGap)
    }
    const spot = settleSpot({
      from: { x: land.p.x, z: land.p.z },
      heading,
      dist: stoppingDistance(speed, it.material.mu, config.gravity),
      fit,
      rand: r,
      step: config.shortenStep,
      tries: config.maxTries,
      spread: config.fanSpread,
    })
    return { target: { x: spot.x, z: spot.z }, fallback: spot.fallback, circle: it.restCircle(spot, rotEnd) }
  }

  /** Final rotation for items that turn as they go, and the banana's landing side. */
  const finish = (id: ItemId, rot0: number): ThrowOptions => {
    if (id === 'radish') return { rotEnd: rot0 + (r() < 0.5 ? -1 : 1) * rand(r, 60, 120) }
    if (id === 'banana') return { rotEnd: nearestTurn(r() < 0.5 ? 0 : 180, rot0) + rand(r, -12, 12), side: r() < 0.5 ? 'a' : 'b' }
    return {}
  }

  /** An exit throw with a little random spread in speed and direction. */
  const exitThrow = (id: ItemId): { p0: Vec3; v0: Vec3 } => {
    const e = c.exits[id]
    const m = config.items[id]
    const k = 1 + (r() * 2 - 1) * m.speedJitter
    const a = ((r() * 2 - 1) * m.angleJitter * Math.PI) / 180
    const cs = Math.cos(a)
    const sn = Math.sin(a)
    return {
      p0: { x: e.x, y: e.y, z: e.z },
      v0: { x: (e.vx * cs - e.vz * sn) * k, y: e.vy * k, z: (e.vx * sn + e.vz * cs) * k },
    }
  }

  const spawnItem = (id: ItemId) => {
    const it = items.get(id)!
    const e = c.exits[id]
    const { p0, v0 } = exitThrow(id)
    const f = finish(id, e.rot)
    const plan = planThrow(it, p0, v0, placedExcept(id), f.rotEnd ?? e.rot)
    it.spawn(p0, v0, e.rot, e.image, plan.target, f)
    dispatch({ type: 'itemSpawned', id })
  }

  /** Let go (or knocked): fly from where it is and come to rest somewhere that fits. */
  const throwItem = (it: Item, v0: Vec3) => {
    const plan = planThrow(it, it.pos, v0, placedExcept(it.id), it.rot)
    it.throwTo(v0, plan.target)
  }

  /** Dropped on the fallen bag: it rolls off its side, onto the floor in front. */
  const bumpOff = (id: ItemId) => {
    const it = items.get(id)!
    const hb = bag.hitbox()
    const centre = unproject(layout, { x: hb.cx, y: hb.cy + hb.h / 2 }) ?? { x: 0, y: 0, z: 0 }
    let dx = it.pos.x - centre.x
    let dz = it.pos.z - centre.z + 120
    const d = Math.hypot(dx, dz) || 1
    dx /= d
    dz /= d
    throwItem(it, { x: dx * config.bumpOffSpeed, y: config.bumpOffUp, z: dz * config.bumpOffSpeed })
  }

  /** After a resize: if a resting item no longer fits, nudge it to the nearest spot that does. */
  const reclamp = (it: Item) => {
    if (it.kind !== 'rest') return
    const placed = placedExcept(it.id)
    const fit = (p: FloorPoint) => {
      const circle = it.restCircle(p)
      return fits(layout.zone, circle, circle.r, placed, config.itemGap)
    }
    const here = { x: it.pos.x, z: it.pos.z }
    if (fit(here)) return
    it.throwTo({ x: 0, y: 0, z: 0 }, nearestFit(here, fit, config.shortenStep))
  }

  // ---------------------------------------------------------------------------
  // Pointer input

  const toStage = (e: PointerEvent): Vec => {
    const s = stage.getBoundingClientRect()
    return { x: e.clientX - s.left, y: e.clientY - s.top }
  }

  // A fast pass through the upright bag tips it over.
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
      const inside = distToRotRect(p, bag.hitbox()) === 0
      if (inside && !wasInside && Math.hypot(vel.x, vel.y) >= config.bumpSpeed) dispatch({ type: 'bump' })
      wasInside = inside
    },
    { passive: true },
  )

  // Bag: tap to tip, or grab to right it.
  const bagDrag = { pointer: -1, phi0: 0, lastP: 0, lastT: 0, vel: 0 }
  const pointerAngle = (p: Vec) => {
    const pv = bag.pivotStage()
    return (Math.atan2(p.y - pv.y, p.x - pv.x) * 180) / Math.PI
  }
  const sweep = (((c.scrub.up - c.scrub.rest) % 360) + 360) % 360
  onEl(bag.hitEl, 'pointerdown', (e) => {
    if (state.drag) return
    const fx = dispatch({ type: 'pressBag' })
    if (!fx.some((f) => f.type === 'beginBagDrag')) return
    e.preventDefault()
    bag.hitEl.setPointerCapture(e.pointerId)
    Object.assign(bagDrag, { pointer: e.pointerId, phi0: pointerAngle(toStage(e)), lastP: 0, lastT: e.timeStamp, vel: 0 })
  })
  onEl(bag.hitEl, 'pointermove', (e) => {
    if (e.pointerId !== bagDrag.pointer || state.drag?.kind !== 'bag') return
    const delta = ((pointerAngle(toStage(e)) - bagDrag.phi0 + 540) % 360) - 180
    const progress = Math.max(0, Math.min(1, delta / sweep))
    bag.scrubTo(progress)
    const dt = Math.max(1, e.timeStamp - bagDrag.lastT) / 1000
    // Logical degrees per second (the bag's angle runs from −90 to 0).
    bagDrag.vel = bagDrag.vel * 0.5 + (((progress - bagDrag.lastP) * -c.restAngle) / dt) * 0.5
    bagDrag.lastP = progress
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

  // Items: grab, carry on the ramp, let go.
  const itemDrag = { pointer: -1, id: null as ItemId | null, offset: { x: 0, y: 0 } }
  for (const [id, it] of items) {
    onEl(it.hitEl, 'pointerdown', (e) => {
      if (state.drag) return
      const fx = dispatch({ type: 'grabItem', id })
      if (!fx.some((f) => f.type === 'beginItemDrag')) return
      e.preventDefault()
      e.stopPropagation()
      it.hitEl.setPointerCapture(e.pointerId)
      const p = toStage(e)
      const pv = it.pivotStage()
      Object.assign(itemDrag, { pointer: e.pointerId, id, offset: { x: p.x - pv.x, y: p.y - pv.y } })
      it.beginHold()
      it.holdRay(stageRay(layout, pv))
      loop.wake()
    })
    onEl(it.hitEl, 'pointermove', (e) => {
      if (e.pointerId !== itemDrag.pointer || itemDrag.id !== id) return
      const p = toStage(e)
      it.holdRay(stageRay(layout, { x: p.x - itemDrag.offset.x, y: p.y - itemDrag.offset.y }))
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
    const m = c.mouth
    const tol = config.mouthTolerance
    const p = it.pos
    if (
      state.name === 'upright' &&
      bag.isLayered &&
      Math.abs(p.x - m.x) <= m.halfX * tol &&
      p.z >= m.z - m.halfZ * tol &&
      p.z <= m.z + m.halfZ * tol + 60 &&
      p.y >= m.rimY * 0.5
    ) {
      return 'mouth'
    }
    if (!bag.isLayered && inRotRect(it.screenCenter(), bag.hitbox())) return 'bag'
    return 'floor'
  }

  const dropHeldItem = () => {
    const id = itemDrag.id
    itemDrag.pointer = -1
    itemDrag.id = null
    if (!id || state.drag?.kind !== 'item' || state.drag.id !== id) return
    dispatch({ type: 'dropItem', id, over: dropTarget(items.get(id)!) })
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
    for (const it of items.values()) {
      const wasMoving = it.isMoving
      if (it.tick(dt, (aid) => dispatch({ type: 'snapArrived', id: aid }))) active = true
      // A throw that finished after a resize might sit outside the new zone.
      if (wasMoving && it.kind === 'rest' && state.name !== 'falling') {
        reclamp(it)
        if (it.isMoving) active = true
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
          const it = items.get(id)!
          const { p0, v0 } = exitThrow(id)
          const f = finish(id, c.exits[id].rot)
          const plan = planThrow(it, p0, v0, placed, f.rotEnd ?? c.exits[id].rot)
          const p = plan.circle
          if (!fits(layout.zone, p, p.r, placed, 0)) violations++
          if (plan.fallback) fallbacks++
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
