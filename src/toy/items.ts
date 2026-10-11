// Loose items: tomato, radish, banana. Each is a canvas-sized element moved only with
// transforms. Its state is a world position (the pivot) and a screen rotation; the camera
// turns that into stage position and size every frame.
//
// Motion is world physics in closed form: a flight under gravity, small bounces, then a slide
// or roll that slows at a constant rate and stops exactly on the spot the zone picked.

import type { Assets } from './assets.ts'
import type { Bag } from './bag.ts'
import type { Ray } from './camera.ts'
import { config, type Material } from './config.ts'
import { rotate } from './hit.ts'
import { project, type Layout } from './layout.ts'
import { arcLengthTable, clamp, dampedSine, lerp, nearestTurn, quadBezier, smoothstep, snapToRest, spring, type Spring } from './motion.ts'
import {
  bounceHeight,
  bounces,
  capSpeed,
  flightAt,
  flightLanding,
  groundAt,
  groundMotion,
  timeToHeight,
  type Bounces,
  type Ground,
  type Landing,
} from './physics.ts'
import { rampPoint } from './ramp.ts'
import type { ItemId, ItemSpec, Vec, Vec3 } from './types.ts'
import { ITEM_IDS } from './types.ts'
import type { FloorPoint, Placed } from './zone.ts'

const DEG = 180 / Math.PI

interface Throw {
  t: number
  p0: Vec3
  v0: Vec3
  land: Landing
  hop: Bounces
  start: FloorPoint
  target: FloorPoint
  dir: FloorPoint
  ground: Ground
  /** Curved ground path (radish), by arc length. */
  curve: { at(s: number): FloorPoint } | null
  /** Horizontal speed in the air. */
  airSpeed: number
  rot0: number
  rotEnd: number
  /** Tomato: screen degrees per unit of distance travelled (signed). */
  spin: number
  rock: number
  end: number
}

type Mode =
  | { kind: 'home' }
  | { kind: 'throw'; plan: Throw }
  | { kind: 'rest' }
  | { kind: 'held' }
  | { kind: 'dropIn'; t: number; p0: Vec3; T: number; rot0: number; inBag: boolean }

export interface ThrowOptions {
  /** Final screen rotation for items that turn as they go (radish sweep, banana lying flat). */
  rotEnd?: number
  /** Image to land on (banana side). */
  side?: string
}

export class Item {
  readonly id: ItemId
  readonly spec: ItemSpec
  readonly el: HTMLDivElement
  readonly hitEl: HTMLDivElement
  private contactEl: HTMLDivElement
  private softEl: HTMLDivElement
  private imgs = new Map<string, HTMLImageElement>()
  private image = ''
  private bag: Bag
  private layout: Layout | null = null
  private looseLayer: HTMLElement
  private mode: Mode = { kind: 'home' }

  /** World position of the pivot. */
  pos: Vec3 = { x: 0, y: 0, z: 0 }
  /** Screen rotation, degrees. */
  rot = 0
  /** Where the current throw comes to rest (debug overlay, overlap checks). */
  landing: FloorPoint | null = null

  private ray: Ray | null = null
  private lift: Spring = { x: 0, v: 0 }
  private vel: Vec3 = { x: 0, y: 0, z: 0 }
  private flipTo: string | null = null

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

    this.softEl = document.createElement('div')
    this.contactEl = document.createElement('div')
    this.softEl.className = this.contactEl.className = 'toy-shadow'
    this.softEl.style.opacity = this.contactEl.style.opacity = '0'
    shadowLayer.append(this.softEl, this.contactEl)

