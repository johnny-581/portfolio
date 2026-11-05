---
name: add-clip
description: Prepare a screen recording or video for the site, and add it to an entry only when asked. Use when the user gives a video file (.mov, .mp4) to prepare, convert or add to a project or journal entry.
---

# Add a clip

1. **Convert.** `npm run clip -- <video> <entry>-<what-it-shows>` (e.g. `pepper-docs-stage-manager`).
   It writes a silent MP4 to `src/content/images/` and prints its size, length, a folder of three
   frames, and the line to paste. If it's over 3 MB, say so and suggest a shorter clip.
2. **Report.** Give the user the file and the line to paste, with alt text written from the three
   frames:
   ```md
   ![pepper docs: switching between documents](../images/pepper-docs-stage-manager.mp4)
   ```
   Stop here unless they asked for it to be added to an entry. Don't commit a clip on its own.
3. **Only if asked to add it:** put that line in `src/content/<section>/<entry>.md` where they said,
   with an optional caption on the next line (`<small>…</small>`, lowercase). If they didn't say
   where, ask; the first image or clip in an entry is its homepage preview. Then `npm run build`,
   confirm `dist/media/<name>.mp4` exists and the entry page has the `<video>`, and commit and push.
