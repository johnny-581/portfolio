import { z } from "astro/zod";
import { markdownLink, maybeLink, noteLink } from "./lib/markdown-link";
// The settings live in a note so they can be edited in Obsidian; the note explains each one
import { frontmatter } from "./content/site.md";

export const site = z
  .object({
    name: z.string(),
    tagline: z.string(),
    role: z.string(),
    places: z.array(maybeLink),
    // The header adds about before these
    links: z.array(markdownLink),
    // The order of projects in the index and the home feed, as note links (see lib/entries)
    projects: z.array(noteLink).nullish().transform((projects) => projects ?? []),
  })
  .parse(frontmatter);
