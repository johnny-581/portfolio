// Loose items: tomato, radish, banana. Each one is a canvas-sized element moved only with
// transforms. While home it lives inside the bag (frame pixels); while loose it lives on the
// stage (stage pixels) with depth scale and a soft shadow.
//
// Motion while rolling is closed-form over time (hops + eased travel + damped settle), so a
// roll always ends exactly on the landing spot that was picked for it.

import type { Assets } from './assets.ts'
import type { Bag } from './bag.ts'
import { config, type ItemMotion } from './config.ts'
import { depthFactor, type Layout } from './layout.ts'
import {
  arcLengthTable,
  clamp,
  dampedSine,
  easeInOutCubic,
  hermite01,
  hopProfile,
  lerp,
  nearestTurn,
  quadBezier,
  quadBezierDeriv,
  rand,
  smoothstep,
  spring,
  springAtRest,
  type Spring,
} from './motion.ts'
import { rotate } from './poses.ts'
import type { Exit, ItemId, ItemSpec, Vec } from './types.ts'
import { clampIntoZone, type Placed } from './zone.ts'

const DEG = 180 / Math.PI
const SETTLE_TIME = 1.2

interface RollPlan {
  t: number
  g0: Vec
  ctrl: Vec
  target: Vec
  arc: ReturnType<typeof arcLengthTable>
  travel: number
  m0: number
  hop: ReturnType<typeof hopProfile>
  end: number
  rot0: number
  /** Rotation at the end of the travel (before settle). */
  rotEnd: number
  kind: 'spin' | 'sweep' | 'turn'
  spinDir: number
  settle: { amp: number; freq: number; decay: number }
  /** Banana: image to swap to at the top of the first bounce. */
  flipTo: string | null
  flipAt: number
  squashAt: number | null
}

type Mode =
  | { kind: 'home' }
  | { kind: 'roll'; plan: RollPlan }
  | { kind: 'rest' }
  | { kind: 'drag' }
  | { kind: 'snap'; t: number; p0: Vec; k0: number; inBag: boolean }

export class Item {
  readonly id: ItemId
  readonly spec: ItemSpec
  readonly el: HTMLDivElement
  readonly hitEl: HTMLDivElement
  readonly shadowEl: HTMLDivElement
  private hlEl: HTMLDivElement | null = null
  private imgs = new Map<string, HTMLImageElement>()
  private image = ''
  private bag: Bag
  private layout: Layout | null = null
  private looseLayer: HTMLElement
  private mode: Mode = { kind: 'home' }

  // Loose state (stage pixels)
  ground: Vec = { x: 0, y: 0 }
  h = 0
  rot = 0
  private lift: Spring = { x: 1, v: 0 }
  private height: Spring = { x: 0, v: 0 }
  private tilt: Spring = { x: 0, v: 0 }
  /** Dragged pivot position on screen (springs toward the pointer). */
  private sx: Spring = { x: 0, v: 0 }
  private sy: Spring = { x: 0, v: 0 }
  private dragTarget: Vec = { x: 0, y: 0 }
  private grabOffset: Vec = { x: 0, y: 0 }
  private dragVx = 0
  private rotSpring: Spring = { x: 0, v: 0 }
  private snapPos: Vec = { x: 0, y: 0 }
  private snapScale = 1
  /** Target spot of the current roll (debug overlay draws it). */
  landing: Vec | null = null

