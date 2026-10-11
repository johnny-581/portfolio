// Writes every placeholder SVG and bag.json from src/toy/poses.ts.
//
//   node scripts/gen-placeholders.ts
//
// public/art/     what the page loads (no guides)
// templates/art/  same files plus a <g id="guides"> layer (frame number, pivot, floor line,
//                 exit arrows): trace over these, then export to public/art with the same name.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BAG,
  EXIT_FRAME,
  FALL_POSES,
  FRAME_SIZE,
  HOMES_LOCAL,
  ITEM_SPECS,
  MILK_LOCAL,
  PIVOT,
  POSE0,
  POSE_L1,
  SCALLION_LOCAL,
  bakedItem,
  buildContract,
  fallEmptySrc,
  fallSrc,
  isBaked,
  rotationOrigin,
} from '../src/toy/poses.ts'
import type { Pose } from '../src/toy/poses.ts'
import type { Contract, ItemId, Vec } from '../src/toy/types.ts'
import { ITEM_IDS } from '../src/toy/types.ts'

const C = {
  line: '#2a1d17',
  kraft: '#c9a06a',
  kraftSide: '#b48650',
  kraftRim: '#bb8f5b',
  kraftInside: '#7a5631',
  tomato: '#e5483a',
  tomatoShade: '#a92a22',
  leaf: '#3f8f3a',
  leafLight: '#6fa84a',
  banana: '#f2d04b',
  bananaB: '#e3c544',
  bananaShade: '#cfa531',
  stem: '#3a2a1a',
  radish: '#f4f1e8',
  radishTop: '#d4e6b5',
  milk: '#fafaf7',
  glass: '#a9b8bf',
  cap: '#f2e6c9',
  string: '#c0392b',
  scallionWhite: '#f3f1e4',
  scallion: '#5e9b3e',
  guide: '#e0218a',
}

const STROKE = `stroke="${C.line}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`

const n = (v: number) => Math.round(v * 10) / 10
const pts = (ps: Vec[]) => ps.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')

function svgDoc(w: number, h: number, body: string, guides = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    body +
    (guides ? `\n<g id="guides" fill="none" stroke="${C.guide}" stroke-width="2">${guides}</g>` : '') +
    `\n</svg>\n`
  )
}

// ---------------------------------------------------------------------------
// Bag (drawn in bag-local coordinates; the pose is applied as one SVG transform)

function poseTransform(p: Pose): string {
  const o = rotationOrigin(p)
  return (
    `translate(${PIVOT.x} ${PIVOT.y}) translate(${n(o.x)} ${n(o.y)}) rotate(${p.angle}) ` +
    `translate(${n(-o.x)} ${n(-o.y)}) scale(${p.sx} ${p.sy})`
  )
}

/** Mouth corners, flared open by the pose. */
function mouth(p: Pose) {
  const f = p.flare
  return {
    D: { x: BAG.D.x - 22 * f, y: BAG.D.y - 8 * f },
    G: { x: BAG.G.x + 6 * f, y: BAG.G.y - 34 * f },
    F: { x: BAG.F.x + 26 * f, y: BAG.F.y - 18 * f },
    C: { x: BAG.C.x - 6 * f, y: BAG.C.y + 4 * f },
  }
}

/** Front rim from C to F, sagging in two places when crumpled. */
function frontRim(p: Pose, m: ReturnType<typeof mouth>): Vec[] {
  const k = p.crumple
  const lerp = (t: number, dy: number) => ({
    x: m.C.x + (m.F.x - m.C.x) * t,
    y: m.C.y + (m.F.y - m.C.y) * t + dy,
  })
  return [m.C, lerp(0.33, 38 * k), lerp(0.55, 8 * k), lerp(0.78, 30 * k), m.F]
}

function bagBack(p: Pose): string {
  const m = mouth(p)
  const opening = pts([m.D, m.G, m.F, ...frontRim(p, m).reverse().slice(1)])
  const handle = `M 70 ${m.D.y - 6} C 90 -640, 250 -650, 262 ${m.G.y - 2}`
  return [
    `<polygon points="${opening}" fill="${C.kraftInside}" ${STROKE}/>`,
    `<path d="${handle}" fill="none" stroke="${C.line}" stroke-width="22" stroke-linecap="round"/>`,
    `<path d="${handle}" fill="none" stroke="${C.kraftSide}" stroke-width="15" stroke-linecap="round"/>`,
    milk(p),
    scallionBulbs(),
  ].join('\n')
}

