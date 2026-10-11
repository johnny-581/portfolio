// The bag: layered upright group (back · homed items · front) or one frame image, inside a
// "rotor" that adds wobble, get-up attempts, the righting scrub residual and the overshoot.
// Everything inside .toy-bag is in frame pixels; one transform maps it onto the stage.

import type { Assets } from './assets.ts'
import { config } from './config.ts'
import { frameToStage, rectToStage, type Layout } from './layout.ts'
import { clamp, lerp, spring, springAtRest, type Spring } from './motion.ts'
import { rotate } from './poses.ts'
import { buildTimeline, exitTimes, type Timeline } from './timeline.ts'
import type { Contract, ItemId, RotRect, Vec } from './types.ts'

type Mode =
  | { kind: 'still' }
  | { kind: 'wobble' }
  | { kind: 'fall'; t: number; fired: Set<ItemId> }
  | { kind: 'getUp'; t: number }
  | { kind: 'scrub' }
  | { kind: 'raise'; a: Spring }
  | { kind: 'lower'; a: Spring }

export interface BagCallbacks {
  onExit(id: ItemId): void
  onFallDone(): void
  onSettled(upright: boolean): void
}

export class Bag {
  readonly el: HTMLDivElement
  readonly hitEl: HTMLDivElement
  /** Homed items live in here, between the back and front layers. */
  readonly homedEl: HTMLDivElement
  readonly contract: Contract
  readonly timeline: Timeline

  private rotorEl: HTMLDivElement
  private uprightEl: HTMLDivElement
  private shadowEl: HTMLDivElement
  private frames = new Map<string, HTMLImageElement>()
  private shown: string | null = null
  private layered = true
  private mode: Mode = { kind: 'still' }
  private exitAt: Record<ItemId, number>
  private cb: BagCallbacks
  private layout: Layout | null = null

  /** Rotor rotation in degrees, added on top of whatever is shown. */
  readonly rotor: Spring = { x: 0, v: 0 }
  /** Logical bag angle: 0 upright, restAngle fallen. Drives frame choice and the shadow. */
  angle = 0

  constructor(assets: Assets, cb: BagCallbacks) {
    const c = assets.contract
    this.contract = c
    this.cb = cb
    this.timeline = buildTimeline(c.fall, c.fps)
    this.exitAt = exitTimes(this.timeline, c.exits)

    const [w, h] = c.frameSize
    this.el = div('toy-bag', { width: `${w}px`, height: `${h}px` })
    this.shadowEl = div('toy-bag-shadow')
    this.rotorEl = div('toy-rotor', { width: `${w}px`, height: `${h}px` })
    const framesEl = div('toy-frames')
    this.uprightEl = div('toy-upright')
    this.homedEl = div('toy-homed')

    const paths = new Set<string>()
    for (const f of c.fall) paths.add(f.src).add(f.empty)
    for (const r of c.right) paths.add(r.src)
    for (const p of paths) {
      const img = assets.img(p)
      img.className = 'toy-frame'
      img.style.opacity = '0'
      framesEl.append(img)
      this.frames.set(p, img)
    }
    const back = assets.img(c.upright.back)
    const front = assets.img(c.upright.front)
    back.className = front.className = 'toy-layer'
    this.uprightEl.append(back, this.homedEl, front)
    this.rotorEl.append(framesEl, this.uprightEl)
    this.el.append(this.shadowEl, this.rotorEl)

    this.hitEl = div('toy-bag-hit')
  }

  setLayout(l: Layout) {
    this.layout = l
    this.render()
  }

  get isLayered() {
    return this.layered
  }

  get busy() {
    return this.mode.kind !== 'still'
  }

  // ---------------------------------------------------------------------------
  // Geometry

  /** Rotor origin: leaning back (layered, positive) rocks on the front-right corner; everything else turns on the pivot. */
  private rotorOrigin(): Vec {
    const c = this.contract
    const [x, y] = this.layered && this.rotor.x > 0 ? c.rockPivot : c.pivot
    return { x, y }
  }

  /** Frame pixel → frame pixel with the rotor applied. */
  rotorApply(p: Vec): Vec {
    const o = this.rotorOrigin()
    const r = rotate({ x: p.x - o.x, y: p.y - o.y }, this.rotor.x)
    return { x: r.x + o.x, y: r.y + o.y }
  }

