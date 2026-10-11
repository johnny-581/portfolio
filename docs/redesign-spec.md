# Grocery Bag Toy: Redesign Spec

2026-10-10

The redesign mirrors the bag to match the new reference, tips it toward the viewer's bottom-left, cuts the small interaction effects, and restyles the art as flat cut-paper. The art contract, the state machine and the art-swap workflow from the built prototype ([PLAN.md](PLAN.md)) stay as they are.

The depth model (camera, world physics, shadows, the drag ramp) lives in the companion [depth & realism doc](depth-model.md); this doc covers everything else.

## 1. Orientation and contents

The bag is mirrored to match the new image: wide front face on the left, narrow side panel on the right with a fold line down its middle, and flat strap handles.

| Position (left → right) | Item | Role |
| --- | --- | --- |
| Far left, leaning out | Radish (where the cucumber is) | Falls |
| Left | Banana bunch | Falls |
| Center | Tomato | Falls |
| Center-right | Milk bottle, teal lid | Stays (baked into the bag frames) |
| Right, over the right rim | Scallions (where the leafy greens are) | Stays (baked into the bag frames) |

This is physically right: the bag tips toward the bottom-left, so the left-side items come out, while the milk and scallions at the back-right stay in.

## 2. The fall

The bag rotates over its front-left bottom corner, its top falling toward the bottom-left of the screen, in about 10 frames at 12fps.