function bagFront(p: Pose): string {
  const m = mouth(p)
  const rim = frontRim(p, m)
  const k = p.crumple
  const side = pts([BAG.A, BAG.B, m.C, { x: (m.C.x + m.D.x) / 2, y: (m.C.y + m.D.y) / 2 + 18 * k }, m.D])
  const front = pts([BAG.B, BAG.E, m.F, ...rim.slice(1, -1).reverse(), m.C])
  const rimBand = pts([...rim, ...rim.map((r) => ({ x: r.x, y: r.y + 26 })).reverse()])
  const handle = `M 150 ${rim[0].y + 4} C 170 -610, 350 -620, 372 ${rim[rim.length - 1].y + 6}`
  const creases =
    k > 0
      ? `<path d="M 160 ${-300 - 40 * k} l 60 30 l -20 50 M 300 ${-200 - 30 * k} l 50 -20 l 10 60" fill="none" stroke="${C.line}" stroke-width="3" opacity="${0.4 + 0.5 * k}"/>`
      : ''
  return [
    `<polygon points="${side}" fill="${C.kraftSide}" ${STROKE}/>`,
    `<polygon points="${front}" fill="${C.kraft}" ${STROKE}/>`,
    `<polygon points="${rimBand}" fill="${C.kraftRim}" stroke="none"/>`,
    `<polyline points="${pts(rim.map((r) => ({ x: r.x, y: r.y + 26 })))}" fill="none" stroke="${C.line}" stroke-width="3"/>`,
    `<line x1="${BAG.B.x}" y1="${BAG.B.y}" x2="${m.C.x}" y2="${m.C.y}" stroke="${C.line}" stroke-width="4"/>`,
    `<line x1="40" y1="${BAG.A.y + 3}" x2="40" y2="${m.D.y + 10}" stroke="${C.line}" stroke-width="3"/>`,
    creases,
    `<path d="${handle}" fill="none" stroke="${C.line}" stroke-width="22" stroke-linecap="round"/>`,
    `<path d="${handle}" fill="none" stroke="${C.kraft}" stroke-width="15" stroke-linecap="round"/>`,
    scallionGreens(p),
  ].join('\n')
}

function milk(p: Pose): string {
  const { x, w, h } = MILK_LOCAL
  const y = MILK_LOCAL.y - p.milk
  const top = y - h / 2
  const bot = y + h / 2
  const hw = w / 2
  const neck = 25
  const body =
    `M ${x - hw} ${bot - 14} Q ${x - hw} ${bot} ${x - hw + 14} ${bot} L ${x + hw - 14} ${bot} Q ${x + hw} ${bot} ${x + hw} ${bot - 14} ` +
    `L ${x + hw} ${top + 80} Q ${x + hw} ${top + 40} ${x + neck} ${top + 22} L ${x + neck} ${top + 10} ` +
    `L ${x - neck} ${top + 10} L ${x - neck} ${top + 22} Q ${x - hw} ${top + 40} ${x - hw} ${top + 80} Z`
  return [
    `<path d="${body}" fill="${C.milk}" ${STROKE}/>`,
    `<path d="M ${x + hw - 12} ${top + 84} L ${x + hw - 12} ${bot - 20}" stroke="${C.glass}" stroke-width="7" stroke-linecap="round"/>`,
    `<rect x="${x - hw + 10}" y="${y - 10}" width="${w - 20}" height="44" rx="4" fill="#fff" stroke="${C.string}" stroke-width="3"/>`,
    `<text x="${x}" y="${y + 22}" font-size="26" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="${C.string}">牛奶</text>`,
    `<rect x="${x - neck - 5}" y="${top}" width="${neck * 2 + 10}" height="16" rx="5" fill="${C.cap}" ${STROKE}/>`,
    `<line x1="${x - neck - 4}" y1="${top + 12}" x2="${x + neck + 4}" y2="${top + 12}" stroke="${C.string}" stroke-width="3"/>`,
  ].join('\n')
}

const SCALLION_XS = [-14, 0, 14, 26]

function scallionBulbs(): string {
  const { x, y } = SCALLION_LOCAL
  return SCALLION_XS.map(
    (dx) => `<path d="M ${x + dx} ${y} L ${x + dx} ${y - 120}" stroke="${C.line}" stroke-width="16" stroke-linecap="round"/>` +
      `<path d="M ${x + dx} ${y} L ${x + dx} ${y - 120}" stroke="${C.scallionWhite}" stroke-width="10" stroke-linecap="round"/>`,
  ).join('\n')
}

