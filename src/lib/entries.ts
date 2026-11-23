import type { ImageMetadata } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { site } from "../site";
import { VIDEO, mediaUrl } from "./video.mjs";

export type Entry = CollectionEntry<"entries">;

/** The index's sections, in order; pages (about) sit outside them */
export const SECTIONS = ["projects", "journal"] as const;
export type Section = (typeof SECTIONS)[number] | "pages";

/** Which section an entry belongs to. Its id is its URL path, "projects/whisk" or "about" */
export function sectionOf(entry: Entry): Section {
  const [first] = entry.id.split("/");
  return SECTIONS.find((s) => s === first) ?? "pages";
}

/** Where an entry sits in the home feed: "whisk" for projects/whisk, so /#whisk scrolls to it.
 *  Only projects are in the feed */
export function anchorOf(entry: Entry) {
  return sectionOf(entry) === "projects" ? entry.id.split("/").at(-1)! : undefined;
}

/** The entry's title, or its file name with spaces for dashes: posture-reminder.md is "posture reminder" */
export function titleOf(entry: Entry) {
  return entry.data.title ?? entry.id.split("/").at(-1)!.replaceAll("-", " ");
}

// Every entry's images, keyed by path, so a Markdown image can be found as an asset
const images = import.meta.glob<{ default: ImageMetadata }>("/src/content/images/*.{png,jpg,jpeg,webp,gif}", {
  eager: true,
});

/** The first image or clip in an entry's body, for its preview on the home feed */
export function firstMedia(entry: Entry) {
  // Entries link their images and clips as "../images/whisk-1.png"
  const match = entry.body?.match(/!\[([^\]]*)\]\(\.\.\/images\/([^)\s]+)\)/);
  if (!match) return undefined;
  const [, alt, encoded] = match;
  const file = decodeURI(encoded);
  if (VIDEO.test(file)) return { kind: "video" as const, src: mediaUrl(file) as string, alt };
  const src = images[`/src/content/images/${file}`]?.default;
  return src && { kind: "image" as const, src, alt };
}

// Paths that belong to routes or sections, so a page can't take them
const RESERVED = ["404", ...SECTIONS];

/** Listed entries (not draft, not unlisted), optionally from one section. Projects follow the
 *  order in site.md, then any it leaves out, newest first; everything else is newest first */
export async function getEntries(section?: Section) {
  const entries = await getCollection(
    "entries",
    (entry) => !entry.data.draft && !entry.data.unlisted && (!section || sectionOf(entry) === section),
  );
  const rank = await projectRanks();
  const place = (entry: Entry) => rank.get(entry.id) ?? Infinity;
  return entries.sort(
    (a, b) => place(a) - place(b) || b.data.published.getTime() - a.data.published.getTime(),
  );
}

/** Each project in site.md's list, by id ("projects/whisk"), to its place in the list. Its links
 *  can be "[[whisk]]" or "[[projects/whisk]]"; one to no project stops the build, so a typo can't
 *  quietly leave a project out of place. A listed draft or unlisted project is just skipped. */
async function projectRanks() {
  const projects = new Set(
    (await getCollection("entries", (entry) => sectionOf(entry) === "projects")).map((e) => e.id),
  );
  const rank = new Map<string, number>();
  site.projects.forEach((path) => {
    const id = path.startsWith("projects/") ? path : `projects/${path}`;
    if (!projects.has(id)) {
      throw new Error(`site.md lists "${path}" under projects, but there's no project with that name`);
    }
    if (!rank.has(id)) rank.set(id, rank.size);
  });
  return rank;
}

/** Every page to build: listed entries plus unlisted ones like about */
export async function getAllEntries() {
  const entries = await getCollection("entries", ({ data }) => !data.draft);
  const clash = entries.find((e) => RESERVED.includes(e.id));
  if (clash) throw new Error(`Page "${clash.id}" uses a path reserved for a route`);
  return entries;
}

export async function getEntry(id: string) {
  return (await getAllEntries()).find((e) => e.id === id);
}
