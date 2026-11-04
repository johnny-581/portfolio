Templates for new entries, used by Obsidian's Templates plugin. Not part of the site.

New entry: create a note in `projects/` or `journal/` named after its URL (`projects/my-thing.md`
becomes /projects/my-thing), then run "Templates: Insert template".

Images all live in `images/`, named after their entry (`my-thing-1.png`) and linked as
`../images/my-thing-1.png`. Pasting an image puts it there; rename it to match the entry.
The first image in an entry is its preview on the homepage.

- `tag`: projects use work, shipped, club, hackathon or personal; journal uses journal, place or list.
- `when`: the label in the index, like 2026, 2025-26 or 2026- (ongoing).
- `published`: sets the order, newest first. Not shown anywhere.
- `links`: Markdown links, like "[github](https://github.com/…)".
- `draft: true` keeps it off the site. Delete the line when it's ready.