  /** Frame pixel → stage pixel, including the rotor. */
  toStage(p: Vec): Vec {
    return frameToStage(this.layout!, this.rotorApply(p))
  }

  /** Stage pixel → frame pixel (inverse of toStage). */
  toFrame(p: Vec): Vec {
    const l = this.layout!
    const f = { x: (p.x - l.origin.x) / l.scale, y: (p.y - l.origin.y) / l.scale }
    const o = this.rotorOrigin()
    const r = rotate({ x: f.x - o.x, y: f.y - o.y }, -this.rotor.x)
    return { x: r.x + o.x, y: r.y + o.y }
  }

  /** Current hitbox in stage pixels. */
  hitbox(): RotRect {
    const l = this.layout!
    const fallen = !this.layered
    const r = fallen ? this.contract.hitboxes.fallen : this.contract.hitboxes.upright
    const s = rectToStage(l, r)
    const c = this.toStage({ x: r.cx, y: r.cy })
    return { ...s, cx: c.x, cy: c.y, rot: r.rot + this.rotor.x }
  }

  mouthStage(): { x: number; y: number; r: number } {
    const m = this.contract.mouth.upright
    const p = this.toStage(m)
    return { ...p, r: (m.w * this.layout!.scale * config.mouthTolerance) / 2 }
  }

  /** Bag-local pivot in stage pixels (righting drag turns around this). */
  pivotStage(): Vec {
    const [x, y] = this.contract.pivot
    return frameToStage(this.layout!, { x, y })
  }

  // ---------------------------------------------------------------------------
  // What's shown

  private showLayered() {
    if (this.shown) this.frames.get(this.shown)!.style.opacity = '0'
    this.shown = null
    this.layered = true
    this.uprightEl.style.opacity = '1'
  }

  private showFrame(path: string) {
    if (this.layered) {
      this.uprightEl.style.opacity = '0'
      this.layered = false
    }
    if (this.shown === path) return
    if (this.shown) this.frames.get(this.shown)!.style.opacity = '0'
    this.frames.get(path)!.style.opacity = '1'
    this.shown = path
  }

  /** Righting frame nearest a logical angle (rotor carries the remainder). */
  private showForAngle(a: number) {
    const right = this.contract.right
    if (a > right[right.length - 1].angle / 2) {
      this.showLayered()
      this.rotor.x = a
      return
    }
    let best = right[0]
    for (const r of right) if (Math.abs(r.angle - a) < Math.abs(best.angle - a)) best = r
    this.showFrame(best.src)
    this.rotor.x = a - best.angle
  }

  // ---------------------------------------------------------------------------
  // Behaviors

  /** Pointer passing nearby: nudge the wobble in the direction it's moving. */
  kick(vx: number) {
    if (!this.layered || (this.mode.kind !== 'still' && this.mode.kind !== 'wobble')) return
    this.mode = { kind: 'wobble' }
    this.rotor.v = clamp(this.rotor.v + vx * config.wobbleKick, -60, 60)
  }

  startFall() {
    this.mode = { kind: 'fall', t: 0, fired: new Set() }
    this.angle = this.contract.fall[0].angle
    this.showFrame(this.contract.fall[0].src)
  }

  startGetUp() {
    if (this.mode.kind === 'still' && !this.layered) this.mode = { kind: 'getUp', t: 0 }
  }

  beginScrub() {
    this.mode = { kind: 'scrub' }
    this.angle = this.contract.restAngle
    this.showForAngle(this.angle)
  }

  /** Logical angle from the drag (clamped between fallen and upright). */
  scrubTo(a: number) {
    if (this.mode.kind !== 'scrub') return
    this.angle = clamp(a, this.contract.restAngle, 0)
    this.showForAngle(this.angle)
    this.renderShadow()
  }

  progress(): number {
    return 1 - this.angle / this.contract.restAngle
  }

  raise(v: number) {
    this.mode = { kind: 'raise', a: { x: this.angle, v } }
  }

  lower(v: number) {
    this.mode = { kind: 'lower', a: { x: this.angle, v } }
  }

  /** Jump straight to the tidy upright state (reduced motion, debug reset). */
  resetUpright() {
    this.mode = { kind: 'still' }
    this.angle = 0
    this.rotor.x = this.rotor.v = 0
    this.showLayered()
    this.render()
  }

