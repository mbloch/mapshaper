---
title: Raster GeoTIFF and image support notes
description: Initial raster import support policy, test corpus, sidecar handling, and SVG image encoding decisions.
---

# Raster GeoTIFF And Image Support Notes

This document records the GeoTIFF, PNG, and JPEG support policy for the first
raster implementation. It is intentionally conservative: import common rasters
well, create editable working samples and GUI display previews, export
grid-derived SVG images, and document unsupported cases clearly.

## Decoder

Use the npm `geotiff` package, also known as geotiff.js, for initial GeoTIFF
decoding. It supports browser and Node usage and already covers many GeoTIFF
storage variants, including strips, tiles, multiple sample types, compression,
overviews, windows, and worker pools.

Mapshaper should treat GeoTIFF import as async in both CLI and browser code.
The browser should load the GeoTIFF bundle on demand, following the existing
GeoPackage and GeoParquet lazy bundle pattern.

## File Detection

Recognize these extensions as GeoTIFF:

- `.tif`
- `.tiff`

They must be treated as binary importable files. This matters in the browser
because unknown files may otherwise be read as text before they reach the
decoder.

Recognize these non-GeoTIFF image extensions as raster inputs:

- `.png`
- `.jpg`
- `.jpeg`

These image files are only georeferenced when imported with a world file. Common
sidecar extensions include `.pgw`, `.pngw`, `.jgw`, `.jpw`, `.jpgw`, `.jpegw`,
`.tfw`, and `.wld`. A matching `.prj` file is optional; if it is missing,
Mapshaper emits a warning and treats the raster as having an unknown projected
CRS.

GeoTIFFs and image rasters inside zip files should work in the GUI once zip
expansion hands the expanded primary file and sidecars to the normal import
grouping path.

## PNG And JPEG Import

PNG/JPEG import creates the same `raster.grid` and `raster.view.recipe` model as
GeoTIFF import. Source pixels are decoded as `uint8` samples:

- JPEG imports as RGB samples.
- PNG imports as RGBA samples, preserving alpha from the decoded image.

World files contain six affine coefficients in this order:

```text
A
D
B
E
C
F
```

`C` and `F` are the center of the upper-left pixel. Mapshaper converts them to
the upper-left pixel corner before storing `raster.grid.transform`, then derives
an axis-aligned `raster.grid.bbox` from the transformed raster corners. Rotated
world files are accepted for bounds calculation, but raster display and clipping
currently use the axis-aligned bbox and are not full raster warping operations.

When a `.prj` sidecar is present, its WKT is stored in `dataset.info.wkt1` and
parsed into the normal dataset CRS fields when possible. Missing `.prj` files do
not block import, because world files often accompany images without projection
metadata; the resulting dataset CRS remains unknown.

## First-Pass Supported Cases

The initial implementation should prioritize:

- Single-band gray working samples and GUI previews.
- RGB working samples and GUI previews.
- RGBA working samples and GUI previews when alpha is present.
- Stripped and tiled storage.
- Pixel and band interleaving.
- Common integer sample types.
- Float sample types with simple display scaling.
- Common compression that geotiff.js decodes reliably, including uncompressed,
  LZW, Deflate, and PackBits.
- BigTIFF if geotiff.js can decode the fixture.

Import success should mean:

- The file is recognized as GeoTIFF.
- Raster dimensions and band/sample metadata are extracted.
- Bounds and transform are extracted when georeferencing is present.
- CRS metadata is mapped to existing `dataset.info` CRS fields when possible.
- Selected working bands are decoded into `raster.grid.samples`.
- In the browser, a bounded RGBA preview is derived from `grid.samples` for GUI
  rendering. CLI/headless import skips this derived cache.
- Source metadata is recorded in `dataset.info.raster_sources`; the original
  source is referenced by path in CLI or stored separately in IndexedDB in the
  browser.

## Expected-Limited Cases

These cases can be deferred or treated as expected-limited during the first
milestone:

- OME-TIFF and scientific multi-channel visualization.
- Palette expansion and categorical color tables.
- CMYK, CIELab, YCbCr, and other less common photometric interpretations.
- JPEG-in-TIFF, LERC, ZSTD, and LERC-combined compression until decoder behavior
  is verified against fixtures.
