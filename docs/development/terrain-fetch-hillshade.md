---
title: Terrain fetching and hillshading
description: Design and implementation plan for the -fetch and -hillshade commands.
---

# Terrain Fetching and Hillshading

This document describes two commands that let users add shaded relief to a map
without running a tile or rendering service:

- `-fetch` retrieves data for the current map frame from a remote source,
  composites it, and reprojects it to the frame's coordinate system.
- `-hillshade` converts an elevation raster into shaded relief.

A typical session:

```
mapshaper -i states.shp -proj albersusa -frame width=1200 \
  -fetch tilezen -hillshade -o map.svg
```

## Goals

- **Convenient defaults.** `-fetch tilezen` works out the extent, coordinate
  system and resolution from the target frame. `-hillshade` gives a good result
  with no options.
- **Client-side processing.** Everything runs in the CLI and in the browser.
  No server is involved beyond static tile hosting.
- **Post-projection shading.** Elevation is reprojected to the frame's grid
  first, then shaded. Light direction stays fixed relative to the page, and
  generalization and pixel size match the output.
- **Command-backed.** Both are ordinary commands, so the CLI, the GUI console,
  session history, undo and snapshots work without special handling.

## Why shade after reprojecting

Prerendered relief tiles bake in Web Mercator geometry, a light direction, a
vertical exaggeration and a level of detail. Reprojecting them rotates the light
(meridian convergence in conic projections), stretches shading at high
latitudes, and gives a level of detail tied to a tile zoom rather than to the
map. Elevation data has none of those problems: once it is on the output grid,
each output pixel is shaded with the correct ground cell size and the light
comes from the upper left of the page.

The same reasoning applies to terrain generalization. Generalization filters
are sized in output pixels, which is only possible after reprojection.

## -fetch

```
-fetch [source] [options]
```

`source` is a preset name (`tilezen`) or a URL template. The first bare
argument is the source, so `-fetch tilezen` and `-fetch source=tilezen` are
equivalent.