  /** Advance; returns true while still moving. */
  tick(dt: number): boolean {
    const m = this.mode
    const c = this.contract
    switch (m.kind) {
      case 'still':
        break
      case 'wobble': {
        spring(this.rotor, 0, dt, config.wobbleK, config.wobbleC)
        this.rotor.x = clamp(this.rotor.x, -config.wobbleMax, config.wobbleMax)
        if (springAtRest(this.rotor, 0, 0.02)) {
          this.rotor.x = this.rotor.v = 0
          this.mode = { kind: 'still' }
        }
        break
      }
      case 'fall': {
        m.t += dt
        const i = this.timeline.indexAt(m.t)
        this.showFrame(c.fall[i].src)
        this.angle = c.fall[i].angle
        // Any leftover wobble decays while the frames play.
        spring(this.rotor, 0, dt, 300, 30)
        for (const id of Object.keys(this.exitAt) as ItemId[]) {
          if (!m.fired.has(id) && m.t >= this.exitAt[id]) {
            m.fired.add(id)
            this.cb.onExit(id)
          }
        }
        if (m.t >= this.timeline.duration) {
          this.rotor.x = this.rotor.v = 0
          this.angle = c.restAngle
          this.showFrame(c.right[0].src)
          this.mode = { kind: 'still' }
          this.cb.onFallDone()
        }
        break
      }
      case 'getUp': {
        m.t += dt
        const d = config.getUpDuration
        // Strain up, then flop back with a little bounce.
        const u = m.t / d
        this.rotor.x = u < 1 ? config.getUpAngle * Math.sin(Math.PI * u) ** 1.5 : -1.2 * Math.exp(-8 * (m.t - d)) * Math.sin(18 * (m.t - d))
        if (m.t > d + 0.5) {
          this.rotor.x = 0
          this.mode = { kind: 'still' }
        }
        break
      }
      case 'scrub':
        break
      case 'raise': {
        spring(m.a, 0, dt, config.uprightK, config.uprightC)
        // Past upright it keeps going a little (leaning back), then rocks home.
        this.angle = Math.min(0, m.a.x)
        if (m.a.x < 0) this.showForAngle(m.a.x)
        else {
          this.showLayered()
          this.rotor.x = m.a.x
        }
        if (springAtRest(m.a, 0, 0.05)) {
          this.angle = 0
          this.rotor.x = this.rotor.v = 0
          this.showLayered()
          this.mode = { kind: 'still' }
          this.cb.onSettled(true)
        }
        break
      }
      case 'lower': {
        const rest = c.restAngle
        spring(m.a, rest, dt, config.lowerK, config.lowerC)
        m.a.x = Math.max(rest, m.a.x)
        this.angle = m.a.x
        this.showForAngle(m.a.x)
        if (springAtRest(m.a, rest, 0.1) || (m.a.x <= rest && m.a.v <= 0)) {
          this.angle = rest
          this.rotor.x = this.rotor.v = 0
          this.showFrame(c.right[0].src)
          this.mode = { kind: 'still' }
          this.cb.onSettled(false)
        }
        break
      }
    }
    this.render()
    return this.mode.kind !== 'still'
  }

  // ---------------------------------------------------------------------------
  // Render

  render() {
    const l = this.layout
    if (!l) return
    this.el.style.transform = `translate(${l.origin.x}px, ${l.origin.y}px) scale(${l.scale})`
    const o = this.rotorOrigin()
    this.rotorEl.style.transform = `translate(${o.x}px, ${o.y}px) rotate(${this.rotor.x}deg) translate(${-o.x}px, ${-o.y}px)`
    this.renderShadow()
    const hb = this.hitbox()
    this.hitEl.style.width = `${hb.w}px`
    this.hitEl.style.height = `${hb.h}px`
    this.hitEl.style.transform = `translate(${hb.cx - hb.w / 2}px, ${hb.cy - hb.h / 2}px) rotate(${hb.rot}deg)`
  }

  private renderShadow() {
    const c = this.contract
    const t = clamp(this.angle / c.restAngle, 0, 1)
    const up = c.hitboxes.upright
    const fallen = c.hitboxes.fallen
    // Fallen rect is rotated, so its on-floor length is its h.
    const w = lerp(up.w * 0.85, fallen.h * 1.05, t)
    const cx = lerp(up.cx, fallen.cx, t)
    const y = c.pivot[1]
    this.shadowEl.style.transform = `translate(${cx - w / 2}px, ${y - 40}px) scaleX(${w / 100})`
  }
}

function div(className: string, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  Object.assign(el.style, style)
  return el
}