- **Shape over the fall:** the bag looks shorter as it tips toward you, and its mouth opens and grows (about 1.15× at rest, because it's closer). You end up looking *into* the opening instead of at the rim.
- **Rest pose:** the bag's bottom points up-right (further away), the mouth points down-left (closer), and the bag lies diagonally.
- **Real toppling timing:** slow start, then faster. No wind-up lean-back and no squash or stretch; the paper only crumples a little where it hits.
- **12fps, on purpose:** the bag plays at 12fps while loose items move at 60fps. That keeps the drawing load to about 10 frames and gives the fall a hand-drawn cadence.

| Phase | Frames | Angle | What happens |
| --- | --- | --- | --- |
| Teeter | 2 | 0 → 8° | Contents shift toward the mouth |
| Tip | 4 | 8 → 80° | Speeds up; tomato rises to the lip |
| Impact | 1 | ~88° | Mouth opens out; **tomato exits** |
| Settle | 2 | 88 → 90° | Paper relaxes; **banana exits**, then the **radish slides out** |
| Rest | 1 (held 2 ticks) | 90° | Scallions flop onto the floor |

- **Righting:** dragging the bag plays the empty fall frames in reverse. Between drawn frames the code rotates the shown frame by the remaining angle (as the prototype does), so the bag still follows the pointer smoothly with 10 frames, and the separate `L1` in-between frame goes.
- **Placeholder generator:** models the bag as a simple 3D box, rotates it about the tipping corner and projects it through the runtime camera, so foreshortening, exits, homes and hitboxes line up automatically.

## 3. Items falling out

Each item does only what physics would do; the material settings are in the depth doc.

- **Tomato:** drops from the lip, makes one small bounce, rolls (rotation tied to distance travelled) and slows to a stop. No wobble at the end.
- **Radish:** drops, rolls in a curve around its thin tip, and stops. No bounce.
- **Banana:** drops, slides a short way, and rocks a little on its curve before stopping. A curved object really rocks, so this stays.
- **Landing fan:** points diagonally down-left (about 115–160°), so items come toward the viewer and grow as they roll. The safe zone and its rules stay as built.

## 4. Letting go

Where an item is released decides what happens; how it's held and lifted is the drag ramp in the depth doc.

| Released… | What happens |
| --- | --- |
| On the floor | Falls straight down from its current height; nothing extra if it was already on the floor |
| Over the upright bag's mouth | Drops in. Passing the rim it moves behind the front layer, and on the way down it eases into its exact slot and angle. That gentle correction is the "organized" punchline |
| Over the fallen bag | Drops onto the bag and rolls off its curved side, onto the floor in front |

The upright bag still ignores bumps while items are missing, and re-arms 2s after the last item is home.

## 5. What goes, what stays

Every effect that isn't physics goes; that deletes 2 tomato files (squash, highlight), `L1`, and about 11 settings.

| Remove | Keep (it's physics) |
| --- | --- |
| Wobble when the cursor gets near | The fall frames |
| Tomato squash on landing | One small tomato bounce |
| Scale-up when grabbed (replaced by real height) | Rolling, sliding, the banana's rock |
| Tilt while dragging | A small settle when the bag is set upright (one light rock, no springy overshoot) |
| Tomato highlight layer (the flat style doesn't use one) | Contact shadows |
| Arc-shaped snap (replaced by dropping in) | Bump on a fast pass, or tap, to tip it |
| The fallen bag's "trying to get up" nudge (the grab cursor and the bump-off carry that cue) | |

## 6. Restyling the SVGs

The placeholders move to the reference's flat cut-paper look: flat color, hand-cut edges, ink only for detail.

**Style rules**

- **No outlines around shapes.** Silhouettes are flat color with slightly uneven, hand-cut edges (path points nudged with seeded noise).
- **Ink lines only for internal detail:** the bag's corner and fold lines, banana ridges, a few radish lines, the strap handle edges. `#1f1b17`, about 3px at full size, round ends, slightly wobbly.
- **Flat fills with subtle paper grain,** as a cheap tiled texture pattern, not an SVG filter. Filters inside images re-render at every new scale, and the final art has its texture baked in anyway.
- **Shadows:** a flat, very soft ellipse at about 12% opacity, no visible edge.

**Palette**

| Use | Color |
| --- | --- |
| Kraft (front face) | `#C9A063` |
| Kraft (side panel) | a darker kraft |
| Tomato | `#E0433A` |
| Leaf green | `#7FAF3C` |
| Dark green | `#3E7A2E` |
| Banana | `#F4D24A` |
| Teal (milk lid) | `#2E8C9A` |
| Milk | `#F7F5EF` |
| Radish | `#F1EDE0` fading to `#C9DFA0` at the top |

**Per item**

| Item | Look |
| --- | --- |
| Bag | Slightly tapered, bottom edge a little curved. Front face, side panel with its fold and a V-dip at the top edge, flat strap handles (back one behind, front one over the produce) |
| Tomato | Slightly lopsided round, pointed star of leaves on top, dark stem dot |
| Banana | 2–3 fingers, ink ridge lines, black tips |
| Radish | Cream body, pale green shoulder, 3–4 short ink rings, short leafy top. The roll cycle moves the rings and one mark around the body |
| Milk bottle | Plain white bottle, teal lid, no label |
| Scallions | Green strokes with soft bends, white bulbs, hanging over the right rim |

## 7. Contract changes

| Where | Change |
| --- | --- |
| `bag.json` exits and homes | Store the item's 3D position (x, height, depth), so the loose sprite starts at the depth and size it was drawn at |
| `bag.json` playback | `fps: 12`; the fall list becomes about 10 frames |
| `bag.json` righting | `right` reuses the empty fall frames; `L1` is removed |
| `bag.json` items | Specs lose `highlight` and `squash` |
| `bag.json` frames | Each frame gains a generated soft shadow layer (see the depth doc) |
| `config.ts` | Gains the camera's near scale and tilt; loses the wobble, squash, tilt, lift-scale and get-up settings |

## 8. Decisions

| Question | Decision |
| --- | --- |
| Keep the fallen bag's "trying to get up" nudge? | No. The grab cursor plus the bump-off (an item dropped on the fallen bag rolls off) show it has to stand first |
| Fall frame rate | 12fps, about 10 drawings |
| Near scale | 1.25× (tunable live in the debug panel) |
