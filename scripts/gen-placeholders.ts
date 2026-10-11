// Writes every placeholder SVG and bag.json from src/toy/poses.ts.
//
//   node scripts/gen-placeholders.ts
//
// public/art/     what the page loads (no guides)
// templates/art/  same files plus a <g id="guides"> layer (frame number, origin, floor grid,
//                 light direction, exit arrows): trace over these, then export to public/art.
//
// Style: flat cut-paper. No outlines; slightly uneven hand-cut edges; ink only for interior
// detail; flat fills with a tiled paper grain.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BAG_D,
  BAG_H,
  BAG_W,
  EXIT_FRAME,
  FALL_POSES,
  FRAME_SIZE,
  HOMES_LOCAL,
  ITEM_SPECS,
  LIGHT,
  MILK_LOCAL,
  ORIGIN,
  POSE0,
  SCALLION_LOCAL,
  bagScreenAngle,
  bakedItem,
  buildContract,
  camera,
  fallEmptySrc,
  fallSrc,
  isBaked,
  localToWorld,
  poseWorld,
  shadowSrc,
  tipVector,
  toFrame,
} from '../src/toy/poses.ts'
import type { Local, Pose } from '../src/toy/poses.ts'
import type { Contract, ItemId, Vec, Vec3 } from '../src/toy/types.ts'
import { ITEM_IDS } from '../src/toy/types.ts'

const C = {
  ink: '#1f1b17',
  kraftFront: '#c9a063',
  kraftSide: '#b48a55',
  kraftBack: '#bd945d',
  kraftLeft: '#ae8550',
  kraftBottom: '#a57c49',
  inFront: '#8e683b',
  inBack: '#9a7442',
  inSide: '#936d3e',
  inBottom: '#86623a',
  handle: '#d1a96d',
  tomato: '#e0433a',
  leaf: '#7faf3c',
  leafDark: '#3e7a2e',
  banana: '#f4d24a',
  bananaB: '#e9cc4a',
  stem: '#2b2418',
  teal: '#2e8c9a',
  milk: '#f7f5ef',
  milkShade: '#e4e0d4',
  radish: '#f1ede0',
  radishTop: '#c9dfa0',
  bulb: '#f3f1e4',
  guide: '#e0218a',
}

const n = (v: number) => Math.round(v * 10) / 10
const pts = (ps: Vec[]) => ps.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')

/** Deterministic noise in [-1, 1] from any numbers. */
function hash(...xs: number[]): number {
  let h = 2166136261
  for (const x of xs) {
    h ^= Math.round(x * 10)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return ((h >>> 0) / 4294967295) * 2 - 1
}

const GRAIN = (() => {
  const dots: string[] = []
  for (let i = 0; i < 70; i++) {
    const x = (hash(i, 1) * 0.5 + 0.5) * 40
    const y = (hash(i, 2) * 0.5 + 0.5) * 40
    const r = 0.5 + (hash(i, 3) * 0.5 + 0.5) * 0.9
    const dark = hash(i, 4) > 0
    dots.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${dark ? '#000' : '#fff'}" opacity="${dark ? 0.07 : 0.1}"/>`)
  }
  return `<pattern id="grain" width="40" height="40" patternUnits="userSpaceOnUse">${dots.join('')}</pattern>`
})()

function svgDoc(w: number, h: number, body: string, guides = '', defs = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    `<defs>${GRAIN}${defs}</defs>\n` +
    body +
    (guides ? `\n<g id="guides" fill="none" stroke="${C.guide}" stroke-width="2">${guides}</g>` : '') +
    `\n</svg>\n`
  )
}

/** A flat shape with paper grain on top. */
const paper = (points: string, fill: string) =>
  `<polygon points="${points}" fill="${fill}"/><polygon points="${points}" fill="url(#grain)"/>`
