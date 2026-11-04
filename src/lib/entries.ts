import type { ImageMetadata } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

export type Entry = CollectionEntry<"entries">;

/** The index's sections, in order; pages (about) sit outside them */
export const SECTIONS = ["projects", "journal"] as const;
export type Section = (typeof SECTIONS)[number] | "pages";

/** Which section an entry belongs to. Its id is its URL path, "projects/whisk" or "about" */
export function sectionOf(entry: Entry): Section {
  const [first] = entry.id.split("/");
  return SECTIONS.find((s) => s === first) ?? "pages";
}

// Every entry's images, keyed by path, so a Markdown image can be found as an asset
const images = import.meta.glob<{ default: ImageMetadata }>("/src/content/images/*.{png,jpg,jpeg,webp,gif}", {
  eager: true,
});

/** The first image in an entry's body, for its preview on the home feed */
export function firstImage(entry: Entry) {
  // Entries link their images as "../images/whisk-1.png"
  const match = entry.body?.match(/!\[([^\]]*)\]\(\.\.\/images\/([^)\s]+)\)/);
  if (!match) return undefined;
  const [, alt, file] = match;
  const src = images[`/src/content/images/${decodeURI(file)}`]?.default;
  return src && { src, alt };
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
