---
name: add-clip
description: Prepare a screen recording or video for the site and add it to an entry. Use when the user gives a video file (.mov, .mp4) to add to a project or journal entry, or asks to prepare a clip.
---

# Add a clip

1. **Convert.** `npm run clip -- <video> <entry>-<what-it-shows>` (e.g. `pepper-docs-stage-manager`).
   It writes a silent MP4 to `src/content/images/` and prints its size, length, a folder of three
   frames, and the line to paste. If it's over 3 MB, say so and suggest a shorter clip.
2. **Look.** Read the three frames and write alt text describing what the clip shows, plus an
   optional caption in the site's voice (lowercase, one line).
3. **Embed.** Add it to `src/content/<section>/<entry>.md` where the user asked:
   ```md
   ![pepper docs: switching between documents](../images/pepper-docs-stage-manager.mp4)
   <small>the caption.</small>
   ```
   If they didn't say where, ask. The first image or clip in an entry is its homepage preview.
4. **Check.** `npm run build`, then confirm `dist/media/<name>.mp4` exists and the entry page has
   the `<video>`. Commit and push.
