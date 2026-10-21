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
  /** Top of the card's column (its first card); "top" thumbnails go above it */
  columnTop: number;
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
// Top and bottom spots need the whole thumbnail on screen with this much to spare
const MARGIN = 24;

const distance = (a: Rect, b: Rect) =>
  Math.hypot(Math.max(0, b.x - a.x - a.w, a.x - b.x - b.w), Math.max(0, b.y - a.y - a.h, a.y - b.y - b.h));

/**
 * Tries, in order: above the card's column (over the featured project), below the card,
 * left of it, and right of it. Each spot must be fully on screen and clear of the other
 * cards; above and below are left- or right-aligned, whichever has more room. If none
 * fits, the thumbnail goes in the sidebar, which is always on screen.
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
  const { card, columnTop, others, viewport, canvasLeft, size, gap, clearance } = input;
  const { w, h } = size;

  const fits = (r: Rect, margin = 0) =>
    r.x >= canvasLeft &&
    r.x + r.w <= viewport.w - EDGE &&
    r.y >= margin &&
    r.y + r.h <= viewport.h - margin &&
    others.every((o) => distance(r, o) >= clearance);

  const room = (r: Rect) =>
    Math.min(r.x - canvasLeft, viewport.w - EDGE - r.x - r.w, ...others.map((o) => distance(r, o)));

  for (const [where, y] of [["top", columnTop - gap - h], ["bottom", card.y + card.h + gap]] as const) {
    const [first, second] = [card.x, card.x + card.w - w].map((x) => ({ x, y, w, h })).filter((r) => fits(r, MARGIN));
    if (!first) continue;
    // Ties go to left-aligned (the first)
    const best = second && room(second) > room(first) + 1 ? second : first;
    return { where, ...best };
  }

  // Beside the card, top-aligned. Left only fits where the column to the left has
  // ended; right only on wide screens.
  const left = { x: card.x - gap - w, y: card.y, w, h };
  if (fits(left)) return { where: "left", ...left };
  const right = { x: card.x + card.w + gap, y: card.y, w, h };
  if (fits(right)) return { where: "right", ...right };

  return null;
}
