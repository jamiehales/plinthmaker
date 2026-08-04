# Chamfer/Fillet Rework Plan (Revised)

## Problems with the current implementation

1. **"Both" incorrectly affects the bottom.** The current `applyRounding` treats
   `roundLocation === 'both'` as "top + bottom + edges". Per the user, "both"
   should mean **top + edges** only — the bottom is never rounded.
2. **Fillets are subtractive, which is wrong.** A fillet *rounds* an edge
   convexly (keeping the bounding box); a chamfer *removes* material (flat
   45° bevel). The current code uses `SUBTRACTION` for both, so "fillet" carves
   a cylindrical trench instead of rounding outward.
3. **Ellipses are unsupported.** Rounding is gated on `shape === 'rectangle'`.
   The subtractive-boolean approach makes the ellipse case very hard.
4. **Bottom is rounded in "both" mode** — should never happen.

## New approach: direct mesh generation from outlines

Build the geometry **directly** from horizontal "rings" (X-Z outlines) stacked
vertically. No CSG for the rounding step; CSG only for `angleTop` cut and hole
subtraction (unchanged).

### Outline construction (`makeOutline`)

Returns CCW-from-above points in the X-Z plane (closed loop, no dup last pt).

- **Ellipse**: sample `ELLIPSE_SEGMENTS=48` points: `(hw*cos(a), hd*sin(a))`.
- **Rectangle, no edge rounding**: 4 corner points.
- **Rectangle, edge chamfer**: 8 points — corners cut at 45°, chamfer width `r`.
- **Rectangle, edge fillet**: rounded rectangle — 4 arcs of `ARC_SEGMENTS=8`
  per corner, radius `r`, plus implicit straight segments between arc
  endpoints (the arc endpoints themselves serve as segment boundaries).

### Top rounding via normal-based shrink

For each outline point, compute the outward normal from the 2D outline
tangent: `normal = (dz, -dx) / len` for CCW winding. Shrink inward by moving
each point along `-normal * shrinkAmount`.

This works uniformly for **both shapes** and all outline types (plain rect,
chamfered, filleted, ellipse). No special-casing per shape.

**Chamfer top** (linear):
```
shrink(t) = r * t
y(t)      = h - r + r * t
```
8 intermediate steps.

**Fillet top** (quarter-arc):
```
shrink(t) = r - r * cos(t * π/2)   // 0 → r
y(t)      = h - r + r * sin(t * π/2)  // h-r → h
```
12 intermediate steps.

### Ring stack

```
rings = [
  { y: 0,   pts: baseOutline },           // bottom
  { y: h-r, pts: baseOutline },           // start of top rounding (if topRound)
  ...arc rings...,
  { y: h,   pts: shrinkOutline(base, r) } // top (shrunk)
]
```
If no top rounding: `rings = [{ y:0, base }, { y:h, base }]`.

### Mesh assembly

- **Side walls**: connect consecutive rings with quads → 2 triangles per
  segment. Winding for CCW-from-above outline:
  - `tri1: (k,j), (k+1,j), (k,j+1)`
  - `tri2: (k,j+1), (k+1,j), (k+1,j+1)`
  Verified: cross product gives outward normal (+X for right wall). ✓

- **Caps**: triangulate outline via `THREE.Shape` + `ShapeGeometry`.
  - Top cap: use indices as-is (normals +Y).
  - Bottom cap: reverse indices (normals -Y).

### `roundLocation` semantics

| location | shape     | topRound | edgeRound | effect                    |
|----------|-----------|----------|-----------|---------------------------|
| none     | any       | false    | false     | plain                     |
| top      | any       | true     | false     | chamfer/fillet top rim    |
| edges    | rectangle | false    | true      | chamfer/fillet vert edges |
| edges    | ellipse   | false    | false     | (button hidden; n/a)      |
| both     | rectangle | true     | true      | top + edges               |
| both     | ellipse   | true     | false     | top only (edges hidden)   |

Bottom is **never** rounded.

### Drill jig handling

The jig should NOT get rounding. `buildJigGeometry` internally calls
`buildPlinthBody(p, tol)` to form the cavity. We clone `p` with
`roundStyle: 'none', roundLocation: 'none'` before that call, so the jig
cavity always uses a plain unrounded plinth body. No changes needed in
`App.tsx` — the stripping happens inside `buildJigGeometry`.

### `angleTop` interaction

`buildPlinthBody` builds the rounded body, then applies the angle-top boolean
cut (unchanged). The rounded body is a closed manifold mesh, so the boolean
works fine. Hole subtraction also unchanged (applied after body+angleTop).

### `tol` parameter

Applied to `w` and `d` only (as before). Rounding disabled for jig path via
params clone, so `buildRoundedBody` with `roundStyle:'none'` produces a plain
box/cylinder with tol-applied dimensions — same as old `makeBodyGeometry`.

## Files to change

- `src/components/Plinth.tsx`:
  - Remove `ROUND_SEGMENTS`, `applyRounding`, `makeTopBottomCuts`,
    `makeVerticalEdgeCuts`.
  - Replace `makeBodyGeometry` with `buildRoundedBody`.
  - `buildPlinthBody` calls `buildRoundedBody` then applies `angleTop` cut.
  - `buildGeometry` calls `buildPlinthBody` then applies hole subtraction.
  - Add helpers: `makeOutline`, `shrinkOutline`, `triangulateOutline`.

- `src/components/DrillJig.tsx`:
  - In `buildJigGeometry`, clone `p` with `roundStyle: 'none'` before
    calling `buildPlinthBody`.

## Verification

- `pnpm run build` (tsc + vite)
- `pnpm run lint` (oxlint)
- Visual check: rectangle with top chamfer, top fillet, edge chamfer, edge
  fillet, both; ellipse with top chamfer, top fillet; none.