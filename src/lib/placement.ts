/** Where a project's hover thumbnail goes, given where everything is on screen (viewport px). */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement extends Rect {
  where: "gutter" | "left" | "bottom" | "top" | "right";
}

export interface PlacementInput {
  card: Rect;
  /** 1-based grid column of the card */
  column: number;
  /** The other project cards; a thumbnail never comes within `clearance` of one */
  others: Rect[];
  viewport: { w: number; h: number };
  /** Thumbnails outside the sidebar stay right of this x */
  canvasLeft: number;
  /** Thumbnail size in the canvas */
  size: { w: number; h: number };
  /** Where thumbnails go in the sidebar (they may cover its text), and their size there */
  gutter: { x: number; w: number; h: number };
  /** Distance from the hovered card */
  gap: number;
  clearance: number;
}

const EDGE = 16;

const distance = (a: Rect, b: Rect) =>
  Math.hypot(Math.max(0, b.x - a.x - a.w, a.x - b.x - b.w), Math.max(0, b.y - a.y - a.h, a.y - b.y - b.h));

/**
 * Tries, in order: left of the card (the sidebar gutter for column 1), below or above it
 * (left- or right-aligned, whichever has more room), and right of it. A spot needs at
 * least a third of the thumbnail on screen. If none fits, the thumbnail goes in the
 * gutter, which is always on screen.
 */
export function placeThumb(input: PlacementInput): Placement {
  return firstFit(input) ?? inGutter(input);
}

/** Top-aligned with the card, kept on screen */
function inGutter({ card, gutter, viewport }: PlacementInput): Placement {
  const y = Math.max(EDGE, Math.min(card.y, viewport.h - EDGE - gutter.h));
  return { where: "gutter", ...gutter, y };
}

function firstFit(input: PlacementInput): Placement | null {
  const { card, column, others, viewport, canvasLeft, size, gap, clearance } = input;
  const { w, h } = size;

  const fits = (r: Rect) =>
    r.x >= canvasLeft &&
    r.x + r.w <= viewport.w - EDGE &&
    Math.min(r.y + r.h, viewport.h) - Math.max(r.y, 0) >= r.h / 3 &&
    others.every((o) => distance(r, o) >= clearance);

  const room = (r: Rect) =>
    Math.min(r.x - canvasLeft, viewport.w - EDGE - r.x - r.w, ...others.map((o) => distance(r, o)));

  if (column === 1) return inGutter(input);
  const left = { x: card.x - gap - w, y: card.y, w, h };
  if (fits(left)) return { where: "left", ...left };

  for (const [where, y] of [["bottom", card.y + card.h + gap], ["top", card.y - gap - h]] as const) {
    const [first, second] = [card.x, card.x + card.w - w].map((x) => ({ x, y, w, h })).filter(fits);
    if (!first) continue;
    // Ties go to left-aligned (the first)
    const best = second && room(second) > room(first) + 1 ? second : first;
    return { where, ...best };
  }

  const right = { x: card.x + card.w + gap, y: card.y, w, h };
  if (fits(right)) return { where: "right", ...right };

  return null;
}
