---
title: Raster implementation guide
description: Design notes for adding raster layers to Mapshaper's data model, GUI renderer, and SVG exporter.
---

# Raster Implementation Guide

This document describes the current raster layer implementation. The initial
vertical slice imports GeoTIFF files and georeferenced PNG/JPEG image files,
represents editable raster samples in the layer model, renders a derived preview
in the web UI, preserves source provenance for later operations, supports
rectangle-based clipping, supports raster reprojection, and exports rasters
embedded in SVG output.

Raster support should fit into Mapshaper's existing `dataset` + `layers` +
`info` structure. It should not overload vector geometry fields or weaken
existing vector invariants.

## Initial Scope

The first implementation supports:

- GeoTIFF import through the async import path.
- PNG and JPEG import with world-file georeferencing and optional `.prj`
  sidecars.
- Raster-only datasets for import. Some mixed vector/raster workflows exist
  during SVG framing and GUI display, but broad mixed-layer command support is
  still limited.
- Dataset-level CRS metadata using the existing `dataset.info` projection
  fields.
- Editable working samples for the selected import rendition and display bands.
  Large GeoTIFFs use an overview or resized rendition by default unless
  `rendition=full` is requested.
- A derived RGBA preview for GUI rendering. CLI/headless imports skip preview
  creation because SVG export renders directly from the working grid.
- Source provenance in `dataset.info.raster_sources`.
- Browser IndexedDB temp storage for current sample payloads and, separately,
  optional original raster source bytes.
- Display-only GUI raster reprojection for basemap/dynamic CRS workflows.
- Raster reprojection through `-proj`, using forward mesh rasterization.
- SVG export using an export-specific image generated from `raster.grid`.
- Rectangle-tool clipping of raster layers.

The first implementation does not attempt to support:

- Raster/vector analysis commands.
- GUI source-band derivation or styling controls.
- Full GeoTIFF metadata preservation beyond the fields currently used for CRS,
  nodata, georeferencing, and provenance.

## Layer Model

Vector layers use `geometry_type` with `shapes` and, for paths, a dataset-level
`ArcCollection`. Raster layers use separate raster fields:

```js
{
  name,
  raster_type: 'grid',
  raster: {
    sourceId,
    grid: {
      width,
      height,
      bands,
      pixelType,
      samples,
      sampleBands,
      nodata,
      bbox,
      transform
    },
    derivation: {
      type,
      sourceId,
      bands
    },
    view: {
      recipe,
      preview
    }
  }
}
```

`geometry_type` remains vector-only. A raster layer should not set
`geometry_type: 'raster'`, because existing export validation and many commands
assume that any truthy `geometry_type` is one of `polygon`, `polyline`, or
`point` and has vector `shapes`.

The `raster` object distinguishes:

- `grid`: canonical editable working samples for the layer. These are the
  current truth for clipping and future raster operations.
- `grid.coverage`: optional mask used by projected rasters to distinguish
  covered pixels from nodata fill pixels. This is separate from pixel color.
- `interpretation`: semantic raster type, one of `image`, `categorical` or
  `continuous`. Import defaults to `image`. `categorical` marks class/code
  rasters so later reprojection defaults to nearest-neighbor resampling.
  `continuous` marks measurement rasters such as elevation models, which need
  bilinear resampling but a numeric rather than color nodata fill.
- `view.recipe`: display/export rendering recipe, including band selection and
  scaling options.
- `view.preview`: derived RGBA display pixels used by GUI rendering. Preview
  pixels are cache data and can be regenerated from `grid.samples`.
- `derivation`: provenance describing how the layer was derived from source
  bands.
- `sourceId`: a link to shared source/provenance metadata in
  `dataset.info.raster_sources`.

## CRS Metadata

CRS should stay at the dataset level, using the existing projection metadata in
`dataset.info`. GeoTIFF import should populate the same fields used by vector
formats where possible:

- `crs`
- `crs_string`
- `wkt1`
- format-specific metadata if needed later

This lets existing helpers such as `getDatasetCrsInfo()` and `getDatasetCRS()`
continue to be the central CRS API.

Raster georeferencing still needs per-layer placement metadata. Store pixel to
map information on the raster layer, not in `dataset.info`, because two raster
layers may eventually share a CRS while having different extents, resolutions,
or transforms.

## Bounds And Predicates

Raster layers need explicit predicates and bounds helpers. Add helpers along
these lines:

