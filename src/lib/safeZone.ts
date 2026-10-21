/** The "safe triangle" dropdown menus use, so the cursor can cross a gap without losing hover. */

interface Point {
  x: number;
  y: number;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull, by monotone chain */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (pts: Point[]) => {
    const out: Point[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * Whether `point` is on the way from `from` to `target`: inside the smallest convex
 * shape covering both the starting point and the target's box.
 */
export function onTheWay(point: Point, from: Point, target: DOMRect): boolean {
  const { left, right, top, bottom } = target;
  const shape = hull([from, { x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom }]);
  return shape.every((a, i) => cross(a, shape[(i + 1) % shape.length], point) >= 0);
}
