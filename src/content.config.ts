import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const entries = defineCollection({
  // One folder per entry, grouped by section: src/content/<section>/<slug>/index.md + its images.
  // The id is the entry's URL path: "projects/whisk", "journal/tokyo", and "about" for pages
  loader: glob({
    pattern: "{projects,journal,pages}/*/index.md",
    base: "./src/content",
    generateId: ({ entry }) => {
      const [section, slug] = entry.split("/");
      return section === "pages" ? slug : `${section}/${slug}`;
    },
  }),
  schema: z.object({
    // Lowercase by convention
    title: z.string(),
    // Journal entries only; the folder already says what projects and pages are
    tag: z.enum(["journal", "place", "list"]).optional(),
    // Index label: "2026", "2024-25", "2025-". YAML reads a bare 2026 as a number, so coerce
    when: z.coerce.string().regex(/^\d{4}(-(\d{2})?)?$/),
    // Sort key
    published: z.coerce.date(),
    // Meta description and og:description, and the preview text on the home feed
    summary: z.string(),
    // Shown in the meta line under the title; href is a plain string so "/resume.pdf" is allowed
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    // Hidden from the index and feed, but still has its own page (about)
    unlisted: z.boolean().default(false),
    // Not built at all
    draft: z.boolean().default(false),
  }),
});

export const collections = { entries };