```js
layerHasRaster(lyr)
datasetHasRaster(dataset)
getRasterLayerBounds(lyr)
```

Then update shared bounds logic so raster layers contribute to dataset and GUI
map extents. Today, `getLayerBounds()` returns bounds only for point, polyline,
and polygon layers; without a raster branch, raster datasets will look empty to
the map, CRS inference, bbox export helpers, and GUI import flow.

Avoid making `layerHasGeometry()` mean raster in the first pass unless every
caller has been audited. Many command paths use geometry predicates as shorthand
for vector operations.

## Import Flow

GeoTIFF import is async:

- Extend file detection so `.tif` and `.tiff` are binary importable types.
- Add an async `importGeoTIFF()` module under a raster or geotiff directory.
- Route GeoTIFF objects through `importContentAsync()`.
- Use the npm `geotiff` package as the decoder.
- Extract raster dimensions, sample metadata, nodata values, georeferencing, and
  CRS metadata.
- Select the requested GeoTIFF rendition, or automatically choose an overview or
  resized rendition for large sources, then decode the selected working bands
  into `raster.grid.samples`.
- In the browser, generate `raster.view.preview` from `grid.samples` using the
  layer's display recipe. CLI/headless import keeps only the recipe and working
  grid.
- Populate `dataset.info.raster_sources` with source metadata.

The browser GUI must recognize GeoTIFF files as binary before import. If `.tif`
and `.tiff` are not added to binary detection, the browser file reader may treat
them as text and corrupt the bytes before the decoder sees them.

A raster whose CRS metadata cannot be read still imports, and is displayed in
its own coordinates; only the operations that need to know what those
coordinates mean — reprojecting, basemaps, measuring — are unavailable. The
import therefore parses a CRS string it is unsure of with
`tryParseCrsString()`, which returns null instead of stopping, and reports the
failure with `warnOnce()`. Using the ordinary parser here had two effects in the
web app that neither the CLI nor the tests could show: `stop()` opens a modal
popup on its way to throwing, and opening one puts the app in its `alert` mode,
which took the importer out of `import` mode — and leaving `import` mode is what
draws what was imported. The raster loaded, and the map stayed blank.

PNG and JPEG import also uses the async raster import path:

- Recognize `.png`, `.jpg`, and `.jpeg` as binary importable primary files.
- Recognize common world-file sidecars such as `.pgw`, `.pngw`, `.jgw`,
  `.jpgw`, `.jpegw`, `.jpw`, `.tfw`, and `.wld`.
- Read `.prj` sidecars when present and store the WKT in `dataset.info.wkt1`.
- Emit a warning when the `.prj` sidecar is missing, while still importing the
  raster with unknown CRS.
- Decode PNG/JPEG pixels into `uint8` RGB or RGBA `grid.samples`. Browser import
  also creates `view.preview` with the same raster display recipe used by
  GeoTIFF import; CLI/headless import does not.

World files store the center of the upper-left pixel. Mapshaper converts this to
an upper-left pixel-corner transform before deriving `raster.grid.bbox`, so the
layer bounds describe the outside extent of the raster.

Large rasters keep the selected working bands as canonical samples in
`grid.samples`. Browser sessions create a bounded preview for display; CLI
sessions skip this derived cache. The display recipe supports
`scaling=none|minmax|percentile`, normalized `scale-range=0,100` output
intensity, and `percentile-range=2,98` for percentile scaling. The default is
raw/type-range display for 8-bit data and percentile scaling for non-8-bit
integer and floating point data.

`raster-type=image|categorical|continuous` records whether the raster should be
treated as a display image, a categorical class/code raster, or continuous
measurements. The default is `image`. The setting affects later command defaults
such as `-proj` resampling and nodata fill; it does not change the pixel storage
type.

Resampling and nodata fill are two independent axes, which is why three values
are needed rather than a single image/categorical switch:

| `raster-type=` | Default resampling | Uncovered pixels |
| --- | --- | --- |
| `image` | bilinear | fill color (white) |
| `categorical` | nearest | `grid.nodata` |
| `continuous` | bilinear | `grid.nodata` |

## Source Storage

The implementation separates editable layer samples from source provenance.

In CLI:

- Keep canonical sample pixels in memory.
- Store source filename/path and byte metadata in `dataset.info.raster_sources`.
- Reopen the source path in future operations when source-backed band derivation
  is implemented.
