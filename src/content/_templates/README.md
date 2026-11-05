Templates for new entries, used by Obsidian's Templates plugin. Not part of the site.

New entry: create a note in `projects/` or `journal/` named after its URL (`projects/my-thing.md`
becomes /projects/my-thing), then run "Templates: Insert template".

Images all live in `images/`, named after their entry (`my-thing-1.png`) and linked as
`../images/my-thing-1.png`. Pasting an image puts it there; rename it to match the entry.
The first image in an entry is its preview on the homepage.

Video clips work the same way, anywhere in an entry: drop an .mp4 into `images/` (or paste it) and
embed it like an image, `![what it shows](../images/my-thing-demo.mp4)`. It plays muted and looping,
like a GIF. Keep clips short (5–15 s), silent and under ~3 MB; MP4 (H.264) plays everywhere.
If the first image in an entry is a clip, the homepage preview plays it.

- `title`: optional. Without it the title is the file name with spaces for dashes
  (`podcast-recs.md` is "podcast recs"). Add it for punctuation or extra words: "tokyo, in december".
- `tag`: projects use work, shipped, club, hackathon or personal; journal uses journal, place or list.
- `when`: the label in the index, like 2026, 2025-26 or 2026- (ongoing).
- `published`: sets the order, newest first. Not shown anywhere.
- `links`: Markdown links, like "[github](https://github.com/…)".
- `draft: true` keeps it off the site. Delete the line when it's ready.
