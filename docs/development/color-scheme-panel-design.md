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
  `interpolation=oklch`.
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

`-classify interpolation=oklch` uses the same method. An `interpolation=oklab`
option for the straight line was removed once the panel moved to OKLCH.

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

Compared with Björn Ottosson's
[sRGB gamut clipping](https://bottosson.github.io/posts/gamutclipping/)
(2021): `oklchToRgb()` is his constant-lightness method, and
`fitLightness()` makes the same trade as his adaptive methods (a little
lightness for more chroma), but with a cap on the lightness shift, which
keeps the lightness steps of a ramp even. His projections have no such cap,
and are meant for clipping the pixels of images, so we don't use them. His
analytic gamut intersection (from an approximation of the gamut's cusp)
could replace the bisection in `findMaxChroma()`, but that search is
already cheap (about 0.13 µs). The cost of fitting is the many searches
`fitLightness()` makes per color (about 8 µs for a color outside the
gamut). If continuous `-classify` output on large layers needs to be
faster, sampling each interval into a lookup table would do more.

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

- `interpolation=rgb|oklch` on `-classify` (default `rgb`, so existing
  outputs don't change). It affects interpolation between user colors in
  `colors=`, `stops=` and `continuous` output. Numeric `values=` are
  unaffected.
- `vibrance=` (0-1) on `-classify`, for `oklch`, scaled to OKLCH chroma
  (1 adds 0.09, the top of the panel's slider); `vibrance=` alone
  selects `oklch`.
- `pivot=`, `pivot-range=`, `no-pivot-class`, `pivot-class` and
  `classes=lo,hi` for diverging schemes (see Diverging schemes).
- With `continuous`, N colors give N-1 intervals (see Continuous ramps).
- Possibly later: placeholder slots in `colors=` (e.g. `#334,*,*,#fd5`) to
  express pinned ramps on the command line.

## Categorical schemes

A categorical scheme is a palette of swatches, of which the first n are used
on the map: a categorical preset (batlowS by default), or a custom list.
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

## No-data color

A "No data" row (a chit and a hex field, with the number of features it
applies to) sets `-classify null-value=`. Its default is `-classify`'s own,
`#eee`, and then the command leaves the option out. Both tabs share the
color, and non-adjacent schemes, which have no field, hide the row.

No data is what `-classify` treats as missing: for sequential schemes, any
value that isn't a finite number; for categorical schemes, null, undefined,
empty strings and NaN. `-classify` used to make an empty value a category of
its own, which would have given it a swatch; categories found from the data
now leave empty values out, so that they get the null value.

## Diverging schemes

A diverging scheme is two sequential schemes back to back around a pivot
value, optionally sharing a neutral class at the pivot. The classification
is in `src/classification/mapshaper-diverging.mjs` and
`getDivergingClassValues()` in `mapshaper-classify-ramps.mjs`; the panel's
Diverging tab uses the same layout function (`internal.getDivergingLayout`).

### Model

- **Pivot value**: a number, `median` or `mean`. Default (`auto`): 0 if the
  data has both negative and positive values, otherwise the median. The
  panel always shows it, since the default is a convenience, not a guess at
  the map's meaning.
- **Neutral (pivot) class**, on by default. It straddles the pivot and takes
  the center color. Its range is either given (`pivot-range=-1,1`) or
  automatic: one class wide, centered on the pivot -- half a step either
  side for equal interval and nice, and for quantile and hybrid the share of
  features one class holds, taken from those nearest the pivot (the range
  reaches halfway to the next value out, so no value sits on its edge).
  With the neutral class off, the pivot is a break, and features equal to
  the pivot go to the upper side, as with other breaks ([lower, upper)).
- **Classes per side.** Each side is classified on its own data with the
  chosen method, so quantile and equal interval stay exact within a side
  even when the pivot is set by hand. `classes=N` (the total, including the
  neutral class) gives the two sides classes of the same size:
  - equal interval: one step for both sides, the largest that gives N
    classes, so the longer side's classes reach just to the end of its data;
  - nice: of the nice steps (1, 2, 2.5, 5 x 10^k) near that step, the one
    whose total comes closest to N;
  - quantile, hybrid: the side classes are split in proportion to each
    side's feature count, each side with features getting at least one.

  The side with less data gets fewer classes. `classes=lo,hi` sets the
  counts directly (with nice, the nearest nice step can change them). The
  default is 7 classes (6 with `no-pivot-class`), or the length of a
  `colors=`/`values=` list.
- **Colors and truncation.** With K classes on the longer side, the scheme
  is built with 2K+1 colors (K per side and the center), and the shorter
  side drops its outermost colors, so the nth color from the pivot means the
  same thing on both sides. Presets use `getColorRamp(name, 2K+1)`: the
  ColorBrewer set for K <= 5, the d3 interpolator beyond. A `colors=` list
  with an odd count has its middle color as the center; with an even count,
  the center is interpolated between the middle two. Each half of a list
  is interpolated separately, center outward. `invert` builds the colors
  with the sides swapped and reverses them.

### CLI

```bash
-classify change colors=RdBu pivot=0 classes=7 quantile
-classify change colors=RdBu pivot=0 pivot-range=-0.5,0.5 classes=3,3 equal-interval
-classify income colors=#b35806,#f7f7f7,#542788 pivot=median classes=4,6
```

- `pivot=` (or `pivot-range=`) turns on diverging classification;
  `no-pivot-class` drops the neutral class, and `pivot-range=` sets its
  range (with `pivot=` defaulting to the middle of the range).
- A `colors=` list with one color per class is used as given when the two
  sides have the same number of classes, or when `classes=lo,hi` is given;
  otherwise it is treated as a ramp with its center at the pivot.
- The panel passes `pivot=`, `classes=` and all 2K+1 of its tile colors.
  -classify finds the same K from the data, so the list is its full ramp,
  used as given (no interpolation), and it takes the same tiles for the
  classes as the panel shows in use.
- `breaks=` works with `pivot=`: a pivot at a break divides the classes; a
  pivot inside a class makes that class the neutral class (an error with
  `no-pivot-class`). `pivot-range=` can't be combined with `breaks=`.
- `invert`, `null-value=`, `precision=`, `outer-breaks=` and
  `interpolation=`/`vibrance=` work as before, and `continuous` (see
  Continuous ramps). `stops=` and the categorical methods are rejected with
  `pivot=`.
- A message reports the pivot and the classes on each side, before the
  usual table of class ranges.

### Panel

- A Diverging tab between Sequential and Categorical. The scheme keeps the
  layout -classify will find (`scheme.layout`, refreshed by
  `updateDivergingLayout()` after each change and when the panel opens).
- Presets are the ColorBrewer and Crameri diverging schemes (RdBu by
  default); the preset menu on each tab groups presets by source, from
  `getColorSchemeGroups()`. A custom ramp has
  pins at both ends and at the center (t = 0.5), which stays pinned; each
  half is an OKLCH ramp, with vibrance. There is no long-hue option: each
  half runs from a low-chroma center, where the hue path makes little
  difference.
- Tiles: 2K+1, low side, center, high side. A bar under the tiles marks the
  ones classes use: the shorter side's outer tiles have none, and without
  a pivot class there is a gap at the center. Each tile in use has its
  class's data range as a tooltip.
- Data mapping: pivot (Auto, Median, Mean or Value, with the resolved value
  shown, and the number of features on each side below), the pivot class
  switch, Sides (same class size, with a total of classes; or the same
  number per side), and the count.
- Not yet: `pivot-range=` (the panel's pivot class is always automatic).
- Later: a small histogram or strip plot with the pivot and breaks, which
  could also let the pivot be dragged.

### Edge cases

- All the data on one side of the pivot: that side gets every class, with a
  warning.
- A neutral range that covers all the data, or crosses its min or max.
- A side with fewer distinct values than classes (quantile especially).
- `classes=N` with a neutral class and an even N.
- A pivot outside the data's range: every class is on one side.

### Phases

1. Classification core: pivot resolution, neutral range, per-side breaks for
   each method (pure functions, unit tested). Done.
2. Diverging color assignment: ColorBrewer sets, interpolation, truncation.
   Done.
3. CLI options, messages, docs and tests. Done.
4. GUI model and panel, browser tests. Done.
5. Continuous diverging ramps (see Continuous ramps). Done.
6. Later: distribution plot, keys.

## Continuous ramps

Unclassed colors for sequential and diverging schemes, with -classify's
`continuous` flag: the tiles become control points, and each feature's color
is interpolated between the two around its value.

### How -classify places the colors

- The colors sit at the class breaks: the first at the data's minimum, the
  last at its maximum, the inner ones at the breaks the method finds. A value
  between two breaks is interpolated between their colors. So the method
  still matters -- it places the control points in the data (equal interval
  gives a linear ramp, quantile one that evens out the histogram).
- Change: with `continuous`, a list of N colors gives N-1 intervals by
  default, so each color is a control point, used as given. (Before, N
  colors made N classes and N+1 colors, re-interpolated from the list.)
- The panel passes `continuous interpolation=oklch classes=N-1` and its tile
  colors. Not `vibrance=`: the tiles already have it, and the interpolation
  between them would add it again.

### Panel

- An icon toggle beside the reverse button (pressed state like the long-hue
  button's), with a gradient icon: a rounded rectangle filled from
  transparent to the icon color. Tooltip "Continuous colors (unclassed)".
  Shown on the sequential and diverging tabs, presets included.
- A gradient bar (about 12px) over half-height tiles (about 14px), which stay
  clickable and pinnable as the control points. Each stop is under the
  center of its tile, with the end colors held over the outer half-tiles.
  The gradient is built from samples of the same interpolator -classify uses
  (about 6 per interval), not a CSS `in oklch` gradient, whose gamut mapping
  differs.
- Tile tooltips give the data value at each stop ("1806 (min)", "2016",
  "5434 (max)").
- The gradient's extent shows which tiles are used, so the black bar is not
  drawn in this mode.
- Starting the mode with 5 or more stops: with 2-3, vibrance and the long hue
  path show only at the stops, since -classify interpolates directly between
  them.

### Diverging

- -classify takes `pivot=` with `continuous`.
- The center color is never a stop of the interpolation. Each side is its
  own gradient, of its own tiles only: a side with m classes becomes m
  intervals, with m + 1 tiles from the one next to the center outward. So
  each side has one more tile than in the classed layout (K = the longer
  side's m + 1), and a side with data always has a gradient of at least two
  tiles.
- The pivot class is off by default in this mode. Off, the center tile is
  unused (as in the classed layout without one), and the two gradients meet
  at the pivot, each starting at its own first tile, so there is a step
  there. The panel draws two bars with a gap at the center tile.
- On, the pivot class is a discrete class outside the interpolation: a flat
  band of the center color across its range, and the two gradients start at
  its edges.
- The panel keeps the switch's setting for each mode, so that turning
  continuous on and off doesn't lose it. On the command line, `continuous`
  has no pivot class unless `pivot-class` (a new flag, the opposite of
  `no-pivot-class`; automatic range) or `pivot-range=` is given; classed
  output keeps its pivot class by default. The panel always passes one of
  the two flags.
- A list of colors still has the center color in the middle (2K+1 colors),
  so the same list works in both modes; without a pivot class the center
  color is ignored.
- Equal interval and nice: the sides end at the pivot (or the band's edge)
  +/- K steps, not at the data's min and max, so that equal distances from
  the pivot get equally strong colors; the shorter side's gradient stops
  partway between two tiles, at the end of its data. Quantile and hybrid
  sides run to their own data extents, as in the classed layout.
- A side with no data: no gradient on that half, and the ramp is the other
  side's gradient alone.

### Other changes needed

- The layer record checks that every fill is one of the scheme's colors,
  which interpolated fills aren't. Keep a fingerprint of the fills (a hash
  of the fill column) when the scheme is applied, and check that instead.
- The style panel's strip and the palette button show the gradients rather
  than blocks, end to end: each gradient runs from its first stop to its
  last, without the flat half-tiles of the panel's bar, and a pivot class
  takes a tile's width.

## Preset ranges

Some presets end in near-black or near-white (davos, oslo, batlowW), which a
map may not want. A sequential or diverging preset can use part of its ramp:

- `scheme.range` is `{start, end, base}`, 0-1 in the preset's own direction,
  so reversing a preset doesn't change it; null means the whole ramp. The
  tiles are evenly spaced over the range, and changing the number of colors
  resamples within it. The panel sends the tile colors in `colors=`, so
  `-classify` needs nothing new (its `stops=` option does the same thing on
  the command line, but not with `pivot=`).
- Trimming one tile's width off each end and taking two colors away leaves
  the other tiles as they were: davos at 5 colors over 1/6-5/6 is the
  7-color davos minus its first and last colors. (An earlier × button on
  the end tiles did this in one click; it was dropped as the range handles
  do the same and more.)
- ColorBrewer's 3-9 color sets are hand-picked, not samples of d3's
  interpolators (a channel can differ by 40 or more), so a range over one
  of them would change all its colors. `base` is the number of tiles when
  the range was first narrowed; `getColorRampSection()` interpolates
  between the colors of the set of that size, if the preset has one, and
  otherwise uses the preset's interpolator.
- In the vibrance row (which presets don't otherwise use), a strip of the
  whole ramp, shaded outside the range, with a handle at each end. Handles
  drag, take arrow keys (Shift for larger steps), and a double-click
  restores the whole ramp. The range keeps at least 10% of the ramp.
- A diverging range is trimmed the same amount at both ends, so the center
  color stays at the pivot. Diverging tiles can't be removed, since the
  number of tiles follows the classes on each side.
- Choosing another preset, or editing a tile (which makes a custom ramp),
  clears the range.

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

Sequential, Diverging and Categorical tabs are in place, with continuous
ramps on the first two.

## Phases

1. Core helpers: OKLab conversion, ramp resolution, `interpolation=oklch`.
2. Sequential classed ramps in the GUI, the style panel strip, the layer
   record, and merged undo for a panel session.
3. Categorical schemes (done).
4. Diverging schemes: the CLI pivot options and the panel tab (done).
5. Continuous (unclassed) ramps, class table and key.