- Do not promise portability if the source file is moved after import.

In the browser:

- Store canonical current layer samples in IndexedDB as raster temp data.
- Store original GeoTIFF, PNG, or JPEG bytes separately in IndexedDB when
  available, as provenance/reload data for future band derivation.
- Keep both stores under the shared temp-session lifecycle and startup cleanup
  reporting.
- Keep preview pixels in memory only as display caches. Snapshot/MSX export
  omits preview pixels and scaling stats; the GUI regenerates missing previews
  from `grid.samples` when snapshots are imported or restored.

The source bytes and current samples have a many-to-one relationship: future
commands may derive multiple editable layers from one source. Current layer
edits update `grid.samples`; they do not rewrite the original source bytes.

## GUI Rendering

Raster layers should be treated as mappable content, not as tables. Update the
display preparation path so raster layers get:

- `gui.geographic = true`
- display bounds from `raster.grid.bbox`
- a display raster preview reference
- source dataset metadata for CRS display

Rendering should use Canvas 2D at first:

- Convert preview pixels to `ImageData` or an offscreen canvas.
- Draw the preview into the current map extent with `drawImage()`.
- Respect layer ordering, with raster layers commonly drawn below vectors.
- Redraw on pan/zoom rather than relying entirely on vector-specific arc
  scaling.

For native-CRS display, the GUI uses cached viewport previews and regenerates
viewport-sized previews after navigation settles. During pan/zoom it can keep
the existing preview visible and let the canvas scale it temporarily.

For dynamic display CRS changes, such as enabling a Mapbox basemap, the GUI uses
the forward mesh raster reprojection path to create a viewport-sized projected
preview. Reprojected display previews are GUI-only caches; they do not mutate
the working grid.

### Magnified rasters

Zoomed in past a raster's resolution, smoothing is all a user can see, so the
pixels are drawn as squares instead. Both display paths reach this through the
two rules in `gui-raster-display-utils.mjs`, which are kept free of browser and
mapshaper dependencies so they can be tested directly:

- `previewHasSourcePixels()` — whether the preview image in hand holds every
  raster pixel in view. This is the guard that makes the feature safe. While a
  large raster is panned, and until a sharper preview is ready, the map draws
  the whole-raster preview made at import time, which is scaled down to fit
  within `DEFAULT_MAX_PREVIEW_PIXELS`. Magnifying that as squares would show
  crisp blocks that are not pixels of the raster, and they would then be
  replaced by different, real ones.
- `rasterPreviewIsSmoothed()` — applies `MIN_CRISP_MAGNIFICATION`, in screen
  pixels per raster pixel. Below it, squares would only look jagged, since the
  destination rectangle is not pixel-snapped and pixels land on fractional
  boundaries.

The reprojected path has to decide before it resamples, not just at the blit:
the sample method follows the same test, because interpolating between pixels
when the output grid has room for all of them blurs the data away for nothing.
It estimates how many raster pixels a view covers by mapping the view's bbox
back through the source CRS, and falls back to smoothing if that fails.

## GUI Pixel Readout

The right-click menu reports the pixel under the cursor, alongside the
coordinates it already showed. `getRasterPixelAtMapXY()` does the work: it turns
a map coordinate into a column and row through the axis-aligned bbox, collects
the interleaved band values, and reports whether the pixel is valid according to
the shared `rasterPixelIsValid` mask. Rotated grids return null, the same
restriction the other bbox-indexed operations have.

Three things are worth knowing about how it is wired up:

- It reads the working grid, not the display preview, so the values are the ones
  commands would see, at full stored resolution, and they reflect earlier edits
  such as `-blur`. Since the preview may be decimated and is drawn with
  smoothing, the reported value can differ from the blended color of the screen
  pixel that was clicked, particularly when zoomed far past the raster's own
  resolution.
- The map's `pixelCoordsToRasterPixel()` runs the display point back through
  `translateDisplayPoint()` first, because the grid is georeferenced in the
  layer's own CRS while the click is in the display CRS.
- `HitControl` samples only on `contextmenu`, not on every pointer event.
  Resolving a color can trigger a scaling-stats scan of the grid, and hover
  events fire constantly.