  constructor(id: ItemId, assets: Assets, bag: Bag, looseLayer: HTMLElement, shadowLayer: HTMLElement) {
    this.id = id
    this.bag = bag
    this.looseLayer = looseLayer
    this.spec = assets.contract.items[id]
    const [w, h] = this.spec.size
    const [px, py] = this.spec.pivot

    this.el = document.createElement('div')
    this.el.className = `toy-item toy-item-${id}`
    Object.assign(this.el.style, { width: `${w}px`, height: `${h}px`, transformOrigin: `${px}px ${py}px` })
    for (const [name, path] of Object.entries(this.spec.frames)) {
      const img = assets.img(path)
      img.className = 'toy-item-img'
      img.style.opacity = '0'
      this.el.append(img)
      this.imgs.set(name, img)
    }
    if (this.spec.highlight) {
      this.hlEl = document.createElement('div')
      this.hlEl.className = 'toy-item toy-item-hl'
      Object.assign(this.hlEl.style, { width: `${w}px`, height: `${h}px`, transformOrigin: `${px}px ${py}px` })
      const img = assets.img(this.spec.highlight)
      img.className = 'toy-item-img'
      this.hlEl.append(img)
    }

    this.hitEl = document.createElement('div')
    this.hitEl.className = 'toy-item-hit'
    this.hitEl.dataset.item = id
    const hs = this.spec.hit
    if (hs.type === 'circle') {
      Object.assign(this.hitEl.style, {
        left: `${px + hs.x - hs.r}px`,
        top: `${py + hs.y - hs.r}px`,
        width: `${hs.r * 2}px`,
        height: `${hs.r * 2}px`,
        borderRadius: '50%',
      })
    } else {
      const len = Math.hypot(hs.bx - hs.ax, hs.by - hs.ay)
      const ang = Math.atan2(hs.by - hs.ay, hs.bx - hs.ax) * DEG
      Object.assign(this.hitEl.style, {
        left: `${px + hs.ax - hs.r}px`,
        top: `${py + hs.ay - hs.r}px`,
        width: `${len + hs.r * 2}px`,
        height: `${hs.r * 2}px`,
        borderRadius: `${hs.r}px`,
        transformOrigin: `${hs.r}px ${hs.r}px`,
        transform: `rotate(${ang}deg)`,
      })
    }
    this.el.append(this.hitEl)

    this.shadowEl = document.createElement('div')
    this.shadowEl.className = 'toy-shadow'
    this.shadowEl.style.opacity = '0'
    shadowLayer.append(this.shadowEl)

    this.goHome()
  }

  setLayout(l: Layout) {
    this.layout = l
    this.render()
  }

  get kind() {
    return this.mode.kind
  }

  get isRolling() {
    return this.mode.kind === 'roll'
  }

  /** Stage position of the item's visual center (pivot + zone offset), for zone checks. */
  centerOf(ground: Vec, rot: number, k = this.scaleAt(ground.y)): Vec {
    const o = rotate({ x: this.spec.zone.offset[0] * k, y: this.spec.zone.offset[1] * k }, rot)
    return { x: ground.x + o.x, y: ground.y + o.y }
  }

  zoneRadius(groundY: number): number {
    return this.spec.zone.r * this.scaleAt(groundY)
  }

  placed(): Placed {
    const c = this.centerOf(this.ground, this.rot)
    return { ...c, r: this.zoneRadius(this.ground.y) }
  }

  /** Screen point under the visual center (what the pointer is "holding"). */
  screenCenter(): Vec {
    const c = this.centerOf(this.ground, this.rot)
    return { x: c.x, y: c.y - this.h }
  }

  /**
   * Where the item is being let go: the pointer's spot while dragging (the sprite may still
   * be springing toward it after a quick flick), otherwise its current center.
   */
  releaseCenter(): Vec {
    if (this.mode.kind !== 'drag') return this.screenCenter()
    const off = this.centerOf({ x: 0, y: 0 }, this.rot, this.scaleAt(this.ground.y) * this.lift.x)
    return { x: this.dragTarget.x + off.x, y: this.dragTarget.y + off.y }
  }

  private scaleAt(groundY: number): number {
    const l = this.layout!
    return l.scale * depthFactor(l, groundY)
  }

  private setImage(name: string) {
    if (this.image === name) return
    if (this.image) this.imgs.get(this.image)!.style.opacity = '0'
    this.imgs.get(name)!.style.opacity = '1'
    this.image = name
  }

  private imageName(path: string): string {
    for (const [name, p] of Object.entries(this.spec.frames)) if (p === path) return name
    return Object.keys(this.spec.frames)[0]
  }

  // ---------------------------------------------------------------------------
  // Transitions

  goHome() {
    const home = this.bag.contract.homes[this.id]
    this.mode = { kind: 'home' }
    this.setImage(this.imageName(home.image))
    this.insertIntoBag()
    this.shadowEl.style.opacity = '0'
    this.landing = null
    this.render()
  }

  private insertIntoBag() {
    const order: ItemId[] = ['radish', 'tomato', 'banana']
    const homed = this.bag.homedEl
    const after = order.slice(order.indexOf(this.id) + 1)
    const next = [...homed.children].find((c) => after.some((id) => c.classList.contains(`toy-item-${id}`)))
    homed.insertBefore(this.el, next ?? null)
    if (this.hlEl) homed.insertBefore(this.hlEl, this.el.nextSibling)
  }

