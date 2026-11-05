// Video clips, embedded like images: ![alt](../images/demo.mp4), as Obsidian writes them. They
// play like a GIF (muted, looping, inline). Astro only publishes images, so the files are served
// from /media/ by the integration below.
import { cp, readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const VIDEO = /\.(mp4|webm|mov)$/i;
const IMAGES = new URL("../content/images/", import.meta.url);

/** Where a clip in src/content/images is published */
export const mediaUrl = (file) => `/media/${encodeURIComponent(file)}`;

const attr = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** The <video> for a clip; Base's script pauses it offscreen and holds it for reduced motion */
export function videoHtml(src, alt = "") {
  // #t=0.001 makes Safari show the first frame while a clip isn't playing
  const label = alt ? ` aria-label="${attr(alt)}"` : "";
  return `<video src="${src}#t=0.001" autoplay muted loop playsinline preload="metadata" data-clip${label}></video>`;
}

/** Sätteri plugin: a Markdown image whose file is a video becomes a <video> */
export const video = {
  name: "video",
  image(node, ctx) {
    const url = node.url && decodeURI(node.url);
    if (!url || !VIDEO.test(url) || URL.canParse(url)) return;
    ctx.replaceNode(node, { type: "html", value: videoHtml(mediaUrl(url.split("/").at(-1)), node.alt ?? "") });
  },
};

/** Astro integration: serves clips from src/content/images at /media/ in dev, and copies them there in builds */
export function media() {
  return {
    name: "media",
    hooks: {
      "astro:server:setup": ({ server }) => {
        // Hand off to Vite's file server, which handles the range requests video playback needs
        server.middlewares.use("/media/", (req, res, next) => {
          const file = decodeURIComponent((req.url ?? "").split(/[?#]/)[0].slice(1));
          if (!VIDEO.test(file) || file.includes("/")) return next();
          res.writeHead(302, { Location: `/@fs${fileURLToPath(new URL(file, IMAGES))}` }).end();
        });
      },
      "astro:build:done": async ({ dir }) => {
        const clips = (await readdir(IMAGES)).filter((file) => VIDEO.test(file));
        if (!clips.length) return;
        const out = new URL("media/", dir);
        await mkdir(out, { recursive: true });
        await Promise.all(clips.map((file) => cp(new URL(file, IMAGES), new URL(file, out))));
      },
    },
  };
}
