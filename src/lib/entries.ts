import type { ImageMetadata } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
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

/** Listed entries (not draft, not unlisted), newest first, optionally from one section */
export async function getEntries(section?: Section) {
  const entries = await getCollection(
    "entries",
    (entry) => !entry.data.draft && !entry.data.unlisted && (!section || sectionOf(entry) === section),
  );
  return entries.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
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

/** The listed entries either side of this one in its section of the index (older is further down) */
export async function neighbours(entry: Entry) {
  const entries = await getEntries(sectionOf(entry));
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i === -1) return {};
  return { older: entries[i + 1], newer: entries[i - 1] };
}
