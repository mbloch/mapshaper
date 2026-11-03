---
title: Raster toning and tinting
description: Design for the -tone (imagery color adjustment) and -tint (hypsometric tints) commands.
---

# Raster Toning and Tinting

Two commands for coloring rasters:

- `-tone` adjusts the colors of an RGB image, typically to turn true color
  imagery into a light background layer.
- `-tint` colors an elevation raster with hypsometric tints.

Together with `-hillshade` they cover the usual ways of making a raster base
map. A typical session:

```
mapshaper -i states.shp -proj albersusa -frame width=1200 \
  -fetch mapterhorn -hillshade -fetch eox -tone saturation=0.3 opacity=0.45 background=white \
  -o map.svg
```

`-fetch` adds each new layer at the bottom of the stack, so the hillshade ends
up above the toned imagery. Terrain is combined with imagery by stacking a
transparent hillshade on top of it rather than by an option of `-tone`:
fading imagery after shading would fade the shadows too.

This document lists every option discussed. The first implementation adds only
the options marked **Phase 1**; the rest are recorded so that later additions
keep the same vocabulary.

## Shared conventions

- **In place by default.** Like `-hillshade`, both commands replace the target
  layer's raster. `+` (with optional `name=`) adds a new layer and keeps the
  original. `target=` selects the layer.