    this.goHome()
  }

  setLayout(l: Layout) {
    this.layout = l
    this.render()
  }

  get kind() {
    return this.mode.kind
  }

  get isMoving() {
    return this.mode.kind === 'throw' || this.mode.kind === 'dropIn'
  }

  get material(): Material {
    return config.items[this.id]
  }

  // ---------------------------------------------------------------------------
  // Geometry

  /** Stage circle of the item resting on floor point p with screen rotation rot. */
  restCircle(p: FloorPoint, rot = this.rot): Placed {
    const s = project(this.layout!, { x: p.x, y: this.spec.restHeight, z: p.z })
    const o = rotate({ x: this.spec.zone.offset[0] * s.scale, y: this.spec.zone.offset[1] * s.scale }, rot)
    return { x: s.x + o.x, y: s.y + o.y, r: this.spec.zone.r * s.scale }
  }

  /** Stage circle where it is (or will come to rest, while moving). */
  placed(): Placed {
    if (this.landing && this.mode.kind === 'throw') return this.restCircle(this.landing, this.mode.plan.rotEnd)
    return this.restCircle({ x: this.pos.x, z: this.pos.z })
  }

  /** Stage point of the visual centre right now. */
  screenCenter(): Vec {
    const s = project(this.layout!, this.pos)
    const o = rotate({ x: this.spec.zone.offset[0] * s.scale, y: this.spec.zone.offset[1] * s.scale }, this.rot)
    return { x: s.x + o.x, y: s.y + o.y }
  }

  /** Stage point of the pivot right now. */
  pivotStage(): Vec {
    const s = project(this.layout!, this.pos)
    return { x: s.x, y: s.y }
  }

  private setImage(name: string) {
    if (this.image === name || !this.imgs.has(name)) return
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
    this.pos = { x: home.x, y: home.y, z: home.z }
    this.rot = home.rot
    this.setImage(this.imageName(home.image))
    this.insertIntoBag()
    this.softEl.style.opacity = this.contactEl.style.opacity = '0'
    this.landing = null
    this.render()
  }

  private insertIntoBag() {
    const homed = this.bag.homedEl
    const after = ITEM_IDS.slice(ITEM_IDS.indexOf(this.id) + 1)
    const next = [...homed.children].find((c) => after.some((id) => c.classList.contains(`toy-item-${id}`)))
    homed.insertBefore(this.el, next ?? null)
    this.el.style.zIndex = ''
  }

  /** Leave the bag frame at its exit and fly, land and roll to `target`. */
  spawn(p0: Vec3, v0: Vec3, rot0: number, image: string, target: FloorPoint, opts: ThrowOptions = {}) {
    this.looseLayer.append(this.el)
    this.setImage(this.imageName(image))
    this.pos = { ...p0 }
    this.rot = rot0
    this.throwTo(v0, target, opts)
  }

  /** Fly from where it is with velocity v0 and come to rest on `target`. */
  throwTo(v0: Vec3, target: FloorPoint, opts: ThrowOptions = {}) {
    const m = this.material
    const g = config.gravity
    const rest = this.spec.restHeight
    const p0 = { ...this.pos, y: Math.max(this.pos.y, rest) }
    const land = flightLanding(p0, v0, g, rest)
    const hop = bounces(-land.v.y, m.restitution, m.bounces, g)
    const start = { x: land.p.x, z: land.p.z }
    const dx = target.x - start.x
    const dz = target.z - start.z
    const dist = Math.hypot(dx, dz)
    const dir = dist > 1e-6 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 0 }
    let speed = Math.hypot(land.v.x, land.v.z)
    // Pushed from standstill (a nudge): the speed that friction brings to rest exactly there.
    if (dist > 0.5 && speed < 1) speed = Math.sqrt(2 * m.mu * g * dist)
    let ground = groundMotion(speed, dist)

    let curve: Throw['curve'] = null
    if (m.curve > 0 && dist > 1) {
      // Bow toward the viewer: the radish rolls in a curve around its thin tip.
      let nx = -dir.z
      let nz = dir.x
      if (nz < 0) {
        nx = -nx
        nz = -nz
      }
      const s0 = { x: start.x, y: start.z }
      const s1 = { x: target.x, y: target.z }
      const c = { x: (s0.x + s1.x) / 2 + nx * m.curve * dist, y: (s0.y + s1.y) / 2 + nz * m.curve * dist }
      const arc = arcLengthTable((u) => quadBezier(s0, c, s1, u))
      ground = groundMotion(speed, arc.total)
      curve = {
        at(s: number) {
          // Parameter for arc length s, by bisection on the table.
          let lo = 0
          let hi = 1
          for (let i = 0; i < 18; i++) {
            const mid = (lo + hi) / 2
            if (arc.at(mid) < s) lo = mid
            else hi = mid
          }
          const q = quadBezier(s0, c, s1, (lo + hi) / 2)
          return { x: q.x, z: q.y }
        },
      }
    }

    const l = this.layout!
    const screenDx = project(l, { x: target.x, y: rest, z: target.z }).x - project(l, p0).x
    const radius = this.spec.hit.type === 'circle' ? this.spec.hit.r : 36
    const airSpeed = Math.hypot(v0.x, v0.z)
    const travel = airSpeed * land.t + ground.dist
    // Where it would naturally stop turning, settled onto the nearest stable resting pose.
    let spin = 0
    let rotEnd: number
    if (this.id === 'tomato') {
      const natural = this.rot + (Math.sign(screenDx) || 1) * (DEG / radius) * travel
      rotEnd = snapToRest(natural, this.spec.restAngles)
      spin = travel > 1 ? (rotEnd - this.rot) / travel : 0
    } else {
      rotEnd = snapToRest(opts.rotEnd ?? this.rot, this.spec.restAngles)
    }
    const plan: Throw = {
      t: 0,
      p0,
      v0,
      land,
      hop,
      start,
      target,
      dir,
      ground,
      curve,
      airSpeed,
      rot0: this.rot,
      rotEnd,
      spin,
      rock: m.rock,
      end: land.t + Math.max(ground.T, hop.end) + (m.rock > 0 ? 1 : 0.02),
    }
    this.flipTo = opts.side && opts.side !== this.image ? opts.side : null
    this.mode = { kind: 'throw', plan }
    this.landing = target
  }

  /** Grabbed: stop wherever it is. */
  beginHold() {
    this.mode = { kind: 'held' }
    this.landing = null
    this.lift = { x: Math.max(0, this.pos.y - this.spec.restHeight), v: 0 }
    this.vel = { x: 0, y: 0, z: 0 }
    this.ray = null
    this.lastFollow = performance.now() / 1000
    this.el.style.zIndex = '5000'
  }

  /** The line from the camera through the cursor (minus the grab offset). Moves it right away, so a quick release lands where the pointer let go. */
  holdRay(ray: Ray, dt = 0) {
    this.ray = ray
    if (this.mode.kind === 'held') {
      this.followRay(dt)
      this.render()
    }
  }

  /** Put the held item on the ramp where the cursor's ray meets it; track its velocity. */
  private followRay(dt: number) {
    if (!this.ray) return
    const prev = this.pos
    const hit = rampPoint(this.ray, {
      base: this.spec.restHeight + this.lift.x,
      wallZ: 0,
      radius: config.rampCurve * this.bag.contract.bodyHeight,
    })
    this.pos = { x: hit.x, y: hit.y, z: hit.z }
    const now = performance.now() / 1000
    const step = dt > 0 ? dt : now - this.lastFollow
    this.lastFollow = now
    if (step > 1e-3 && step < 0.25) {
      const k = 0.35
      this.vel = {
        x: this.vel.x * (1 - k) + ((this.pos.x - prev.x) / step) * k,
        y: this.vel.y * (1 - k) + ((this.pos.y - prev.y) / step) * k,
        z: this.vel.z * (1 - k) + ((this.pos.z - prev.z) / step) * k,
      }
    }
  }

  private lastFollow = 0

  /** Velocity to carry into the fall when let go, capped. */
  releaseVelocity(): Vec3 {
    return capSpeed(this.vel, config.releaseCap)
  }

  /** Let go over the upright bag's mouth: fall in, easing into the slot on the way down. */
  dropIn() {
    const home = this.bag.contract.homes[this.id]
    const p0 = { ...this.pos }
    const fall = p0.y > home.y ? timeToHeight(p0.y, 0, config.gravity, home.y) : 0
    this.mode = { kind: 'dropIn', t: 0, p0, T: Math.max(0.22, fall), rot0: this.rot, inBag: false }
    this.landing = null
    this.softEl.style.opacity = this.contactEl.style.opacity = '0'
  }

  // ---------------------------------------------------------------------------

  /** Advance; returns true while still moving. `onArrive` fires when a drop-in lands home. */
  tick(dt: number, onArrive: (id: ItemId) => void): boolean {
    const m = this.mode
    switch (m.kind) {
      case 'home':
      case 'rest':
        return false
      case 'throw':
        this.tickThrow(m.plan, dt)
        break
      case 'held': {
        // Only the lift eases in here; the pointer moves it directly (holdRay).
        const before = this.lift.x
        spring(this.lift, config.heldLift, dt, config.liftK, config.liftC)
        if (Math.abs(this.lift.x - before) > 1e-3) this.followRay(0)
        // Velocity decays while the pointer rests, so letting go of a still item drops it straight down.
        const decay = Math.exp(-8 * dt)
        this.vel = { x: this.vel.x * decay, y: this.vel.y * decay, z: this.vel.z * decay }
        break
      }
      case 'dropIn': {
        m.t += dt
        const home = this.bag.contract.homes[this.id]
        const tau = Math.min(1, m.t / m.T)
        const e = smoothstep(tau)
        const y =
          m.p0.y > home.y ? Math.max(home.y, m.p0.y - 0.5 * config.gravity * m.t * m.t) : lerp(m.p0.y, home.y, e)
        this.pos = { x: lerp(m.p0.x, home.x, e), y, z: lerp(m.p0.z, home.z, e) }
        this.rot = lerp(m.rot0, nearestTurn(home.rot, m.rot0), e)
        if (!m.inBag && (y < this.bag.contract.mouth.rimY + 40 || tau >= 0.5)) {
          // Past the rim: between the back and front layers from here on.
          m.inBag = true
          this.insertIntoBag()
          this.setImage(this.imageName(home.image))
        }
        if (tau >= 1) {
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

  private tickThrow(p: Throw, dt: number) {
    p.t += dt
    const t = p.t
    const g = config.gravity
    const rest = this.spec.restHeight
    const airDist = p.airSpeed * p.land.t
    let travelled: number
    let onGround = 0
    if (t < p.land.t) {
      this.pos = flightAt(p.p0, p.v0, g, t)
      travelled = p.airSpeed * t
    } else {
      const tau = t - p.land.t
      onGround = groundAt(p.ground, tau)
      const xz = p.curve ? p.curve.at(onGround) : { x: p.start.x + p.dir.x * onGround, z: p.start.z + p.dir.z * onGround }
      this.pos = { x: xz.x, y: rest + bounceHeight(p.hop, g, tau), z: xz.z }
      travelled = airDist + onGround
    }

    if (this.id === 'tomato') {
      this.rot = p.rot0 + p.spin * travelled
    } else if (this.id === 'radish') {
      const frac = p.ground.dist > 0 ? clamp(onGround / p.ground.dist, 0, 1) : 1
      this.rot = lerp(p.rot0, p.rotEnd, frac)
      // Roll cycle: the rings move around the body as it rolls.
      const step = (2 * Math.PI * 34) / 3
      this.setImage(`roll${(Math.floor(travelled / step) % 3) + 1}`)
    } else {
      this.rot = lerp(p.rot0, p.rotEnd, smoothstep(clamp(t / (p.land.t + 0.2), 0, 1)))
      const stopped = t - p.land.t - p.ground.T
      if (stopped > 0) this.rot += dampedSine(stopped, p.rock, 2.6, 6)
    }
    if (this.flipTo && t >= p.land.t * 0.6) {
      this.setImage(this.flipTo)
      this.flipTo = null
    }

    if (t >= p.end) {
      this.pos = { x: p.target.x, y: rest, z: p.target.z }
      this.rot = p.rotEnd
      this.mode = { kind: 'rest' }
    }
  }

  // ---------------------------------------------------------------------------

  render() {
    const l = this.layout
    if (!l) return
    const m = this.mode
    const c = this.bag.contract
    if (m.kind === 'home' || (m.kind === 'dropIn' && m.inBag)) {
      // Frame pixels, inside the bag.
      const q = l.camera.project(this.pos)
      const scale = m.kind === 'home' ? c.homes[this.id].scale : 1
      this.place(c.origin[0] + q.x, c.origin[1] + q.y, this.rot, q.scale * scale)
      return
    }
    const s = project(l, this.pos)
    this.place(s.x, s.y, this.rot, s.scale)
    this.el.style.zIndex = m.kind === 'held' ? '5000' : String(Math.round(2000 + this.pos.z))
    this.renderShadows()
  }

  private renderShadows() {
    const l = this.layout!
    const [lx, ly, lz] = this.bag.contract.light
    const h = Math.max(0, this.pos.y - this.spec.restHeight)
    const sh = this.spec.shadow
    const aspect = l.camera.floorAspect
    const ellipse = (el: HTMLElement, at: Vec3, w: number, thick: number, opacity: number) => {
      const s = project(l, { x: at.x, y: 0, z: at.z })
      const o = sh.rotates ? rotate({ x: sh.offset[0] * s.scale, y: sh.offset[1] * s.scale }, this.rot) : { x: 0, y: 0 }
      const rot = sh.rotates ? this.rot : 0
      el.style.opacity = String(opacity)
      el.style.transform =
        `translate(${s.x + o.x}px, ${s.y + o.y * aspect}px) scale(1, ${aspect}) rotate(${rot}deg) ` +
        `scale(${(w * s.scale) / 100}, ${(thick * s.scale) / 100})`
    }
    const thick = (w: number) => (sh.rotates ? w * 0.34 : w)
    // Contact: tight and dark, only while touching the floor.
    ellipse(this.contactEl, this.pos, sh.w, thick(sh.w), (config.contactShadow / 0.26) * clamp(1 - h / 10, 0, 1))
    // Soft: cast along the light; grows, blurs and fades as the item rises.
    const k = h / -ly
    const softAt = { x: this.pos.x + lx * k, y: 0, z: this.pos.z + lz * k }
    const sw = sh.w * (1.3 + h / 160)
    ellipse(this.softEl, softAt, sw, thick(sw) * 1.3, config.softShadow / 0.26 / (1 + h / 220))
  }

  /** Put the pivot at (x, y) in the current parent's coordinates. */
  private place(x: number, y: number, rot: number, k: number) {
    const [px, py] = this.spec.pivot
    this.el.style.transform = `translate(${x - px}px, ${y - py}px) rotate(${rot}deg) scale(${k})`
  }

  /** Debug: zone circle in stage pixels. */
  debugCircle(): Placed | null {
    if (this.mode.kind === 'home' || this.mode.kind === 'dropIn' || !this.layout) return null
    const c = this.screenCenter()
    return { ...c, r: this.restCircle({ x: this.pos.x, z: this.pos.z }).r }
  }

  /** Debug: current hit shape endpoints in stage pixels. */
  debugHit(): { a: Vec; b: Vec; r: number } | null {
    if (this.mode.kind === 'home' || this.mode.kind === 'dropIn' || !this.layout) return null
    const s = project(this.layout, this.pos)
    const hs = this.spec.hit
    const at = (x: number, y: number) => {
      const v = rotate({ x: x * s.scale, y: y * s.scale }, this.rot)
      return { x: s.x + v.x, y: s.y + v.y }
    }
    if (hs.type === 'circle') return { a: at(hs.x, hs.y), b: at(hs.x, hs.y), r: hs.r * s.scale }
    return { a: at(hs.ax, hs.ay), b: at(hs.bx, hs.by), r: hs.r * s.scale }
  }
}
