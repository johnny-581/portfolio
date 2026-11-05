// YouTube videos, embedded like images: ![alt](https://youtu.be/ID), as Obsidian writes them.
// They render as a thumbnail button; Base's script swaps in the player on click, so nothing
// from YouTube loads (and no cookies are set) until someone presses play.

const HOSTS = /^(?:www\.|m\.)?youtube\.com$/;
const ID = /^[\w-]{11}$/;

/** Seconds from a `t=` / `start=` value: "90", "90s" or "1h2m3s" */
function seconds(text) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(text ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** `{ id, start }` for a YouTube watch, short, shorts or embed link; undefined for anything else */
export function parseYoutube(href) {
  if (!href || !URL.canParse(href)) return;
  const url = new URL(href);
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  const path = url.pathname.split("/").filter(Boolean);
  let id;
  if (url.hostname === "youtu.be") id = path[0];
  else if (HOSTS.test(url.hostname)) {
    if (path[0] === "watch") id = url.searchParams.get("v");
    else if (path[0] === "shorts" || path[0] === "embed") id = path[1];
  }
  if (!id || !ID.test(id)) return;
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return { id, start };
}

const attr = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** The thumbnail button; Base's script reads data-id / data-start / data-title to build the player */
export function youtubeHtml({ id, start }, alt = "") {
  const label = attr(alt ? `Play: ${alt}` : "Play video");
  const extra = (start ? ` data-start="${start}"` : "") + (alt ? ` data-title="${attr(alt)}"` : "");
  return `<button type="button" class="yt" data-id="${id}"${extra} aria-label="${label}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" /></button>`;
}

/** Sätteri plugin: a Markdown image whose URL is a YouTube video becomes a click-to-play thumbnail */
export const youtube = {
  name: "youtube",
  image(node, ctx) {
    const video = parseYoutube(node.url);
    if (!video) return;
    ctx.replaceNode(node, { type: "html", value: youtubeHtml(video, node.alt ?? "") });
  },
};
