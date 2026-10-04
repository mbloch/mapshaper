# Color Scheme Panel Design

A GUI front end to `-classify` for polygon fills: sequential, diverging and
categorical color schemes, with user-editable ramps.

## Decisions

- **Placement.** A separate popup panel, opened from a "Palettes" button
  on the Fill row of the polygon style panel. The style panel is already long
  (stroke, fill, patterns, glow, presets) and the scheme editor plus its
  data-mapping controls would roughly double it.
- **Style panel indicator.** While a scheme is applied, the Fill row's swatch
  and hex field are replaced by a strip of the class colors and the field name.
  Clicking the strip reopens the scheme panel; a × removes the scheme and
  returns to a single fill. Fill opacity, stroke and the other rows keep
  working. If the stored scheme no longer matches the data (a hand-edited
  fill, a changed field), the strip shows a "modified" state.
- **Tabs.** Sequential | Diverging | Categorical (Diverging is still to
  come). Each tab keeps its own scheme while the panel is open, so switching
  back finds it as it was; the switch is part of the same undo step.
- **Live preview, one undo step per panel session.** Edits are applied to the
  map as they are made. Everything done while the panel is open becomes one
  undo step and one `-classify` command in the session history.
- **Explicit colors in commands.** The panel runs `-classify` with fully
  resolved hex colors, e.g.
  `-classify field=pop quantile classes=5 colors=#344a72,#9a4c64,...`.
  The history is readable and replays exactly, independent of how the ramp
  was built. CLI users get the same interpolation through
  `interpolation=oklab`.
- **Editing a preset makes it custom.** Pinning any tile of a preset switches
  the palette menu to "Custom". The preset's two end colors become end pins,
  the edited tile becomes a third pin, and the other tiles are interpolated.
  Choosing the preset again from the menu restores it.
- **Whole-layer scope.** `-classify` has no `ids=` option, so a scheme applies
  to every feature even when some are selected. The panel says so.

## Ramp model

A custom ramp is a list of pins, `[{t, color}]`, where `t` is a position from
0 (left end) to 1 (right end). Pins are stored by position rather than tile
index so they survive changes to the swatch count.

- Both ends are always pinned. Their colors can change; they cannot be
  unpinned.
- To resolve a ramp to `n` tiles, each pin snaps to tile
  `round(t * (n - 1))`. When two pins land on one tile, an end pin wins,
  otherwise the pin closest to the tile's own position wins.
- Unpinned tiles are interpolated in OKLCH between the nearest pinned tiles
  on either side, by tile index.
- Pinning tile `i` adds (or replaces) a pin at `t = i / (n - 1)`. Unpinning
  tile `i` removes the pins that resolve to it, except end pins.

The pure helpers are in `src/color/color-ramps.mjs` (`resolveRamp`,
`getPinnedSlots`, `setRampPin`, `clearRampPin`) and are exposed to the GUI
through `internal`.

### Why OKLCH

Ramps are interpolated in OKLCH, the polar form of OKLab: lightness, chroma
and hue are each interpolated on their own, so each changes by equal steps
from tile to tile. Hue takes the shorter way around the color wheel. A gray
end (chroma below 0.002) takes the other end's hue, so white-to-blue stays
blue.

A straight line through OKLab (the first version) also steps lightness
evenly, but between two hues it cuts across the middle of the color wheel:
midpoints lose chroma, and hue changes unevenly. RGB interpolation gives
muddy, dark midpoints; CIELAB bends blue-to-white ramps toward purple.

Equal hue steps mean a ramp passes through the hues between its ends -- navy
to yellow goes through teal and green, cream to green through tan and olive.
A user who wants a different path pins a middle tile.

OKLCH colors can fall outside sRGB. They are brought in by reducing chroma at
the same hue and lightness (a binary search for the most chroma the gamut
has there), so hue is kept first, then lightness, and chroma gives way.

Pinned colors are fixed, so steps can still differ in size from one segment
to the next. Evening those out would mean moving pinned colors, which the
model doesn't do.

`-classify interpolation=oklch` uses the same method; `interpolation=oklab`
keeps the straight line.

### Vibrance

The sRGB gamut holds little chroma near black and white, and much more at
mid lightness. Equal chroma steps between a dark end and a light end (both
necessarily low in chroma) therefore leave the midtones far duller than the
gamut allows.