function scallionGreens(p: Pose): string {
  const { x, y } = SCALLION_LOCAL
  const f = p.flop
  const out: string[] = []
  SCALLION_XS.forEach((dx, i) => {
    const sx = x + dx
    const sy = y - 120
    const topY = y - 230 - i * 8
    // Upright the leaves arc over the left rim; flopped they lie further out toward the floor.
    const tipX = sx - 120 - i * 18 - 50 * f
    const tipY = -470 + i * 16 - 150 * f
    const d = `M ${sx} ${sy} L ${sx + 4} ${topY} Q ${sx - 30 - 20 * f} ${topY - 70 + 40 * f} ${n(tipX)} ${n(tipY)}`
    out.push(`<path d="${d}" fill="none" stroke="${C.line}" stroke-width="15" stroke-linecap="round"/>`)
    out.push(`<path d="${d}" fill="none" stroke="${i % 2 ? C.scallion : C.leafLight}" stroke-width="9" stroke-linecap="round"/>`)
  })
  out.push(`<rect x="${x - 26}" y="${y - 150}" width="62" height="12" rx="4" fill="${C.string}" ${STROKE}/>`)
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Items (drawn in their own canvas coordinates; pivot from ITEM_SPECS)

function tomatoBase(squash: boolean): string {
  const [cx, cy] = ITEM_SPECS.tomato.pivot
  const body = squash
    ? `<ellipse cx="${cx}" cy="${cy + 8}" rx="72" ry="54" fill="${C.tomato}" ${STROKE}/>`
    : `<circle cx="${cx}" cy="${cy}" r="62" fill="${C.tomato}" ${STROKE}/>`
  const top = squash ? cy - 40 : cy - 56
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const r = i % 2 ? 7 : 24
    return { x: cx + Math.cos(a) * r, y: top + 8 + Math.sin(a) * r * 0.75 }
  })
  // Speckles make the spin readable.
  const specks = [
    [-30, 10],
    [22, 28],
    [8, -18],
    [-12, 34],
  ]
    .map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy * (squash ? 0.8 : 1)}" r="3" fill="#ffb3a6"/>`)
    .join('')
  return [
    body,
    specks,
    `<polygon points="${pts(star)}" fill="${C.leaf}" ${STROKE}/>`,
    `<path d="M ${cx} ${top + 6} l 4 -16" stroke="${C.line}" stroke-width="6" stroke-linecap="round"/>`,
  ].join('\n')
}

/** Light and shade that stay put while the tomato spins. */
function tomatoHighlight(): string {
  const [cx, cy] = ITEM_SPECS.tomato.pivot
  return [
    `<defs><clipPath id="t"><circle cx="${cx}" cy="${cy}" r="60"/></clipPath></defs>`,
    `<g clip-path="url(#t)">`,
    `<circle cx="${cx + 22}" cy="${cy + 24}" r="58" fill="${C.tomatoShade}" opacity="0.35"/>`,
    `<ellipse cx="${cx - 24}" cy="${cy - 26}" rx="17" ry="9" transform="rotate(-35 ${cx - 24} ${cy - 26})" fill="#fff" opacity="0.85"/>`,
    `<circle cx="${cx - 36}" cy="${cy - 8}" r="4" fill="#fff" opacity="0.8"/>`,
    `</g>`,
  ].join('\n')
}

function radish(frame: number): string {
  const [tx, ty] = ITEM_SPECS.radish.pivot
  const body =
    `M ${tx} ${ty} C ${tx + 60} ${ty - 4}, ${tx + 130} ${ty - 34}, ${tx + 210} ${ty - 38} ` +
    `Q ${tx + 256} ${ty - 36} ${tx + 256} ${ty} Q ${tx + 256} ${ty + 36} ${tx + 210} ${ty + 38} ` +
    `C ${tx + 130} ${ty + 34}, ${tx + 60} ${ty + 4}, ${tx} ${ty} Z`
  // The roll cycle: rings and a blemish move around the body.
  const shift = (frame - 1) * 14
  const rings = [60, 102, 144, 186]
    .map((rx) => {
      const x = tx + ((rx + shift) % 168) + 40
      const half = Math.min(36, 6 + (x - tx) * 0.17)
      return `<path d="M ${x} ${ty - half + 4} q 6 ${half - 4} 0 ${2 * half - 8}" fill="none" stroke="#b9b29c" stroke-width="3"/>`
    })
    .join('')
  const spotY = ty - 18 + (frame - 1) * 18
  const leaves = [-28, -10, 10, 26]
    .map((dy, i) => {
      const d = `M ${tx + 252} ${ty + dy * 0.6} q ${30 + i * 4} ${dy * 0.5 - 6 + frame * 3} ${62 - i * 6} ${dy * 1.3}`
      return (
        `<path d="${d}" fill="none" stroke="${C.line}" stroke-width="14" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="${i % 2 ? C.leaf : C.leafLight}" stroke-width="8" stroke-linecap="round"/>`
      )
    })
    .join('')
  return [
    `<defs><linearGradient id="r" x1="0" x2="1" y1="0" y2="0"><stop offset="0.55" stop-color="${C.radish}"/><stop offset="1" stop-color="${C.radishTop}"/></linearGradient></defs>`,
    leaves,
    `<path d="${body}" fill="url(#r)" ${STROKE}/>`,
    rings,
    `<circle cx="${tx + 150}" cy="${spotY}" r="4" fill="#c9c0a3"/>`,
  ].join('\n')
}