A color is only computed for images of three or more bands, so inspecting a DEM
does not pay for a stats scan that nothing would display. The color goes through
the same recipe, scaling stats and `scaleSample()` as the preview renderer, so a
16-bit or float image reads as the color it is drawn with rather than as a raw
band triplet. Float band values are printed through
`formatRasterSampleValue()`, which rounds to the precision the type actually
carries; printing a Float32 in full shows binary noise.

## SVG Export

SVG export writes raster images using SVG `<image>` elements. By default, images
are embedded as data URIs; `linked-images` writes separate JPEG/PNG files and
uses relative file links in the SVG.

Current behavior:

- Render an export-specific RGBA image from `raster.grid`, not from
  `raster.view.preview`.
- Crop the rendered image to the SVG frame extent.
- Use `raster-res=` to set raster pixels per SVG pixel; the default is `1`.
- Use `linked-images` to output raster images as sibling files instead of data
  URIs.
- Use `jpeg-quality=` to set JPEG quality on a `1..100` scale; the default is
  `85`.
- Cap export raster dimensions at the available source grid resolution.
- Use area averaging for downsampling, with bounded regular-grid averaging for
  very large downsampling footprints to avoid excessive export time.
- Use bilinear sampling for upsampling and near-native export.
- Place raster image elements before vector layers when exporting underlays.

Image encoding should support JPEG and PNG:

- Use JPEG by default for opaque continuous-tone RGB/gray imagery, such as
  satellite imagery and shaded relief.
- Use PNG when alpha/nodata transparency is needed, when lossless output is
  requested, or when categorical/palette fidelity matters.
- Treat WebP as a possible future option, not an initial default, because
  PNG/JPEG are more portable across SVG viewers and graphics editors.

The SVG element should use a matching href, either a data URI such as
`data:image/jpeg;base64,...` or a relative filename such as `map-image-1.jpg`
when `linked-images` is enabled.

Browser export can use Canvas encoders. CLI export needs Node-capable JPEG and
PNG encoding dependencies or a shared pure-JS encoder.

## GeoTIFF Export

`-o format=geotiff` (or a `.tif`/`.tiff` output filename) writes a raster
layer's samples to a GeoTIFF. Unlike SVG export, which renders a picture of the
raster, this writes the grid unchanged: same values, same data type, same band
count, so an elevation model round-trips as elevations.

The encoder in `src/geotiff/mapshaper-geotiff-encode.mjs` is hand-rolled. The
`geotiff` dependency that reads GeoTIFFs also has a writer, but it corrupts
signed integer samples (its type table omits the signed typed arrays, so it
writes 64-bit floats behind integer tags), tags data as Deflate without
compressing it, and assembles its IFD in a fixed 1000-byte buffer that a long
ASCII tag overruns. Building on it would have meant fixing all three upstream.

What the encoder writes:

- A classic (32-bit) little-endian TIFF, band-interleaved
  (`PlanarConfiguration = 1`), which is the layout `grid.samples` already has.
  Samples are copied as bytes on a little-endian platform and byte-swapped
  otherwise, rather than written value by value through a `DataView`.
- Rows grouped into strips of about 256 KB, each Deflate-compressed on its own
  (`compression=none` stores them). Deflate goes through
  `deflateSync()` in `src/io/mapshaper-gzip.mjs`, which is zlib in Node and
  fflate in the browser.
- `SampleFormat` and `BitsPerSample` derived from the typed array, so all of
  mapshaper's pixel types survive the trip.
- `PhotometricInterpretation = 2` (RGB) for three or more bands and `1`
  (BlackIsZero) otherwise, matching how the renderer treats band counts. A
  fourth band is declared as unassociated alpha; other bands past the ones the
  photometric interpretation covers are declared unspecified.
- `GDAL_NODATA` when the grid has a nodata value.
- Georeferencing as `ModelTiepoint` plus `ModelPixelScale`, which cannot express
  rotation, so a rotated or skewed grid is rejected rather than written wrong.

### CRS metadata

A GeoTIFF names its CRS in one of two ways, and
`src/geotiff/mapshaper-geotiff-export.mjs` tries them in this order:

1. **An EPSG code**, which is the most complete answer, because it identifies
   the datum realization and not just the shape of the earth. The code is looked
   for in the dataset's `crs_string`, in an `AUTHORITY` clause in `info.wkt1`, in
   GeoPackage CRS metadata, and finally by recognizing WGS-84 or Web Mercator
   from the projection itself (which is what makes mapshaper's own `wgs84` and
   `webmercator` aliases come out coded).
