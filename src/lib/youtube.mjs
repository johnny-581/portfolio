// YouTube videos, embedded like images: ![alt](https://youtu.be/ID), as Obsidian writes them.
// They render as the YouTube player itself (privacy-enhanced nocookie embed, lazy-loaded,
// no autoplay), so nothing loads from YouTube until the player scrolls near view.

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

/** The player iframe; `.yt` in global.css gives it the 16:9 box */
export function youtubeHtml({ id, start }, alt = "") {
  const src = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`;
  return `<iframe class="yt" src="${src}" title="${attr(alt || "Video")}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

/** Sätteri plugin: a Markdown image whose URL is a YouTube video becomes the embedded player */
export const youtube = {
  name: "youtube",
  image(node, ctx) {
    const video = parseYoutube(node.url);
    if (!video) return;
    ctx.replaceNode(node, { type: "html", value: youtubeHtml(video, node.alt ?? "") });
  },
};