  private insertLoose() {
    this.looseLayer.append(this.el)
    if (this.hlEl) this.looseLayer.append(this.hlEl)
  }

  /** Take over from the bag frame at the exit point and roll to `target` (the item's pivot). */
  spawn(exit: Exit, target: Vec, motion: ItemMotion, r: () => number, finalRot: number, side: string | null) {
    const l = this.layout!
    const s = this.bag.toStage({ x: exit.x, y: exit.y })
    const v = rotate({ x: exit.vx * l.scale, y: exit.vy * l.scale }, this.bag.rotor.x)
    const rot0 = exit.rot + this.bag.rotor.x
    this.insertLoose()
    this.setImage(this.imageName(exit.image))
    const back = l.zone.back
    const g0 = { x: s.x, y: Math.max(s.y, back) }
    this.ground = g0
    this.h = g0.y - s.y
    this.rot = rot0
    this.mode = { kind: 'roll', plan: this.plan(g0, this.h, v, target, motion, r, rot0, finalRot, side) }
    this.landing = target
    this.render()
  }

  private plan(
    g0: Vec,
    h0: number,
    v0: Vec,
    target: Vec,
    m: ItemMotion,
    r: () => number,
    rot0: number,
    finalRot: number,
    side: string | null,
    vhOverride?: number,
  ): RollPlan {
    const l = this.layout!
    const dx = target.x - g0.x
    const dy = target.y - g0.y
    const len = Math.hypot(dx, dy)
    // Bow the path toward the viewer (down the screen).
    let nx = -dy / (len || 1)
    let ny = dx / (len || 1)
    if (ny < 0) {
      nx = -nx
      ny = -ny
    }
    const bow = { x: (g0.x + target.x) / 2 + nx * m.curve * len, y: (g0.y + target.y) / 2 + ny * m.curve * len }
    const nominal = ((m.dist[0] + m.dist[1]) / 2) * l.bagH
    const travel = Math.max(0.2, m.travel * clamp(len / Math.max(1, nominal), 0.6, 1.3))
    // Start the ground path along the exit's horizontal velocity (height handles the vertical),
    // so the sprite keeps its speed through the handoff; then bend toward the target.
    const reach = clamp((v0.x * travel) / 2, -0.6 * len, 0.6 * len)
    const ctrl = Math.abs(v0.x) > 1 ? { x: lerp(bow.x, g0.x + reach, 0.7), y: lerp(bow.y, g0.y, 0.7) } : bow
    const fn = (u: number) => quadBezier(g0, ctrl, target, u)
    const arc = arcLengthTable(fn)

    // Match the handoff speed along the path so the sprite doesn't lurch.
    const d0 = quadBezierDeriv(g0, ctrl, target, 0)
    const d0len = Math.hypot(d0.x, d0.y) || 1
    const along = (v0.x * d0.x + v0.y * d0.y) / d0len
    const m0 = arc.total > 1 ? clamp((along * travel) / arc.total, 0, 2.8) : 0
    const groundVy0 = (d0.y * m0) / travel
    const vh0 = vhOverride ?? groundVy0 - v0.y
    const g = config.gravity * l.scale
    const hop = hopProfile(h0, vh0, g, m.hops, m.restitution)

    const spinDir = dx < 0 ? -1 : 1
    const kind: RollPlan['kind'] = this.id === 'tomato' ? 'spin' : this.id === 'radish' ? 'sweep' : 'turn'
    const radius = (this.spec.hit.type === 'circle' ? this.spec.hit.r : 40) * l.scale
    const rotEnd = kind === 'spin' ? rot0 + (spinDir * arc.total) / radius * DEG : finalRot

    return {
      t: 0,
      g0,
      ctrl,
      target,
      arc,
      travel,
      m0,
      hop,
      end: Math.max(travel, hop.end) + SETTLE_TIME,
      rot0,
      rotEnd,
      kind,
      spinDir,
      settle: { amp: m.settleAmp * (r() < 0.5 ? -1 : 1), freq: m.settleFreq, decay: m.settleDecay },
      flipTo: side && side !== this.image ? side : null,
      flipAt: hop.apexTimes[0] ?? hop.landTimes[0] * 0.6,
      squashAt: this.id === 'tomato' && this.spec.frames.squash ? hop.landTimes[0] : null,
    }
  }