function banana(side: 'a' | 'b'): string {
  const [cx, cy] = ITEM_SPECS.banana.pivot
  // Stem stays at the +x end on both sides. Side b is the bunch flipped over its long
  // axis: the curve bends the other way and you see the greener underside.
  const bend = side === 'a' ? 1 : -1
  const fill = side === 'a' ? C.banana : C.bananaB
  const crown = { x: cx + 92, y: cy - 6 * bend }
  const fingers = [-1, 0, 1]
    .map((k) => {
      const tipX = cx - 104 + Math.abs(k) * 10
      const tipY = cy + k * 26 - 12 * bend
      const midY = cy + k * 22 + 34 * bend
      const d =
        `M ${crown.x} ${crown.y + k * 10} Q ${cx} ${midY + 16 * bend} ${tipX} ${tipY} ` +
        `Q ${cx - 10} ${midY - 6 * bend} ${crown.x} ${crown.y + k * 10 - 14 * bend} Z`
      return (
        `<path d="${d}" fill="${fill}" ${STROKE}/>` +
        `<path d="M ${crown.x - 20} ${crown.y + k * 10 - 4 * bend} Q ${cx} ${midY + 2 * bend} ${tipX + 12} ${tipY}" fill="none" stroke="${C.bananaShade}" stroke-width="4"/>` +
        `<circle cx="${tipX + 3}" cy="${tipY}" r="5" fill="${C.stem}"/>`
      )
    })
    .join('')
  const freckles = [
    [-40, 8],
    [-6, 22],
    [26, -4],
    [-60, -10],
  ]
    .map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy * bend}" r="3" fill="#8a6a2a" opacity="0.7"/>`)
    .join('')
  return [
    fingers,
    freckles,
    `<path d="M ${crown.x - 4} ${crown.y} l 30 ${-10 * bend}" stroke="${C.line}" stroke-width="16" stroke-linecap="round"/>`,
    `<path d="M ${crown.x - 4} ${crown.y} l 30 ${-10 * bend}" stroke="${side === 'a' ? '#7a8a3a' : '#6f9a3a'}" stroke-width="9" stroke-linecap="round"/>`,
  ].join('\n')
}

function itemBody(id: ItemId, image: string): string {
  if (id === 'tomato') return tomatoBase(image === 'squash')
  if (id === 'radish') return radish(Number(image.replace('roll', '')))
  return banana(image as 'a' | 'b')
}

/** A faller drawn inside a bag frame, exactly where the loose sprite will take over. */
function bakedFaller(id: ItemId, p: Pose): string {
  const b = bakedItem(id, p)
  const [px, py] = ITEM_SPECS[id].pivot
  const image = HOMES_LOCAL[id].image
  const body = itemBody(id, image)
  const gloss = id === 'tomato' ? `<g transform="translate(${n(b.x)} ${n(b.y)}) translate(${-px} ${-py})">${tomatoHighlight()}</g>` : ''
  return (
    `<g transform="translate(${n(b.x)} ${n(b.y)}) rotate(${n(b.rot)}) scale(${b.scale}) translate(${-px} ${-py})">${body}</g>` + gloss
  )
}

// ---------------------------------------------------------------------------
// Guides

function cross(x: number, y: number, r = 18): string {
  return `<path d="M ${x - r} ${y} H ${x + r} M ${x} ${y - r} V ${y + r}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}"/>`
}

