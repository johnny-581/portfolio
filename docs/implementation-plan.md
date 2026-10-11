# Grocery Bag Toy: Implementation Plan

2026-10-10

This plan takes the built prototype to the redesign in one pass: a mirrored bag that tips toward the viewer's bottom-left, a real camera and world physics for depth, an invisible drag ramp, no small interaction effects, and flat cut-paper placeholder art. It implements [depth-model.md](depth-model.md) and [redesign-spec.md](redesign-spec.md); [PLAN.md](PLAN.md) stays as the record of the prototype as built.

Every milestone ends in a running page and a commit, so any step can be reviewed or rolled back on its own.

## 1. What stays, what changes

| Area | Stays | Changes |
| --- | --- | --- |
| Page shell | Vite + React + TS, `GroceryBag.tsx` mount/destroy, `.bag-anchor`, headline `pointer-events: none` | — |
| Art contract | One `bag.json` naming every file, art swap by path | Positions become 3D, camera stored in the contract, 12fps, ~10 fall frames, shadow layers, no `L1` / squash / highlight |
| State machine | Pure reducer, one drag at a time, upright ignores bumps, 2s re-arm | `wobble` state and `near` / `far` events removed |
| Landing zone | Measured edges, exclusions, shorten-along-direction sampler, widening fan | Sampler works on floor points; fan aims along the fall direction |
| Motion | `requestAnimationFrame` loop that sleeps, offscreen pause, `timeScale` | 2D roll formulas, springs and depth lerp replaced by camera + world physics |
| Drag | Pointer capture, release-point drops, blur/cancel = drop | Springs, tilt and lift-scale replaced by the ramp |
| Generator | `poses.ts` as the single source of truth, `public/art` + `templates/art` | Bag modelled as a 3D box, mirrored, flat cut-paper style, generated shadows, floor-grid guides |
| Debug | Overlay, Tweakpane (dev only), stress run | Adds floor grid, ramp and world positions; drops removed settings |

## 2. Coordinate system and camera

One world, one camera, shared by the generator and the runtime.

- **World:** origin at the bag's tipping corner on the floor. X right, Y up, Z toward the viewer. 1 unit = 1 frame pixel at Z = 0, so the art keeps its scale.
- **Camera:** a pinhole that looks at the origin from distance `D`, tilted down by `tilt`. Its focal length equals `D`, so anything at Z = 0 projects at exactly 1×. It outputs frame pixels around the pivot; `layout.ts` keeps mapping frame pixels to stage pixels through `.bag-anchor`, as today.
- **The camera lives in `bag.json`,** not in `config.ts`: the frames are drawn through it, so it belongs to the art. `D` is chosen so the near scale is 1.25× at the bottom of the first screen on the reference desktop layout (1440 × 900); other viewports land a little above or below that, which is accepted. Tweakpane can override it for experiments, with a note that the art was drawn for the stored camera.

```
project(X, Y, Z)  → { x, y, scale }      frame px + scale at that depth
unprojectFloor(x, y) → { X, Z }          screen point → floor point (ray ∩ Y = 0)
cursorRay(x, y)   → ray in world          used by the drag ramp
```

## 3. Module changes

| File | Action | What it does |
| --- | --- | --- |
| `src/toy/camera.ts` | New, pure | `project`, `unprojectFloor`, `cursorRay`, scale at a depth; built from the contract's camera |
| `src/toy/physics.ts` | New, pure | Closed-form flight (gravity, bounces by restitution), friction slide/roll with `v₀ = √(2μgd)` for planned rolls, stopping distance for released throws, the radish's curved roll around its tip |
| `src/toy/ramp.ts` | New, pure | The drag surface: floor → curve (radius 0.15 bag heights) → wall at the bag's depth; `rampPoint(ray)` with a continuous, smooth join |
| `src/toy/poses.ts` | Rewrite | 3D bag box (mirrored), yaw and tipping edge, 10 fall poses, homes and exits as world positions, `buildContract()` incl. camera and shadow layers |
| `src/toy/items.ts` | Rewrite | World state per item (`x, y, z, v, rot, image`); phases: held · flight · ground · dropping-in · home; two shadows; render = project + place |
| `src/toy/bag.ts` | Trim | Frame player at 12fps, scrub over empty fall frames with rotor residual, one light settle on upright; wobble and get-up removed |
| `src/toy/index.ts` | Update | Wire camera and ramp, release velocity, new drop targets in world terms, remove wobble/nudge wiring |
| `src/toy/machine.ts` | Trim | Drop `wobble`, `near`, `far`, `startWobble` |
| `src/toy/zone.ts` | Adapt | Same rules; candidates sampled on the floor along the fall direction, checked as projected circles |
| `src/toy/layout.ts` | Adapt | Remove `depthFactor`; expose the camera mapped to stage pixels |
| `src/toy/config.ts` | Update | Add material table, ramp curve, held lift, release cap, shadow strengths; remove 11 settings (wobble ×5, tilt ×2, drag lift, get-up ×3) |
| `src/toy/motion.ts` | Trim | Keep `spring` (bag settle), `clamp`, `lerp`, PRNG; drop roll-specific helpers no longer used |
| `src/toy/types.ts` | Update | `Vec3`, contract camera, world exits/homes, per-frame shadow path |
| `src/toy/debug.ts` | Update | Projected floor grid, ramp profile, world positions; new settings, removed ones gone |
| `scripts/gen-placeholders.ts` | Rewrite | Flat cut-paper renderer for box faces + items, shadow layer per frame, template guides (frame number, pivot, floor grid, light arrow, exit arrows) |
| `src/App.css` | Update | Mirrored bag needs the anchor re-tuned (desktop + mobile) |