const paperPath = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/><path d="${d}" fill="url(#grain)"/>`

// ---------------------------------------------------------------------------
// Bag geometry

/** Flare and crumple near the rim, then a little hand-cut wobble. A function of the point, so shared edges stay shared. */
function deform(l: Local, p: Pose): Local {
  const w = Math.max(0, (l.c - (BAG_H - 140)) / 140)
  const da = (l.a - BAG_W / 2) / (BAG_W / 2)
  const db = (l.b - BAG_D / 2) / (BAG_D / 2)
  const sag = p.crumple * w * 28 * (0.55 + 0.45 * Math.sin(l.a * 0.045 + l.b * 0.08))
  const j = 2.4
  return {
    a: l.a + da * 14 * p.flare * w + hash(l.a, l.b, l.c, 1) * j,
    b: l.b + db * 12 * p.flare * w + hash(l.a, l.b, l.c, 2) * j,
    c: l.c - sag + hash(l.a, l.b, l.c, 3) * j,
  }
}

const frameOf = (p: Pose, l: Local) => toFrame(poseWorld(p, deform(l, p)))

/** Points along a polyline of local corners, every ~24 units, projected. */
function outline(p: Pose, corners: Local[], closed = true): Vec[] {
  const out: Vec[] = []
  const count = closed ? corners.length : corners.length - 1
  for (let i = 0; i < count; i++) {
    const s = corners[i]
    const e = corners[(i + 1) % corners.length]
    const len = Math.hypot(e.a - s.a, e.b - s.b, e.c - s.c)
    const steps = Math.max(1, Math.round(len / 24))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      out.push(frameOf(p, { a: s.a + (e.a - s.a) * t, b: s.b + (e.b - s.b) * t, c: s.c + (e.c - s.c) * t }))
    }
  }
  if (!closed) out.push(frameOf(p, corners.at(-1)!))
  return out
}

interface Face {
  name: 'front' | 'back' | 'side' | 'left' | 'bottom'
  corners: Local[]
  normal: Local
  ext: string
  int: string
}

const W = BAG_W
const D = BAG_D
const H = BAG_H
/** The side panels' top edges dip into a V at the gusset fold. */
const V = 56

const FACES: Face[] = [
  {
    name: 'front',
    corners: [{ a: 0, b: 0, c: 0 }, { a: W, b: 0, c: 0 }, { a: W, b: 0, c: H }, { a: 0, b: 0, c: H }],
    normal: { a: 0, b: -1, c: 0 },
    ext: C.kraftFront,
    int: C.inFront,
  },
  {
    name: 'back',
    corners: [{ a: 0, b: D, c: 0 }, { a: 0, b: D, c: H }, { a: W, b: D, c: H }, { a: W, b: D, c: 0 }],
    normal: { a: 0, b: 1, c: 0 },
    ext: C.kraftBack,
    int: C.inBack,
  },
  {
    name: 'side',
    corners: [{ a: 0, b: 0, c: 0 }, { a: 0, b: 0, c: H }, { a: 0, b: D / 2, c: H - V }, { a: 0, b: D, c: H }, { a: 0, b: D, c: 0 }],
    normal: { a: -1, b: 0, c: 0 },
    ext: C.kraftSide,
    int: C.inSide,
  },
  {
    name: 'left',
    corners: [{ a: W, b: 0, c: 0 }, { a: W, b: D, c: 0 }, { a: W, b: D, c: H }, { a: W, b: D / 2, c: H - V }, { a: W, b: 0, c: H }],
    normal: { a: 1, b: 0, c: 0 },
    ext: C.kraftLeft,
    int: C.inSide,
  },
  {
    name: 'bottom',
    corners: [{ a: 0, b: 0, c: 0 }, { a: 0, b: D, c: 0 }, { a: W, b: D, c: 0 }, { a: W, b: 0, c: 0 }],
    normal: { a: 0, b: 0, c: -1 },
    ext: C.kraftBottom,
    int: C.inBottom,
  },
]

/** Does the camera see this face's outside? */
function facesCamera(p: Pose, f: Face): boolean {
  const center = f.corners.reduce((s, c) => ({ a: s.a + c.a / f.corners.length, b: s.b + c.b / f.corners.length, c: s.c + c.c / f.corners.length }), { a: 0, b: 0, c: 0 })
  const cw = poseWorld(p, center)
  const nw = tipVector(localToWorld(f.normal), p.tip)
  const cam = camera.position
  return nw.x * (cam.x - cw.x) + nw.y * (cam.y - cw.y) + nw.z * (cam.z - cw.z) > 0
}

/** Flat strap handle on a face plane (b = 0 or D), as a band polygon. */
function handle(p: Pose, b: number): string {
  const out = b === 0 ? -2 : D + 2
  const legs = [70, 230]
  const top = H + 92
  const wBand = 22
  const outer: Local[] = [
    { a: legs[0], b: out, c: H - 46 },
    { a: legs[0], b: out, c: top - 30 },
    { a: legs[0] + 26, b: out, c: top },
    { a: legs[1] - 26, b: out, c: top },
    { a: legs[1], b: out, c: top - 30 },
    { a: legs[1], b: out, c: H - 46 },
  ]
  const inner: Local[] = [
    { a: legs[1] - wBand, b: out, c: H - 46 },
    { a: legs[1] - wBand, b: out, c: top - wBand - 24 },
    { a: legs[1] - wBand - 18, b: out, c: top - wBand },
    { a: legs[0] + wBand + 18, b: out, c: top - wBand },
    { a: legs[0] + wBand, b: out, c: top - wBand - 24 },
    { a: legs[0] + wBand, b: out, c: H - 46 },
  ]
  const o = outline(p, outer, false)
  const i = outline(p, inner, false)
  const band = pts([...o, ...i])
  const edge = (line: Vec[]) => `<polyline points="${pts(line)}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
  return paper(band, C.handle) + edge(o) + edge(i)
}