2. **The projection spelled out**, parameter by parameter, in the geo keys:
   a coordinate transformation code plus the origin, standard parallels, scale
   factor and false easting and northing that go with it, on top of an ellipsoid
   given by its axes. This is what `src/geotiff/mapshaper-geotiff-geokeys.mjs`
   builds, and it covers the projections in the GeoTIFF spec's transformation
   list, which is most of the ones a raster is likely to be in.

Where each parameter goes is decided per projection, following what GDAL writes
for the same projection: a two-parallel Lambert conformal conic uses the
false-origin keys while an Albers uses the natural-origin ones, a polar
stereographic puts its central meridian in `ProjStraightVertPoleLong` and its
parallel of true scale in `ProjNatOriginLat`, and so on. The parameters
themselves are read from the CRS object where mproj normalizes them (which is
what expands a UTM zone into a transverse Mercator) and from its proj4 string
where mproj keeps them inside the projection's own state, as it does for
`lat_1`, `lat_2` and `lat_ts`.

Failing both, the projection goes into a `<file>.tif.aux.xml` sidecar as WKT,
and the message says so. That is GDAL's own PAM sidecar, which GDAL-based
software reads; a shapefile-style `.prj` next to a `.tif` is ignored. This is
where mapshaper's interrupted, polyhedral and composite projections end up,
along with anything else GeoTIFF has no transformation code for. A composite
projection like `albersusa` has to be turned away by name, because its proj4
string reports only the projection its main frame uses.

The same table is used to read these keys back, in `getGeoKeyProjection()`.
Reading is otherwise done by the `geotiff-geokeys-to-proj4` library, which knows
the EPSG database and so handles datums, ellipsoids and units thoroughly, but
which reads the projection parameters loosely: it drops the central meridian of
a polar stereographic, the azimuth of an oblique Mercator, and the true-scale
parallel of a Mercator. So on import the projection part of its answer is
replaced by mapshaper's own reading of the same keys, and the rest of it kept.

Two assumptions fill in what a file leaves out, both of them the ones mapshaper
already makes for vector data with no projection metadata:

- **A missing datum is taken for WGS 84.** Geo keys often spell out a
  transformation and its parameters without naming an ellipsoid, and since the
  geokeys-to-proj4 library ends every definition with `+no_defs`, proj will not
  supply its own default either -- so a perfectly good projection used to be
  discarded over a missing semi-major axis. A definition that will not parse is
  now tried again with `+datum=WGS84` added, which leaves definitions that
  already work untouched.
- **Coordinates in the decimal-degree range are taken for WGS 84 lat-long.**
  This one needs no raster-specific code: `getDatasetCrsInfo()` applies it to
  any dataset whose bounds fit inside the world, raster or vector. What the
  raster importer contributes is not getting in the way. Asked about a file with
  no CRS keys, the geokeys-to-proj4 library answers `+proj=longlat +no_defs`
  rather than nothing, having read the silence as a geographic CRS; that is a
  guess about the coordinates dressed up as metadata, and combined with the
  datum assumption above it would declare every CRS-less raster to be in
  degrees, whatever its coordinates. So the library is not consulted at all
  unless the file has at least one CRS-bearing geo key (`hasCrsGeoKeys()`),
  which leaves the degree-range test to make the call.

Nothing is recorded on the dataset in the second case, deliberately: like a
vector file, the raster keeps no CRS of its own and the assumption is re-made
whenever something asks. The import says which of the two situations it is in,
since "no CRS metadata, treating the coordinates as lat-long" and "no CRS
metadata, and no idea what these coordinates are" lead to very different
sessions.

A sidecar is read back too, by the same rule GDAL follows: the file's own geo
keys are tried first, and the sidecar is consulted only when they yield nothing
usable, which includes the case where the library returns a definition that will
not parse. `src/geotiff/mapshaper-geotiff-aux.mjs` holds both halves of the
format, so that what is written and what is read stay in step, and the SRS it
finds is converted from either WKT dialect (or used as-is, if a hand-written
sidecar states a code or a proj4 string). The wording of the sidecar's WKT is
kept in `info.wkt1`, so a raster read this way and written out again travels
with the same text it arrived with.

Getting the sidecar as far as the importer takes a little plumbing, because it
is named after the whole raster file (`world.tif.aux.xml`) rather than by
replacing its extension:

