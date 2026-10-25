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
| Cloud-Optimized GeoTIFF (windowed reads) | Planned | OpenTopography SRTM |
| ArcGIS ImageServer bbox export | Planned | USGS 3DEP |
| Vector tiles / PMTiles | Later | see `future-directions.md` |

A preset is data: a named bundle of adapter options plus metadata (license,
zoom range, attribution check). Options given on the command line override the
preset's.

### Options

- `source=` preset name or URL template containing `{z}`, `{x}` and `{y}`.
- `encoding=` elevation encoding of custom tiles: `terrarium` (default) or
  `mapbox`.
- `scheme=` `xyz` (default) or `tms` for custom tiles.
- `zoom=` tile zoom level, overriding automatic selection.
- `raster-res=` raster pixels per frame pixel (default 2). The GUI on
  high-density screens and PNG output draw two device pixels per frame pixel,
  so a raster at 1 is blurred by upsampling; comparisons showed resolution was
  the largest single cause of soft, rounded ridges. The name matches
  `-o raster-res=`.
- `margin=` extra border around the frame, in frame pixels (default 10). Keeps
  hillshading and generalization filters from producing artifacts at the frame
  edge. SVG export crops rasters to the frame, so the margin never shows.
- `bbox=` extent to fetch (in the target's coordinate system, or lat-long when
  there is no target).
- `max-tiles=` safety cap on the number of tiles (default 500).
- `name=` name of the new layer (default `elevation`).
- `target=` layer or frame whose extent to use.

### Defaults derived from the frame

- **Frame:** the target layer's frame, or the session's only frame. Without a
  frame, the target layers' extent and coordinate system are used, at a
  nominal width of 800 pixels; without targets, `bbox=` is required.
- **Extent:** the frame's bbox, expanded by `margin=`.
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

### Provenance

The new dataset's `info.raster_sources` records the preset, URL, zoom, tile
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
- `generalize=` amount of terrain smoothing: rounds of feature-preserving
  smoothing (default 3), or the blur radius in pixels with `smoothing=lowpass`
  (default 1). 0 turns smoothing off. See below.
- `smoothing=` (experimental) `fps` (default) or `lowpass`.
- `fps-threshold=`, `fps-radius=`, `maximum-change=` (experimental) FPS
  settings, described under Generalization. These may later be replaced by
  presets such as `generalization=off|low|medium|high`.
- `light-adjust=`, `ambient=`, `aerial=` (experimental) lighting refinements,
  described under Lighting experiments. All default to 0 (off).
- `style=` `shadow` (default) or `gray`.
  - `shadow` is black shadows and white highlights with transparency: flat
    ground is fully transparent, shaded slopes get darker and lit slopes
    lighter. It uses ordinary compositing, so it looks the same in the GUI,
    SVG, PNG and graphics editors. Highlights are capped at 0.6 times
    `max-opacity=`, so lit slopes are not blown out; they double the contrast
    across ridgelines, which makes ridges read much more crisply than shadows
    alone.
  - `gray` is a conventional opaque gray hillshade.
- `min-elevation=` raises lower elevations to this value; `min-elevation=0`
  flattens the sea floor, which the shadow style then leaves transparent.
  Raising (rather than masking as nodata) keeps coastal slopes shading
  naturally and keeps land below sea level. It is applied before
  generalization, so the sea floor is not blurred into coastal land, and again
  after, resetting raised pixels so blurred land does not shade a flat sea.
- `max-opacity=` 0-1 opacity of the darkest shadows (default 0.55; shadow
  style only).
- `gamma=` exponent of the tone curve: tone = darkness ^ gamma, where
  darkness is 0 on flat ground and 1 in full shadow (default 0.5). Values
  below 1 strengthen faint shading and ease off the darkest shadows; values
  above 1 do the opposite. Applies to both styles. 0.5 was chosen by comparing
  renderings of France (zoom 7) and Mount Rainier (zoom 11); 1 left gentle
  terrain such as the Massif Central nearly invisible.
- `band=` band to read elevations from (default 0).
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
Each round:

1. Compute surface normals of the exaggerated surface.
2. Smooth the normals over a 9x9 window, weighting neighbors by
   `(dot - cos 20°)^2` and ignoring neighbors whose normal differs by more than
   20°. Normals on opposite sides of a ridge or valley don't mix, so crests
   stay sharp while noise on each face is averaged away.
3. Refit elevations to the smoothed normals (5 iterations), predicting each
   pixel from its 8 neighbors' tangent planes.

Settings:

- `fps-threshold=` (default 20°): lower values preserve more slope changes as
  features, keeping ridges sharper but also more small-scale texture; higher
  values approach a blur. Normals are measured on the exaggerated surface, so
  higher exaggeration has a similar effect to lowering the threshold.
- `fps-radius=` (default 4, a 9x9 window): the size of bumps averaged away.
  Cost per round grows with the square of the window width.
- `maximum-change=` (default off): after each round, elevations are clamped
  to within this many meters of their original values, protecting summits and
  narrow gorges from being shaved down.

Windows of entirely flat ground are skipped. On a 1640x1477 map of France,
three rounds take about 2 seconds. FPS must run on unblurred data: low-pass
filtering first turns valleys into worm-like grooves, and sharpening first
leaves halos that FPS preserves as false ridges.

The earlier method (`smoothing=lowpass`) follows the approach of Terrain
Sculptor (Leonowicz, Jenny and Hurni, 2010): low-pass filter the terrain, then
restore major ridges and valleys by blending toward local maximum and minimum
filters, weighted by curvature measured at a broader scale. It is faster but
softens ridges. With `generalize=g` (Gaussian sigma in pixels):

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
- `ambient=w` mixes in sky-view (openness) lighting with weight `w` (0-1):
  `shade = (1 - w) * shade + w * openness`, where openness is
  `1 - mean(sin(horizon angle))` over 8 directions within about 24 pixels.
  Deep valleys darken and sunlit faces lose some glare, at the cost of
  directional contrast.
- `aerial=k` (0-1) reduces contrast at low elevations:
  `shade = 1 + (shade - 1) * (1 - k * (1 - t))`, where `t` is elevation
  normalized between its 2nd and 98th percentiles. High mountains keep full
  contrast and lowlands fade.
- `altitude=` (existing) lower values give longer, darker shadows and fewer
  highlights.

The window sizes are fixed in pixels, so they cover more ground on
small-scale maps.

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