  /** Stop wherever it is (grabbed mid-roll). */
  cancelRoll() {
    if (this.mode.kind === 'roll') {
      if (this.id === 'tomato') this.setImage('base')
      this.mode = { kind: 'rest' }
    }
  }

  beginDrag(pointer: Vec) {
    this.cancelRoll()
    this.mode = { kind: 'drag' }
    const p = { x: this.ground.x, y: this.ground.y - this.h }
    this.sx = { x: p.x, v: 0 }
    this.sy = { x: p.y, v: 0 }
    this.dragTarget = { ...p }
    this.grabOffset = { x: pointer.x - p.x, y: pointer.y - p.y }
    this.height = { x: this.h, v: 0 }
    this.lift = { x: this.lift.x, v: 0 }
    this.tilt = { x: 0, v: 0 }
  }

  /** Ground point under where the pointer let go (or the current one when not dragging). */
  private releaseGround(): Vec {
    return this.mode.kind === 'drag' ? { x: this.dragTarget.x, y: this.dragTarget.y + this.h } : this.ground
  }

  /** Fold the drag tilt into the rotation so letting go doesn't snap it straight. */
  private endDrag() {
    if (this.mode.kind !== 'drag') return
    this.rot += this.tilt.x
    this.tilt = { x: 0, v: 0 }
    this.mode = { kind: 'rest' }
  }

  dragTo(pointer: Vec, vx: number) {
    this.dragTarget = { x: pointer.x - this.grabOffset.x, y: pointer.y - this.grabOffset.y }
    this.dragVx = vx
  }

  /** Dropped on the floor: little hop, then stay (eased back into the zone if needed). */
  settle(placed: Placed[], r: () => number) {
    // Land where the pointer let go, even if the sprite is still catching up.
    const release = this.releaseGround()
    this.endDrag()
    const l = this.layout!
    const target = this.clampPivot(release, placed)
    this.mode = {
      kind: 'roll',
      plan: this.plan(this.ground, this.h, { x: 0, y: 0 }, target, quick(0.28, 1, 0.3), r, this.rot, this.rot, null, 140 * l.scale),
    }
    this.landing = target
  }

  /** Dropped on the fallen bag: pop up and roll 40–80px away from it. */
  bumpOff(from: Vec, placed: Placed[], r: () => number) {
    const g = this.releaseGround()
    this.endDrag()
    const l = this.layout!
    const dx = g.x - from.x
    const dy = g.y - from.y + 40
    const d = Math.hypot(dx, dy) || 1
    const dist = rand(r, config.bumpOffMin, config.bumpOffMax)
    const raw = { x: g.x + (dx / d) * dist, y: Math.max(g.y, l.zone.back) + (dy / d) * dist }
    const target = this.clampPivot(raw, placed)
    const spin = this.id === 'tomato' ? this.rot : this.rot + rand(r, -25, 25)
    this.mode = {
      kind: 'roll',
      plan: this.plan(this.ground, this.h, { x: 0, y: 0 }, target, quick(0.5, 1, 0.35), r, this.rot, spin, null, 360 * l.scale),
    }
    this.landing = target
  }

  /** Ease back inside the zone after a resize. */
  reclamp(placed: Placed[], r: () => number) {
    if (this.mode.kind !== 'rest') return
    const target = this.clampPivot(this.ground, placed)
    if (Math.hypot(target.x - this.ground.x, target.y - this.ground.y) < 0.5) return
    this.mode = {
      kind: 'roll',
      plan: this.plan(this.ground, 0, { x: 0, y: 0 }, target, quick(0.45, 0, 0), r, this.rot, this.rot, null, 0),
    }
    this.landing = target
  }

  /** Pivot position whose visual center fits the zone, as close to `pivot` as possible. */
  private clampPivot(pivot: Vec, placed: Placed[]): Vec {
    const l = this.layout!
    const c = this.centerOf(pivot, this.rot)
    const k = this.scaleAt(pivot.y)
    const fit = clampIntoZone(c, this.spec.zone.r * k, l.zone, placed, config.itemGap)
    return { x: pivot.x + (fit.x - c.x), y: pivot.y + (fit.y - c.y) }
  }

