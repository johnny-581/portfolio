import type { ImageMetadata } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
// The order of the projects, a note in the vault beside site.md
import { rawContent as orderNote } from "../content/order.md";
import { linkedNote } from "./markdown-link";
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
 *  Only the projects order.md lists are in the feed */
export function anchorOf(entry: Entry) {
  const shown = sectionOf(entry) === "projects" && !entry.data.unlisted && projectOrder().has(entry.id);
  return shown ? entry.id.split("/").at(-1)! : undefined;
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

/** Listed entries (not draft, not unlisted), optionally from one section, newest first. Projects
 *  are the ones order.md lists, in its order; one it leaves out is hidden like an unlisted one */
export async function getEntries(section?: Section) {
  await checkOrder();
  const rank = projectOrder();
  const entries = await getCollection(
    "entries",
    (entry) =>
      !entry.data.draft &&
      !entry.data.unlisted &&
      (sectionOf(entry) !== "projects" || rank.has(entry.id)) &&
      (!section || sectionOf(entry) === section),
  );
  const place = (entry: Entry) => rank.get(entry.id) ?? Infinity;
  return entries.sort(
    (a, b) => place(a) - place(b) || b.data.published.getTime() - a.data.published.getTime(),
  );
}

/** The items of order.md's list, each with the project id it links ("projects/whisk"), if any.
 *  Only the list's items are read, so the note can say what it's for around them */
function orderItems() {
  return orderNote()
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/)?.[1].trim())
    // Empty items, and checkboxes, which aren't part of the order
    .filter((item): item is string => !!item && !/^\[[ xX]\]/.test(item))
    .map((item) => {
      const path = linkedNote(item);
      return { item, path, id: path && (path.startsWith("projects/") ? path : `projects/${path}`) };
    });
}

/** Each project order.md lists, by id, to its place in the list */
function projectOrder() {
  const rank = new Map<string, number>();
  for (const { id } of orderItems()) if (id && !rank.has(id)) rank.set(id, rank.size);
  return rank;
}

/** Stops the build, naming the item, when one of order.md's items links no project: a typo or a
 *  deleted project would otherwise quietly hide a project or leave a gap */
async function checkOrder() {
  const projects = new Set(
    (await getCollection("entries", (entry) => sectionOf(entry) === "projects")).map((e) => e.id),
  );
  for (const { item, path, id } of orderItems()) {
    if (id && projects.has(id)) continue;
    throw new Error(
      path
        ? `order.md lists "${path}", but there's no project with that name`
        : `order.md has "${item}" in its list, which isn't a link to a project`,
    );
  }
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
