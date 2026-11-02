import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const entries = defineCollection({
  // One folder per entry: src/content/entries/<slug>/index.md + its images
  loader: glob({
    pattern: "*/index.md",
    base: "./src/content/entries",
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: z.object({
    // Lowercase by convention
    title: z.string(),
    tag: z.enum(["journal", "project", "place", "list"]),
    // Index label: "2026", "2024-25", "2025-". YAML reads a bare 2026 as a number, so coerce
    when: z.coerce.string().regex(/^\d{4}(-(\d{2})?)?$/),
    // Sort key and RSS date
    published: z.coerce.date(),
    // Meta description, RSS and og:description
    summary: z.string(),
    // Shown in the meta line under the title; href is a plain string so "/resume.pdf" is allowed
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    // Hidden from the index, feed and RSS, but still has its own page (about)
    unlisted: z.boolean().default(false),
    // Not built at all
    draft: z.boolean().default(false),
  }),
});

export const collections = { entries };