- `guessInputFileType()` matches the full name ahead of the extension and
  returns `aux`, an auxiliary type, so the file survives unzipping and is not
  taken for a dataset of its own. Before this, unzipping dropped it as an
  unknown type, which is why a raster exported from the web UI came back
  without its projection.
- The CLI reads it alongside the `.tif` in `readGeoTIFFAuxFiles()`; the web UI
  groups it with the `.tif` in `groupFilesForImport()`.
- A sidecar that arrives on its own is imported as a CRS with no layers, in the
  way a lone `.prj` file is, rather than raising an error.

## Raster Clipping

Raster clipping is available through the rectangle tool and the existing
`-clip bbox=...` command path.

Current behavior:

- Clip applies only to raster target layers; raster `-erase` is not exposed in
  the rectangle submenu.
- The clipped area is the intersection of the drawn rectangle and
  `raster.grid.bbox`.
- No intersection emits a warning and leaves the raster unchanged.
- Successful clipping updates `grid.samples`, `grid.width`, `grid.height`,
  `grid.bbox`, and `grid.transform`.
- In the browser, `view.preview` is regenerated from the clipped grid. In
  CLI/headless mode, preview caches are omitted.
- `sourceId` and `derivation` remain as provenance.

## Raster Reprojection

Raster reprojection is available through `-proj` and through GUI-only dynamic
display previews. The implementation uses forward mesh rasterization instead of
per-pixel inverse projection:

- Project a grid of source pixel vertices with `getProjTransform2()`.
- Classify mesh cells as valid only when their vertices project and their
  projected edge lengths are not extreme outliers.
- Rasterize each valid mesh cell as two projected triangles.
- Sample source pixels with `resampling=nearest|bilinear`. The default is
  bilinear for image-style rasters; use nearest-neighbor for categorical rasters
  or exact cell values. If raster metadata marks a layer as categorical or
  palette-based, reprojection defaults to nearest.
- Bilinear sampling skips invalid source pixels (uncovered or nodata) and
  renormalizes the remaining corner weights, so nodata is never averaged into a
  real value. Nearest sampling copies a nodata sample through unchanged.
- Interpolated values are rounded only when the destination sample array holds
  integers. Rounding a float array would quantize elevation data to whole units.
- Fill uncovered output pixels with `nodata-color=`. When the option is omitted,
  image rasters default to white, and categorical and continuous rasters use
  `grid.nodata` when available.

Projected output grids include a `coverage` mask. The mask records which output
pixels received source content, independently of the nodata fill color. Later
reprojections check source coverage before copying or interpolating pixels, so a
user-chosen nodata color that also appears in the image is not mistaken for
valid source content.

Disconnected projected mesh components are kept by default if their cells pass
the per-cell validity checks. A component filter remains available as an
internal option (`raster_component_filter` / `rasterComponentFilter`) for
experiments, but it is off by default because valid antimeridian wrapping can
produce disconnected components.

Classic interrupted and polyhedral destination projections use a piecewise
forward-mesh compositor. Source mesh cells are associated with every lobe or
face detected inside the cell and projected through that piece's forward
transform. Each projected piece is restricted by a scanline-rasterized
destination mask and composited directly into the shared output grid. This
avoids adaptive-mesh T-junctions and represents a cut boundary independently
on both sides without allocating a complete output raster per piece. A final
isolated-pixel pass closes numerical one-pixel cracks only when all four
orthogonal neighbors are covered. Piecewise projections without explicit
per-piece transforms continue to use adaptive subdivision as a fallback.

Rectangular tetrahedral projections use the same compositor through a shared
expanded-facet topology contract. A projection supplies spherical source
regions, projected layout pieces, a continuous source-region transform, and a
polygon clip/placement callback. The raster code triangulates those source
regions once and applies every relevant translated or reflected layout copy.

Narukawa 2022 splits each canonical tetrahedral facet into three continuous
spherical sectors before layout folding. Markley and CALM use Lee's continuous
conformal transform on four tetrahedral facets. In both cases, projected
triangles are clipped against straight layout and frame boundaries before
placement. Split facets are represented by translated copies rather than
wrapped triangles. The final rectangular coverage pass fills only the small
numerical gaps left by triangle clipping.

## Raster Blur

`-blur radius=` applies a Gaussian-like blur to projected raster layers. The
implementation uses three passes of separable box blur to approximate a Gaussian
in linear time. The kernel is sized in pixels and corresponds to `2 * sigma`.