- External overviews.
- External masks.
- Complex nodata styling beyond simple alpha handling.
- Automatic contrast/stretch based on sidecar statistics.
- Reprojection or warping during import. Reprojection is handled later by
  display preview generation or by the `-proj` command.

Unsupported cases should fail with clear messages when possible. Silent
misrendering is worse than a visible limitation.

## `.aux.xml` Sidecars

Do not require `.aux.xml` sidecars for the initial implementation.

The inspected sidecars in the local geotiff.js test data are GDAL PAM files
containing per-band statistics and histograms. They did not contain essential
CRS or geotransform metadata in the checked examples. That means Mapshaper
should import the `.tiff` file directly and ignore the sidecar unless a future
feature explicitly uses PAM metadata.

Possible later uses for `.aux.xml` include:

- Default display stretch from band min/max statistics.
- Histogram-based contrast controls.
- Color interpretation metadata if encountered in real-world fixtures.
- Nodata or mask metadata if a file relies on PAM for those values.

If future support is added, sidecars should remain optional. A GeoTIFF that
contains complete internal georeferencing should not depend on an auxiliary XML
file.

## Local Test Corpus

The local geotiff.js generated corpus is currently at:

```text
/Users/matthewbloch/Development/mapshaper/geotiff.js/test/data
```

Use this corpus for early manual and automated tests. The files mostly exercise
the same scene with different encodings, storage layouts, and sample types.

Start with these fixtures:

- `initial.tiff`
- `stripped.tiff`
- `tiled.tiff`
- `small.tiff`
- `bigtiff.tiff`
- `lzw.tiff`
- `deflate.tiff`
- `packbits.tiff`
- `interleave.tiff`
- `tiledplanar.tiff`
- `tiledplanarlzw.tiff`
- `int32.tiff`
- `uint32.tiff`
- `float32.tiff`
- `float64.tiff`
- `float64lzw.tiff`
- `rgb.tiff`

Use `multi-channel.ome.tif` as an exploratory fixture rather than a first-pass
required success case.

Additional files referenced by `setup_data.sh` can be added later when present
locally and when their compression/photometric variants are in scope.

## Working Samples And Preview Policy

Import currently decodes the selected display bands from the selected import
rendition into `raster.grid.samples`. This makes the imported layer immediately
editable without reopening the GeoTIFF. The default band selection is simple:

- Three or more samples per pixel become an RGB(A) image layer.
- Single-band rasters become a grayscale image layer.

For large GeoTIFFs, Mapshaper applies the same automatic rendition policy in the
CLI and web UI: if the full-resolution image exceeds the default import size
limit, import uses the best available overview under the limit, or a resized
rendition if no overview is small enough. Use `rendition=full` to force
full-resolution import, or `rendition=overview-1` (or another listed slug) to
choose a specific overview. The internal maximum-pixel override is available as
`raster-max-pixels` / `raster_max_pixels` for testing and advanced import paths.

The GUI source-band derivation interface is deferred. Future CLI derivation
should use repeated `-i` commands with raster import options rather than a new
`-raster-create` command.

Browser import also creates a bounded RGBA preview derived from `grid.samples`.
The preview should be small enough for interactive GUI rendering. CLI/headless
import omits previews because SVG export renders directly from `grid.samples`.

Preview generation uses a bounded maximum-pixel default for browser display
caches. The display recipe supports these compact import options:

```text
scaling=none|minmax|percentile
scale-range=0,100
percentile-range=2,98
raster-type=image|categorical
```

`scale-range` is a normalized output intensity range in percent. The default is
`0,100`, which maps to the full display range `0..255`.

`scaling=none` is raw/type-range display. For `uint8`, values map directly to
display values. For `uint16`, the full `0..65535` type range maps to `0..255`,
so users do not need to know the source bit depth to get a full-range display.

`scaling=minmax` stretches source data min/max into `scale-range`. Grayscale
uses the selected band min/max. RGB uses one shared min/max across the displayed
R, G, and B bands to avoid color shifts from independent per-channel stretching.

`scaling=percentile` stretches input percentile values into `scale-range`. The
default `percentile-range=2,98` maps the 2nd percentile to output intensity 0%
and the 98th percentile to output intensity 100%. RGB uses one shared percentile
range across the displayed R, G, and B bands to preserve color balance.

