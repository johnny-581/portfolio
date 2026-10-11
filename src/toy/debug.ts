// ?debug overlay: zone, exclusions, hitboxes, exits, homes, pivot, landing targets.
// In dev builds it also loads Tweakpane (every config number, replay, replay ×50 stress run).

import { config } from './config.ts'
import { rotRectCorners } from './hit.ts'
import type { Engine } from './index.ts'
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
      `<rect x="${z.footprint.x}" y="${z.footprint.y}" width="${z.footprint.w}" height="${z.footprint.h}" fill="rgba(220,50,50,0.08)" stroke="#dc3232" stroke-dasharray="4 4"/>`,
    )
    if (z.headline) {
      const h = z.headline
      parts.push(`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="rgba(240,140,0,0.08)" stroke="#f08c00" stroke-dasharray="4 4"/>`)
    }

    // Bag
    parts.push(`<polygon points="${poly(bag.hitbox())}" fill="none" stroke="#2f6fde" stroke-width="1.5"/>`)
    parts.push(cross(bag.pivotStage(), '#2f6fde'))
    const m = bag.mouthStage()
    if (bag.isLayered) parts.push(`<circle cx="${m.x}" cy="${m.y}" r="${m.r}" fill="none" stroke="#2f6fde" stroke-dasharray="3 4"/>`)
    const fm = c.mouth.fallen
    parts.push(dot({ x: l.origin.x + fm.x * l.scale, y: l.origin.y + fm.y * l.scale }, '#2f6fde', 5))

    for (const id of Object.keys(c.exits) as ItemId[]) {
      const e = c.exits[id]
      const p = bag.toStage(e)
      parts.push(dot(p, '#e0218a'), `<text x="${p.x + 6}" y="${p.y - 6}" font-size="10" fill="#e0218a">${id} exit · f${e.frame}</text>`)
      parts.push(dot(bag.toStage(c.homes[id]), '#7a3fd0', 3))
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
      if (it.landing) parts.push(cross(it.landing, '#28a050'))
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
        trigger: ['wobbleRadius', 'bumpSpeed', 'wobbleKick', 'wobbleMax', 'wobbleK', 'wobbleC'],
        righting: ['scrubThreshold', 'uprightK', 'uprightC', 'lowerK', 'lowerC'],
        messy: ['getUpInterval', 'getUpAngle', 'getUpDuration', 'rearmDelay'],
        snap: ['snapDuration', 'snapArc', 'mouthTolerance'],
        drag: ['dragLift', 'liftHeight', 'tiltMax', 'tiltFactor', 'springK', 'springC', 'rotK', 'rotC'],
        fall: ['gravity', 'depthFar', 'depthNear', 'bumpOffMin', 'bumpOffMax', 'fanMin', 'fanMax'],
        zone: ['zoneFrontMargin', 'footprintPad', 'itemGap', 'shortenStep', 'maxTries'],
        time: ['timeScale'],
      }
      const cfg = config as unknown as Record<string, number>
      for (const [title, keys] of Object.entries(groups)) {
        const f = p.addFolder({ title, expanded: false })
        for (const key of keys) f.addBinding(cfg, key)
      }
      for (const [id, m] of Object.entries(config.items)) {
        const f = p.addFolder({ title: `item · ${id}`, expanded: false })
        const band = { near: m.dist[0], far: m.dist[1] }
        f.addBinding(band, 'near', { min: 0, max: 3, step: 0.05 }).on('change', (ev) => (m.dist[0] = ev.value))
        f.addBinding(band, 'far', { min: 0, max: 3, step: 0.05 }).on('change', (ev) => (m.dist[1] = ev.value))
        for (const key of ['travel', 'hops', 'restitution', 'curve', 'settleAmp', 'settleFreq', 'settleDecay'] as const) {
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