## 4. The bag in 3D

- **Box:** front face 310 wide, side panel 100 deep, 480 tall (world units), yawed about 30° so the front face looks toward the viewer's left and the narrow right side shows, as in the reference.
- **Tipping edge:** the front bottom edge. Tipping over it sends the top toward the viewer's bottom-left, and the mouth ends up facing that way.
- **Poses (12fps, ~10 frames):**

| Frames | Phase | Angle | Exits |
| --- | --- | --- | --- |
| 1–2 | Teeter | 0 → 8° | — |
| 3–6 | Tip | 8 → 80° | — |
| 7 | Impact | ~88° | Tomato |
| 8–9 | Settle | 88 → 90° | Banana, then radish slides out |
| 10 | Rest (held 2 ticks) | 90° | — |

- **Faces** are drawn back to front from the projected box; the mouth opening is a projected quad, so seeing *into* the bag at rest comes out of the geometry.
- **Baked contents:** milk bottle (teal lid) and scallions are drawn at their 3D positions in every frame; fallers are drawn only before their exit frame, as now.
- **Exits** = the faller's world position one tick past its last baked frame, with its world velocity, so the loose sprite takes over at the same size and speed.
- **Shadow layer:** the box projected onto the floor along the light (top-left, 45°), drawn soft, one per frame, never hand-drawn.

## 5. Items

- **Phases:**
  1. **Flight:** gravity from the exit or release point, bounces by restitution (tomato 0.25 once, others none).
  2. **Ground:** slide or roll with friction until it stops; planned rolls get `v₀` from the chosen landing distance so they stop exactly on the spot.
  3. **Held:** on the ramp under the cursor, plus a 10-unit lift eased in.
  4. **Dropping in:** falls under gravity; x/z ease into the home slot during the fall; moves behind the front layer once below the rim height.
  5. **Home:** fixed in the bag's frame space, as now.
- **Rotation:** tomato from world distance ÷ radius; radish sweeps around its tip; banana rocks a few degrees on its curve, then stops.
- **Release:** keeps the drag velocity in world terms, capped at 600 units/s, then flight → ground.
- **Drop targets (world):**
  - Upright bag: item's X/Z inside the mouth opening (with tolerance) → drop in.
  - Fallen bag: item over the bag's footprint → flight with an outward push, rolls off onto the floor in front.
  - Anywhere else: falls straight down where it is.
- **Shadows:** contact (≈25%, tight, gone within a few units of lift) + soft (≈10%, grows and fades with height); both flattened to the camera tilt and offset along the light with height.
- **Z-order:** by world Z; a held item over the upright bag draws in front of it until it drops below the rim.

## 6. Drag ramp

- `cursor − grabOffset` → `cursorRay` → `rampPoint` gives the item's world position; projecting it lands back under the cursor exactly.
- Below the bag's base line: on the floor, depth follows the cursor. Approaching it: the curve. Above it: the wall at the bag's depth, height takes over and scale freezes.
- The near end needs no cap: the bottom of the viewport limits the cursor, and that point is the 1.25× near scale.

## 7. Placeholder art