Elevation presets: `tilezen`, `mapterhorn`. Imagery presets: `bluemarble`,
`blackmarble`, `usgs`, `eox` (see [Imagery](#imagery)).

### Scope

`-fetch` is defined by being frame-aware, not by format: it works out what to
request from the frame (extent, resolution and coordinate system), then fetches,
composites and reprojects. Loading a single file from a URL as-is belongs to
`-i`.

Phase 1 implements XYZ elevation tiles. The source layer is designed around
adapters, so other kinds of source can be added without changing the command:

| Adapter | Status | Examples |
| --- | --- | --- |
| XYZ/TMS tiles with an elevation encoding | Phase 1 | Tilezen (Terrarium), Mapbox Terrain-RGB |
| XYZ/TMS imagery tiles | Done | NASA GIBS, USGS, EOxCloudless |
| Cloud-Optimized GeoTIFF (windowed reads) | Planned | OpenTopography SRTM |
| ArcGIS ImageServer bbox export | Planned | USGS 3DEP |
| Vector tiles / PMTiles | Later | see `future-directions.md` |

A preset is data: a named bundle of adapter options plus metadata (license,
zoom range, attribution check). Options given on the command line override the
preset's.

### Options

- `source=` preset name or URL template containing `{z}`, `{x}` and `{y}`.
- `year=` edition of a preset that has several (`blackmarble`, `eox`);
  defaults to the latest. An error for other sources.
- `encoding=` encoding of custom tiles: `terrarium` (default) or `mapbox`
  for elevation, `rgb` for imagery.
- `scheme=` `xyz` (default) or `tms` for custom tiles.
- `zoom=` tile zoom level, overriding automatic selection.
- `raster-res=` raster pixels per frame pixel (default 2). The GUI on
  high-density screens and PNG output draw two device pixels per frame pixel,
  so a raster at 1 is blurred by upsampling; comparisons showed resolution was
  the largest single cause of soft, rounded ridges. The name matches
  `-o raster-res=`.
- `bleed=` extra border around the frame, in frame pixels (default 10). Keeps
  hillshading and generalization filters from producing artifacts at the frame
  edge. SVG export crops rasters to the frame, so the bleed never shows. The
  name and units match `-graticule bleed=` (default 0); `margin=` would be
  confused with `-frame margin=`, which is inside the frame.
- `bbox=` extent to fetch (in the target's coordinate system, or lat-long when
  there is no target).
- `max-tiles=` safety cap on the number of tiles (default 500).
- `name=` name of the new layer (default `elevation`; for imagery, the preset
  name, or `imagery` for a URL).
- `target=` layer or frame whose extent to use.

### Defaults derived from the frame

- **Frame:** the target layer's frame, or the session's only frame. Without a
  frame, the target layers' extent and coordinate system are used, at a
  nominal width of 800 pixels; without targets, `bbox=` is required.
- **Extent:** the frame's bbox, expanded by `bleed=`.
- **Coordinate system:** the frame's.
- **Resolution:** the frame's ground meters per pixel, divided by `raster-res=`.

### Zoom selection

Tile ground resolution at zoom `z` and latitude `phi` is
`2 pi R cos(phi) / (256 * 2^z)`. The chosen zoom is the smallest one whose
resolution is at least as fine as the output pixels, so the source is 1-2x finer
than the output. This is evaluated at the latitude of the frame's center; Web
Mercator tiles get finer on the ground toward the poles, so high-latitude maps
automatically use higher zooms.

The mosaic is reprojected at twice the output resolution with bilinear
sampling, then averaged down in 2x2 blocks. This antialiases without the
detail loss of a blur prefilter (an earlier version blurred the mosaic by the
source/output resolution ratio, which was the largest avoidable loss of ridge
detail in the pipeline). Fetching one zoom finer and averaging retained even
more detail, but at four times the tile count.

### Pipeline

1. Resolve the frame, extent, coordinate system and output size.
2. Sample the expanded extent on a grid and inverse-project the samples to
   lat-long. Longitudes are treated as a circular range, so frames that cross
   the antimeridian fetch a contiguous strip of tiles. Latitudes are clamped
   to the Web Mercator limit (about 85 degrees).
3. Choose the zoom and tile range; stop if the tile count exceeds `max-tiles=`.
4. Fetch tiles with limited concurrency and retries. A missing tile (404)
   becomes nodata.
5. Decode each tile to elevations and composite them into a Web Mercator
   Float32 grid.
6. Reproject the mosaic onto a grid of twice the output resolution with
   `projectRasterGridForward()` (bilinear, nodata-aware), then average 2x2
   blocks of valid pixels (`averageGridPixels()`).
7. Add the result as a new `continuous` raster layer in its own dataset, in
   the frame (if the target is in it), at the bottom of the layer stack.

### Decoding

- Terrarium: `elevation = R * 256 + G + B / 256 - 32768`.
- Mapbox Terrain-RGB: `elevation = -10000 + (R * 65536 + G * 256 + B) * 0.1`.
- The image format is detected from the file signature, not the URL.
- Node decodes PNG with `pngjs`, which is already a dependency, and lossless
  WebP with a built-in decoder (`src/fetch/mapshaper-webp-decoder.mjs`, about
  10 ms per 512px tile; verified byte-for-byte against libwebp's `dwebp`).
  Lossy WebP is rejected, since it can't carry encoded elevations intact.
- The browser decodes with `createImageBitmap(blob, {colorSpaceConversion:
  'none', premultiplyAlpha: 'none'})`. Color management would otherwise alter
  the encoded values.

### Licensing

Each preset records its license. The Tilezen tiles combine public-domain
sources (SRTM, GMTED2010, ETOPO1, USGS NED/3DEP) with national datasets that
require attribution (EU-DEM, Canada CDEM, UK LIDAR, Norway, and others). Each
tile names its sources in an `x-amz-meta-x-imagery-sources` response header,
which the bucket exposes to browsers. The `tilezen` preset reads it and warns
when a fetched tile includes a source that requires attribution, naming the
sources.

The `mapterhorn` preset (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`,
512px lossless WebP Terrarium tiles) always warns: its global base layer is
Copernicus GLO-30 and most of its high-resolution national sources require
attribution, and the project asks for "© Mapterhorn". Zooms 0-12 are global;
13-17 exist only where high-resolution national data is available and are
404 elsewhere, so automatic zoom selection stops at 12 (`auto_max_zoom`) and
higher zooms must be requested with `zoom=`.

Comparison with Tilezen, same frame and hillshade settings: at small scales
(France, about 800 m per pixel) and where both use USGS data (Mount Rainier)
the hillshades are practically identical. At large scales in areas with
national lidar (Bernese Oberland, about 23 m per pixel) Mapterhorn is far
more detailed: three times the surface roughness, and peaks within a few
meters of their true height. It is also faster: about a quarter as many
tiles at the same resolution, served from a CDN.

### Imagery

Presets with `encoding: 'rgb'` keep tile colors instead of decoding
elevations. Tiles (JPEG, decoded in Node with `jpeg-js`, or PNG) are
composited into an RGB mosaic with a coverage mask, so missing tiles and
transparent pixels are excluded from bilinear sampling rather than blended in.
The mosaic is reprojected at twice the output resolution, with uncovered
pixels transparent, and averaged down 2x2 with alpha weighting
(`downsampleRgba()`). The result is an `image` raster with an `rgb` recipe:
RGB if every pixel is opaque, else RGBA.

| Preset | Layer | Zooms | License |
| --- | --- | --- | --- |
| `bluemarble` | GIBS `BlueMarble_NextGeneration` (no relief shading) | 0-8 | NASA, no restrictions |
| `blackmarble` | GIBS `VIIRS_Black_Marble`, `year=` 2012 or 2016 | 0-8 | NASA, no restrictions |
| `usgs` | The National Map `USGSImageryOnly` | 0-16 | Public domain |
| `eox` | EOxCloudless Sentinel-2 mosaics, `year=` 2016, 2018-2025 | 0-16 (auto to 14) | 2016 CC BY 4.0; 2018+ CC BY-NC-SA 4.0 |

Notes:

- None of these need a key. GIBS and EOX use `{z}/{y}/{x}` (row before
  column) URLs.
- `usgs` covers the world at low zooms and the United States at higher zooms;
  elsewhere the server answers 404, so those tiles are transparent.
- Sentinel-2 pixels are 10 m, about a zoom 14 pixel; zooms 15-16 are
  enlarged, so automatic selection stops at 14.
- A preset with editions lists them in `years`, each with the settings that
  differ (URL, title, attribution, license). EOX's 2016 layer is named
  `s2cloudless_3857`, without the year, and its 2018 mosaic credits
  "2017 & 2018" data.
- Licensing messages: GIBS and USGS print a requested credit; `eox` warns with
  its required attribution for the year, and for 2018 and later that the
  data is for non-commercial use only. Using EOX's public endpoints in
  commercial production apps is prohibited by its terms.
- GIBS daily layers (MODIS, VIIRS true color) and a generic `gibs layer=`
  source were considered and left out for now: daily imagery is cloudy and
  has swath gaps, and a generic source would need each layer's zoom range and
  format from the 5.8 MB capabilities document.

### Provenance

The new dataset's `info.raster_sources` records the preset, URL, year, zoom, tile
count and the parameters used. This is what a later "re-fetch for the current
frame" action in the GUI would need. A fetched raster is a snapshot of the frame
at fetch time: running `-proj` or resizing the frame afterwards leaves it at
the wrong resolution, so `-fetch` should come after `-proj` and `-frame`.

## -hillshade

```
-hillshade [options]
```

Replaces the target elevation raster with shaded relief. `+` keeps the
elevation layer and adds the shading as a new layer named `hillshade`, the
same pattern as other mapshaper commands.

### Options

- `azimuth=` direction of the main light, in degrees clockwise from north
  (default 315).
- `altitude=` light angle above the horizon, in degrees (default 45).
- `single-light` use one light instead of the default blend of four lights
  around the main azimuth. Multiple lights reduce harsh shadows and keep
  landforms facing away from the main light legible.
- `exaggeration=` vertical exaggeration. The default increases with the map's
  ground pixel size (1 at 50 m per pixel and below, about 4.5 at 1 km, capped at
  10), because relief flattens out at small scales.
- `smoothing=` terrain smoothing, described under Generalization:
  - `low`, `medium`, `high`: feature-preserving smoothing (FPS) presets; see
    Generalization for their settings.
  - `auto` (default): currently `low` (it was `medium` until manual testing
    favored keeping more terrain detail); it may later depend on the map
    scale.
  - `off` or `none`: no smoothing.
  - `lowpass` (experimental): the earlier blur-and-restore method.
- `fps-passes=` (1-20) overrides the preset number of FPS passes.
- `fps-levels=` 1 (single-level FPS) or 2 (two-level smoothing, as in
  `high`; see Generalization) overrides the preset. With 2, `fps-passes=`,
  `fps-threshold=` and `fps-radius=` apply to the downsampled level; the
  full-resolution pass that follows always uses 1 pass, 20° and radius 4.
- `fps-threshold=`, `fps-radius=`, `maximum-change=` (experimental) FPS
  settings, described under Generalization. They refine any FPS preset.
- `fps-min-threshold=` (experimental) turns on dynamic smoothing, with
  `fps-slope-factor=`, `fps-slope-radius=` and, for two-level smoothing,
  `fps-blend=`; see Dynamic smoothing under Generalization.
- `lowpass-radius=` blur radius of `smoothing=lowpass`, in pixels (default 1).
- FPS settings with `smoothing=off` or `lowpass`, and `lowpass-radius=` without
  `smoothing=lowpass`, are errors rather than being silently ignored.
- `light-adjust=`, `ambient=`, `texture=`, `aerial=` (experimental) lighting refinements,
  described under Lighting experiments. `ambient=` defaults to 0.5, the
  others to 0 (off).
- `style=` `shadow` (default) or `opaque` (`gray` and `grey` are accepted as
  earlier names).
  - `shadow` is black shadows and white highlights with transparency: flat
    ground is fully transparent, shaded slopes get darker and lit slopes
    lighter. It uses ordinary compositing, so it looks the same in the GUI,
    SVG, PNG and graphics editors. By default the brightest highlights get
    the same opacity as the darkest shadows; highlights double the contrast
    across ridgelines, which makes ridges read much more crisply than shadows
    alone.
  - `opaque` colors every pixel from a ramp that runs from `shadow-color=`
    (full shadow) through `base-color=` (flat ground) to `highlight-color=`
    (the brightest slope), so every pixel is opaque. The tones are the
    shadow style's at full strength: a shadow tone is how far the pixel is
    from the base toward the shadow color, and a highlight tone how far
    toward the highlight color, so full shadow is the shadow color itself.
    `max-opacity=` and `highlights=` are errors in this style; the colors
    set the contrast instead. (They used to scale the tones, with the alpha
    of the colors, which made the ends of the ramp unreachable without
    saying so: with `max-opacity=1`, full shadow was black, while with less
    the shadow color was never shown.) The ramp is interpolated in OKLCH,
    as `-tint` ramps are (`getHillshadeColorRamp()`), so lightness changes
    in perceptually even steps and colors of different hues keep their
    chroma between them: a teal shadow and a pale yellow highlight pass
    through green rather than gray, the look of Swiss-style relief. Hue takes
    the shorter way around the color wheel, so colors of nearly opposite
    hues (navy and orange) pass through a third hue (purple); a base color
    sets the middle. The ramp was first blended in sRGB over a `#b4b4b4`
    base (the GDAL/Esri sin(altitude) × 255 at 45°).
- `base-color=` color of flat ground in the opaque style, e.g. a land tint;
  it implies `style=opaque` and is an error with `style=shadow`. The three
  colors are tied by a weight of 0.8: the base is 80% of the lightness from
  the shadow color to the highlight color (`getHillshadeRampColors()`). The
  highlight color defaults to white. A missing base color is 80% of the way
  from the shadow color to the highlight color (in OKLCH), or `#dfdfdf` if
  the shadow color is missing too. A missing shadow color gets the
  lightness that puts the base at 80%, with the base's hue and chroma
  (reduced to fit the sRGB gamut), or black if the base is too dark for
  that (darker than `#bebebe` with a white highlight). Extrapolating the
  hue and chroma as well would multiply small differences between the base
  and highlight colors into a strong, unrelated color. With all three
  colors given nothing is derived. The defaults give `#686868` →
  `#dfdfdf` → `#ffffff`; `base-color=#e0d8c0` gives a `#514a36` shadow.
  The weight 0.8 is 1 / `getHillshadeMaxShade()` with the default lights
  (the brightest slope is 1.25 times as bright as flat ground), which gives
  the shadow half of the ramp four times the lightness range of the
  highlight half, as the highlight tones are scaled four times as much:
  slopes tilted a little toward and away from the light change lightness
  equally. It is fixed rather than following the lights, so `altitude=`
  changes the relief but not the colors. Earlier versions blended a black
  shadow and a white highlight with a base at a fixed position on that
  ramp: first 71% (`#a1a1a1`), the position of flat ground in Lambertian
  shading lit from 45° (sin 45° of full illumination), then 87%
  (`#d3d3d3`), because even OKLab lightness steps make partial shadows
  darker than the sRGB blending the conventional `#b4b4b4` was paired with
  (a shadow tone of 0.5 was 90 with sRGB over `#b4b4b4`, 60 with OKLab over
  `#a1a1a1`, 80 over `#d3d3d3`), and mountain relief went nearly black; but
  full shadow was still black. The `#dfdfdf` base was chosen by eye. The
  two-color forms are a quick way to color relief; matching a reference map
  usually takes all three colors, because a reference's midtones are often
  more saturated than any blend of its extremes (a Swiss relief measured
  had chroma 0.06 in its midtones against 0.03-0.05 for blends of its
  darkest and lightest colors).
- `min-elevation=` raises lower elevations to this value; `min-elevation=0`
  flattens the sea floor, which the shadow style then leaves transparent.
  Raising (rather than masking as nodata) keeps coastal slopes shading
  naturally and keeps land below sea level. It is applied before
  generalization, so the sea floor is not blurred into coastal land, and again
  after, resetting raised pixels so blurred land does not shade a flat sea.
  After smoothing, land may sink at most halfway to the minimum. FPS can
  carry a coastal slope down past sea level, and clamping those pixels to the
  minimum made the sea spread over low-lying land: with `smoothing=high`,
  0.75% of land pixels in France at zoom 7 went flat (`medium`: 0.57%),
  mostly within a few pixels of the coast and starting below 10 m, with
  visible patches around the Rhône delta and in southern Brittany. Leaving
  the sea out of smoothing, the way nodata is, barely helped (0.65%), since
  the cause is FPS refitting rather than averaging with the sea.
- `max-opacity=` 0-1 opacity of the darkest shadows (default 0.55; shadow
  style only).
- `highlights=` opacity of the brightest highlights (a slope facing the light),
  as a ratio of `max-opacity=` (shadow style only; default 0.6). It was
  raised from 0.6 to 1 while highlights were scaled to a single light's
  brightest slope, which no slope reaches under the blend of lights (see
  below), and returned to 0.6 once highlights reached full strength. The highlight
  range is scaled to this maximum, not clipped; the product is capped at 1.
  The brightest highlight goes to the slope facing the blend of lights
  (`getHillshadeMaxShade()`), which is 1.25 times as bright as flat ground
  with the default lights at 45°. The range was first scaled to a single
  light's 1.41, which no slope reaches under the blend: highlights topped out
  at about 0.65 of full strength, and in the opaque style sunny slopes stayed
  near the base color (median 0.37 of the way to the highlight color on
  mountain relief, 0.54 after the fix).
  A white overlay can only lighten a background by its distance from white, so
  on light backgrounds a higher ratio adds little; `highlight-color=` helps
  more there.
- `shadow-color=`, `highlight-color=` replace black shadows and white
  highlights, in both styles. A warm highlight such as `#fff0b4` stays
  visible on white or cream backgrounds through its hue, after Imhof's warm
  light and cool shadow. In the shadow style, the alpha of an rgba() color
  scales the opacity of its tones; the opaque style ignores alpha. The
  defaults differ in the opaque style (see `base-color=`).
- `gamma=` exponent of the tone curve: tone = darkness ^ gamma, where
  darkness is 0 on flat ground and 1 in full shadow (default 0.75). Values
  below 1 strengthen faint shading and ease off the darkest shadows; values
  above 1 do the opposite. Applies to both styles. 0.5 was first chosen by
  comparing renderings of France (zoom 7) and Mount Rainier (zoom 11), since
  1 left gentle terrain such as the Massif Central nearly invisible; manual
  testing then settled on 0.75 together with default sharpening, which
  restores local contrast that the lower gamma had flattened.
- `verbose` prints the settings used, including automatic ones such as
  `exaggeration=`, as command options that can be pasted back into a command,
  plus the ground pixel size. The global `-verbose` command prints them too.
- `band=` band to read elevations from (default 0).
- `workers=` number of worker threads; 0 runs everything in the main thread.
  By default, rasters of at least 500,000 pixels use one worker per CPU core,
  up to 16, and smaller rasters none. The output is the same either way, so
  the setting is not recorded in the derivation. See Workers.
- `name=`, `target=`, `+`.

### Cell size

Shading needs horizontal distances in the same units as elevation (meters).
For each row, the cell size in ground meters is the cell size in map units,
times the coordinate system's meters per unit, divided by the projection's
scale factor at that row (`getScaleFactorAtXY()`). Lat-long grids use the
length of a degree at the row's latitude. With an unknown coordinate system,
map units are assumed to be meters, with a warning.

### Algorithm

1. Read the elevation band into a Float32 channel, with a validity mask from the
   grid's coverage and nodata.
2. Smooth the terrain (below).
3. Optionally compute per-pixel light adjustments (`light-adjust=`).
4. Compute slope and aspect with Horn's method. Invalid neighbors are replaced
   by the center value, so shading stops cleanly at nodata.
5. Accumulate weighted Lambertian shading for each light, normalized by the
   value of flat ground.
6. Optionally blend in ambient light (`ambient=`) and apply aerial perspective
   (`aerial=`).
7. Write RGBA (`uint8`). Invalid pixels are transparent.

The output is a 4-band RGBA image (`interpretation: 'image'`, display scaling
`none`), which uses the raster renderer's fast 8-bit path and keeps
transparency in SVG export (PNG is chosen automatically for images with alpha).

### Generalization

The default is feature-preserving smoothing (FPS; Sun et al. 2007, as adapted
for DEMs by Lindsay et al. 2019), in `src/rasters/mapshaper-terrain-smoothing.mjs`.
Each pass (called a round in the code):

1. Compute surface normals of the exaggerated surface.
2. Smooth the normals over a 9x9 window, weighting neighbors by
   `(dot - cos 20°)^2` and ignoring neighbors whose normal differs by more than
   20°. Normals on opposite sides of a ridge or valley don't mix, so crests
   stay sharp while noise on each face is averaged away.
3. Refit elevations to the smoothed normals (5 iterations), predicting each
   pixel from its 8 neighbors' tangent planes.

Settings:

- `fps-threshold=` (20° in the default preset): lower values preserve more slope changes as
  features, keeping ridges sharper but also more small-scale texture; higher
  values approach a blur. Normals are measured on the exaggerated surface, so
  higher exaggeration has a similar effect to lowering the threshold.
- `fps-radius=` (4 in the default preset, a 9x9 window): the size of bumps averaged away.
  Cost per round grows with the square of the window width.
- `maximum-change=` (default off): after each round, elevations are clamped
  to within this many meters of their original values, protecting summits and
  narrow gorges from being shaved down.

Presets (`smoothing=low|medium|high`); `fps-passes=`, `fps-threshold=` and
`fps-radius=` override their values (for `high`, the values of the coarse
level):

| Preset | Levels | Passes | Threshold | Radius |
|---|---|---|---|---|
| `low` (`auto`) | 1 | 1 | 15° | 4 |
| `medium` | 1 | 3 | 20° | 4 |
| `high` | 2 | 3 | 20° | 4 |

`low` and `medium` were chosen from a grid of passes (1, 3, 6) and thresholds
(15-35°), rendered on the Bernese Oberland (Mapterhorn zoom 12) and France
(zoom 7), and measured by mean absolute Laplacian of the shading (fine detail)
and its standard deviation (contrast):

- Raising the threshold removes small landforms: detail falls steadily from
  15° to 35° at every pass count, in both regions, while contrast and the main
  crests are kept.
- Passes give diminishing, then negative, returns. One pass removes most data
  noise; three give chiseled ridges. In the Oberland six passes have more fine
  detail than three at every threshold, because slopes break into flat facets
  with sharp creases (the glassy look also seen on Mount Rainier).

`high` uses two-level smoothing (`twoLevelSmooth()`):

1. Average the elevations down 2x. This removes landforms smaller than about
   two pixels, and each FPS window then covers four times the ground area.
2. Run the FPS passes on the coarse grid.
3. Upsample with Catmull-Rom interpolation, extrapolating linearly past the
   grid edges (and completing partial blocks of odd-sized grids) so that
   tilted planes stay planar.
4. Run one FPS pass at full resolution (20°, radius 4). Without it, upsampled
   crests are jagged.
5. `maximum-change=` is applied to the result.

It is roughly one zoom level more generalized than single-level FPS with a
high threshold (4 passes, 30°, radius 5, the earlier `high`), and faster than
`medium`: on France (1640x1477), smoothing takes 1.3 s against 2.1 s for
`medium` and 3.4 s for the earlier `high`. Steep one-pixel features that
single-level FPS keeps as ridges are removed. Relief also flattens: shading
contrast in France fell about 25%, since averaging lowers peaks and fills
valleys, so more exaggeration may suit it.

Shading at half resolution and upsampling the shading with directional cubic
convolution interpolation (DCCI, a cheaper relative of NEDI) was also tried. It
was faster still (0.8 s through shading) and DCCI kept crests cleaner than
bicubic upsampling, but ambient light, aerial perspective and the tone input
run at half resolution, and the result looked slightly softer than two-level
smoothing. The prototype is `/tmp/hillshade-proto/multires.mjs`.

FPS normals at the grid edges use one-sided differences over the actual span.
Dividing by the full two-pixel span, as before, halved edge slopes, and the
refit then tilted whole planes by up to half a meter in tests.

Normals are measured on the exaggerated surface, so automatic exaggeration
effectively lowers the threshold at small scales, where more generalization is
wanted. A scale-aware `auto` could raise the threshold with exaggeration.

Windows of entirely flat ground are skipped. On a 1600x1436 map of France,
each pass takes about a second. FPS must run on unblurred data: low-pass
filtering first turns valleys into worm-like grooves, and sharpening first
leaves halos that FPS preserves as false ridges.

The earlier method (`smoothing=lowpass`) follows the approach of Terrain
Sculptor (Leonowicz, Jenny and Hurni, 2010): low-pass filter the terrain, then
restore major ridges and valleys by blending toward local maximum and minimum
filters, weighted by curvature measured at a broader scale. It is faster but
softens ridges. With `lowpass-radius=g` (Gaussian sigma in pixels):

- `low` = blur(elevation, g)
- `broad` = blur(elevation, 2.5g)
- `hi`, `lo` = blur(max/min filter(elevation, round(0.6g)), g)
- curvature `k` = Laplacian of `broad`, scaled by twice its mean absolute value
  and clamped to [-1, 1]
- ridges (`k < 0`): `low + 0.5 |k| (hi - low)`
- valleys (`k > 0`): `low - 0.3 k (low - lo)`

All steps are linear-time filters over the output grid; on a 1600x1200 map they
take a few hundred milliseconds in plain JavaScript. They are written as small
pure functions over typed arrays so they can be unit-tested and later moved into
a Web Worker.

#### Dynamic smoothing

A fixed threshold is too high for gentle terrain. In the plains of northern
Botswana (Tilezen zoom 9, 400 m pixels, automatic exaggeration 2.8), the
median slope of the exaggerated surface, averaged over 10 pixels, is under 1°,
so the two sides of a shallow drainage differ by only a few degrees. `medium`
averages them away, while steep ridges, whose faces differ by tens of
degrees, stay sharp. `fps-min-threshold=` gives each pixel its own threshold
(`getSlopeThresholds()`):

    threshold = min(fps-threshold, fps-min-threshold + fps-slope-factor * mean slope)

Slope is in degrees on the exaggerated surface, measured at each pixel and
averaged with a Gaussian blur of `fps-slope-radius=` pixels (default 10).
Averaging slope magnitudes, rather than taking the slope of blurred
elevations, keeps a mountain's opposing slopes from canceling out. The
default slope factor is 3. With `fps-min-threshold=1`, thresholds in that area
range from about 2° (10th percentile) through 3.4° (median) to 11° (90th
percentile); `-verbose` prints these percentiles.

The threshold never rises above the preset's (or `fps-threshold=`), so steep
terrain gets exactly the preset's smoothing, and the dynamic part only reduces
smoothing where the terrain is gentle. Letting it rise further (up to 40°)
generalized mountains more, but they looked smeared next to `medium`.
Thresholds from 5-8° in the plains looked no different from `medium`; 1-2°
kept drainages about as crisp as `low`. Varying the number of passes with
slope (1 in the plains to 4 in the mountains) made little difference, with or
without dynamic thresholds.

In two-level smoothing, the threshold map is averaged down for the coarse
pass and capped at 20° for the full-resolution pass. That alone barely helps
gentle terrain, because the 2x averaging removes drainages a few pixels wide
before any threshold can protect them. So with `fps-blend=lo,hi` (default
5,15), gentle terrain takes single-level FPS (with the same dynamic
thresholds) instead: the result blends from single-level, where the threshold
is below `lo`, to two-level, above `hi`, with a smoothstep weight. Both
surfaces are smoothed consistently and the weight changes gradually, so the
blend shows no seams. In the plains `high` then looks like dynamic `medium`,
and in the mountains like `high`. The extra single-level pass makes `high`
take about twice as long: on the Botswana grid (3240x1997), the whole
`-hillshade` run went from 6.3 s to 12.5 s, against 8.2 s for `medium` and
8.6 s for dynamic `medium`. `fps-blend=off` uses the two-level result
everywhere.

Earlier attempts to restore drainages after smoothing failed. Blending the
original elevations back into channels, found with the texture-shading
signal, cut narrow grooves into the broad troughs that smoothing makes, and
brought back noise pits and gully texture in the mountains. Restoring whole
valley cross-sections toward `low` smoothing looked coherent, but amounted to
`low` in valleys and `medium` elsewhere. The lesson that carried over: a sharp
feature placed into a smoother surface looks pasted on, while two surfaces
that are each smoothed consistently blend well under a gradual mask.

Untested so far: other landscapes (the slope factor and minimum were tuned on
one flat region), and whether dynamic smoothing should become part of the
presets.

### Lighting experiments

These options are exposed for experimentation; the defaults may change once
good values are known.

- `light-adjust=d` turns the light by up to `d` degrees (0-60) toward the
  direction that crosses the local landform grain. The grain is the dominant
  gradient orientation from a structure tensor smoothed over about 10 pixels;
  the turn is scaled by the tensor's coherence, so jumbled terrain is left
  alone. Ridges parallel to the light (a 90° difference) are ambiguous, since
  turning either way is equally valid, so the turn fades to 0 there to keep
  neighboring pixels consistent. Works best with `single-light`, since the
  four-light blend already reduces the problem.
- `ambient=w` darkens shading where the sky is hidden, with weight `w` (0-1):
  `shade = shade * (1 - w * (1 - openness))`, where openness is
  `1 - mean(sin(horizon angle))` over 8 directions within about 24 pixels.
  Openness is 1 on flat ground and on planar slopes (uphill and downhill
  horizons cancel), below 1 in valleys and above 1 on ridges, so deep valleys
  darken and crests brighten. The first version blended additively,
  `(1 - w) * shade + w * openness`, which pulls every pixel toward flat
  brightness: at `w=0.5` it halved directional contrast everywhere, cutting
  highlight coverage in the Alps (France, zoom 7) from 7.8% to 1.1% and
  fading the Massif Central. The multiplicative form keeps gentle terrain
  nearly unchanged; in the Alps highlights still fall to 2.9% (lit faces
  inside valleys see less sky) while shadows rise from 11.8% to 14.8%,
  adding depth. It costs about 0.5 s on a 2400 × 2000 grid. The default is
  0.5, chosen in manual testing for the sense of depth it adds. With
  `min-elevation=`, pixels at or below the minimum are left out, so a
  flattened sea stays transparent instead of darkening along the coast.
- `texture=o` (0-1, default 0) darkens drainages using texture shading after
  Leland Brown (2010), as a shadow layer whose maximum opacity is `o`:
  `a = o * tanh(-T)` where `T < 0`, and `T` is a fractional Laplacian of the
  elevations, positive on ridges and negative in drainages. Ridges are left
  alone. The layer is combined with the hillshade's signed tones after the
  tone curve and sharpening, `tone -= a * (1 + min(tone, 0))`, so
  `max-opacity=` and `gamma=` lighten the directional hillshade without
  affecting the texture (`max-opacity=0` shows the texture alone). Over
  shadows this is exact compositing of two shadow layers; over a highlight
  it cancels the highlight, then darkens.
  - `texture-highlights=r` (default 0) lightens ridges with the positive half
    of `T`, as a highlight layer of up to `min(1, o * r)` opacity in
    `highlight-color=`: `tone += a * (1 - max(tone, 0))`, the mirror of the
    shadow rule. Alps with `texture=0.5`: shadow/highlight 19.8%/2.7% at
    `r=0`, 17.7%/3.9% at 0.5, 16.3%/5.7% at 1. Over light backgrounds, most
    of the visible effect is cancelling shadow on the shaded sides of crests.
  - Earlier versions multiplied the shade value before the tone curve, so
    `max-opacity=` scaled both together. That version first brightened ridges
    too, with the full signed form; it was then changed to darken drainages
    only, and `texture-highlights=` brings back the ridge half as a separate
    control. Brown filters
  in the frequency domain (spectrum × |k|^α); we approximate that with a sum
  of differences of Gaussians at half-octave scales, weighted by σ^-α, which
  needs no FFT and reuses the nodata-aware box blur. `texture-detail=` is α
  (default 0.5); higher values favor smaller landforms. Compared with
  ambient, it carves the whole valley hierarchy. Alps (France, zoom 7), with
  default ambient: 14.8% shadow and 2.9% highlight; adding `texture=0.5`
  gives 19.8% and 2.7%; `texture=0.5 max-opacity=0.3` gives 13.9% and 1.4%;
  the texture alone (`max-opacity=0`) is 6.9% shadow.
  - Brown's scales are unbounded, so a plain ringed by mountains reads as a
    giant drainage. Uncapped, shadow on the flat Po plain rose from 3.1% to
    11.1%. Scales are capped at 24 pixels (4.1%; a 48-pixel cap gave 5.5%,
    96 gave 8.1%), which keeps nearly all of the ridge carving.
  - Brown stretches the result by percentiles of the extent, which would
    make adjacent extents render differently. Instead the differences are
    divided by the pixel size and multiplied by the exaggeration, like a
    slope, and scaled by a fixed factor (1/8) that brings France at zoom 7 to
    about 1 at the 98th percentile. Rugged terrain at high zoom saturates
    more (the Bernese Oberland's 98th percentile is about 2.4).
  - With `min-elevation=`, the flattened sea is excluded from the blurs as
    well as from the result. Otherwise it acts as a deep basin, and coastal
    land got bright, banded halos.
  - It costs about 0.45 s on a 2400 × 2000 grid.
- `aerial=k` (0-1) reduces contrast at low elevations:
  `shade = 1 + (shade - 1) * (1 - k * (1 - t))`, where `t` is elevation
  normalized between its 2nd and 98th percentiles. High mountains keep full
  contrast and lowlands fade.
- `altitude=` (existing) lower values give longer, darker shadows and fewer
  highlights.
- `sharpening=a` (0-3, default 0.25; 0 is off) applies an unsharp mask after the tone
  curve, to signed tones (shadow opacity negative, highlight opacity
  positive, flat ground 0): `tone += a * (tone - blur(tone))`, with a Gaussian
  of `sharpen-radius=` pixels (default 3). `sharpen-threshold=` (default 0,
  in opacity units) ignores smaller differences and reduces larger ones by
  it. Flat ground (a tone of exactly 0) is left alone, so a sea flattened by
  `min-elevation=` gets no halo along the coast; overshoot is clipped only by the 0-1
  range of opacity, not by the shadow and highlight caps. Unlike sharpening
  the elevations before smoothing, which leaves halos that FPS preserves as
  false grooves, this only adds tonal contrast.

The window sizes are fixed in pixels, so they cover more ground on
small-scale maps.

### Workers

Smoothing and shading take nearly all of the time, and every step of both
depends only on pixels within a fixed distance (its reach). So the grid is
split into overlapping tiles, which workers process separately: each tile's
core gets the same values as processing the whole grid, bit for bit, as long
as the margin around it covers the reach. There are two stages, each a
round trip to the workers, because the reach of the whole pipeline in one
stage (about 100 pixels with `medium` smoothing and `texture=`) would mean
much more duplicated work. Margins, including 2 spare pixels:

1. Smoothing (`smoothTerrain()`): 32 pixels for `medium`, 78 for `high`, and
   29 more with dynamic smoothing. Two-level smoothing works on 2x2 blocks, so
   its tiles start on even rows and columns.
2. Shading to signed tones (`shadeTerrain()`): 28 pixels by default (openness
   and sharpening), or 68 with `texture=`.

The main thread reads the elevations, computes the two values that need the
whole grid (the elevation range of `aerial=`; `smoothing=lowpass`, whose
curvature scale is a mean over the grid, runs as a single tile), and writes
the RGBA output.

The reach of each algorithm is computed from its settings, next to it
(`getFpsReach()`, `getOpennessReach()` and so on). Two kinds of mocha tests
check it, so a change to an algorithm that widens its reach fails a test
instead of leaving seams. One compares tiled and whole results for each
option. The other changes one pixel and checks that the result changes no
farther away than the reach, without the spare pixels. This one is stricter:
when a reach was set one pixel too short, only it failed. For shading, the
measured spread equals the computed reach; for smoothing it can fall short,
because smoothing ignores neighbors whose slopes differ too much (`high`
measured 60 pixels, against 76 computed). So a reach can't be measured
instead of computed: on other terrain, changes may spread farther.

The layout is the split into up to one tile per worker whose largest tile,
margins included, is smallest, since the slowest tile sets the running time.
Tiles beat strips: on a 3000 x 2000 grid with 16 workers, horizontal strips
duplicated 51% of the pixels and 4 x 4 tiles 18%. The shape of the tile
made no difference to the speed of the algorithms themselves.

On that grid (an 18-core Mac, 16 workers), the whole command took 0.8 s
instead of 5.9 s with default settings, 0.7 s instead of 4.9 s with
`smoothing=high`, and 1.0 s instead of 7.8 s with `texture=0.5`. In the GUI,
the main thread also stays responsive while workers run.

Workers load `www/hillshade-worker.js`, a separate bundle of about 50 KB
built from the pure raster modules; loading `mapshaper.js` in each worker
would add about 29 MB of memory per worker. In Node the script is found next
to `mapshaper.js`; in the browser, relative to the page. The browser can't
share memory between workers without cross-origin isolation headers, which
GitHub Pages can't send, so tiles are copied and the results transferred.
If workers can't be started (the script is missing, or mapshaper's source
modules are loaded directly), the command runs in the main thread.

## Implementation layout

- `src/fetch/mapshaper-tile-math.mjs` — tile coordinates, ground resolution,
  zoom selection, circular longitude ranges (pure).
- `src/fetch/mapshaper-elevation-decoding.mjs` — elevation encodings (pure).
- `src/fetch/mapshaper-fetch-sources.mjs` — presets.
- `src/fetch/mapshaper-tile-fetch.mjs` — fetching, image decoding, mosaicking.
- `src/fetch/mapshaper-webp-decoder.mjs` — lossless WebP decoding for Node.
- `src/commands/mapshaper-fetch.mjs` — the command: extent, reprojection,
  dataset creation.
- `src/rasters/mapshaper-hillshade.mjs` — shading, lighting refinements and
  low-pass generalization (pure).
- `src/rasters/mapshaper-terrain-smoothing.mjs` — feature-preserving
  smoothing (pure).
- `src/rasters/mapshaper-box-blur.mjs` — the blur used by both (pure, no
  imports).
- `src/rasters/mapshaper-hillshade-stages.mjs` — the smoothing and shading
  stages and their reach (pure; what workers run).
- `src/rasters/mapshaper-raster-tiles.mjs` — tile layouts, copying tiles out
  and their cores back (pure).
- `src/rasters/mapshaper-hillshade-runner.mjs` — runs the stages in this
  thread or in workers.
- `src/utils/mapshaper-worker-pool.mjs`, `mapshaper-worker-messages.mjs` —
  starting Node and browser workers, and the messages they exchange.
- `src/mapshaper-hillshade-worker.mjs` — entry point of
  `www/hillshade-worker.js`.
- `src/commands/mapshaper-hillshade.mjs` — the command.

## Testing

Mocha tests never touch the network:

- Tile math, zoom selection and longitude ranges as pure functions.
- Elevation decoding against known values.
- Hillshade on synthetic surfaces: flat ground is transparent in the shadow
  style; a slope facing the light is lit and one facing away is shaded;
  nodata becomes transparent; generalization reduces noise but keeps a ridge.
- `-fetch` with a stubbed `globalThis.fetch` that serves generated Terrarium
  PNG tiles, checking the extent, coordinate system, decoded elevations and
  the tile cap.
- `-hillshade` and `-hillshade +` through `applyCommands`.

## Later phases

1. COG adapter (OpenTopography SRTM, any public COG), using windowed and
   overview reads through `geotiff`.
2. USGS 3DEP ImageServer adapter for high-resolution US data.
3. Move supersampled or area-averaging resampling into
   `projectRasterGridForward()`, benefiting `-proj` too.
4. A GUI "Add terrain" action that issues `-fetch` and `-hillshade`, and an
   offer to re-fetch when the frame changes.
5. A disk cache for tiles in the CLI.
6. A public-domain-only tile pyramid (ETOPO 2022 / GMTED2010 at low zooms,
   NASADEM / SRTM above), possibly with per-pixel min/max bands so
   generalization can preserve peaks and narrow canyons.