`getBlurRadius()` resolves the user's `radius=` into that pixel count. Plain
numbers and `px` strings pass through unchanged; a measure with units (`500m`,
`2km`) is converted to the dataset's coordinate units with
`convertIntervalParam()` and then divided by the size of a pixel, taken from
`grid.bbox` and the grid dimensions. Because the blur is isotropic in pixel
space, a grid with non-square pixels uses the geometric mean of its two
resolutions. A distance therefore needs both a known CRS and a georeferenced
grid, and errors without them; a pixel radius needs neither.

The blur operates on interleaved `grid.samples` one band at a time, so it works
with grayscale, RGB, RGBA, and non-8-bit GeoTIFF sample arrays without changing
the internal raster model. It preserves raster metadata and `grid.coverage`.
When coverage or nodata is present, invalid pixels are excluded from the blur
window and weights are renormalized.

## Raster Contours

`-contours` converts a raster layer into a polyline layer of isolines, using
marching squares over `grid.samples`.

It reads the working store rather than the source pixels, so contours reflect
whatever the layer currently holds. That is the same rule every other command
follows: `-blur` or `-clip` earlier in the pipeline changes what gets contoured.
It also means contours inherit the resolution of the working store, which import
may have decimated (see Import Flow).

Samples are treated as point measurements at pixel centers, so a `W x H` grid
contours over a lattice of `W x H` values and `(W-1) x (H-1)` cells. Contour
vertices therefore stop half a pixel inside `grid.bbox`, matching gdal_contour.
Only north-up grids are supported, the same restriction as clipping and
reprojection.

Implementation notes:

- Cells are visited once, and each is marched for only the levels that fall
  inside its own value range, found by binary search on the sorted level list.
  Scanning the whole grid once per level would cost levels times more.
- Cells with an invalid corner are skipped, using the shared
  `rasterPixelIsValid` mask, so contours stop at nodata and at the edge of a
  projected coverage area rather than crossing them. NaN samples are skipped
  too, since some float rasters use NaN as nodata and it does not compare equal
  to `grid.nodata`.
- Ambiguous saddle cells are resolved with the average of the four corners.
- Segments are stitched into long polylines by edge id, not by comparing
  coordinates. Each crossing is identified by the lattice edge it lies on, which
  neighboring cells number identically, so joins are exact rather than
  tolerance-based. This relies on the case table being consistently oriented:
  every crossing is the exit of one cell and the entry of the next.
- Open contours are traced before closed ones, so a line running between two
  grid boundaries is not entered part way along and split in two.

Traced lines are then smoothed through `cmd.smooth` with `no_corners` and
`no_prefilter` set: the staircase is an artifact, so there are no real corners
to pin and no sub-pixel detail worth prefiltering. `no-smoothing` skips the step.

