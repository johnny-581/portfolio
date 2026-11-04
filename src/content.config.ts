import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const entries = defineCollection({
  // One folder per entry, grouped by section: src/content/<section>/<slug>/<slug>.md + its images.
  // The file is named after its folder so Obsidian doesn't list a dozen notes called "index".
  // The id is the entry's URL path: "projects/whisk", "journal/tokyo", and "about" for pages
  loader: glob({
    pattern: "{projects,journal,pages}/*/*.md",
    base: "./src/content",
    generateId: ({ entry }) => {
      const [section, slug] = entry.split("/");
      return section === "pages" ? slug : `${section}/${slug}`;
    },
  }),
  schema: z.object({
    // Lowercase by convention
    title: z.string(),
    // Journal: journal, place, list. Projects: what kind of project it was
    tag: z.enum(["journal", "place", "list", "work", "shipped", "club", "hackathon", "personal"]).optional(),
    // Index label: "2026", "2024-25", "2025-". YAML reads a bare 2026 as a number, so coerce
    when: z.coerce.string().regex(/^\d{4}(-(\d{2})?)?$/),
    // Sort key
    published: z.coerce.date(),
    // Meta description and og:description, and the preview text on the home feed
    summary: z.string(),
    // Shown in the meta line under the title. Written as Markdown links, "[github](https://…)",
    // so Obsidian edits them as a plain list; the href can be a path like "/resume.pdf"
    links: z
      .array(
        z
          .string()
          .regex(/^\[[^\]]+\]\([^)]+\)$/, 'Write links as "[label](href)"')
          .transform((link) => {
            const [, label, href] = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
            return { label, href };
          }),
      )
      .default([]),
    // Hidden from the index and feed, but still has its own page (about)
    unlisted: z.boolean().default(false),
    // Not built at all
    draft: z.boolean().default(false),
  }),
});

export const collections = { entries };
