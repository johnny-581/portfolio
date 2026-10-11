# Grocery Bag Toy: Depth & Realism Model

2026-10-10

The toy's 3D feel comes from one small world seen through one fixed camera. The camera turns every position into screen position and size; items move by simple physics in that world. When position, size, speed and shadows all come from the same source, they agree, and that agreement is what reads as real. A depth effect only feels fake when two cues disagree.

This doc covers the depth model only. Orientation, the fall frames, the art style and what's removed are in the companion [redesign spec](redesign-spec.md).

## 1. One camera, set from two numbers

A normal perspective camera looks slightly down at the floor, so you see a little into the bag, as in the reference. You never tune its height or lens directly; both are worked out from two settings.

- **World units:** 1 unit = 1 frame pixel at the bag's depth. The art keeps its current scale, and the bag is drawn at 1×.
- **Near scale = 1.25×:** how much bigger things are at the bottom of the first screen than at the bag.
- **Tilt = about 20°:** how steeply you look down. It sets how flattened shadows look, about 0.34:1.

**What a real camera gives for free:**

- A lifted item rises less on screen the further away it is.
- Things near you move faster on screen than things far away.
- Sideways positions spread slightly as things come closer.
- Floor shadows flatten correctly.

The earlier linear rule (scale grows with screen height) is almost exactly what this camera produces, within about 1–2% over this depth range. Same look, derived properly, so heights, sideways movement and shadows come out right too.

**Left out on purpose:** items stay flat drawings that always face the camera. Over a 1.25× depth change the viewing angle shifts about 3°, which nobody perceives, and each pose stays one drawing.

## 2. Move things in the world, not on the screen

All motion is world physics seen through the camera; nothing follows a screen-space curve.

- **Gravity** pulls straight down in world units, so a drop from the bag's mouth takes the time it really would at that scale.
- **Rolls and slides use friction, not easing curves.** The item slows at a constant rate and stops cleanly. The landing spot is still picked first by the safe zone; the starting speed is worked out from friction and distance, so the motion is physical and still lands exactly on the spot:

  ```
  v₀ = √(2 · μ · g · d)
  ```

| Item | Bounce (restitution) | Friction | Feel |
| --- | --- | --- | --- |
| Tomato | 0.25, one small bounce | Very low (rolls) | Rolls farthest, slows gradually |
| Radish | 0 | Low; rolls in a curve around its tip | Curves around, stops |
| Banana | 0 | High (slides) | Short slide, slight rock on its curve |

- **Rotation comes from world distance.** The tomato turns by world distance ÷ world radius, so its spin stays correct as it grows on screen.
- **Perception comes for free.** An item rolling toward you at a steady world speed appears to speed up and grow. The eye reads that as depth.

## 3. Shadows: the strongest cue

One light, from the top-left at about 45°, the same direction the drawings are lit from. Each item gets two shadows so contact reads clearly:

| Shadow | Look | Behaviour as the item rises |
| --- | --- | --- |
| Contact | Small, dark (about 25%), tight | Only while touching the floor; fades out within the first few pixels of lift |
| Soft | Larger, pale (about 10%) | Grows, blurs and fades |

- Both are flattened to the camera's floor angle (about 0.34:1) and drawn at the item's floor point.
- Both shift slightly down-right as the item rises (height × light angle), so a lifted item's shadow slides away from it the way a real one does.

**The bag's shadow is generated, not drawn.** For each frame the generator projects the 3D bag box onto the floor along the light and writes a soft shadow layer. As the bag tips, its shadow stretches toward the bottom-right and thickens at the pivot corner. It stays geometrically correct whatever the drawing looks like.

## 4. Dragging: an invisible ramp

The held item always stays under the cursor; only the split between depth and height changes. Picture the floor curving smoothly up into a wall at the bag's depth, like a skate ramp seen from the side.

```
 side view: the held item sits where the line from the camera through the cursor meets the ramp

                                         │  ← drag up: rises up the wall,
  camera ◣ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ●     size frozen at the bag's depth,
          ╲                              │     shadow stays on the floor
            ╲                            │   ┌╌╌╌╌╌┐ mouth at this depth
              ╲                          │   ┊ bag ┊
                ╲                       ╭╯   ┊     ┊
  ─────────────────●──────────────────╯      └╌╌╌╌╌┘
  near    drag down: slides along      ↑ curve = the easing (about 0.15 bag heights)
          the floor, gets bigger          far (the bag's base line)
```

- **Drag down:** the item slides along the floor toward you and gets bigger.
- **Drag up past the bag's base:** it rounds the curve and rises up the wall. Its size freezes at the bag's depth and its shadow stays behind on the floor.
- **The curve is the easing.** It's one continuous surface, so nothing moves suddenly.
- **Held lift:** a small constant lift of about 10 units while held, eased in, so the shadow separates slightly and reads as "in your hand".
- **Why it works:** the bag's mouth sits on that wall, at mouth height. Lifting an item to the mouth puts it in the right 3D place automatically, so putting things back is just "lift it over the bag and let go".

**On release,** the item keeps its drag speed in world terms, falls under gravity, and on landing slides or rolls with its material's friction. A gentle toss travels a little. Release speed is capped at about 600 units/s so items never shoot across the page.

## 5. Keeping the bag frames consistent

The bag frames are drawn through the same camera the page uses, so a drawn frame and the live sprites always agree.

- **Placeholders:** the generator draws the bag as a 3D box rotating about its tipping corner, seen through the exact runtime camera. Foreshortening, how much of the mouth's inside shows, the size of baked-in items, and exit positions all match the live sprites by construction.
- **Your drawings:** trace over those templates and their perspective matches the runtime. The guides layer can include the floor grid and the light direction, so hand shading agrees with the computed shadows.
- **Exits and homes** store the item's 3D position (x, height, depth) instead of screen pixels, so the handoff carries the right size and the right fall height.

## 6. Settings

Starting values, and what each looks like when pushed too far.

| Setting | Start at | Too much looks like |
| --- | --- | --- |
| Near scale | 1.25× | Above 1.35×, things zoom like a fish-eye lens |
| Camera tilt | 20° | Above 30°, it looks like a top-down game |
| Light | Top-left, 45° | Must match the art, or the scene feels off |
| Contact shadow | 25%, tight | Dark and hard looks pasted on |
| Soft shadow | 10%, grows with height | No growth: items float without leaving the floor |
| Gravity | ~5,000 units/s² (real gravity at this scale) | Lower looks like the moon |
| Ramp curve | 0.15 bag heights | 0 gives a visible kink as items start lifting |
| Held lift | 10 units | Much more reads as floating, not holding |
| Release speed cap | 600 units/s | No cap: items get flung across the page |

## 7. What to avoid

- **Moving anything along a screen-space curve.** Every motion is world physics seen through the camera, or the depth cues stop agreeing.
- **Fixed-duration easing for physical motion.** Friction and gravity set the timing. A duration stays only for the one designed moment: an item settling into its slot.
- **Different light directions** across the art, the shadows and any highlights.
- **Depth blur, haze or a visible horizon.** On a plain page these turn a subtle effect into an obvious 3D scene.
