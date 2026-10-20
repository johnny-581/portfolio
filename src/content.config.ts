import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  // One folder per project: src/content/projects/<slug>/index.md + its images
  loader: glob({
    pattern: "*/index.md",
    base: "./src/content/projects",
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      status: z.string(),
      blurb: z.string(),
      link: z.object({ label: z.string(), href: z.url() }).optional(),
      order: z.number(),
      // Home page grid column (lg and up). Projects without one fill the columns in turn.
      column: z.number().int().min(1).max(3).optional(),
      featured: z.boolean().default(false),
      // The first image is the thumbnail on the home page
      images: z
        .array(z.object({ src: image(), caption: z.string().optional() }))
        .min(1),
    }),
});

export const collections = { projects };