Implements the style section of [redesign-spec.md](redesign-spec.md#6-restyling-the-svgs): no outlines, hand-cut edges (seeded jitter), ink only for internal detail, flat fills with a tiled grain pattern (no SVG filters), the reference palette, and the mirrored item order (radish, banana, tomato, milk, scallions). Files after the change:

```
public/art/
  bag.json
  bag/upright-back.svg, upright-front.svg
  bag/fall/01–10.svg          fallers drawn only before their exit frame
  bag/fall-empty/01–10.svg    same poses, no fallers (righting)
  bag/shadow/01–10.svg        generated, never hand-drawn
  items/tomato.svg
  items/radish-roll-1.svg … radish-roll-3.svg
  items/banana-a.svg, banana-b.svg
templates/art/                same files + guides layer
```

That's 2 + 10 + 10 + 10 + 1 + 3 + 2 = **38 SVGs**; `L1`, `tomato-squash` and `tomato-highlight` are deleted.

## 8. Milestones

1. **Camera + physics + ramp (pure).** `camera.ts`, `physics.ts`, `ramp.ts` with their tests. Nothing on the page changes yet.
2. **Generator rewrite.** 3D mirrored bag, 10 frames, shadow layers, flat style, new contract; contact sheet updated. The page loads the new art with the old runtime temporarily disabled where it conflicts.
3. **Runtime rewiring.** `items.ts` rewrite, `bag.ts` trim, `machine.ts` trim, `index.ts` wiring, removals in config and debug. Full loop works end to end.
4. **Zone + layout.** Floor-based sampler along the fall direction, anchor re-tuned for desktop and mobile, stress run back to zero violations.
5. **Polish + verification.** Shadows tuned, debug overlay additions, README updated, full checklist below, commit and push.

## 9. Tests

| File | Covers |
| --- | --- |
| `tests/camera.test.ts` | Z = 0 projects at 1×; project ∘ unprojectFloor round-trips; heights foreshorten with depth; reference layout gives ~1.25× at the first screen's bottom |
| `tests/physics.test.ts` | Planned rolls stop within 1 unit of the target; flight lands at the right time; tomato bounces once, others never; release cap holds |
| `tests/ramp.test.ts` | Surface is continuous and smooth at both joins; the ramp point always projects back to the cursor; scale freezes on the wall |
| `tests/machine.test.ts` | Updated: no wobble states; every remaining input-rule row |
| `tests/timeline.test.ts` | Updated: 10 frames, 12fps, holds, exit ticks |
| `tests/generator.test.ts` | Updated: exits match the last baked world position + one tick; pose 0 matches homes; 38 files; `bag.json` up to date |
| `tests/zone.test.ts` | Same rules, new fan; 1,000 falls fit at 375 / 768 / 1440 wide |

## 10. Browser checks

- [ ] Fast pass or tap tips the bag; slow approach does nothing (no wobble).
- [ ] Fall plays at 12fps; each item hands off with no jump in position, size or speed.
- [ ] Items come toward the viewer and grow as they roll; shadows stay under them.
- [ ] Dragging down grows an item; dragging up past the bag's base lifts it with no visible kink, and its shadow stays on the floor.
- [ ] Lifting an item over the upright bag and letting go drops it in and settles it in its slot.
- [ ] Releasing over the fallen bag rolls the item off in front; releasing elsewhere drops it straight down; a toss travels a little and stops.
- [ ] Righting below 60% falls back; above 60% stands with one light settle.
- [ ] No get-up nudge, no squash, no drag tilt anywhere.
- [ ] Desktop, tablet (768) and mobile (375): fallen bag and items stay on screen; stress run 0 violations.
- [ ] Reduced motion, StrictMode single instance, offscreen pause, PNG art swap, no Tweakpane in the build, clean console.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Fixed camera gives a slightly different near scale per viewport | Accepted; tuned on the reference layout, checked at three sizes |
| 12fps bag next to 60fps items reads as a mismatch | Accepted as the hand-drawn cadence; rotor residual keeps righting smooth |
| SVG grain re-renders on every scale change | Tiled pattern instead of filters; final art is raster with baked texture |
| Yawed 3D box doesn't match the reference silhouette closely | Tune yaw and tilt in the generator against the reference before drawing |

## 12. Out of scope

Hand-drawn art, sprite sheets (`scripts/build-sheets.ts`), sound, the rest of the portfolio pages, and moving the shell to Next.js.

## 13. As built

All five milestones are in. Differences from the plan above:

- **Near scale is 1.5×**, not 1.25×, for a more dramatic perspective. It lives in `src/toy/poses.ts` (`NEAR_SCALE`) because the frames are drawn through the camera; change it and run `npm run gen`.
- **39 SVGs, not 38:** there is also `bag/shadow/00.svg`, the upright bag's shadow.
- **The fallen bag's no-landing area is its real floor outline** (`footprint` in `bag.json`, a polygon), not a screen rectangle. The rectangle covered the floor in front of the mouth, so short-sliding items couldn't escape it.
- **Landing spots** are searched on the floor: the item's own path first (shortened if needed), then deflected directions widening toward the viewer, then the nearest fitting point. Stress run: 0 violations at 375 / 768 / 1440 wide; 20–27% of spots are short nudges away from a neighbour or the bag.
- **Held items move on pointer move**, not on the next frame, so a quick release is judged where the pointer let go.
- **Gravity is 11,000 units/s²** (real gravity at this scale), not the ~5,000 the depth doc first estimated.
- **The anchor's aspect ratio** in `src/App.css` follows `uprightBox` in `bag.json`; update it after regenerating if the box changes.
- **Testing note:** the in-app browser pane throttles animation frames to ~2/s when hidden. With the 50 ms frame-time cap that plays everything in slow motion; it's the pane, not the toy. Set `__toy.config.maxDt = 1` under `?debug` to check timing there.
- **Predefined resting poses:** each item lists the screen rotations it can come to rest at (`restAngles` in `bag.json`): radish and banana lie flat (leaves or stem to either side), the tomato sits stem-up. Every roll ends on the nearest one; the tomato's spin is scaled by a few percent to get there.
