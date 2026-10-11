// The bag: layered upright group (shadow · back · homed items · front) or one frame image with
// its shadow, inside a "rotor" that carries the righting drag between drawn frames and the
// light settle when it stands. Everything inside .toy-bag is in frame pixels; one transform
// maps it onto the stage.

import type { Assets } from './assets.ts'
import { config } from './config.ts'
import { frameToStage, rectToStage, type Layout } from './layout.ts'
import { clamp, spring, springAtRest, type Spring } from './motion.ts'
import { rotate } from './hit.ts'
import { buildTimeline, exitTimes, type Timeline } from './timeline.ts'
import type { Contract, ItemId, RotRect, Vec } from './types.ts'

type Mode =
  | { kind: 'still' }
  | { kind: 'fall'; t: number; fired: Set<ItemId> }
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
  private frames = new Map<string, HTMLImageElement>()
  private shown: string[] = []
  private layered = true
  private mode: Mode = { kind: 'still' }
  private exitAt: Record<ItemId, number>
  private cb: BagCallbacks
  private layout: Layout | null = null
  /** Screen degrees swept by the mouth from lying to upright. */
  private sweep: number

  /** Rotor rotation in screen degrees, added on top of whatever is shown. */
  readonly rotor: Spring = { x: 0, v: 0 }
  /** Logical bag angle: 0 upright, restAngle lying. Drives frame choice. */
  angle = 0

  constructor(assets: Assets, cb: BagCallbacks) {
    const c = assets.contract
    this.contract = c
    this.cb = cb
    this.timeline = buildTimeline(c.fall, c.fps)
    this.exitAt = exitTimes(this.timeline, c.exits)
    this.sweep = (((c.scrub.up - c.scrub.rest) % 360) + 360) % 360

    const [w, h] = c.frameSize
    this.el = div('toy-bag', { width: `${w}px`, height: `${h}px` })
    this.rotorEl = div('toy-rotor')
    const framesEl = div('toy-frames')
    this.uprightEl = div('toy-upright')
    this.homedEl = div('toy-homed')

    const add = (path: string, parent: HTMLElement) => {
      if (this.frames.has(path)) return
      const img = assets.img(path)
      img.className = 'toy-frame'
      img.style.opacity = '0'
      parent.append(img)
      this.frames.set(path, img)
    }
    // Shadows first so every frame sits on top of them.
    for (const f of c.fall) add(f.shadow, framesEl)
    for (const r of c.right) add(r.shadow, framesEl)
    for (const f of c.fall) {
      add(f.src, framesEl)
      add(f.empty, framesEl)
    }
    for (const r of c.right) add(r.src, framesEl)

    const shadow = assets.img(c.upright.shadow)
    const back = assets.img(c.upright.back)
    const front = assets.img(c.upright.front)
    shadow.className = back.className = front.className = 'toy-layer'
    this.uprightEl.append(shadow, back, this.homedEl, front)
    this.rotorEl.append(framesEl, this.uprightEl)
    this.el.append(this.rotorEl)

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

  /** Rotor origin: leaning back (layered, positive) rocks on the back corner; everything else turns on the tipping corner. */
  private rotorOrigin(): Vec {
    const c = this.contract
    const [x, y] = this.layered && this.rotor.x > 0 ? c.rockPivot : c.origin
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

  /** Current hitbox in stage pixels. */
  hitbox(): RotRect {
    const l = this.layout!
    const r = this.layered ? this.contract.hitboxes.upright : this.contract.hitboxes.fallen
    const s = rectToStage(l, r)
    const c = this.toStage({ x: r.cx, y: r.cy })
    return { ...s, cx: c.x, cy: c.y, rot: r.rot + this.rotor.x }
  }

  /** The tipping corner in stage pixels (a righting drag turns around it). */
  pivotStage(): Vec {
    const [x, y] = this.contract.origin
    return frameToStage(this.layout!, { x, y })
  }

  /** Righting progress (0 lying → 1 upright) for a pointer at screen angle `deg` around the pivot. */
  progressAt(deg: number): number {
    const from = (((deg - this.contract.scrub.rest) % 360) + 360) % 360
    // Past upright or behind the lying pose: clamp to the nearer end.
    if (from > this.sweep) return from - this.sweep < (360 - this.sweep) / 2 ? 1 : 0
    return from / this.sweep
  }

  // ---------------------------------------------------------------------------
  // What's shown

  private show(paths: string[]) {
    for (const p of this.shown) if (!paths.includes(p)) this.frames.get(p)!.style.opacity = '0'
    for (const p of paths) this.frames.get(p)!.style.opacity = '1'
    this.shown = paths
  }

  private showLayered() {
    this.show([])
    this.layered = true
    this.uprightEl.style.opacity = '1'
  }

  private showFrame(src: string, shadow: string) {
    if (this.layered) {
      this.uprightEl.style.opacity = '0'
      this.layered = false
    }
    this.show([shadow, src])
  }

  /** Righting frame nearest a logical angle; the rotor carries the remainder. */
  private showForAngle(a: number) {
    const right = this.contract.right
    const k = this.sweep / -this.contract.restAngle
    if (a > right.at(-1)!.angle / 2) {
      this.showLayered()
      this.rotor.x = a * k
      return
    }
    let best = right[0]
    for (const r of right) if (Math.abs(r.angle - a) < Math.abs(best.angle - a)) best = r
    this.showFrame(best.src, best.shadow)
    this.rotor.x = (a - best.angle) * k
  }

  // ---------------------------------------------------------------------------
  // Behaviors

  startFall() {
    this.mode = { kind: 'fall', t: 0, fired: new Set() }
    this.rotor.x = this.rotor.v = 0
    const f = this.contract.fall[0]
    this.angle = f.angle
    this.showFrame(f.src, f.shadow)
  }

  beginScrub() {
    this.mode = { kind: 'scrub' }
    this.angle = this.contract.restAngle
    this.showForAngle(this.angle)
  }

  /** Righting progress from the drag (0 lying → 1 upright). */
  scrubTo(progress: number) {
    if (this.mode.kind !== 'scrub') return
    const rest = this.contract.restAngle
    this.angle = clamp(rest * (1 - progress), rest, 0)
    this.showForAngle(this.angle)
    this.render()
  }

  progress(): number {
    return 1 - this.angle / this.contract.restAngle
  }

  /** v: logical degrees per second at release. */
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
      case 'scrub':
        break
      case 'fall': {
        m.t += dt
        const f = c.fall[this.timeline.indexAt(m.t)]
        this.showFrame(f.src, f.shadow)
        this.angle = f.angle
        for (const id of Object.keys(this.exitAt) as ItemId[]) {
          if (!m.fired.has(id) && m.t >= this.exitAt[id]) {
            m.fired.add(id)
            this.cb.onExit(id)
          }
        }
        if (m.t >= this.timeline.duration) {
          this.angle = c.restAngle
          const r = c.right[0]
          this.showFrame(r.src, r.shadow)
          this.mode = { kind: 'still' }
          this.cb.onFallDone()
        }
        break
      }
      case 'raise': {
        // A light settle: it stands, leans back a touch, and comes to rest.
        spring(m.a, 0, dt, config.uprightK, config.uprightC)
        this.angle = Math.min(0, m.a.x)
        this.showForAngle(m.a.x)
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
          const r = c.right[0]
          this.showFrame(r.src, r.shadow)
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
    const hb = this.hitbox()
    this.hitEl.style.width = `${hb.w}px`
    this.hitEl.style.height = `${hb.h}px`
    this.hitEl.style.transform = `translate(${hb.cx - hb.w / 2}px, ${hb.cy - hb.h / 2}px) rotate(${hb.rot}deg)`
  }
}

function div(className: string, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  Object.assign(el.style, style)
  return el
}
