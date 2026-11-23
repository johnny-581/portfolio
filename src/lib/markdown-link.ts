import { z } from "astro/zod";

// "[label](href)": how a link is written in a list property, so Obsidian can edit it
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/** A Markdown link, read as { label, href } */
export const markdownLink = z
  .string()
  .regex(LINK, 'Write links as "[label](href)"')
  .transform((link) => {
    const [, label, href] = link.match(LINK)!;
    return { label, href };
  });

// A link to another note somewhere in a line of a note's body, as Obsidian writes it and updates
// it when that note is renamed or moved: "[whisk](projects/whisk.md)" (the vault's setting),
// "[x](<projects/my note.md>)" when the path has spaces, or "[[projects/whisk]]" / "[[whisk|x]]"
const NOTE_IN_TEXT = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]|\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))\)/;

/** The path of the first note linked in some text, without ".md" or a leading "./" or "../":
 *  "projects/whisk", or just "whisk" for "[[whisk]]". Undefined if it links no note */
export function linkedNote(text: string) {
  const match = text.match(NOTE_IN_TEXT);
  if (!match) return undefined;
  const [, wiki, angled, plain] = match;
  const path = wiki ?? angled ?? decodeURI(plain);
  return path
    .trim()
    .replace(/^(\.\.?\/)+/, "")
    .replace(/\.md$/, "");
}

/** A Markdown link, or plain text read as a label with no link */
export const maybeLink = z.string().transform((text) => {
  const match = text.match(LINK);
  return match ? { label: match[1], href: match[2] } : { label: text, href: undefined };
});