Vibrance adds a fixed amount of OKLCH chroma to every color of the straight
OKLCH interpolation between each pair of pinned tiles, dark end included.
The amount is absolute, so the boost looks about the same at every hue.

Pinned tiles get vibrance as far as the gamut has room at their own
lightness and hue; where a pinned color reaches the edge of the gamut it
just stops changing. Its lightness never moves, and it is never marked as
adjusted. Grays are left alone. The pin keeps the user's color, which is
what the picker shows when the tile is edited. Interpolated tiles that
leave the gamut are fitted to it (see below).

With vibrance 0 this is the straight interpolation, which is the default in
the GUI (slider 0-0.09) and on the command line.

### Hue path

Hue takes the shorter way around the color wheel between two pinned colors.
Some schemes cover more than half the wheel, so a toggle button (next to the
vibrance slider) sends every segment of a custom ramp the long way around
(`hue: 'longer'` in the interpolator's options; no CLI option, since the
panel passes `-classify` its final colors). A segment with a gray end has no
hue to go around from and isn't affected.

### Lightness shift for vibrance

The gamut has little room for chroma near white, so a light end often gains
less chroma than the tile next to it, and the step between them then looks
larger than the others. To offset this, the tile next to the lighter end
moves toward it in lightness:

    L_2 = L_lin + k * max(0, gain_2 - gain_end)