Two details matter here. Smoothing runs on the standalone contour dataset
*before* it is merged into the target, because `-smooth` rewrites every arc in
the ArcCollection it is given; merging first would smooth any vector layer
already sharing the target dataset. And the interval is returned by
`getContourSmoothingDistance()` in the units `-smooth` expects from a plain
`distance=` number, which is meters when the CRS is known (including for
lat-long datasets, where a pixel's ground size is derived with a cosine
correction at the raster's middle latitude) and raw coordinate units when it is
not. The interval is a quarter of a pixel; see the constant's comment for the
measurements behind that choice.

Smoothing moves lines, and contour lines run close together wherever the ground
is steep -- much closer than a pixel on a coarse grid -- so two further steps
keep it from pulling one line over its neighbor. Both were added after a
one-pixel interval turned an 11x11 elevation model into a tangle of 40 crossings
(and a 1200x1053 DEM into 346).

- While the lines are going to be smoothed, the tracer holds each vertex
  `CORNER_CLEARANCE` of a cell clear of the grid point at either end of the edge
  it crosses. A sample whose value is exactly the contour level -- routine, with
  whole-unit elevations and round levels -- otherwise puts the crossing exactly
  on that grid point, and every cell around the point does the same, so two
  branches of the contour meet there. Touching does no harm in the traced line,
  but smoothing turns each touch into a crossing, and no interval is small enough
  to prevent it. `no-smoothing` traces without the clearance, so the raw geometry
  is still the exact marching-squares result.
- Afterwards `repairCrossedArcs()` looks for crossings and puts the lines
  involved back the way they were traced, repeating until none are left. Contour
  lines never cross, so any crossing is smoothing overreaching, and the traced
  geometry is a floor the repair can always fall back to. This costs a
  `findSegmentIntersections()` pass, about 2% of what the smoothing itself costs,
  and on the DEMs measured it leaves a handful of lines unsmoothed at most (2 of
  12,697 on the 1200x1053 file).

### Closed contour bands

`-contours closed` reuses the isoline trace instead of running a separate
three-state isoband marcher. Open paths that reach the outside sample-center
lattice are extended through the half-pixel margin to `grid.bbox`. The paths
are then smoothed and repaired by the same code as line contours unless
`no-smoothing` is set.

The remaining closure linework is fixed. A cell-domain mask applies the same
validity rule as the isoline collector: a `(W-1) x (H-1)` lattice cell is active
only when all four corner pixels pass the shared nodata/coverage mask and the
selected samples are not NaN. Tracing the union boundary of these active cells
creates the outer bbox frame and any internal nodata boundaries. This means the
closed output deliberately preserves the isoline tracer's conservative setback
around invalid samples; it is not a polygonization of invalid pixel footprints.
Neither these boundaries nor the raster corners are smoothed.

The smoothed contour paths and fixed domain boundaries are combined, cut at
intersections and passed to `buildPolygonMosaic()`. Contour paths retain their
level and direction through topology building. Because the marcher directs
every line with the above-level side on its left, the direction in which a
mosaic tile uses a contour arc identifies whether that level is its lower or
upper bound. A raster sample is needed only to classify a disconnected valid
component that no contour line crosses. Tiles outside the active-cell domain
are discarded, and tiles with matching `lower`/`upper` attribute pairs are
dissolved so adjacent bands share topology.

Band intervals are `[lower, upper)`, with the raster maximum included in the
final band. Only contour levels strictly between the valid sample minimum and
maximum become interior breaks. A flat valid raster therefore creates one band
whose bounds are equal, while an all-invalid raster creates an empty polygon
layer.

## Commands And Validation

Most existing commands are vector commands and should reject raster targets
with clear errors. Early raster-aware commands should be limited to:

- Import.
- Layer listing and selection where safe.
- `-info` reporting of raster dimensions, bounds, source, and CRS.
- `-clip bbox=...` for raster clipping.
- `-blur radius=` for projected raster blur.
- `-proj` for raster reprojection, with `nodata-color=` and
  `resampling=nearest|bilinear` support.
- `-contours` for tracing isolines into a new polyline layer, or closed bands
  into a polygon layer.
- SVG export.
- Session snapshot export/import.

Export validation must be updated so raster layers are valid for raster-aware
formats while remaining invalid for vector-only formats. Do not make vector
exporters silently ignore raster layers unless the command explicitly documents
that behavior.

## Pack, Undo, And Snapshots

Pack/unpack and undo logic are raster-aware:

- Pack/unpack raster metadata and `grid.samples` for session snapshots and MSX
  files. Derived preview pixels and scaling stats are omitted.
- Store browser source references and raster temp payload keys for cleanup.
- Capture raster layer changes in undo transactions when `grid` or metadata
  changes.
- Store large raster undo payloads through `gui-undo-payload-store.mjs`.
- Strip `view.preview.pixels` from raster undo payloads and regenerate previews
  from `grid.samples` on undo/redo restore in the GUI.
- Regenerate missing snapshot/MSX previews from `grid.samples` when the GUI
  imports or restores packed session data.
- Avoid duplicating original GeoTIFF bytes in every undo entry.

This keeps the History menu's "restore data stored on-disk" count aligned with
canonical sample payloads instead of counting both samples and derived RGBA
preview caches.

## Implementation Order

Recommended order:

1. Add raster layer predicates, bounds, copy, validation, pack, and info support.
2. Add GeoTIFF binary detection and async import.
3. Decode metadata and selected working bands using `geotiff`.
4. Add browser lazy loading and IndexedDB sample/source temp storage.
5. Add native-CRS GUI rendering.
6. Add grid-based SVG export with JPEG/PNG encoding and `raster-res=`.
7. Add rectangle-based raster clipping and undo/redo support.
8. Add raster reprojection for `-proj` and GUI display previews.
9. Add tests using the local geotiff.js test corpus.
10. Document supported and unsupported raster variants.