function frameGuides(label: string, exits: Contract['exits'], frame?: number): string {
  const [w] = FRAME_SIZE
  const parts = [
    `<text x="24" y="56" font-size="40" font-family="sans-serif" fill="${C.guide}" stroke="none">${label}</text>`,
    `<line x1="0" y1="${PIVOT.y}" x2="${w}" y2="${PIVOT.y}" stroke-dasharray="12 10"/>`,
    cross(PIVOT.x, PIVOT.y),
  ]
  if (frame !== undefined) {
    for (const id of ITEM_IDS) {
      const e = exits[id]
      if (e.frame !== frame) continue
      const len = Math.hypot(e.vx, e.vy) || 1
      const ex = e.x + (e.vx / len) * 90
      const ey = e.y + (e.vy / len) * 90
      parts.push(cross(e.x, e.y, 12))
      parts.push(`<path d="M ${e.x} ${e.y} L ${n(ex)} ${n(ey)}" stroke-width="4"/>`)
      parts.push(`<text x="${n(ex + 8)}" y="${n(ey - 8)}" font-size="24" font-family="sans-serif" fill="${C.guide}" stroke="none">${id} exits</text>`)
    }
  }
  return parts.join('')
}

function itemGuides(id: ItemId, label: string): string {
  const spec = ITEM_SPECS[id]
  const [w] = spec.size
  return (
    `<rect x="1" y="1" width="${w - 2}" height="${spec.size[1] - 2}" stroke-dasharray="8 8"/>` +
    cross(spec.pivot[0], spec.pivot[1], 12) +
    `<text x="8" y="22" font-size="16" font-family="sans-serif" fill="${C.guide}" stroke="none">${label}</text>`
  )
}

// ---------------------------------------------------------------------------

export function renderAll(): { files: Map<string, { body: string; guides: string; size: [number, number] }>; contract: Contract } {
  const contract = buildContract()
  const files = new Map<string, { body: string; guides: string; size: [number, number] }>()
  const bagFrame = (p: Pose, withFallers: (id: ItemId) => boolean) =>
    `<g transform="${poseTransform(p)}">${bagBack(p)}</g>\n` +
    ITEM_IDS.filter(withFallers).map((id) => bakedFaller(id, p)).join('\n') +
    `\n<g transform="${poseTransform(p)}">${bagFront(p)}</g>`

  files.set('bag/upright-back.svg', {
    body: `<g transform="${poseTransform(POSE0)}">${bagBack(POSE0)}</g>`,
    guides: frameGuides('upright · back layer', contract.exits),
    size: FRAME_SIZE,
  })
  files.set('bag/upright-front.svg', {
    body: `<g transform="${poseTransform(POSE0)}">${bagFront(POSE0)}</g>`,
    guides: frameGuides('upright · front layer', contract.exits),
    size: FRAME_SIZE,
  })
  for (let f = 1; f <= 12; f++) {
    const p = FALL_POSES[f]
    files.set(fallSrc(f), {
      body: bagFrame(p, (id) => isBaked(id, f)),
      guides: frameGuides(`fall ${f} · ${p.angle}°`, contract.exits, f),
      size: FRAME_SIZE,
    })
    files.set(fallEmptySrc(f), {
      body: bagFrame(p, () => false),
      guides: frameGuides(`fall-empty ${f} · ${p.angle}°`, contract.exits),
      size: FRAME_SIZE,
    })
  }
  files.set('bag/right/L1.svg', {
    body: bagFrame(POSE_L1, () => false),
    guides: frameGuides(`right L1 · ${POSE_L1.angle}°`, contract.exits),
    size: FRAME_SIZE,
  })

  for (const id of ITEM_IDS) {
    const spec = ITEM_SPECS[id]
    for (const [name, path] of Object.entries(spec.frames)) {
      files.set(path, { body: itemBody(id, name), guides: itemGuides(id, `${id} · ${name}`), size: spec.size })
    }
  }
  files.set(ITEM_SPECS.tomato.highlight!, {
    body: tomatoHighlight(),
    guides: itemGuides('tomato', 'tomato · highlight (never rotates)'),
    size: ITEM_SPECS.tomato.size,
  })

  // Sanity: every exit frame really drops its faller.
  for (const id of ITEM_IDS) {
    if (isBaked(id, EXIT_FRAME[id])) throw new Error(`${id} still baked into its exit frame`)
  }
  return { files, contract }
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const { files, contract } = renderAll()
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  for (const [rel, f] of files) {
    write(join(root, 'public/art', rel), svgDoc(f.size[0], f.size[1], f.body))
    write(join(root, 'templates/art', rel), svgDoc(f.size[0], f.size[1], f.body, f.guides))
  }
  write(join(root, 'public/art/bag.json'), JSON.stringify(contract, null, 2) + '\n')
  console.log(`wrote ${files.size} SVGs (+ ${files.size} templates) and bag.json`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