- **Option names follow `-classify` and the color model.** Color ramps use
  `-classify`'s `colors=`, `breaks=`, `interpolation=` and `invert`, so a ramp
  written for polygons can be pasted into `-tint`. Adjustments are named after
  what they change, `lightness=` and `saturation=`, and 1 is unchanged (as in
  CSS filters, though the color math is different; see
  [Color model](#color-model)).
- **Opacity and background come last.** `opacity=` and `background=` are
  applied after every color adjustment, so the background is the paper the
  finished image is laid on, and is never toned or recolored itself.
- **Transparent pixels.** Without `background=`, transparent and nodata pixels
  stay transparent. With `background=`, they take the background color (see
  below).
- **Fixed order of operations.** The order in which options are typed doesn't
  matter. A different order is available by running a command twice.
- **Wrong input.** `-tone` on a one-band raster stops with a message pointing
  to `-tint` or `-hillshade`; `-tint` on an RGB image points to `-tone`.

## Color model

All of `-tone`'s adjustments work in OKLCH: lightness (L), chroma (C) and hue
(h), rather than HSL or straight RGB.

- `saturation=` scales chroma, keeping lightness and hue. `saturation=0` gives
  a gray of the same perceived lightness as the original color.
- `lightness=` moves lightness toward black or white, keeping chroma and
  hue. Below 1, L′ = L × k, a blend with black by 1 − k. Above 1,
  L′ = L + (k − 1)(1 − L), a blend with white by k − 1. So 0.5 is halfway to
  black, 1.5 halfway to white, and 2 is white. `contrast=`, `gamma=` and `colors=` also work on
  lightness only, so they don't shift hues or saturation.

Why not HSL: HSL's lightness and saturation are not perceptual. Pure yellow
and pure blue both have HSL lightness 0.5, though yellow looks far lighter.
Desaturating in HSL moves every color to (max + min) / 2, so vegetation and
yellow fields get darker and blues get lighter: the image's tonal structure
changes along with its saturation. Hues also drift when chroma is scaled in
HSL, and to a lesser degree in CIELAB, where blues turn purple as they lose
chroma; OKLab was designed to avoid that.

Gamut: lowering chroma at constant lightness and hue stays inside the sRGB
gamut, so `saturation=` from 0 to 1 needs no gamut mapping. `saturation=`
above 1, and `lightness=` above 1, can leave the gamut; those colors are
clipped to the gamut at the same lightness and hue (as `oklchToRgb()` does).
Lightness itself never clips: only white stays at 1.

Speed: converting to OKLab needs a table lookup (sRGB to linear, 256 entries),
a 3x3 matrix and three cube roots per pixel, then the inverse (with a
4096-entry table for linear to sRGB). A prototype loop doing the round trip
with a saturation change took about 170 ms for 10 megapixels in Node 24.
Three 8-bit channels are too many combinations for a single lookup table.

Because the math isn't the same as CSS filters, a GUI preview can't use CSS
`filter` and has to run the same computation, perhaps on a reduced preview
image.

The GUI's tone panel ("adjust colors" in the arrow menu and the layer menu of
an RGB image; `src/gui/gui-raster-tone-tool.mjs`) does that. It tones a copy
of the preview the map is drawing, never the raster, so moving a slider back
and forth doesn't degrade the image: every setting is applied to the original
colors. While a slider is dragged, the copy is made with a 52³ lookup table of
`toneRgbPixels()` results (`getToneColorTable()`), interpolated between
lattice colors, which is several times faster and within a level or two except
for very saturated colors at the edge of the gamut. When the slider is let go,
the preview is redone exactly. The pivots come from the whole raster, as
`-tone` computes them, so the preview matches the result. The Opacity slider
is `-tone opacity=`, which multiplies each pixel's alpha; the preview draws
the copy with the canvas's global alpha, which does the same, and needs no
copy at all if the colors are unchanged. Apply runs `-tone`
with the slider settings, which goes into the session history and the undo
stack; Cancel, the ×, or leaving the mode drops the preview.

## -tone

```
-tone [preset] [options]
```

### Options

| Option | Phase | Description |
| --- | --- | --- |
| `saturation=` | 1 | Chroma multiplier: 0 is gray, 1 is unchanged, above 1 more vivid. |
| `lightness=` | 1 | 0-2. Below 1 blends lightness toward black, above 1 toward white; 1 is unchanged. |
| `opacity=` | 1 | 0-1. Without `background=`, multiplies each pixel's alpha. |
| `background=` | 1 | Composites the result over this color, making it opaque. |
| `+`, `name=`, `target=` | 1 | As for other commands. |
| `contrast=` | 1 | Spreads (above 1) or flattens (below 1) lightness around the image's median, without clipping; 0 is flat. See [contrast= and gamma=](#contrast-and-gamma). |
| `gamma=` | 1 | Lightness tone curve between the image's 1st and 99th percentile lightness: above 1 lightens midtones and shadows (the same direction as in `-hillshade`). See [contrast= and gamma=](#contrast-and-gamma). |
| `hue-shift=` | 1 | -1 to 1. Moves hues toward the pivot hue by up to half their distance from it (at 1), or away; see [hue-shift= and hue-pivot=](#hue-shift-and-hue-pivot). |
| `hue-pivot=` | 1 | The hue `hue-shift=` moves toward: a color, or an OKLCH hue angle. Default 85° (yellow-tan). |
| `colors=` | Later | Maps lightness onto a color ramp, dark to light (duotone or more colors). Replaces saturation and hue, so it can't be combined with `saturation=`. |
| `range=` | Later | Input lightness range mapped onto `colors=`: `auto` or two numbers, e.g. `0.2,0.65`. Default is 0 to 1. |
| `interpolation=` | Later | `oklch` (default) or `rgb`, for `colors=`. |
| `verbose` | Later | Prints the settings used, including an automatic `range=`. |
| preset | Later | `light`, `gray`, `muted`. Options given with a preset override its settings. |

### Order of operations

1. Convert each pixel to OKLCH.
2. Lightness: `gamma=`, then `contrast=`, then `lightness=`.
   `gamma=` shapes the midtones, `contrast=` spreads them, and `lightness=`
   then fades the result evenly toward black or white. Applied after a lift,
   the curve would act on an already compressed band, and its effect would
   depend on `lightness=`. All three are combined into one lookup table over
   lightness.
3. `saturation=` (chroma), or `colors=` (lightness to ramp color), then
   `hue-shift=` (hue).
4. Convert back to sRGB.
5. `opacity=`, then `background=`.

### contrast= and gamma=

Both use levels found in the image's own lightness, from a sample of at
most a million visible pixels: the 1st and 99th percentiles (lo and hi),
between which `gamma=` curves, and the median, which `contrast=` centers on.
`gamma=` is applied first, then `contrast=`.

`contrast=` (k, 0 or more) works around a center c, the median kept within
0.25-0.75, and leaves c where it is:

- Below 1, every lightness moves toward c in proportion,
  L′ = c + (L − c) × k, black and white included. 0 gives a flat image at
  c.
- Above 1, each side of c bends toward black or white. With u the distance
  from c as a fraction of the room on that side (c below, 1 − c above),
  the new distance is k u / (1 + (k − 1) u). The slope at c is k, so the
  midtones spread by about k; black and white stay put, and the slope there
  is 1 / k, so the extremes are compressed, never clipped.

Why the median, clamped: contrast should be steepest where the image's
tones are. On EOX imagery the median, 0.39, is also where the earlier
version's fixed point fell. The clamp keeps room on both sides when most of
the image is snow or deep shadow, where the median would be at one end.

An earlier version moved the 1st and 99th percentile pivots: it multiplied
hi − lo by k, up to black to white, with the room outside them keeping its
ratio, and the tails scaled into what was left. That was reversible by the
reciprocal, but it had two problems:

- Lowering contrast kept black and white fixed while the pivots moved
  toward each other, so the 1% of pixels at each end were stretched across
  a wide range (a slope near 4 at `contrast=0.33` on a photo with lo at
  0.15). Pure black and white pixels stayed put among them, and dark
  shadows turned into black specks.
- Raising contrast did nothing more once the pivots reached black and white,
  at k = 1 / (hi − lo). On a snow scene with pivots at 0.02 and 0.98, that
  was 1.04.

The new curve can't be undone by the reciprocal: once lowering contrast has
lifted black, raising it can't bring black back down without clipping.
(Before that, a version that blended the pivots toward black and white
above 1 and toward their midpoint below 1 lightened dark images when
contrast was raised and then lowered.)

Between the pivots, `gamma=` follows

L′ = lo + (hi − lo) × ((L − lo) / (hi − lo))^(1/gamma)

and leaves lightness below lo and above hi alone. Imagery rarely reaches
black or white, so a curve over the full 0-1 scale moved the image's whole
range as well as its midtones: on EOX imagery (0.25-0.61), `gamma=1.6` moved the
darks to 0.42 and the lights to 0.73, and getting both the curve and the
overall lightness right meant alternating between `gamma=` and `lightness=`.
With the curve on the image's range, `gamma=` only shapes the midtones
(EOX, `gamma=1.6`: median 0.39 to 0.45, with the 1st and 99th percentiles
unchanged), and `lightness=` sets the overall lightness. Percentiles rather
than the minimum and maximum, because the extremes are a few clouds or
shadows (EOX: 0.08-0.99), which would make the curve nearly absolute again.

The levels found are recorded in the layer's derivation as `pivots`
([lo, hi, median]), and the center `contrast=` used as `contrast_center`.
Like `range=auto`, they
depend on the frame, so adjacent map sheets can get slightly different
curves. If that matters, `range=lo,hi` (later) could also pin the pivots,
and `verbose` print the pivots found.

### hue-shift= and hue-pivot=

EOX greens are intense partly because of their hue: OKLCH 120-160°, toward
blue-green, where vegetation in natural-looking imagery is closer to olive
(about 105-125°). In a Glacier National Park frame, greens covered 58% of
the pixels at a median chroma of 0.055, against 0.04 for the tans, so they
were not much more saturated than the rest; per-hue saturation would work
but is complicated to use.

`hue-shift=` rotates each color's hue toward the pivot hue by `hue-shift`
times half its distance from it, times cos(distance / 2), so the rotation
never passes the pivot and fades to nothing at the opposite hue. It also
fades out below chroma 0.03 (to nothing at 0.005), so snow, white and gray
rock stay neutral. Lightness and chroma are unchanged. Negative values push
hues away from the pivot.

The half is there so that the range from -1 to 1 is all useful. Without it,
values above 0.5 collapsed greens and oranges onto the pivot, and values
below about -0.6 pushed hues far enough that they crossed near the opposite
hue, swapping colors and banding; with it, hues keep their order across the
whole range.

`hue-pivot=` takes a color (its OKLCH hue is used; grays are an error) or a
hue angle in degrees. The default, 85°, is a yellow-tan (ochre) rather than
pure yellow (about 110°): with a yellow pivot, greens would move about half
as far, and tan rock and dry grass, near 85°, would shift toward
yellow-green. With the default, hues near the pivot barely move, greens move
most (138° to about 112° at 1), and blue water, near the opposite hue
(265°), stays blue.

```
-tone hue-shift=0.8                        # toward ochre: greens to olive
-tone hue-shift=0.6 hue-pivot=orange       # warmer: toward orange-brown
-tone hue-shift=0.6 hue-pivot=#4a6fa5      # cooler: toward a slate blue
```

A pivot pulls every hue within 180° of it, so a cool pivot also moves reds
toward magenta (on the Glacier frame, the red argillite turned pink with a
slate-blue pivot).

Naming: `hue-shift=` with a pivot, rather than `warmth=`, which suggests a
white-balance control. In image editors a hue shift usually rotates all hues
by a fixed angle; here the value is a fraction of each hue's distance from
the pivot, which the help text states.

A white-balance shift (`temperature=`) was simulated first: red up 12% and
blue down 12% in linear RGB moved greens only 6° toward yellow, while snow
turned cream (+0.019 chroma) and tans got more saturated. It warms the whole
image rather than the vegetation, but would still be useful for imagery with
a color cast, and may be added later.

### opacity= and background=

`opacity=0.4` alone makes the raster 40% opaque: whatever is drawn below it
shows through.

`opacity=0.4 background=white` composites the 40% opaque image over white:

```
result = color * opacity + background * (1 - opacity)
```

The blend uses ordinary (gamma-encoded) sRGB values, which is what a 40%
opacity layer over white paper gives in Illustrator or a browser, so the
results match that familiar look. The result is opaque, so its color doesn't
depend on what is drawn below it, the hillshade sits on a solid base, and the
exported image already has the final colors.

Compositing over a background fills transparent pixels with the background
color too, so missing tiles become the background. That matches
`-proj background=`, which fills uncovered pixels. To keep the gaps, use
`opacity=` without `background=`.

`background=` will often be the map's paper color rather than white, e.g.
`background=#f6f3ec`, so that the image blends into the page.

### colors= (later)

Each pixel's lightness (after the lightness adjustments) is mapped to a
position on the ramp: L = 0 is the first color, L = 1 the last, with three or
more colors spaced evenly. The hue and chroma of the original pixel are
discarded, so features that differ only in hue (water, forest, dark rock)
become one color. On a light base map that's usually intended, since water and
other features come from vector layers drawn on top.

Example: a forest pixel, RGB (60, 90, 40), has an OKLCH lightness of about
0.43. With `colors=#56604f,#f5f2ea` it becomes the color 43% of the way along
the ramp, about `#999b8d`.

True color imagery seldom spans the full lightness range, so mapped directly
it uses only part of the ramp. Measured OKLCH lightness, 1st to 99th
percentile, with the median: EOX over the Botswana test frame 0.26-0.61
(0.39); Blue Marble, same frame, 0.30-0.62 (0.46); USGS over the Colorado
Front Range 0.25-0.73 (0.38). `range=` addresses this:

- Default, 0 to 1: the same image always gets the same colors, and adjacent
  map sheets match, but the image may use only part of the ramp.
- `range=auto`: stretches from the 1st to the 99th percentile of the image's
  lightness. It uses the whole ramp without tuning, but the colors depend on
  the frame (a bright salt pan coming into view darkens everything else).
  `verbose` prints the range found, so it can be pinned with `range=lo,hi`.
- `range=lo,hi`: explicit.

### Presets (later)

Starting points and examples of the options. Values to be tuned on real
imagery:

| Preset | Settings |
| --- | --- |
| `light` | `saturation=0.35 opacity=0.45 background=white` |
| `gray` | `saturation=0 opacity=0.5 background=white` |
| `muted` | `saturation=0.6` |

### Examples

```
-fetch eox -tone saturation=0.3 opacity=0.45 background=white
-fetch eox -tone saturation=0 lightness=1.1 opacity=0.5 background=#f6f3ec
-fetch bluemarble -tone colors=#4a5a6a,#e9e4d8          (later)
-fetch eox -tone light                                  (later)
```

## -tint

```
-tint [options]
```

### Options

| Option | Phase | Description |
| --- | --- | --- |
| `colors=` | 1 | Color list or scheme name (as in `-classify` and `-colors`), low to high. |
| `breaks=` | 1 | The elevation of each color: numbers (elevation units), percentages of the elevation range (`40%`), or a mix. Default spreads the colors evenly over the range. |
| `opacity=`, `background=` | 1 | As in `-tone`. |
| `band=` | 1 | Band containing elevation values (default 0), as in `-hillshade`. |
| `+`, `name=`, `target=` | 1 | As for other commands. |
| `verbose` | 1 | Prints the elevation each break resolved to. |
| `interpolation=` | Later | `oklch` (default) or `rgb`. |
| `invert` | Later | Reverses the colors. |
| percentile breaks | Later | Breaks by rank (histogram equalization); syntax undecided. |
| automatic breaks | Later | Breaks chosen from the elevation distribution (see below). |

Colors are interpolated linearly in elevation between breaks; there is no
curve option. Giving more of the ramp to low elevations is done with
`breaks=`, and may later be done by automatic breaks.

Output is an RGB image, RGBA if any pixel is nodata (nodata pixels are
transparent unless `background=` is given).

### breaks=

The number of breaks equals the number of colors; between breaks, colors are
interpolated. Below the first break the first color is used, above the last
the last.

- Plain numbers are elevations, in the raster's units.
- `40%` is 40% of the way from the lowest to the highest elevation in the
  raster. The range ignores the lowest and highest 0.1% of valid pixels, so a
  spike or an artifact in the bleed area doesn't shift every break.
- The two can be mixed: `breaks=0,40%,100%`. Sea level is the one elevation
  users reliably know, and the most common fixed break in hypsometric tints.
  The command stops if the resolved breaks don't increase.

Percentages depend on the frame, so `verbose` prints the resolved elevations,
which can be pasted in to make adjacent map sheets match.

Percentiles were considered as the meaning of `%`, and rejected: most users
would read "20%" as 20% of the way up. Percentiles (the elevation that 20% of
the pixels are below) equalize the area each color covers, which brings out
lowland detail in mostly flat frames, but the same color then means different
elevations in different maps. If added, they get their own syntax.

### Examples

```
-fetch tilezen -tint colors=#3f6b4a,#c9b98a,#f4efe6
-fetch tilezen -tint colors=#3f6b4a,#c9b98a,#f4efe6 breaks=0,30%,100%
-fetch tilezen -hillshade + name=hs -tint target=elevation colors=#3f6b4a,#c9b98a,#f4efe6
```

The last example tints the elevation layer in place, under the hillshade
layer (an opaque tint created with `+` would sit above the hillshade).

## Color ramps

`colors=` is resolved into a lookup table once per command, using the same
OKLCH interpolation as vector ramps (`getOklchInterpolator()`). Each pixel is
then one table lookup.

- Each segment between two breaks has its own 256 entries
  (`getColorRampTable()` in `src/rasters/mapshaper-raster-color.mjs`). A single
  table over the whole range would leave a narrow segment, such as 0 to 10 m in
  a ramp to 4000 m, with one or two entries, and breaks would fall between
  entries. With a table per segment, each break's color is exact.
- Gamut fitting can only move a color's lightness by a fraction of a step, so
  lightness stays monotonic along the ramp.
- When `-tone` gets `colors=` (later), it can use the same tables, with one
  segment per pair of colors.

`interpolation=` defaults to `oklch` in these commands, unlike `-classify`,
which defaults to `rgb`. RGB is noticeably worse on multi-hue ramps, and the
new commands have no compatibility to keep. The cost is that the same
`colors=` gives slightly different midtones in `-classify` and `-tint` unless
`interpolation=` is set.

## Decisions and alternatives

- **Names.** `-tone` follows photographic and cartographic usage ("toning
  down" imagery, tone curves); "hypsometric tints" is the standard term for
  elevation coloring. In color theory a tint is a color mixed with white,
  which is what `opacity=` with a white `background=` does, so some users may
  try `-tint` on imagery; the wrong-input messages handle that. `-recolor`
  and `-adjust-image` were considered; `-recolor` sits too close to `-colors`
  and `-colorizer`.
- **fade= and fade-color=** were replaced by `opacity=` and `background=`,
  which describe the same blend in familiar terms (`fade=0.6` is
  `opacity=0.4 background=white`) and also cover real transparency.
- **lightness=, not brightness=.** Named after the OKLCH dimension it
  changes, alongside `saturation=`.
- **lightness= blends toward white rather than multiplying above 1.**
  Multiplying (like CSS `brightness()`) clips the lights before the darks
  come up much: EOX imagery, with lightness 0.26-0.61, goes to 0.42-0.98 at
  1.6. A blend with white lifts the darks most and never clips (0.63-0.81 at
  1.5), which suits a light base layer. In both directions `lightness=`
  compresses the lightness range and never adds contrast; stretching is left
  to `contrast=`. A two-value output range
  (`lightness=0.5,0.92`) was considered and dropped: `lightness=1.5` is the
  0.5-1 case, and `gamma=` can shape the lift.
- **contrast= is a line below 1 and a soft S-curve above 1, around the
  median.** A plain multiplier around one lightness clips at both ends; see
  [contrast= and gamma=](#contrast-and-gamma) for the earlier pivot-based
  version and why it was replaced.
- **No curve option in -tint.** Linear interpolation between breaks;
  automatic breaks may come later instead.
- **vibrance=** (from `-classify`) was left out. It mainly helps colored
  duotones, whose OKLCH midtones can be dull; light base maps don't need it.
  It can be added if duotones look flat.
- **Terrain in -tone.** A `shade=<layer>` option that multiplies a hillshade
  into the image, making one raster instead of two, was postponed: stacked
  layers look the same.
- **Hue-selective adjustments** (toning down bright greens or agricultural
  patchwork) were left out as too complex for the benefit; saturation plus
  opacity covers most cases.

## Open questions

- How automatic breaks for `-tint` should be chosen (percentiles, or a method
  that gives more of the ramp to low elevations), and their syntax.
