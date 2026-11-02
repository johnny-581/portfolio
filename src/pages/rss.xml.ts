import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getEntries } from "../lib/entries";
import { site } from "../site";

export async function GET(context: APIContext) {
  const entries = await getEntries();
  return rss({
    title: site.title,
    description: site.tagline,
    site: context.site!,
    items: entries.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.published,
      description: entry.data.summary,
      link: `/${entry.id}`,
    })),
  });
}
