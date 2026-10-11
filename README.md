# Portfolio: grocery bag toy

```bash
npm install
npm run dev          # http://localhost:5173  (add ?debug for the overlay + tuning panel)
npm run gen          # regenerate placeholder SVGs + public/art/bag.json from src/toy/poses.ts
npm test             # vitest
npm run build        # tsc -b + vite build
```

- `?debug` shows the landing zone, hitboxes, exits and homes. In dev it also opens a Tweakpane panel with every number in `src/toy/config.ts`, plus *Replay fall* and *Replay ×50* (landing stress test). `?seed=7` makes falls repeatable.
- `/dev/sheet.html` is a contact sheet of every frame.

## Swapping in hand-drawn art

1. Open the matching file in `templates/art/` (it has a guides layer: frame number, pivot, floor line, exit arrows) and draw over it at the same canvas size.
2. Export to `public/art/` with the same path. To switch format (e.g. `.webp`), change the paths in `public/art/bag.json`.
3. If an item ends up somewhere different in your drawing, update its `exits` / `homes` entry in `bag.json` and check it with `?debug`.

Once you hand-edit `bag.json`, stop running `npm run gen` (it overwrites the JSON and the SVGs). The generator test in `tests/generator.test.ts` will then report the JSON as out of date; delete that one check when you switch to real art.
