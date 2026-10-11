// Loads bag.json and every image it names, and waits for them to decode so nothing pops in
// mid-animation. Paths in the contract are relative to the art base, so .svg → .webp later is
// a JSON-only change.

import type { Contract } from './types.ts'

export interface Assets {
  contract: Contract
  /** The decoded <img> for a contract path. Each path has exactly one element. */
  img(path: string): HTMLImageElement
}

export function contractPaths(c: Contract): string[] {
  const set = new Set<string>([c.upright.back, c.upright.front, c.upright.shadow])
  for (const f of c.fall) {
    set.add(f.src)
    set.add(f.empty)
    set.add(f.shadow)
  }
  for (const r of c.right) {
    set.add(r.src)
    set.add(r.shadow)
  }
  for (const spec of Object.values(c.items)) {
    for (const p of Object.values(spec.frames)) set.add(p)
  }
  return [...set]
}

export async function loadAssets(base: string, signal?: AbortSignal): Promise<Assets> {
  const res = await fetch(`${base}bag.json`, { signal })
  if (!res.ok) throw new Error(`bag.json: ${res.status}`)
  const contract = (await res.json()) as Contract
  const imgs = new Map<string, HTMLImageElement>()
  await Promise.all(
    contractPaths(contract).map(async (path) => {
      const img = new Image()
      img.decoding = 'async'
      img.draggable = false
      img.alt = ''
      img.src = base + path
      await img.decode()
      imgs.set(path, img)
    }),
  )
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return {
    contract,
    img(path) {
      const el = imgs.get(path)
      if (!el) throw new Error(`asset not in contract: ${path}`)
      return el
    },
  }
}
