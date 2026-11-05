// Several images or clips in one paragraph (consecutive lines, as Obsidian writes them) become a
// row that keeps every item's shape: equal heights, widths by aspect ratio. A portrait first item
// followed by landscapes gets Notion's layout instead: the portrait on the left, the rest stacked
// on the right, both columns ending at the same height. Sizes are read here, at build time, so
// the page needs no script; the CSS lives with the media rules in global.css.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { VIDEO } from "./video.mjs";

// Must match the CSS: the gap between items, and an item's border (1px each side)
const GAP = 12;
const BORDER = 2;
// Narrow screens: a row is laid out at a typical phone's column width (375px less gutters), and
// stacks full width when an item would end up shorter than this
const PHONE = 343;
const MIN_HEIGHT = 100;
const WIDE = 16 / 9;

/** Width / height of a clip, from its video track header (tkhd); undefined if not found */
async function clipAspect(path) {
  const buf = await readFile(path);
  for (let i = buf.indexOf("tkhd"); i !== -1; i = buf.indexOf("tkhd", i + 4)) {
    // Width and height sit after the version-dependent times, matrix and friends, as 16.16 fixed
    const at = i + 4 + (buf[i + 4] === 1 ? 88 : 76);
    if (at + 8 > buf.length) break;
    const width = buf.readUInt32BE(at) / 65536;
    const height = buf.readUInt32BE(at + 4) / 65536;
    if (width && height) return width / height;
  }
}

/** Width / height of a media item: a local image or clip; 16:9 for YouTube, and for remote images, whose size isn't known */
async function aspect(node, ctx) {
  const url = node.url && decodeURI(node.url);
  if (!url || URL.canParse(url) || url.startsWith("/") || !ctx.fileURL) return WIDE;
  const path = fileURLToPath(new URL(url, ctx.fileURL));
  try {
    if (VIDEO.test(url)) return (await clipAspect(path)) ?? WIDE;
    const { width, height, orientation } = await sharp(path).metadata();
    // EXIF orientations 5 to 8 are turned a quarter, so the image shows the other way round
    return orientation >= 5 ? height / width : width / height;
  } catch {
    return WIDE;
  }
}

const round = (n) => Math.round(n * 1000) / 1000;
const isSpace = (node) => (node.type === "text" && !node.value.trim()) || node.type === "break";

/** Sätteri plugin; runs before video and youtube, which turn their images into HTML later */
export const gallery = {
  name: "gallery",
  async paragraph(node, ctx) {
    const items = node.children.filter((child) => child.type === "image");
    if (items.length < 2) return;
    // Only media and the space between them, up to the last one; a caption may follow
    const last = node.children.indexOf(items.at(-1));
    if (!node.children.slice(0, last).every((child) => child.type === "image" || isSpace(child))) return;

    const ratios = await Promise.all(items.map((item) => aspect(item, ctx)));
    const [first, ...rest] = ratios;
    const open = (attrs) => ({ type: "html", value: `<span ${attrs}>` });
    const close = { type: "html", value: "</span>" };

    if (first < 1 && rest.length > 1 && rest.every((a) => a > 1)) {
      // Solve for the right column's width so its stack, gaps and borders included, is as tall
      // as the portrait: right = width × share − offset
      const inverse = rest.reduce((sum, a) => sum + 1 / a, 0);
      const n = rest.length;
      const d = inverse + 1 / first;
      const share = 1 / (first * d);
      const offset = ((GAP + BORDER) / first - BORDER * (1 + inverse - n) + (n - 1) * GAP) / d;
      const right = (width) => width * share - offset;
      const shortest = Math.min(...rest.map((a) => (right(PHONE) - BORDER) / a + BORDER));
      const stack = shortest < MIN_HEIGHT ? " stack" : "";
      ctx.setProperty(node, "data", { hProperties: { className: [`gallery split${stack}`] } });
      ctx.replaceNode(items[0], [open(`class="gallery-item"`), items[0], close]);
      ctx.replaceNode(items[1], [open(`class="gallery-column" style="--width: calc(${round(share * 100)}% - ${round(offset)}px)"`), items[1]]);
      ctx.replaceNode(items.at(-1), [items.at(-1), close]);
      return;
    }

    const total = ratios.reduce((sum, a) => sum + a, 0);
    const height = (PHONE - GAP * (items.length - 1) - BORDER * items.length) / total + BORDER;
    const stack = height < MIN_HEIGHT ? " stack" : "";
    ctx.setProperty(node, "data", { hProperties: { className: [`gallery${stack}`] } });
    items.forEach((item, i) => ctx.replaceNode(item, [open(`class="gallery-item" style="--aspect: ${round(ratios[i])}"`), item, close]));
  },
};