  snapHome() {
    this.endDrag()
    const k0 = this.scaleAt(this.ground.y) * this.lift.x
    this.mode = { kind: 'snap', t: 0, p0: { x: this.ground.x, y: this.ground.y - this.h }, k0, inBag: false }
    this.shadowEl.style.opacity = '0'
    this.rotSpring = { x: this.rot, v: 0 }
    this.landing = null
  }

  // ---------------------------------------------------------------------------

  /** Advance; returns true while still moving. `onArrive` fires when a snap lands. */
  tick(dt: number, onArrive: (id: ItemId) => void): boolean {
    const m = this.mode
    switch (m.kind) {
      case 'home':
      case 'rest':
        return false
      case 'roll':
        this.tickRoll(m.plan, dt)
        break
      case 'drag': {
        const sx = this.sx
        const sy = this.sy
        spring(sx, this.dragTarget.x, dt, config.springK, config.springC)
        spring(sy, this.dragTarget.y, dt, config.springK, config.springC)
        spring(this.height, config.liftHeight, dt, config.springK, config.springC)
        spring(this.lift, config.dragLift, dt, config.springK, config.springC)
        const vx = (this.dragVx + sx.v) / 2
        spring(this.tilt, clamp(vx * config.tiltFactor, -config.tiltMax, config.tiltMax), dt, config.rotK, config.rotC)
        this.dragVx *= Math.exp(-10 * dt)
        this.h = this.height.x
        // The pivot is held on screen; the ground point (and shadow) sits h below it.
        this.ground = { x: sx.x, y: sy.x + this.h }
        break
      }
      case 'snap': {
        m.t += dt
        const tau = Math.min(1, m.t / config.snapDuration)
        const home = this.bag.contract.homes[this.id]
        const p1 = this.bag.toStage({ x: home.x, y: home.y })
        const ctrl = { x: (m.p0.x + p1.x) / 2, y: Math.min(m.p0.y, p1.y) - config.snapArc * (this.layout!.scale / 0.35) }
        const p = quadBezier(m.p0, ctrl, p1, easeInOutCubic(tau))
        spring(this.rotSpring, nearestTurn(home.rot + this.bag.rotor.x, this.rotSpring.x), dt, config.rotK, config.rotC)
        spring(this.lift, 1, dt, config.springK, config.springC)
        this.rot = this.rotSpring.x
        const k = lerp(m.k0, this.layout!.scale * home.scale, smoothstep(tau))
        if (!m.inBag && tau >= 0.5) {
          // Top of the arc: drop in between the back and front layers.
          m.inBag = true
          this.insertIntoBag()
          this.setImage(this.imageName(home.image))
        }
        this.snapPos = p
        this.snapScale = k
        const rotTarget = nearestTurn(home.rot + this.bag.rotor.x, this.rotSpring.x)
        if (tau >= 1 && springAtRest(this.rotSpring, rotTarget, 0.3)) {
          this.goHome()
          onArrive(this.id)
          return false
        }
        break
      }
    }
    this.render()
    return true
  }

  private tickRoll(p: RollPlan, dt: number) {
    p.t += dt
    spring(this.lift, 1, dt, config.springK, config.springC)
    const t = p.t
    const tau = Math.min(1, t / p.travel)
    const u = hermite01(tau, p.m0)
    this.ground = quadBezier(p.g0, p.ctrl, p.target, u)
    this.h = p.hop.height(t)

    let rot: number
    if (p.kind === 'spin') {
      rot = p.rot0 + ((p.rotEnd - p.rot0) * p.arc.at(u)) / Math.max(1, p.arc.total)
    } else if (p.kind === 'sweep') {
      rot = lerp(p.rot0, p.rotEnd, u)
      // Roll cycle frames advance with distance travelled.
      const step = (2 * Math.PI * 38 * this.layout!.scale) / 3
      const travelled = p.arc.at(u) + Math.abs(p.rotEnd - p.rot0) * (Math.PI / 180) * 60 * this.layout!.scale
      this.setImage(`roll${(Math.floor(travelled / step) % 3) + 1}`)
    } else {
      const firstLand = p.hop.landTimes[1] ?? p.hop.landTimes[0]
      rot = lerp(p.rot0, p.rotEnd, smoothstep(Math.min(1, t / Math.max(0.05, Math.min(firstLand, p.travel)))))
    }
    if (t > p.travel) rot += dampedSine(t - p.travel, p.settle.amp, p.settle.freq, p.settle.decay)
    this.rot = rot

    if (p.flipTo && t >= p.flipAt) {
      this.setImage(p.flipTo)
      p.flipTo = null
    }
    if (p.squashAt !== null) {
      const fps = this.bag.contract.fps
      this.setImage(t >= p.squashAt && t < p.squashAt + 2 / fps ? 'squash' : 'base')
      if (t >= p.squashAt + 2 / fps) p.squashAt = null
    }

    if (t >= p.end) {
      this.ground = { ...p.target }
      this.h = 0
      this.rot = p.rotEnd
      this.mode = { kind: 'rest' }
    }
  }

