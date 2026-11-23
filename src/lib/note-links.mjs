// Links between notes, written the way Obsidian writes them in this vault (Markdown links to the
// note's file, relative to the linking note): "[whisk](whisk.md)", "[about](../pages/about.md)",
// "[results](posture-reminder.md#results)". On the site they become the page's URL, "/projects/whisk",
// with a heading becoming the id the site gives it.
//
// A link to a note that doesn't exist (a typo, or a note renamed or deleted outside Obsidian) stops
// the build, naming both notes. A link to a note the site doesn't publish (a draft, or a note like
// site.md) keeps its text but loses the link, with a warning, so drafting doesn't block a build.
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { slug } from "github-slugger";

const CONTENT = fileURLToPath(new URL("../content/", import.meta.url));
// The sections whose notes have pages, as content.config.ts collects them; pages sit at the root
const SECTIONS = ["projects", "journal"];

/** The site URL of a published note, by its path in src/content ("projects/whisk.md"), or
 *  undefined for one the site doesn't publish */
function pageOf(path) {
  const [section, file, ...rest] = path.split("/");
  if (rest.length || !file?.endsWith(".md")) return undefined;
  if (!SECTIONS.includes(section) && section !== "pages") return undefined;
  // Same check as the collection's draft flag, read from the note's frontmatter
  const head = readFileSync(`${CONTENT}${path}`, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  if (/^draft:\s*true\s*$/m.test(head)) return undefined;
  const name = file.slice(0, -".md".length);
  return section === "pages" ? `/${name}` : `/${section}/${name}`;
}

/** Sätteri plugin: a link to another note's .md file becomes a link to its page */
export const noteLinks = {
  name: "note-links",
  link(node, ctx) {
    const url = node.url;
    if (!url || !ctx.fileURL || URL.canParse(url) || url.startsWith("/") || url.startsWith("#")) return;
    const [target, heading] = url.split("#");
    if (!/\.md$/i.test(decodeURI(target))) return;

    const file = fileURLToPath(new URL(target, ctx.fileURL));
    const from = relative(CONTENT, fileURLToPath(ctx.fileURL));
    const path = relative(CONTENT, file).split("\\").join("/");
    if (!existsSync(file)) {
      throw new Error(`${from} links to "${decodeURI(target)}", but there's no note there`);
    }
    const page = !path.startsWith("..") && pageOf(path);
    if (!page) {
      console.warn(`[note-links] ${from} links to ${path}, which isn't published, so it shows as plain text`);
      ctx.replaceNode(node, node.children);
      return;
    }
    // Obsidian writes a heading as it reads ("#The%20dataset"); the site's ids are slugs of it
    ctx.setProperty(node, "url", heading ? `${page}#${slug(decodeURI(heading))}` : page);
  },
};