/** Ink detail on the outside: the near corner, the side panel's fold. */
function ink(p: Pose, visible: Set<Face['name']>): string {
  const lines: Vec[][] = []
  if (visible.has('front') || visible.has('side')) lines.push(outline(p, [{ a: 0, b: 0, c: 4 }, { a: 0, b: 0, c: H - 6 }], false))
  if (visible.has('side')) lines.push(outline(p, [{ a: 0, b: D / 2, c: 6 }, { a: 0, b: D / 2, c: H - V - 6 }], false))
  if (visible.has('left')) lines.push(outline(p, [{ a: W, b: D / 2, c: 6 }, { a: W, b: D / 2, c: H - V - 6 }], false))
  if (visible.has('back')) lines.push(outline(p, [{ a: 0, b: D, c: 4 }, { a: 0, b: D, c: H - 6 }], false))
  return lines
    .map((l) => `<polyline points="${pts(l)}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('')
}

// ---------------------------------------------------------------------------
// Contents drawn as flat billboards

/** A billboard group: drawing in its own coordinates, placed at a frame point, turned and scaled. */
const place = (x: number, y: number, rot: number, scale: number, body: string, pivot: [number, number] = [0, 0]) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n(scale * 1000) / 1000}) translate(${-pivot[0]} ${-pivot[1]})">${body}</g>`

function milkDrawing(): string {
  const { w, h } = MILK_LOCAL
  const hw = w / 2
  const neck = 22
  const top = -h / 2
  const bot = h / 2
  const body =
    `M ${-hw} ${bot - 12} Q ${-hw} ${bot} ${-hw + 12} ${bot} L ${hw - 12} ${bot} Q ${hw} ${bot} ${hw} ${bot - 12} ` +
    `L ${hw} ${top + 76} Q ${hw} ${top + 40} ${neck} ${top + 22} L ${neck} ${top + 12} L ${-neck} ${top + 12} ` +
    `L ${-neck} ${top + 22} Q ${-hw} ${top + 40} ${-hw} ${top + 76} Z`
  return (
    paperPath(body, C.milk) +
    `<path d="M ${hw - 16} ${top + 80} L ${hw - 16} ${bot - 14}" stroke="${C.milkShade}" stroke-width="12" stroke-linecap="round"/>` +
    paper(pts([{ x: -neck - 6, y: top - 4 }, { x: neck + 6, y: top - 6 }, { x: neck + 6, y: top + 16 }, { x: -neck - 6, y: top + 16 }]), C.teal)
  )
}

const SCALLION_DX = [-14, -2, 10, 20]

function scallionBulbs(): string {
  return SCALLION_DX.map(
    (dx) =>
      paperPath(`M ${dx - 7} 0 Q ${dx - 9} -60 ${dx - 5} -120 L ${dx + 5} -120 Q ${dx + 9} -60 ${dx + 7} 0 Q ${dx} 12 ${dx - 7} 0 Z`, C.bulb) +
      `<path d="M ${dx - 4} 6 l -4 12 M ${dx} 8 l 0 14 M ${dx + 4} 6 l 5 11" stroke="${C.milkShade}" stroke-width="2" stroke-linecap="round"/>`,
  ).join('')
}

/** Greens rising out of the bag and hanging over the right rim; flop bends them further down. */
function scallionGreens(flop: number): string {
  return SCALLION_DX.map((dx, i) => {
    const topY = -260 - i * 10
    const tipX = 70 + i * 24 + 40 * flop
    const tipY = -150 + i * 18 + 110 * flop
    const d = `M ${dx} -116 L ${dx + 4} ${topY} Q ${dx + 40 + 16 * flop} ${topY - 46 + 30 * flop} ${n(tipX)} ${n(tipY)}`
    return `<path d="${d}" fill="none" stroke="${i % 2 ? C.leafDark : C.leaf}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('')
}

function milk(p: Pose): string {
  const f = toFrame(poseWorld(p, { a: MILK_LOCAL.a, b: MILK_LOCAL.b, c: MILK_LOCAL.c + p.milk }))
  return place(f.x, f.y, bagScreenAngle(p), f.scale, milkDrawing())
}

function scallions(p: Pose, part: 'bulbs' | 'greens'): string {
  const f = toFrame(poseWorld(p, SCALLION_LOCAL))
  return place(f.x, f.y, bagScreenAngle(p), f.scale, part === 'bulbs' ? scallionBulbs() : scallionGreens(p.flop))
}

// ---------------------------------------------------------------------------
// Items (each in its own canvas; pivot from ITEM_SPECS)

function blob(cx: number, cy: number, r: number, seed: number, wobble = 2, squashY = 1): Vec[] {
  return Array.from({ length: 28 }, (_, i) => {
    const t = (i / 28) * Math.PI * 2
    const rr = r + hash(seed, i) * wobble
    return { x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr * squashY }
  })
}

function tomato(): string {
  const [cx, cy] = ITEM_SPECS.tomato.pivot
  const body = paper(pts(blob(cx, cy + 2, 49, 7, 2.2, 0.94)), C.tomato)
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const r = i % 2 ? 6 : 22 + hash(i, 9) * 3
    return { x: cx + Math.cos(a) * r, y: cy - 38 + Math.sin(a) * r * 0.62 }
  })
  return body + paper(pts(star), C.leafDark) + `<circle cx="${cx}" cy="${cy - 40}" r="4.5" fill="${C.stem}"/>`
}

function banana(side: 'a' | 'b'): string {
  const [cx, cy] = ITEM_SPECS.banana.pivot
  // Stem at the +x end on both sides; side b is the bunch flipped over its long axis.
  const bend = side === 'a' ? 1 : -1
  const fill = side === 'a' ? C.banana : C.bananaB
  const crown = { x: cx + 86, y: cy - 4 * bend }
  const fingers = [-1, 0, 1]
    .map((k) => {
      const tipX = cx - 98 + Math.abs(k) * 12
      const tipY = cy + k * 22 - 10 * bend
      const midY = cy + k * 18 + 30 * bend
      const d =
        `M ${crown.x} ${crown.y + k * 9} Q ${cx} ${midY + 14 * bend} ${tipX} ${tipY} ` +
        `Q ${cx - 8} ${midY - 8 * bend} ${crown.x} ${crown.y + k * 9 - 13 * bend} Z`
      const ridge = `M ${crown.x - 16} ${crown.y + k * 9 - 5 * bend} Q ${cx} ${midY + 1 * bend} ${tipX + 14} ${tipY}`
      return (
        paperPath(d, fill) +
        `<path d="${ridge}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>` +
        `<circle cx="${tipX + 2}" cy="${tipY}" r="4.5" fill="${C.stem}"/>`
      )
    })
    .join('')
  return (
    fingers +
    `<path d="M ${crown.x - 6} ${crown.y} l 26 ${-9 * bend}" stroke="${side === 'a' ? '#5e6b2a' : '#4f7a2e'}" stroke-width="10" stroke-linecap="round"/>` +
    `<circle cx="${crown.x + 21}" cy="${crown.y - 9 * bend}" r="5.5" fill="${C.stem}"/>`
  )
}

function radish(frame: number): string {
  const [tx, ty] = ITEM_SPECS.radish.pivot
  const len = 236
  const half = 34
  const body: Vec[] = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const wdt = half * Math.min(1, Math.sqrt(t) * 1.1) * (t > 0.94 ? Math.sqrt(1 - (t - 0.94) / 0.06 * 0.6) : 1)
    body.push({ x: tx + t * len, y: ty - wdt + hash(i, 21) * 1.2 })
  }
  for (let i = 20; i >= 0; i--) {
    const t = i / 20
    const wdt = half * Math.min(1, Math.sqrt(t) * 1.1) * (t > 0.94 ? Math.sqrt(1 - (t - 0.94) / 0.06 * 0.6) : 1)
    body.push({ x: tx + t * len, y: ty + wdt + hash(i, 22) * 1.2 })
  }
  const shoulder = body.filter((p) => p.x > tx + len * 0.74)
  // The roll cycle: rings and one mark move around the body.
  const shift = (frame - 1) * 15
  const rings = [56, 100, 144]
    .map((rx) => {
      const x = tx + 30 + ((rx + shift) % 150)
      const hw = Math.min(half - 4, 6 + (x - tx) * 0.2)
      return `<path d="M ${n(x)} ${n(ty - hw)} q 5 ${n(hw)} 0 ${n(2 * hw)}" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`
    })
    .join('')
  const markY = ty - 14 + (frame - 1) * 14
  const leaves = [-24, -8, 8, 22]
    .map((dy, i) => {
      const d = `M ${tx + len - 4} ${ty + dy * 0.5} q ${26 + i * 3} ${dy * 0.4 - 4 + frame * 2} ${56 - i * 5} ${dy * 1.2}`
      return `<path d="${d}" fill="none" stroke="${i % 2 ? C.leafDark : C.leaf}" stroke-width="11" stroke-linecap="round"/>`
    })
    .join('')
  return (
    leaves +
    paper(pts(body), C.radish) +
    `<polygon points="${pts(shoulder)}" fill="${C.radishTop}"/>` +
    rings +
    `<path d="M ${tx + 120} ${n(markY)} l 7 3" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`
  )
}