where each gain is the chroma actually gained (as far as the gamut has room
at the straight interpolation's lightness), and the shift stops at the end's
lightness. If the light end takes the full boost, there is no shift. A white
or gray end gains nothing, so the next tile gets the whole shift. The other
tiles are evenly spaced in lightness from the shifted tile to the darker
end. k is 0.2, set by eye with a temporary slider.

Earlier versions:

- Vibrance went to a "reference color" next to the end with less chroma,
  with the other tiles on a line from it to the other end. That left the dark
  end of ramps like Oranges too dull.
- A first attempt lightened the tile next to any near-white end, whether or
  not vibrance was on; testing showed the imbalance came from vibrance.
An earlier version added vibrance along an arch, c_lin(t) + vibrance *
(4t(1 - t))^shape, with a Shape slider; the flat version above looked better.

A first version filled a share of the room left in the gamut at each tile.
That traced the gamut's outline rather than a smooth curve: on a navy to
cream ramp, the tile nearest the lime cusp (where the gamut is very wide)
reached 0.186 chroma while its neighbors had 0.08-0.11, and stood out.

### Fitting to the gamut

An interpolated color outside sRGB keeps its hue. Its lightness may move up
to 0.05, and up to 20% of the lightness step between tiles in that segment,
to where the gamut has room for more of its chroma. Within that range it
takes the lightness that brings it closest to its ideal color, by a color
difference that weights lightness twice as heavily as chroma,

    (2 * dL)^2 + (chroma lost)^2

since viewers notice lightness differences more, and even lightness steps
matter more than even chroma steps. Chroma is then reduced to fit. Where the
gamut gains little chroma with lightness (dark cyans, for instance), this
moves lightness very little and the color is mostly dulled instead.

Tiles moved by more than 0.003 in lightness or chroma are marked with a red
triangle under the tile, where pinned tiles have a dot; its tooltip gives the
lightness shift and the chroma lost.

Where the gamut is tight, clipped tiles fall behind their boosted neighbors,
so large vibrance values can make one tile stand out. The boost is not
capped automatically: the marks show where this happens, and lowering
vibrance until they go away removes it.

## Layer record

The panel needs to know which scheme produced a layer's fills, both to show
the strip and to reopen the editor in the same state. `-classify` writes only
the final colors, so the GUI keeps a small record on the layer, roughly:

```js
lyr.classify = {type, field, method, n, preset, pins, nullColor}
```

It must be covered by undo/redo along with the fill values. How undo snapshots
layer properties still needs to be checked before this is built.

## CLI additions

- `interpolation=rgb|oklab|oklch` on `-classify` (default `rgb`, so existing
  outputs don't change). It affects interpolation between user colors in
  `colors=`, `stops=` and `continuous` output. Numeric `values=` are
  unaffected.
- `vibrance=` (0-0.4) on `-classify`, for `oklch`; `vibrance=` alone
  selects `oklch`.
- Later: a midpoint option for diverging schemes, so breaks fall on either
  side of a data value such as 0.
- Possibly later: placeholder slots in `colors=` (e.g. `#334,*,*,#fd5`) to
  express pinned ramps on the command line.

## Categorical schemes

A categorical scheme is a palette of swatches, of which the first n are used
on the map: a d3 categorical scheme (Tableau10 by default), or a custom list.
The panel shows the whole palette, with a bar under the swatches in use.
Dragging a swatch moves it in the palette; dragging one into the swatches in
use pushes the last of them out of use, and dragging one out brings the
first unused one in. The shuffle button puts the whole palette, used and
unused, in a random order. A preset that is moved or shuffled keeps its name
(the scheme stores the new order as indexes into the preset's colors), and
choosing it from the menu puts it back in order. Editing a swatch makes a
custom list of the palette's colors; one that grows past them goes on with
Tableau20 colors it doesn't have. There are no pins and no interpolation.

Two methods:

- **Categories** (`-classify method=categorical`): each unique value of a
  text or number field gets a swatch, in the order the values first appear,
  which is the order `-classify` uses. If there are more values than
  swatches, they share swatches in turn; a tile's tooltip lists the values it
  colors. The swatch count is capped at the number of values, and choosing a
  field resets it to that number (up to the palette's size). The panel gives
  `-classify` one color per swatch, and `-classify` now repeats a `colors=`
  list that is shorter than the categories, so the command stays short for
  fields with many values.
- **Non-adjacent** (`-classify method=non-adjacent`): no field; neighboring
  polygons get different colors. This takes over from the style panel's old
  Random fill button.

The swatch count goes up to the palette's size (20 for custom lists).
Non-adjacent starts with 5. Palettes of more than 12 swatches are drawn in
two rows.

## Diverging schemes

A diverging ramp is a custom ramp with a third fixed pin at the center, plus a
"center at" data value. With an even number of classes there is no neutral
class; the UI should make that visible rather than hide it.

## Panel contents (sequential, first version)

- Palette menu with ramp previews (presets plus "Custom"), swatch count.
- A row under the tiles with the vibrance slider and two icon buttons: the
  long hue path and reverse. Presets keep only the reverse button.
- Tile row; clicking a tile opens the color picker and pins the tile. A dot
  under each pinned tile; clicking a dot unpins it. End dots are drawn
  differently because they can't be unpinned.
- Null-data color chit.
- Data mapping: field and method (quantile, equal interval, nice, hybrid).
- Deferred: class table, key, export.

## Status

Phase 2 is in place for polygon layers:

- `src/gui/gui-color-scheme-panel.mjs` is the popup;
  `src/gui/gui-color-scheme-model.mjs` holds its state as pure functions
  (unit tests in `test/gui-color-scheme-model-test.mjs`).
- The style panel has a "Palettes" button beside the Fill color (where the Random fill button was; that button is removed for now). While a scheme is
  applied, the fill's swatch and hex value are replaced by the scheme's
  colors; clicking them reopens the panel, and × unsets the fills.
- The layer record lives in a `WeakMap` keyed by layer, not on the layer, and
  is checked against the data each time it is read: if any fill is not one of
  the scheme's colors (or the `-classify` null color), or the field is gone,
  the scheme is treated as gone. Undo and redo of a panel session restore the
  record that went with the fills. It is not saved in snapshots or `.msx`
  files.
- The panel's edits run in a console command session (see the undo guide),
  so a session is one undo entry and one `-classify` in the history.
  Repeated scheme commands are also culled from the exported history.
- Opening the panel applies the default scheme at once, to the first numeric
  field.
- Browser tests: `browser-tests/color-scheme-panel.spec.mjs`.

Not yet done from the panel contents list: the null-data color chit and the
Diverging tab. Sequential and Categorical tabs are in place.

## Phases

1. Core helpers: OKLab conversion, ramp resolution, `interpolation=oklab`.
2. Sequential classed ramps in the GUI, the style panel strip, the layer
   record, and merged undo for a panel session.
3. Categorical schemes (done).
4. Diverging schemes and the CLI midpoint option.
5. Continuous (unclassed) ramps, class table and key.
