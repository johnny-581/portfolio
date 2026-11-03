import { getCollection, type CollectionEntry } from "astro:content";

export type Entry = CollectionEntry<"entries">;

// Slugs that belong to routes, so an entry can't take them
const RESERVED = ["404", "projects"];

/** Listed entries (not draft, not unlisted), newest first */
export async function getEntries() {
  const entries = await getCollection("entries", ({ data }) => !data.draft && !data.unlisted);
  return entries.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}

/** Every page to build: listed entries plus unlisted ones like about */
export async function getAllEntries() {
  const entries = await getCollection("entries", ({ data }) => !data.draft);
  const clash = entries.find((e) => RESERVED.includes(e.id));
  if (clash) throw new Error(`Entry "${clash.id}" uses a slug reserved for a route`);
  return entries;
}

export async function getEntry(slug: string) {
  return (await getAllEntries()).find((e) => e.id === slug);
}

/** The listed entries either side of this one in the index (older is further down) */
export async function neighbours(slug: string) {
  const entries = await getEntries();
  const i = entries.findIndex((e) => e.id === slug);
  if (i === -1) return {};
  return { older: entries[i + 1], newer: entries[i - 1] };
}
