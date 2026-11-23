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

// "[[projects/whisk]]" or "[[whisk|alias]]": how Obsidian writes a link to a note in a property,
// and keeps it up to date when the note is renamed or moved
const NOTE = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/;

/** A link to a note, read as the note's path without ".md": "[[projects/whisk]]" is
 *  "projects/whisk", "[[whisk]]" is "whisk". Also takes a Markdown link to the note's file */
export const noteLink = z
  .string()
  .refine((link) => NOTE.test(link) || LINK.test(link), 'Write note links as "[[note]]"')
  .transform((link) => {
    const path = link.match(NOTE)?.[1] ?? decodeURI(link.match(LINK)![2]);
    return path
      .trim()
      .replace(/^(\.\.?\/)+/, "")
      .replace(/\.md$/, "");
  });

/** A Markdown link, or plain text read as a label with no link */
export const maybeLink = z.string().transform((text) => {
  const match = text.match(LINK);
  return match ? { label: match[1], href: match[2] } : { label: text, href: undefined };
});
