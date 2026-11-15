---
title: Blending hillshades with other layers
description: Design for the -blend command, which applies a hillshade's shadows and highlights to an imagery, data or vector layer.
---

# Blending Hillshades with Other Layers

Status: phase 1 and vector targets are implemented, with the `overlay`
option (see [Phases](#phases)).

Today terrain is combined with other layers by stacking a transparent
(`style=shadow`) hillshade on top of them. That works, but it has two
problems:

- **Hazy highlights.** A highlight is semi-transparent white. Drawn over a
  saturated color, it raises lightness and lowers chroma by the same factor,
  so sunlit slopes look washed out rather than lit.
- **Fixed color behavior.** Shadows are semi-transparent black (or a single
  shadow color), so a shadowed pixel's chroma always falls in proportion to
  its lightness. There is no way to keep shadowed forests green, or to
  gray them more, or to cool shadows and warm highlights independently of the
  shading strength.

An opaque hillshade has a third problem: multiplying it with imagery darkens
everything, because flat ground is a mid-light gray rather than white.

`-blend` replaces stacking with a pixel operation. It reads a hillshade as a
field of shadow and highlight amounts, and changes the lightness, chroma and
hue of the layer underneath, separately for shadows and highlights.

## Example

```
mapshaper -i states.shp -proj albersusa -frame width=1200 \
  -fetch mapterhorn -hillshade name=relief \
  -fetch eox -tone saturation=0.6 \
  -blend relief \
  -o map.svg
```

`-fetch` leaves the new imagery layer as the target, so `-blend` applies the
`relief` layer's shading to the toned imagery in place. With the default
settings the result has the same lightness as the stacked map, without the
haze in the highlights. The `relief` layer is removed, since its shading is
now part of the imagery.

## Command shape

```
-blend <layer> [target=<layers>] [overlay] [+ name=<name>] [options]
```

- The hillshade layer's name (required) is the default argument, so
  `-blend hillshade` and `-blend source=hillshade` are the same, as with
  `source=` in `-clip` and `-join`.
- `target=` is the layer being shaded: an RGB(A) raster, a one-band raster
  with a color view (such as `-tint` output or a classified data raster), or
  vector layers (see [Vector targets](#vector-targets)). The default is the
  current target, as in other commands.
- **The two layers become one.** By default the target is replaced, as with
  `-tone` and `-tint`, and the hillshade layer is removed too. A hillshade
  left in place would be drawn over the blended layer, shading it twice, in
  the GUI and in exported maps. `+` (with optional `name=`) adds a new layer
  and keeps both inputs.
- To use one hillshade for several raster layers, blend them in one command
  (`target=imagery,tint`); each is blended on its own, and the hillshade is
  removed after the last one. A hillshade read from a file isn't in the
  catalog, so there's nothing to remove. If any target is a vector layer,
  the targets are drawn together instead (see
  [Vector targets](#vector-targets)).
- `source=` keeps its name, although the source is consumed: it matches
  `-clip` and `-join`, which also name the second layer `source=`, and it's
  usually typed as the bare argument (`-blend hillshade`).
- The output is an 8-bit RGB raster (RGBA if the target has alpha or is
  drawn through a view, and for drawn targets). The derivation records
  `{type: 'blend', source, strength, chroma}` (and `overlay: true` for an
  overlay) so that a later GUI panel can show and edit the settings.

The name is general (`-blend`) rather than hillshade-specific because the
same mechanism can blend other kinds of shading later, such as an ambient
occlusion layer or a texture. The options, though, are about shadows and
highlights.

Why the target is the underlying layer and not the hillshade: the operation
changes the underlying layer's colors, as `-tone` does, and the usual
command order (`-fetch` imagery, `-tone` it, then blend) leaves the imagery
as the current target.

## Reading the hillshade: shadow and highlight amounts

`-blend` reduces the hillshade to two numbers per pixel: a shadow amount
\(a_s\) and a highlight amount \(a_h\), each from 0 to 1, at most one of
them nonzero. Each amount is the opacity of a black or white overlay that,
stacked on the hillshade's flat-ground color, would give the hillshade's
pixel. That makes both hillshade styles interchangeable inputs.

**Shadow style.** A pixel is the shadow color or the highlight color at some
alpha (`writeHillshadeRgba()`). The alpha is the amount; which of the two
colors the pixel is closer to says whether it's a shadow or a highlight. The
amounts already include `max-opacity=` and `highlights=`, so a hillshade
tuned for stacking blends at the same strength.

**Opaque style.** A pixel lies on the shadow, base, highlight ramp. Its
position is found from its OKLab lightness, which rises from the shadow
color to the highlight color. It is then converted to the overlay amount that takes the
base to the same lightness: with \(g\) the sRGB gray value of a lightness,

\[
a_s = 1 - g(P) / g(B) \qquad a_h = (g(P) - g(B)) / (1 - g(B))
\]

where \(P\) is the pixel and \(B\) the base color. For a gray ramp this is
exact: stacking black at \(a_s\) over the base color reproduces the pixel.
The base color comes from the derivation (`base_color` is recorded with the
colors actually used, including derived ones).

**Hillshades from elsewhere** (a GDAL hillshade GeoTIFF, or a mapshaper
hillshade written to a file and read back) have no recorded settings:

- With `base-color=`, the source is read as opaque, with that color as flat
  ground. `base-color=` also overrides the recorded base of an opaque
  `-hillshade` layer, and is refused for a transparent one.
- Without it, a source in which at least 1% of the visible pixels are partly
  transparent is read as a transparent hillshade, with black shadows and
  white highlights.
- Otherwise it's read as opaque, and flat ground is guessed as the most
  common gray level (the peak of a lightly smoothed histogram; black is
  skipped, since it's more likely a nodata border). A message gives the
  color it chose. Flat ground is usually the largest tone class; in rugged
  terrain with little flat ground, the guess can land on a common slope
  tone, and `base-color=` fixes it.
- One-band 8-bit hillshades are read as gray values rather than through
  their view, which may stretch them. Other one-band rasters are refused as
  elevation data.

A mapshaper opaque hillshade written to GeoTIFF and read back blends
identically to the original: the guess finds its base color exactly.

**Grid alignment.** The amounts are computed on the hillshade's own grid and
then resampled to the output grid as floats. Resampling the RGBA image
instead would average adjacent black and white overlays into a gray haze at
every ridge line.

## Grids and coordinate systems

- Both layers must be in the same coordinate system; otherwise `-blend`
  stops and suggests `-proj`.
- If the two rasters have the same grid (the usual case when both come from
  `-fetch` on the same frame), no resampling happens.
- Otherwise the output uses the target's grid, so in-place blending doesn't
  change the target's resolution or extent. The target is never resampled;
  the hillshade amounts are resampled bilinearly.
- Where the target is transparent or nodata, the output keeps the
  hillshade as it would look stacked on nothing: a shadow-style hillshade
  shows its shadows and highlights, and an opaque one shows itself. So
  blending changes nothing outside the target's footprint. Open question:
  whether to offer clipping to the target instead (`-clip` covers it today).
- Where the hillshade has no data (outside its extent, or below
  `min-elevation=`), the target is unchanged.

## Effects

Two options, each taking one value for both shadows and highlights, or two
values in the order shadows,highlights:

```
-blend relief strength=0.8 chroma=0.5
-blend relief strength=1,0.6 chroma=0,1
```

Shadows come first because that's dark-to-light order, the order of the
hillshade's signed tones (-1 to 1) and of its color ramp (shadow, base,
highlight), and of the phrase "shadows and highlights".

All color work is in OKLab, like `-tone` (see the color model in
[`raster-tone-tint.md`](raster-tone-tint.md#color-model)).

### Lightness: `strength=`

The output pixel has the lightness of the stacked result: the target with
the shadow color at \(a_s\) or the highlight color at \(a_h\) on top,
composited in sRGB as browsers and resvg do. `strength=` multiplies the
amounts (default 1; 0 turns the shading off; above 1 strengthens it, with
the amounts capped at 1). One hillshade can then be used at different
strengths for different layers without re-running `-hillshade`.

Taking lightness from the stacked result keeps what "shadow" means over
different colors: a shadow darkens a light field more, in absolute terms,
than a dark forest, just as it does when stacking. See
[Open questions](#open-questions) for dark targets, where that makes the
relief faint.

### Color: `chroma=`

`chroma=` is the share of the target's color kept under the shading. The
output's OKLab a and b (its chroma and hue) move from the stacked pixel's
toward the target pixel's:

\[
(a', b') = (a_{stack}, b_{stack}) + k \cdot \bigl((a, b) - (a_{stack}, b_{stack})\bigr)
\]

- `0` is plain stacking: the color comes from the target and the hillshade
  as composited. Black shadows reduce chroma about in proportion to
  lightness; white highlights reduce it too, which is the haze.
- `1` keeps the target's chroma and hue, so only lightness changes. In
  highlights, lit slopes are lighter but not hazy. In shadows, colors stay
  vivid (and so become more saturated, since they are darker).
- Values above 1 go further than the target's own color: more vivid lit
  slopes, limited by the gamut.

The default is `chroma=0,1`: shadows as stacked, highlights without haze.

Colors outside the sRGB gamut are fitted at the same lightness and hue by
reducing chroma, as `oklchToRgb()` does. Very saturated colors lose some
chroma in deep shadow even at `chroma=1`, because no color of that
lightness has it.

Why interpolate between the two results rather than blend the target's
color into the hillshade before compositing: a white highlight can't carry
the target's chroma (only white has OKLab lightness 1), and compositing in
sRGB would change lightness as well as color. Defined on the results, the
change is also scaled by the local shading depth for free: where the
shading is faint, the stacked and target colors are nearly the same, so
`chroma=` has little effect there.

So `strength=1 chroma=0` is exactly stacking, including on partly
transparent target pixels, and no separate `mode=normal` is needed.

### Hue

With `chroma=` below 1, the hillshade's own `shadow-color=` and
`highlight-color=` show through in proportion: a hillshade made with a
blue-violet shadow color and a warm highlight color gives Imhof-style
colored light at `chroma=0.5`. That may make separate tint options
unnecessary. If not, a later `shadow-tint=` and `highlight-tint=` would
shift hues independently of the hillshade's colors.

### Other blend modes

Later, if needed: `multiply`, `screen`, `overlay` and `soft-light` in sRGB,
mainly for opaque hillshades. With a black and white shadow-style hillshade,
`multiply` for shadows and `screen` for highlights give the same result as
stacking, so the standard modes add little there.

Not offered: CSS `luminosity`, which replaces the target's lightness with
the hillshade's. That loses the target's own lightness structure (water
would become as light as a sunlit slope), and its luma isn't perceptual.

### Order of operations

Read the amounts, scale them (`strength=`), stack, take the stacked
lightness, interpolate the color (`chroma=`), then fit to the gamut.

## Vector targets

```
-blend relief target=landcover,water,roads
```

If any target is a vector layer, all the targets are drawn together and
blended as one image:

- **Drawing.** The targets are drawn in stack order, with their styles, the
  way PNG output draws them: as an SVG document rendered by resvg in Node
  and by a canvas in the browser (`rasterizeSVGPixels()`, which returns
  RGBA pixels rather than an image file). Raster targets in the list are
  drawn too, so imagery with roads on top is shaded as one image. Labels and
  fine lines are drawn and shaded as well; layers that should stay crisp
  belong above the output, or use `overlay`.
- **Grid.** The layers are drawn over the hillshade's extent. Strokes, labels
  and symbols are sized as in the map's frame (or, without a frame, as in an
  SVG of the default width of 800 pixels). The resolution is the
  hillshade's, or finer if the hillshade has fewer than 2 pixels per CSS
  pixel of the map (like PNG output's default `pixel-ratio=2`), so a coarse
  hillshade doesn't blur the vectors; the shading amounts are then
  resampled to the finer grid. A hillshade from `-fetch` for a frame usually
  has that resolution already. The grid is capped at 40 megapixels.
- **Layers.** The output, an RGBA raster, takes the hillshade's place in its
  dataset and goes directly above the topmost target in the stack. As with
  raster targets, the targets and the hillshade are removed, and `+` keeps
  them (the output is then named `blend`, or after a single target).
- Where the drawn layers are transparent, the output shows the shading
  stacked on nothing, as with transparent raster pixels.

Targets in different datasets are drawn together, so the command doesn't
run once per dataset, as it does for raster targets.

## Overlay

```
-blend relief target=landcover,water overlay
```

`overlay` keeps the targets as they are and recolors the hillshade instead,
so that drawn over the targets with ordinary alpha compositing it gives the
blended result. Vector layers stay vectors: sharp at any zoom, editable,
and exported as paths.

The targets are drawn as for [vector targets](#vector-targets) (always
together, rasters included). Then, for each pixel with target color \(T\)
and blended color \(R\), the overlay is the color \(C\) and alpha
\(\alpha\) that composite to \(R\):

\[
T (1 - \alpha) + C \alpha = R
\]

Any \(\alpha\) works if \(C\) stays within 0-255 in every channel; the
overlay uses the least such alpha, which is

\[
\alpha = \max_{channels} \begin{cases}
(R - T) / (255 - T) & R > T \\
(T - R) / T & R < T
\end{cases}
\qquad C = T + (R - T) / \alpha
\]

(`getShadingOverlayPixels()`). The result is exact after 8-bit rounding.

- **Shadows** at the default `chroma=0` are plain stacking, so the overlay
  has the hillshade's own shadow color and alpha there.
- **Highlights** that keep the target's color (`chroma=1`) can't be white:
  the overlay takes the target's color, lightened, and is more opaque than
  the hillshade (about 0.2 more alpha on average over random colors).
- **Flat ground** has no shading and stays fully transparent.
- Where a target pixel is partly transparent, what's under it isn't known,
  so the overlay there is the plain shading color at the amount's opacity.

Layers: without `+`, the overlay replaces the hillshade in its dataset (with
`+`, it's added as `blend`), and goes directly above the topmost target.
The targets are kept. The derivation records `overlay: true`, and `-blend`
refuses an overlay as its hillshade, since its colors depend on the layers
under it.

Limits:

- The overlay only fits the targets as they were drawn. It has to stay
  directly above them, and editing, restyling or reordering them means
  running `-blend` again.
- A boundary pixel is computed for the mix of colors drawn there. Drawn over
  sharp vectors at a finer resolution, its color spills onto both sides, and
  a resampled overlay interpolates between neighbors of different colors and
  alphas. In a test map at 6× zoom this made a 2-pixel line slightly
  darker than in a blend drawn at that zoom, but the overlay was still
  closer to that ideal than the blended raster (0.24% of pixels off by more
  than 8 levels, against 1.27%), whose edges are blurred. Falling back to
  plain shading at boundary pixels would trade one error for another
  (hazy highlights), so it isn't done.
- `-o target=*` exports layers in catalog order, not stack order, so the
  overlay can end up under the targets; exporting the frame draws them in
  stack order.

## More than two layers

Phase 1 handles one shading layer and one target. Larger stacks are built by
chaining:

- Several shading layers (e.g. a broad hillshade and a detailed one) are
  applied one after another, each with its own `-blend`.
- Several targets are combined by listing them in `target=` with at least
  one vector layer, or with `overlay`: they are then drawn together. Raster
  targets alone are blended one at a time; combining rasters (imagery under
  a semi-transparent tint) without a vector layer would need a plain
  stacking mode, since `-blend` needs a hillshade as its top layer.

If chains get cumbersome, a later `-composite` command could take a list of
layers with a mode per layer. Chaining is the first step because each step's
result can be inspected and exported.

## Alternatives considered

**Blend modes at drawing time.** A `blend-mode=` style property, drawn with
SVG `mix-blend-mode` and canvas `globalCompositeOperation`, would keep
vector layers as vectors and need no resolution choice. But it can only
offer the standard modes, none of which keeps chroma in highlights or
separates shadow and highlight behavior. Support for blend modes in resvg and
in the graphics programs that open mapshaper's SVG output also varies (to be
checked). It may still be worth adding later for simple cases such as
multiplying a vector layer over imagery.

**An option of `-hillshade`.** Shading a target at hillshade time would tie
the relief settings and the blend settings together, and every change to
either would mean recomputing the relief. A separate command keeps the
relief computed once.

**Storing the signed tones on the hillshade layer.** `-hillshade` could keep
its floating-point tones (4 bytes per pixel) for `-blend` to use. But they
would have to survive clipping, reprojection and snapshots, and they
wouldn't exist for hillshades from elsewhere. Decoding the pixels works for
every input, and for mapshaper's own hillshades loses only the 8-bit
rounding of the alpha channel.

## Implementation notes

- New module `src/rasters/mapshaper-raster-blend.mjs` with pure functions:
  decoding amounts from shadow-style and opaque pixels, and blending one
  pixel buffer with an amounts buffer. These carry the mocha tests.
- The OKLab conversions and the gamut fitting are shared with `-tone`
  (`toneRgbPixels()`); fitting runs only for pixels that leave the gamut.
- 8-bit RGB(A) targets are blended as they are; other targets are drawn
  through their view first (`renderRasterPreview()`), so one-band data
  rasters blend as they look.
- Command: `src/commands/mapshaper-blend.mjs` (`cmd.blend()` for raster
  targets, `cmd.blendDrawnLayers()` for drawn targets), options in
  `mapshaper-options.mjs`, dispatch in `mapshaper-run-command.mjs`, which
  also places the output of drawn targets in the stack
  (`addDrawnBlendOutput()`). Drawn targets are async (rasterization).
- Drawing: `src/rasters/mapshaper-raster-draw.mjs` (`drawLayersOnGrid()`),
  which renders the layers with the SVG exporter at the grid's pixel size
  (`svg_image_size`) and rasterizes them (`rasterizeSVGPixels()`; resvg's
  premultiplied pixels are converted back).
- GUI: a later panel modeled on the Color & tone panel (shadow and
  highlight sliders for `strength=` and `chroma=`),
  committing a `-blend` command. Because blending in place compounds, the
  panel has to re-run from the unblended target (via undo) rather than
  blending its own output again.

## Phases

1. Raster targets; shadow-style and opaque hillshades read from their
   derivations; same or resampled grids; `strength=` and `chroma=`.
2. Vector targets and `overlay` (done); `shadow-tint=` and
   `highlight-tint=` if the hillshade's own colors aren't enough.
   (`base-color=` and the guess for hillshades from elsewhere are done.)
3. GUI panel; standard modes for opaque hillshades; a `-composite` command
   if chaining isn't enough.

## Open questions

- **Default chroma in shadows.** `chroma=0,1` stacks shadows. `0.5,1`
  would keep shadowed colors richer, which may be what most maps want. A
  sweep over a few targets (imagery, `-tint` output, a land cover layer)
  would settle it.
- **Grayer shadows.** `chroma=` can't go below stacking's chroma. Negative
  values could move shadows toward gray (the "darken and desaturate"
  effect), if stacking's reduction turns out not to be enough.
- **Dark targets.** Lightness taken from stacking makes the relief faint on
  dark colors (water, dense forest), and highlights can't lighten white. A
  later option could use an absolute lightness change in shadows, or a
  minimum contrast.
- **Transparent target areas.** Keep the plain hillshade there (proposed) or
  leave them transparent.