function itemBody(id: ItemId, image: string): string {
  if (id === 'tomato') return tomato()
  if (id === 'radish') return radish(Number(image.replace('roll', '')))
  return banana(image as 'a' | 'b')
}

function bakedFaller(id: ItemId, p: Pose): string {
  const b = bakedItem(id, p)
  return place(b.x, b.y, b.rot, b.scale, itemBody(id, HOMES_LOCAL[id].image), ITEM_SPECS[id].pivot)
}

/** Is a faller already past the rim (so it draws over the bag)? */
const pastRim = (id: ItemId, p: Pose) => HOMES_LOCAL[id].c + (p.slide[id] ?? 0) > H + 30

// ---------------------------------------------------------------------------
// Frames

function bagLayers(p: Pose, fallers: ItemId[]) {
  const visible = new Set<Face['name']>()
  const inside: string[] = []
  const outside: string[] = []
  for (const f of FACES) {
    const ext = facesCamera(p, f)
    const poly = pts(outline(p, f.corners))
    if (ext) {
      visible.add(f.name)
      outside.push(paper(poly, f.ext))
      if (f.name === 'front') outside.push(handle(p, 0))
      if (f.name === 'back') outside.push(handle(p, D))
    } else {
      inside.push(paper(poly, f.int))
      if (f.name === 'back') inside.push(handle(p, D))
    }
  }
  const contentsIn = [milk(p), scallions(p, 'bulbs'), ...fallers.filter((id) => !pastRim(id, p)).map((id) => bakedFaller(id, p))]
  const contentsOut = [scallions(p, 'greens'), ...fallers.filter((id) => pastRim(id, p)).map((id) => bakedFaller(id, p))]
  return {
    back: inside.join('\n') + '\n' + contentsIn.join('\n'),
    front: outside.join('\n') + '\n' + ink(p, visible) + '\n' + contentsOut.join('\n'),
  }
}

