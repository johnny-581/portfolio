import { placeThumb, type Rect } from "./placement";
import { shotName } from "./shot";

// Figma: 392×245 thumbnails beside 282px cards, 40px from their card and
// at least a column gap (28px) from the others
const SCALE = 392 / 282;
const MAX_W = 392;
const ASPECT = 392 / 245;
const GAP = 40;
const CLEARANCE = 24;

const rect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/**
 * Shows a project's thumbnail beside its card on the home page, or hides it (null).
 * The showing thumbnail carries the view-transition name, so it morphs into the
 * project page's first image and back.
 */
export function showPreview(slug: string | null) {
  const layer = document.querySelector<HTMLElement>("[data-thumbs]");
  if (!layer) return;

  const active = layer.querySelector<HTMLElement>("[data-preview]:not(.opacity-0)");
  if (active) {
    active.classList.add("opacity-0");
    active.style.viewTransitionName = "";
  }

  // The layer is hidden on small screens and touch devices
  if (!slug || getComputedStyle(layer).display === "none") return;

  const thumb = layer.querySelector<HTMLElement>(`[data-preview="${slug}"]`);
  const cards = [...document.querySelectorAll<HTMLElement>("[data-card]")];
  const card = cards.find((c) => c.dataset.slug === slug);
  const sidebar = document.querySelector("[data-sidebar]");
  if (!thumb || !card || !sidebar) return;

  const cardRect = rect(card);
  const sidebarRect = rect(sidebar);
  const canvasLeft = sidebarRect.x + sidebarRect.w;
  const w = Math.min(MAX_W, Math.round(cardRect.w * SCALE));
  // The gutter thumbnail fills the sidebar from its right edge to the screen edge
  const gutterW = Math.min(MAX_W, canvasLeft);
  const column = cards.filter((c) => c.dataset.column === card.dataset.column);

  const place = placeThumb({
    card: cardRect,
    columnTop: Math.min(...column.map((c) => rect(c).y)),
    others: cards.filter((c) => c !== card).map(rect),
    viewport: { w: document.documentElement.clientWidth, h: window.innerHeight },
    canvasLeft,
    size: { w, h: Math.round(w / ASPECT) },
    gutter: { x: canvasLeft - gutterW, w: gutterW, h: Math.round(gutterW / ASPECT) },
    gap: GAP,
    clearance: CLEARANCE,
  });

  Object.assign(thumb.style, {
    left: `${place.x}px`,
    top: `${place.y}px`,
    width: `${place.w}px`,
    height: `${place.h}px`,
    viewTransitionName: shotName(slug),
  });
  thumb.dataset.where = place.where;
  thumb.classList.remove("opacity-0");
}

/** Moves the showing thumbnail with the page as it scrolls by `dy`, so it stays by its card */
export function movePreview(dy: number) {
  const active = document.querySelector<HTMLElement>("[data-thumbs] [data-preview]:not(.opacity-0)");
  if (active) active.style.top = `${parseFloat(active.style.top) - dy}px`;
}
