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

- General cell/value editing beyond rectangle clipping.
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
- `interpretation`: semantic raster type, currently `image` or `categorical`.
  Import defaults to `image`; `-i raster-type=categorical` marks class/code
  rasters so later reprojection defaults to nearest-neighbor resampling.
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

`raster-type=image|categorical` records whether the raster should be treated as
a display image or a categorical class/code raster. The default is `image`,
matching Mapshaper's current raster scope. `categorical` affects later command
defaults such as `-proj` resampling; it does not change the pixel storage type.

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

## SVG Export

SVG export embeds raster images using SVG `<image>` elements with data URIs.

Current behavior:

- Render an export-specific RGBA image from `raster.grid`, not from
  `raster.view.preview`.
- Crop the rendered image to the SVG frame extent.
- Use `raster-res=` to set raster pixels per SVG pixel; the default is `1`.
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

The SVG element should use a matching data URI, for example
`data:image/jpeg;base64,...` or `data:image/png;base64,...`.

Browser export can use Canvas encoders. CLI export needs Node-capable JPEG and
PNG encoding dependencies or a shared pure-JS encoder.

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
- Fill uncovered output pixels with `grid.nodata` or `nodata-color=`.

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

## Commands And Validation

Most existing commands are vector commands and should reject raster targets
with clear errors. Early raster-aware commands should be limited to:

- Import.
- Layer listing and selection where safe.
- `-info` reporting of raster dimensions, bounds, source, and CRS.
- `-clip bbox=...` for raster clipping.
- `-proj` for raster reprojection, with `nodata-color=` and
  `resampling=nearest|bilinear` support.
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
