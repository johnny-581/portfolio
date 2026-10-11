# Grocery Bag Toy: Placeholder Prototype Plan

> Record of the prototype as built. The redesign is planned in [implementation-plan.md](implementation-plan.md).

## Context

This is the centerpiece of Johnny's portfolio hero. A hand-drawn grocery bag sits in the top-right of a minimal page (name and nav at the top, "A curious design engineer" at the bottom-left). When the cursor bumps the bag, it tips forward-left. A tomato, a banana bunch and a Chinese radish roll out to random spots. The visitor drags the bag upright and puts the items back. It's a playful nod to Johnny being very organized.

This plan builds the full interaction with **script-generated SVG placeholder frames**. Johnny will later replace them with hand-drawn frames using the same filenames, canvas sizes and JSON contract, with no code changes. The project folder (`/Users/johnnydong/Desktop/personal-projects/portfolio`) is empty, so this is a fresh setup.

## Stack

- **Vite + React + TypeScript** (`npm create vite@latest`, react-ts template) for the page shell. The final site will be React/Next.js.
- **The toy itself is framework-free TypeScript.** It never re-renders through React. Rendering is positioned DOM elements moved only with `transform` and `opacity`, driven by its own `requestAnimationFrame` loop.
- The bridge is `src/components/GroceryBag.tsx`: a `useEffect` calls `mount(containerRef.current)` and returns the `destroy()` it gets back. It's safe under StrictMode's double mount, because `destroy()` removes all listeners, observers and the rAF loop. To move into Next.js later, copy `src/toy/` and the component, and add `'use client'`.
- Dev-only dependencies: `vitest`, `tweakpane`. Tweakpane is imported dynamically only when `import.meta.env.DEV && ?debug`, so it never reaches the production bundle. The debug overlay itself (zone, hitboxes) stays available in production under `?debug`.
- Node 22.21 runs `.ts` scripts directly (type stripping), so the generator script imports the same pose data as the app. Constraints this imposes:
  - Imports between files the script touches use explicit `.ts` extensions (`allowImportingTsExtensions`, already on in Vite's template).
  - `erasableSyntaxOnly: true`: no enums, namespaces or constructor parameter properties anywhere in `src/toy/`.
  - `poses.ts` and `config.ts` are pure data and math. No DOM, no Vite-only imports (`import.meta.env`, asset imports).
- Type checking: Vite's root `tsconfig.json` only references the app and Node configs, so `tsc --noEmit` at the root checks nothing. Use `tsc -b`. Add `scripts/` and `tests/` to `tsconfig.node.json`'s `include`.

## File layout

```
index.html                 Vite entry
src/main.tsx               renders <App />
src/App.tsx                hero replica: header (name, nav), headline, <GroceryBag />
src/App.css                page layout; .bag-anchor positions the bag (desktop + mobile media query)
src/components/GroceryBag.tsx   container + .bag-anchor div; useEffect → mount()/destroy()
src/toy/
  index.ts                 mount(): builds the stage DOM, wires modules, returns destroy()
  config.ts                every tunable number (see "Key numbers")
  poses.ts                 pose table for the bag frames (angle, squash, crumple, which items are baked in); shared by the app and the generator
  assets.ts                loads bag.json, preloads every image and awaits img.decode() before arming
  layout.ts                measures .bag-anchor, the headline, the gutter and the first screen; frame→screen scale; ResizeObserver
  zone.ts                  fits(p, r), landingSpot(item, mouth, bagH, zone, placed), clampIntoZone()
  machine.ts               state machine (idle, wobble, falling, messy, righting, upright, tidy); pure reducer (state, event) → state + effects, no DOM, so it's unit-testable
  loop.ts                  single requestAnimationFrame loop with dt; sleeps when nothing moves; IntersectionObserver pause
  bag.ts                   frame player (fps + holds), scrub by drag angle, wobble, "try to get up", overshoot
  items.ts                 item bodies + motion profiles (tomato, radish, banana), depth scale, shadow
  drag.ts                  pointer events, setPointerCapture, spring-follow, velocity tilt, drop targets
  motion.ts                spring(), easings, dampedSine(), parabolic hops, arc length
  hit.ts                   circle, capsule and rotated-rect hit tests
  debug.ts                 ?debug overlay (zone, exits, homes, hitboxes, pivot), Tweakpane, "replay ×50" stress test
scripts/
  gen-placeholders.ts      writes all placeholder SVGs + bag.json from poses.ts
public/art/                (generated, later replaced by Johnny's drawings)
  bag.json
  bag/upright-back.svg, upright-front.svg
  bag/fall/01–12.svg        each faller is drawn only before its exit frame
  bag/fall-empty/01–12.svg  same frames with no fallers (used for righting)
  bag/right/L1.svg
  items/tomato.svg, tomato-highlight.svg, tomato-squash.svg
  items/radish-roll-1.svg … radish-roll-3.svg
  items/banana-a.svg, banana-b.svg
tests/zone.test.ts, tests/timeline.test.ts, tests/machine.test.ts, tests/generator.test.ts
```

## Art contract (`public/art/bag.json`)

- `frameSize` [1200, 1200] and `pivot` (the front-left base corner) are shared by every bag frame. Items get their own square canvases. The pivot is the center, except the radish, which pivots at its tip.
- `fps: 12`. `fall: [{f, hold}]` for the 12 frames, with holds: frame 1 = 2, frame 12 = 2, others = 1.
- `right: [12, "L1", 6, 5, 4, 3, 2]`, each with a nominal `angle` so drag angle maps to a frame.
- `exits`: tomato at frame 7, banana at frame 9, radish at frame 10, each as `{x, y, rot, vx, vy}` in frame pixels.
- `homes`: each item's `{x, y, rot, scale}` in the upright bag.
- `mouth`: the drop-target center and width (upright), plus the fallen mouth point used as the roll origin.
- `hitboxes`: the bag's upright and fallen rotated rectangles. Each item's circle or capsule.
- Paths are file paths, so switching `.svg` to `.webp` later only changes the JSON. Sprite sheets are a later optimization (`scripts/build-sheets.ts` with `sharp`). They are not part of this build.

## Placeholder SVG style

- Flat shapes in a rough version of the palette: kraft bag (polygon with a side panel and a folded rim), milk bottle (rounded rect with a paper cap), scallions (strokes with bulbs and a red tie), tomato (circle with a star-shaped top), banana (curved paths), radish (tapered path with rings and leaf stubs).
- Each bag frame is rendered from `poses.ts`: rotation around the pivot, squash, flared mouth on frames 7–8, baked milk and scallions, and fallers included only before their exit frame.
- **One source of truth for positions.** `poses.ts` defines pose 0 (neutral upright) plus the 12 fall poses and L1. The generator derives everything else from it, so nothing can drift apart:
  - `upright-back.svg` / `upright-front.svg` are pose 0, split into layers.
  - A baked faller in frames 1–6 is drawn at its `home` transformed by that frame's pose.
  - `exits` = the item's position in the frame before its exit frame, carried forward one tick along its velocity. That's what makes the handoff seamless.
  - `homes`, `mouth` and `hitboxes` are computed from pose 0 and the fallen rest pose (frame 12).
- When Johnny's drawings replace the placeholders, `bag.json` becomes hand-maintained. The debug overlay draws every exit, home and hitbox on top of the real art so it can be checked by eye.
- A `<g id="guides">` group (frame number, pivot crosshair, floor line, exit arrows) makes the files usable as tracing templates in Procreate or Photoshop.

## Behavior (from the agreed spec)

1. **idle:** layered upright bag (back layer, homed items, front layer inside one group).
2. **wobble:** pointer within 60px gives a damped ±2–3° rotation of the group around its base.
3. **falling:** a bump (pointer entering the bag's hitbox faster than 400px/s, or a tap) plays `fall`. At each item's exit frame, a loose sprite spawns at the exit point, converted to screen coordinates.
4. **Rolls:** the landing spot comes from `landingSpot()`, then the motion is closed-form formulas over time:
   - 1–2 parabolic hops that get smaller.
   - Ease-out travel along a curve, with rotation = arc length ÷ radius.
   - Damped sine settle at the end.
   - **Tomato** goes far (1.0–1.6 bag heights) on a straight path and swaps in the squash frame for 2 ticks on its first landing. `tomato-highlight.svg` sits on top in its own element that follows the tomato's position and scale but **never its rotation**, clipped to the tomato's circle. That way the gloss stays lit from the top-left while the body spins.
   - **Radish** goes mid-distance (0.6–1.0) on a path curved around its tip, cycling the roll frames by distance. Its in-bag home pose is roll frame 1, rotated.
   - **Banana** lands near (0.3–0.6) after one hop. Its landing side (a or b) is picked at spawn. If that differs from the side it exits on, it swaps at the top of the hop, which reads as a flip. Then it slides and rocks ±8°.
5. **messy:** items can be dragged anywhere. An item dropped on the fallen bag pops up and rolls 40–80px away. The bag "tries to get up" (rotates 6° and back) every ~4s of idle.
6. **righting:** dragging the bag maps pointer angle around the pivot to a frame in `right` (using `fall-empty` images). On release, 60% or more plays the remaining frames and springs upright with an overshoot. Less than 60% plays back to the rest frame.
7. **upright:** an item dropped within 1.5× the mouth width arcs to its home in 0.35s. At the top of the arc it moves into the bag group, between the back and front layers. Rotation and scale spring to their home values. The radish goes in root-first.
8. **tidy:** once all three are home, a 2s cooldown, then back to idle (re-armed). No celebration.

### Input rules per state

Only one drag at a time. Extra pointers or touches are ignored until it ends.

| State | Bag | Loose items | Leaves when |
|---|---|---|---|
| `idle` | Proximity → `wobble`. Bump or tap → `falling` | — (all homed, not draggable) | Proximity / bump |
| `wobble` | Bump or tap → `falling` | — | Pointer leaves the 60px radius → `idle` |
| `falling` | Ignores all input | Draggable as soon as spawned. Grabbing **cancels the roll** where it is. Rolling items aren't hit by other items | Bag reaches its rest frame → `messy` |
| `messy` | Drag → `righting`. "Try to get up" every 4s of idle (paused during any drag) | Draggable. Dropped on the fallen bag → bump-off. Dropped elsewhere → hop and stay | Bag drag starts |
| `righting` | Follows the pointer. Release ≥ 0.6 → `upright`, otherwise plays back to rest → `messy` | Not draggable (one drag at a time) | Release |
| `upright` | **Bumps and wobble ignored.** Not draggable | Draggable. Dropped in the mouth → snap home. Dropped elsewhere → stay | Last item homes → `tidy` |
| `tidy` | Inert | — | 2s → `idle` |

**Interrupts:**
- `pointercancel`, losing pointer capture, or the window losing focus during a drag counts as a drop where the item is.
- On resize during `falling`, in-flight rolls keep their targets. `clampIntoZone()` runs once each item settles. In other states it runs right away, skipping the item being dragged.
- If the hero scrolls offscreen mid-animation, the loop pauses. On return it resumes with `dt` capped at 50ms, so nothing teleports.

**Depth:** every frame, `scale = lerp(0.92, 1.0, depth(y))`, the shadow scales the same way, and loose items stack lower-on-screen in front.

**Drag:** on grab, scale ×1.06 and the shadow drops lower and softer. Position springs to the pointer (k 300, c 22). Tilt = clamp(velocity.x × factor, ±10°), also springed.

**Zone:** measured live:
- Back edge = the bag's base line.
- Front edge = bottom of the first screen − item radius − 24px.
- Left edge = page gutter.
- Right edge = the bag's right edge.
- Excluded: the fallen bag's footprint + 16px, and item centers can't land inside the headline's box.
- `landingSpot` picks a direction in the left→down-left fan and a distance band, shortens along the same direction in 8px steps until it fits, retries up to 10 times, then falls back to a fixed spot.
- On resize, out-of-zone items ease back inside.

**Page integration:** the headline gets `pointer-events: none`. `touch-action: none` applies only to the bag and items. The page gets `user-select: none` during a drag. `prefers-reduced-motion` shows the static tidy bag with the trigger off. Until assets have decoded, the trigger is not armed.

## Key numbers (`config.ts`, all exposed in Tweakpane)

Wobble radius 60px, bump speed 400px/s, scrub threshold 0.6, get-up interval 4s and angle 6°, re-arm 2s, snap 0.35s, mouth tolerance 1.5×, drag lift 1.06, tilt max 10°, spring k/c 300/22, depth scale 0.92→1.0, distance bands per item (above), bump-off 40–80px.

## Build order

1. Vite + React + TypeScript scaffold, `App.tsx` hero replica (Inter, gutter, nav, headline, `.bag-anchor`), and `layout.ts` + `zone.ts` with a `?debug` zone overlay.
2. `poses.ts` + `gen-placeholders.ts`, then generate `public/art` and `bag.json`.
3. `assets.ts` + `bag.ts` frame player, playing the fall with real holds.
4. `items.ts` handoff at the exit frames, landing sampler, three motion types.
5. `drag.ts`: springs, tilt, depth, bump-off.
6. Righting scrub, overshoot, snap home, full `machine.ts` with re-arm.
7. `debug.ts`: Tweakpane, replay ×50; reduced motion, touch, IntersectionObserver pause.

## Verification

- `npx tsc -b` and `npx vitest run`:
  - zone: 1,000 random samples always satisfy `fits`, with no overlaps, at desktop, tablet and mobile sizes.
  - timeline: holds and exit frames fire at the right ticks.
  - machine: every row of the input-rules table, e.g. a bump in `upright` doesn't tip, a grab in `falling` cancels the roll, `pointercancel` drops the item.
  - generator: each baked faller in the frame before its exit sits within 2px of the exit point minus one tick of velocity, and pose 0 matches the layered upright bag.
- `node scripts/gen-placeholders.ts` runs with no flags and writes all 35 SVGs (2 upright + 12 fall + 12 fall-empty + 1 L1 + 3 tomato + 3 radish + 2 banana) plus `bag.json`.
- `npm run dev`, then open in the browser pane with `?debug`:
  - The zone overlay matches the layout at desktop, tablet (768) and mobile (375).
  - A bump plays the fall with no pop going from the layered upright bag to frame 01, and the three items hand off with no visible jump.
  - The tomato's highlight stays top-left while it rolls. The banana sometimes flips mid-hop.
  - Bumping the upright bag while items are missing does nothing.
  - Replay ×50 never puts an item outside the zone or hidden under the headline.
  - The full loop works: drag an item while the bag is fallen (it relocates or bumps off), right the bag (both below and above 60%), snap all three home, wait 2s, bump again.
  - Mobile emulation: tapping triggers the fall, items drag, the page still scrolls outside the toy.
  - With `prefers-reduced-motion`, the bag is static.
  - Under React StrictMode (double mount in dev), there's exactly one stage, one loop and no duplicate listeners.
  - Check console errors, and that the loop counter sleeps when idle.
  - `npm run build`: the production bundle contains no Tweakpane code.
- Art swap check: replace one SVG with any PNG of the same canvas size and name; it renders aligned with no code changes.

## Implementation notes (as built)

Deviations and additions found while building:

- **Guides live in separate template files.** An SVG loaded through `<img>` can't hide a `<g id="guides">` layer, so the generator writes two copies: `public/art/` (what the page loads, no guides) and `templates/art/` (same files with guides, for tracing). Draw over a template, export to `public/art/` with the same name.
- **`dev/sheet.html`** (dev server only, at `/dev/sheet.html`): contact sheet of every frame and item, with a guides toggle. Not part of the build.
- **`src/toy/timeline.ts`** holds the fall tick math (frames + holds → ticks, exit times) so it's unit-testable without the DOM.
- **Pivot moved to x 720** so the fallen bag and flopped scallions stay inside the 1200 canvas.
- **Home layout** follows the reference left → right: scallions, milk cap, tomato, banana, radish leaning out past the right edge above the rim.
- **Drops use the release point**, not the spring-lagged sprite, so a quick flick lands where the pointer let go.
- **Roll paths start along the exit's horizontal velocity**, so speed carries through the handoff (measured within ~3% for tomato and radish).
- **Landing fan widens in rounds** (configured fan → down to 90° → down to 50°) before using the fallback. Narrow phones have no room left of the fallen mouth, so items tumble forward instead.
- **Mobile anchor is right-aligned** (`right: 5%`, `height: min(26%, 50vw)`) so the fallen bag fits on a 375px screen.
- **`config.timeScale`** (Tweakpane → time) slows everything down for checking handoffs.
- `@tweakpane/core` is a dev dependency for Tweakpane's types.

Verified: `tsc -b`, 39 vitest tests, production build without Tweakpane, landing stress (150 samples, 0 violations at 375 / 768 / 1440 wide; 3 fallbacks at 375), full loop in the browser (bump, wobble, lower < 60%, bump-off, right ≥ 60%, three snaps, tidy, 2s re-arm), tap + drag in mobile emulation, reduced motion, StrictMode single instance, offscreen pause, PNG art swap.