  // ---------------------------------------------------------------------------

  render() {
    const l = this.layout
    if (!l) return
    const m = this.mode

    if (m.kind === 'home') {
      const home = this.bag.contract.homes[this.id]
      this.place(home.x, home.y, home.rot, home.scale)
      return
    }
    if (m.kind === 'snap') {
      if (m.inBag) {
        const f = this.bag.toFrame(this.snapPos)
        this.place(f.x, f.y, this.rot - this.bag.rotor.x, this.snapScale / l.scale)
      } else {
        this.place(this.snapPos.x, this.snapPos.y, this.rot, this.snapScale)
      }
      return
    }

    const k = this.scaleAt(this.ground.y) * this.lift.x
    const rot = this.rot + (m.kind === 'drag' ? this.tilt.x : 0)
    this.place(this.ground.x, this.ground.y - this.h, rot, k)

    // Shadow on the floor under the item; smaller and fainter the higher it is.
    const sh = this.spec.shadow
    const lifted = clamp(this.h / (120 * l.scale + 1), 0, 1)
    const so = sh.rotates ? rotate({ x: sh.offset[0] * k, y: sh.offset[1] * k }, this.rot) : { x: sh.offset[0] * k, y: sh.offset[1] * k }
    const sw = sh.w * k * (1 - 0.35 * lifted)
    const shh = sh.h * k * (1 - 0.2 * lifted)
    const cx = this.ground.x + so.x
    const cy = this.ground.y + so.y + 6 * lifted * l.scale
    this.shadowEl.style.opacity = String(0.9 - 0.5 * lifted)
    this.shadowEl.style.transform =
      `translate(${cx}px, ${cy}px) rotate(${sh.rotates ? this.rot : 0}deg) scale(${sw / 100}, ${shh / 100})`
  }

  /** Put the pivot at (x, y) in the current parent's coordinates. */
  private place(x: number, y: number, rot: number, k: number) {
    const [px, py] = this.spec.pivot
    this.el.style.transform = `translate(${x - px}px, ${y - py}px) rotate(${rot}deg) scale(${k})`
    if (this.hlEl) this.hlEl.style.transform = `translate(${x - px}px, ${y - py}px) scale(${k})`
  }

  /** Debug: zone circle in stage pixels. */
  debugCircle(): Placed | null {
    if (this.mode.kind === 'home' || this.mode.kind === 'snap' || !this.layout) return null
    return this.placed()
  }

  /** Debug: current hit shape endpoints in stage pixels. */
  debugHit(): { a: Vec; b: Vec; r: number } | null {
    if (this.mode.kind === 'home' || this.mode.kind === 'snap' || !this.layout) return null
    const k = this.scaleAt(this.ground.y) * this.lift.x
    const hs = this.spec.hit
    const base = { x: this.ground.x, y: this.ground.y - this.h }
    const at = (x: number, y: number) => {
      const v = rotate({ x: x * k, y: y * k }, this.rot)
      return { x: base.x + v.x, y: base.y + v.y }
    }
    if (hs.type === 'circle') return { a: at(hs.x, hs.y), b: at(hs.x, hs.y), r: hs.r * k }
    return { a: at(hs.ax, hs.ay), b: at(hs.bx, hs.by), r: hs.r * k }
  }
}

function quick(travel: number, hops: number, restitution: number): ItemMotion {
  return { dist: [0, 1], travel, hops, restitution, curve: 0, settleAmp: 3, settleFreq: 2.4, settleDecay: 6 }
}
