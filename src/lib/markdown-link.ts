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

/** A Markdown link, or plain text read as a label with no link */
export const maybeLink = z.string().transform((text) => {
  const match = text.match(LINK);
  return match ? { label: match[1], href: match[2] } : { label: text, href: undefined };
});