/** Upright layers: what sits behind the homed items, and what sits in front. */
function uprightLayers() {
  const p = POSE0
  const l = bagLayers(p, [])
  return l
}

function bagFrame(p: Pose, withFallers: (id: ItemId) => boolean): string {
  const fallers = ITEM_IDS.filter(withFallers)
  const l = bagLayers(p, fallers)
  return l.back + '\n' + l.front
}

/** Shadow of the box on the floor along the light: a soft cast shadow plus a tight contact one. */
function shadow(p: Pose): { body: string; defs: string } {
  const toFloor = (w: Vec3): Vec3 => {
    const t = w.y / -LIGHT.y
    return { x: w.x + LIGHT.x * t, y: 0, z: w.z + LIGHT.z * t }
  }
  const samples: Local[] = []
  for (const a of [0, W / 2, W]) for (const b of [0, D]) for (const c of [0, H / 2, H]) samples.push({ a, b, c })
  const cast = hull(samples.map((l) => toFrame(toFloor(poseWorld(p, l)))))
  const contact = hull(
    samples
      .map((l) => poseWorld(p, l))
      .filter((w) => w.y < 20)
      .map((w) => toFrame({ ...w, y: 0 })),
  )
  return {
    defs:
      `<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/></filter>` +
      `<filter id="tight" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>`,
    body:
      `<polygon points="${pts(cast)}" fill="#50371a" opacity="0.16" filter="url(#soft)"/>` +
      (contact.length > 2 ? `<polygon points="${pts(contact)}" fill="#50371a" opacity="0.3" filter="url(#tight)"/>` : ''),
  }
}