Defaults:

- 8-bit layers use `scaling=none`.
- Non-8-bit integer and floating point layers use `scaling=percentile`.
- Rasters use `raster-type=image` unless the user passes
  `raster-type=categorical`.

`raster-type=` records semantic intent, not storage type. Image rasters default
to bilinear resampling in later reprojection commands. Categorical rasters
default to nearest-neighbor resampling so class/code values are not blended.

Percentile calculation avoids sorting all pixel values. For small integer ranges
such as 8-bit and 16-bit data, Mapshaper uses an exact histogram. For larger
integer and floating point data, it first finds the finite min/max, then maps
values onto a fixed 16-bit histogram. This is approximate, but avoids large JS
array allocation and keeps preview generation linear.

Known nodata values are excluded from min/max and percentile calculations.
GeoTIFF import currently reads nodata from `image.getGDALNoData()` when
geotiff.js exposes it. If a file relies on sidecar metadata or another
unhandled metadata field for nodata, Mapshaper may not know the nodata value and
it can still affect display scaling.

The current import/display preview generation uses nearest-neighbor resampling
from the working samples. Export-specific SVG rendering uses area averaging for
downsampling and bilinear sampling for upsampling or near-native output.

## Source Preservation

The preview is not the source of truth. `raster.grid.samples` is the editable
layer truth; the original GeoTIFF is provenance/reload data for future
operations:

- CLI: store source path and byte metadata in `dataset.info.raster_sources`.
- Browser: store original bytes in IndexedDB separately from current sample
  payloads, and keep source metadata in `dataset.info.raster_sources`.

SVG export renders an export-specific image from `raster.grid.samples`, cropped
to the SVG frame. The original source file is not reopened during export.

## SVG Image Encoding

SVG raster export should write image data with `<image>`. By default the image
is embedded as a data URI; `linked-images` writes separate JPEG/PNG files and
uses relative file links in the SVG.

Initial formats:

- JPEG for opaque continuous-tone imagery.
- PNG for alpha, nodata transparency, lossless output, palette/categorical
  fidelity, or non-photographic rasters.

Default behavior:

- Use JPEG when the rendered raster is opaque RGB or gray and no lossless
  option is requested.
- Use PNG when transparency is required or when the user requests lossless
  output.

WebP is not an initial target. Browser support is good, but SVG portability to
graphics editors and non-browser renderers is less dependable than PNG/JPEG.

Current SVG raster options:

```text
svg-raster-format=jpeg|png
jpeg-quality=85
raster-res=1
linked-images
```

`raster-res=` controls embedded raster pixels per SVG pixel. The default is `1`;
larger values produce higher-resolution embedded images, capped at the available
source grid resolution. `jpeg-quality=` controls JPEG quality on a `1..100`
scale. `linked-images` changes the `<image href>` from an embedded data URI to a
relative image filename and returns the image files with the SVG export. WebP can
be considered later after SVG compatibility has been tested in browsers,
Illustrator, Inkscape, and common command-line renderers.

## Test Expectations

Early tests should assert:

- `.tif` and `.tiff` are recognized as binary GeoTIFF inputs.
- Import returns a dataset with one raster layer.
- `dataset.info` contains CRS metadata when the file provides usable CRS data.
- Raster bounds are present and contribute to dataset bounds.
- `raster.grid.samples` contains the selected working bands.
- Browser preview dimensions are bounded by the import default or option and
  preview pixels are derived from the grid. CLI/headless imports may not contain
  `view.preview`.
- `scaling=none`, `scaling=minmax`, `scaling=percentile`, `scale-range=`, and
  `percentile-range=` affect preview pixels as documented.
- RGB and grayscale previews produce expected band/color metadata.
- `.aux.xml` sidecars are ignored without causing import failure.
- SVG export produces an `<image>` element with `data:image/jpeg` or
  `data:image/png`.
- Raster clipping updates grid samples, bounds, and transform. Browser clipping
  regenerates preview pixels; CLI/headless clipping omits preview caches.

Tests should avoid asserting exact pixel values until the preview scaling and
color stretch policy is stable.
