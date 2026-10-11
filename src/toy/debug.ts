// ?debug overlay: zone, exclusions, hitboxes, exits, homes, pivot, landing targets.
// In dev builds it also loads Tweakpane (every config number, replay, replay ×50 stress run).

import { config } from './config.ts'
import { rotRectCorners } from './hit.ts'
import type { Engine } from './index.ts'
import { project } from './layout.ts'
import type { ItemId, RotRect, Vec } from './types.ts'

const NS = 'http://www.w3.org/2000/svg'

export function attachDebug(stage: HTMLElement, engine: Engine): () => void {
  const svg = document.createElementNS(NS, 'svg')
  svg.classList.add('toy-debug')
  stage.append(svg)
  let stress: { id: ItemId; x: number; y: number; r: number }[] = []

  const poly = (r: RotRect) => rotRectCorners(r).map((p) => `${p.x},${p.y}`).join(' ')
  const dot = (p: Vec, color: string, rr = 4) => `<circle cx="${p.x}" cy="${p.y}" r="${rr}" fill="${color}"/>`
  const cross = (p: Vec, color: string) =>
    `<path d="M ${p.x - 10} ${p.y} H ${p.x + 10} M ${p.x} ${p.y - 10} V ${p.y + 10}" stroke="${color}" stroke-width="2"/>`

  const draw = () => {
    const l = engine.layout
    const z = l.zone
    const c = engine.assets.contract
    const bag = engine.bag
    const parts: string[] = []
    svg.setAttribute('width', String(l.stageW))
    svg.setAttribute('height', String(l.stageH))

    // Zone and exclusions
    parts.push(
      `<rect x="${z.left}" y="${z.back}" width="${z.right - z.left}" height="${z.front - z.back}" fill="rgba(40,160,80,0.07)" stroke="#28a050" stroke-dasharray="6 5"/>`,
      `<polygon points="${z.footprint.map((q) => `${q.x},${q.y}`).join(' ')}" fill="rgba(220,50,50,0.08)" stroke="#dc3232" stroke-dasharray="4 4"/>`,
    )
    if (z.headline) {
      const h = z.headline
      parts.push(`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="rgba(240,140,0,0.08)" stroke="#f08c00" stroke-dasharray="4 4"/>`)
    }

    // Floor grid (world, every 150 units) seen through the camera
    for (let z = -300; z <= 1500; z += 150) {
      const a = project(l, { x: -1500, y: 0, z })
      const b = project(l, { x: 900, y: 0, z })
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2f6fde" stroke-opacity="${z === 0 ? 0.6 : 0.12}"/>`)
    }
    for (let x = -1500; x <= 900; x += 150) {
      const a = project(l, { x, y: 0, z: -300 })
      const b = project(l, { x, y: 0, z: 1500 })
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2f6fde" stroke-opacity="0.12"/>`)
    }

    // Bag
    parts.push(`<polygon points="${poly(bag.hitbox())}" fill="none" stroke="#2f6fde" stroke-width="1.5"/>`)
    parts.push(cross(bag.pivotStage(), '#2f6fde'))
    if (bag.isLayered) {
      // The mouth's drop target at rim height.
      const m = c.mouth
      const t = config.mouthTolerance
      const corners = [
        { x: m.x - m.halfX * t, z: m.z - m.halfZ * t },
        { x: m.x + m.halfX * t, z: m.z - m.halfZ * t },
        { x: m.x + m.halfX * t, z: m.z + m.halfZ * t + 60 },
        { x: m.x - m.halfX * t, z: m.z + m.halfZ * t + 60 },
      ].map((q) => project(l, { x: q.x, y: m.rimY, z: q.z }))
      parts.push(`<polygon points="${corners.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#2f6fde" stroke-dasharray="3 4"/>`)
    }

    for (const id of Object.keys(c.exits) as ItemId[]) {
      const e = c.exits[id]
      const p = project(l, e)
      parts.push(dot(p, '#e0218a'), `<text x="${p.x + 6}" y="${p.y - 6}" font-size="10" fill="#e0218a">${id} exit · f${e.frame}</text>`)
      parts.push(dot(project(l, c.homes[id]), '#7a3fd0', 3))
    }

    // Items
    for (const it of engine.items.values()) {
      const zc = it.debugCircle()
      if (zc) parts.push(`<circle cx="${zc.x}" cy="${zc.y}" r="${zc.r}" fill="none" stroke="#28a050"/>`)
      const h = it.debugHit()
      if (h) {
        parts.push(
          `<line x1="${h.a.x}" y1="${h.a.y}" x2="${h.b.x}" y2="${h.b.y}" stroke="rgba(47,111,222,0.35)" stroke-width="${h.r * 2}" stroke-linecap="round"/>`,
        )
      }
      if (it.landing) parts.push(cross(project(l, { x: it.landing.x, y: 0, z: it.landing.z }), '#28a050'))
    }

    for (const p of stress) {
      const color = p.id === 'tomato' ? '#e5483a' : p.id === 'banana' ? '#c9a200' : '#5e9b3e'
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-opacity="0.5"/>`)
    }

    parts.push(
      `<text x="${z.left}" y="${z.back - 6}" font-size="11" fill="#28a050">zone · state ${engine.state.name} · frames ${engine.loop.frames} · ${engine.loop.running ? 'running' : 'asleep'}</text>`,
    )
    svg.innerHTML = parts.join('')
  }

  const prevTick = engine.onTick
  const prevLayout = engine.onLayout
  engine.onTick = (dt) => {
    prevTick?.(dt)
    draw()
  }
  engine.onLayout = () => {
    prevLayout?.()
    draw()
  }
  // Keep the "asleep" label honest even when nothing ticks.
  const idleTimer = window.setInterval(draw, 500)
  draw()

  let pane: { dispose(): void } | null = null
  let disposed = false
  if (import.meta.env.DEV) {
    import('tweakpane').then(({ Pane }) => {
      if (disposed) return
      const p = new Pane({ title: 'grocery bag toy' })
      pane = p
      const result = { samples: 0, violations: 0, fallbacks: 0, underHeadline: 0 }
      p.addButton({ title: 'Replay fall' }).on('click', () => engine.replay())
      p.addButton({ title: 'Reset tidy' }).on('click', () => {
        stress = []
        engine.reset()
      })
      p.addButton({ title: 'Replay ×50 (landing stress)' }).on('click', () => {
        const res = engine.stress(50)
        stress = res.points
        Object.assign(result, { samples: res.samples, violations: res.violations, fallbacks: res.fallbacks, underHeadline: res.underHeadline })
        console.info('[toy] stress', result)
        draw()
      })
      p.addBinding(result, 'samples', { readonly: true })
      p.addBinding(result, 'violations', { readonly: true })
      p.addBinding(result, 'fallbacks', { readonly: true })
      p.addBinding(result, 'underHeadline', { readonly: true })

      const groups: Record<string, string[]> = {
        trigger: ['bumpSpeed', 'rearmDelay'],
        righting: ['scrubThreshold', 'uprightK', 'uprightC', 'lowerK', 'lowerC'],
        holding: ['heldLift', 'liftK', 'liftC', 'rampCurve', 'releaseCap', 'mouthTolerance'],
        world: ['gravity', 'bumpOffSpeed', 'bumpOffUp'],
        shadows: ['contactShadow', 'softShadow'],
        zone: ['zoneFrontMargin', 'footprintPad', 'itemGap', 'shortenStep', 'maxTries', 'fanSpread'],
        time: ['timeScale'],
      }
      const cfg = config as unknown as Record<string, number>
      for (const [title, keys] of Object.entries(groups)) {
        const f = p.addFolder({ title, expanded: false })
        for (const key of keys) f.addBinding(cfg, key)
      }
      for (const [id, m] of Object.entries(config.items)) {
        const f = p.addFolder({ title: `item · ${id}`, expanded: false })
        for (const key of ['mu', 'restitution', 'bounces', 'curve', 'rock', 'speedJitter', 'angleJitter'] as const) {
          f.addBinding(m, key)
        }
      }
      p.on('change', () => {
        engine.relayout()
        engine.wake()
      })
    })
  }

  return () => {
    disposed = true
    engine.onTick = prevTick
    engine.onLayout = prevLayout
    clearInterval(idleTimer)
    pane?.dispose()
    svg.remove()
  }
}