/** Convex hull (monotone chain). */
function hull(points: Vec[]): Vec[] {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (ps.length < 3) return ps
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec[] = []
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Vec[] = []
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// ---------------------------------------------------------------------------
// Guides

function cross(x: number, y: number, r = 16): string {
  return `<path d="M ${n(x - r)} ${n(y)} H ${n(x + r)} M ${n(x)} ${n(y - r)} V ${n(y + r)}"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.45)}"/>`
}

function floorGrid(): string {
  const lines: string[] = []
  for (let z = -450; z <= 900; z += 150) {
    const a = toFrame({ x: -900, y: 0, z })
    const b = toFrame({ x: 600, y: 0, z })
    lines.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" opacity="0.35"/>`)
  }
  for (let x = -900; x <= 600; x += 150) {
    const a = toFrame({ x, y: 0, z: -450 })
    const b = toFrame({ x, y: 0, z: 900 })
    lines.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" opacity="0.35"/>`)
  }
  return lines.join('')
}

function lightArrow(): string {
  const s = { x: 120, y: 120 }
  const len = 90
  const e = { x: s.x + LIGHT.x * len, y: s.y - LIGHT.y * len }
  return (
    `<path d="M ${s.x} ${s.y} L ${n(e.x)} ${n(e.y)}" stroke-width="3"/>` +
    `<text x="${s.x - 20}" y="${s.y - 12}" font-size="20" font-family="sans-serif" fill="${C.guide}" stroke="none">light</text>`
  )
}

function frameGuides(label: string, exits: Contract['exits'], frame?: number): string {
  const parts = [
    `<text x="24" y="52" font-size="36" font-family="sans-serif" fill="${C.guide}" stroke="none">${label}</text>`,
    floorGrid(),
    lightArrow(),
    cross(ORIGIN.x, ORIGIN.y),
  ]
  if (frame !== undefined) {
    for (const id of ITEM_IDS) {
      const e = exits[id]
      if (e.frame !== frame) continue
      const a = toFrame(e)
      const b = toFrame({ x: e.x + e.vx * 0.1, y: e.y + e.vy * 0.1, z: e.z + e.vz * 0.1 })
      parts.push(cross(a.x, a.y, 10), `<path d="M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}" stroke-width="4"/>`)
      parts.push(`<text x="${n(b.x + 8)}" y="${n(b.y + 20)}" font-size="22" font-family="sans-serif" fill="${C.guide}" stroke="none">${id} exits</text>`)
    }
  }
  return parts.join('')
}

function itemGuides(id: ItemId, label: string): string {
  const spec = ITEM_SPECS[id]
  return (
    `<rect x="1" y="1" width="${spec.size[0] - 2}" height="${spec.size[1] - 2}" stroke-dasharray="8 8"/>` +
    cross(spec.pivot[0], spec.pivot[1], 10) +
    `<text x="8" y="22" font-size="15" font-family="sans-serif" fill="${C.guide}" stroke="none">${label}</text>`
  )
}

// ---------------------------------------------------------------------------

export interface Rendered {
  body: string
  guides: string
  size: [number, number]
  defs?: string
}

export function renderAll(): { files: Map<string, Rendered>; contract: Contract } {
  const contract = buildContract()
  const files = new Map<string, Rendered>()
  const up = uprightLayers()
  files.set('bag/upright-back.svg', { body: up.back, guides: frameGuides('upright · back layer', contract.exits), size: FRAME_SIZE })
  files.set('bag/upright-front.svg', { body: up.front, guides: frameGuides('upright · front layer', contract.exits), size: FRAME_SIZE })
  const s0 = shadow(POSE0)
  files.set(shadowSrc(0), { body: s0.body, defs: s0.defs, guides: frameGuides('shadow · upright', contract.exits), size: FRAME_SIZE })

  for (let f = 1; f < FALL_POSES.length; f++) {
    const p = FALL_POSES[f]
    files.set(fallSrc(f), { body: bagFrame(p, (id) => isBaked(id, f)), guides: frameGuides(`fall ${f} · ${p.tip}°`, contract.exits, f), size: FRAME_SIZE })
    files.set(fallEmptySrc(f), { body: bagFrame(p, () => false), guides: frameGuides(`fall-empty ${f} · ${p.tip}°`, contract.exits), size: FRAME_SIZE })
    const s = shadow(p)
    files.set(shadowSrc(f), { body: s.body, defs: s.defs, guides: frameGuides(`shadow ${f}`, contract.exits), size: FRAME_SIZE })
  }

  for (const id of ITEM_IDS) {
    const spec = ITEM_SPECS[id]
    for (const [name, path] of Object.entries(spec.frames)) {
      files.set(path, { body: itemBody(id, name), guides: itemGuides(id, `${id} · ${name}`), size: spec.size })
    }
  }

  for (const id of ITEM_IDS) {
    if (isBaked(id, EXIT_FRAME[id])) throw new Error(`${id} still baked into its exit frame`)
  }
  return { files, contract }
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const { files, contract } = renderAll()
  for (const dir of ['public/art', 'templates/art']) rmSync(join(root, dir), { recursive: true, force: true })
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  for (const [rel, f] of files) {
    write(join(root, 'public/art', rel), svgDoc(f.size[0], f.size[1], f.body, '', f.defs))
    write(join(root, 'templates/art', rel), svgDoc(f.size[0], f.size[1], f.body, f.guides, f.defs))
  }
  write(join(root, 'public/art/bag.json'), JSON.stringify(contract, null, 2) + '\n')
  console.log(`wrote ${files.size} SVGs (+ ${files.size} templates) and bag.json`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
