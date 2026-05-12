---
title: Raster implementation guide
description: Design notes for adding raster layers to Mapshaper's data model, GUI renderer, and SVG exporter.
---

# Raster Implementation Guide

This document describes the current raster layer implementation. The initial
vertical slice imports GeoTIFF files and georeferenced PNG/JPEG image files,
represents editable raster samples in the layer model, renders a derived preview
in the web UI, preserves source provenance for later operations, supports
rectangle-based clipping, and exports raster previews embedded in SVG output.

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
- A derived RGBA preview for GUI rendering and first-pass SVG export.
- Source provenance in `dataset.info.raster_sources`.
- Browser IndexedDB temp storage for current sample payloads and, separately,
  optional original raster source bytes.
- Native-CRS display only. Raster reprojection and warping are deferred.
- SVG export using an embedded image generated from the preview.
- Rectangle-tool clipping of raster layers.

The first implementation does not attempt to support:

- General cell/value editing beyond rectangle clipping.
- Raster/vector analysis commands.
- Dynamic raster reprojection for basemap display.
- Full-resolution raster resampling during SVG export.
- GUI source-band derivation or styling controls.

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
- `view.preview`: derived RGBA display pixels used by GUI rendering and SVG
  export. Preview pixels can be regenerated from `grid.samples`.
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
- Generate `raster.view.preview` from `grid.samples` using the layer's display
  recipe.
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
- Decode PNG/JPEG pixels into `uint8` RGB or RGBA `grid.samples`, then generate
  `view.preview` with the same raster display recipe used by GeoTIFF import.

World files store the center of the upper-left pixel. Mapshaper converts this to
an upper-left pixel-corner transform before deriving `raster.grid.bbox`, so the
layer bounds describe the outside extent of the raster.

Large rasters still create a bounded preview by default, but the preview is not
the only decoded raster data. The current implementation keeps the selected
working bands as canonical samples in `grid.samples`, and creates the preview as
a display/export cache. The display recipe supports
`scaling=none|minmax|percentile`, normalized `scale-range=0,100` output
intensity, and `percentile-range=2,98` for percentile scaling. The default is
raw/type-range display for 8-bit data and percentile scaling for non-8-bit
integer and floating point data.

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
- Keep preview pixels in memory and in snapshots, but treat them as derived from
  the canonical grid.

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

Dynamic raster reprojection is out of scope. If the user enables a basemap or
display CRS that does not match the raster's native CRS, the first version
should warn or disable raster display for that mode rather than silently drawing
incorrect pixels.

## SVG Export

SVG export should embed raster previews using SVG `<image>` elements with data
URIs.

For the first milestone:

- Export from the preview image, not by reopening the original GeoTIFF.
- Crop/resample the preview to the SVG frame extent.
- Support `1x` and `2x` image export resolution.
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
- `view.preview` is regenerated from the clipped grid.
- `sourceId` and `derivation` remain as provenance.

## Commands And Validation

Most existing commands are vector commands and should reject raster targets
with clear errors. Early raster-aware commands should be limited to:

- Import.
- Layer listing and selection where safe.
- `-info` reporting of raster dimensions, bounds, source, and CRS.
- `-clip bbox=...` for raster clipping.
- SVG export.
- Session snapshot export/import.

Export validation must be updated so raster layers are valid for raster-aware
formats while remaining invalid for vector-only formats. Do not make vector
exporters silently ignore raster layers unless the command explicitly documents
that behavior.

## Pack, Undo, And Snapshots

Pack/unpack and undo logic are raster-aware:

- Pack/unpack raster metadata, `grid.samples`, and preview pixels for session
  snapshots.
- Store browser source references and raster temp payload keys for cleanup.
- Capture raster layer changes in undo transactions when `grid` or metadata
  changes.
- Store large raster undo payloads through `gui-undo-payload-store.mjs`.
- Strip `view.preview.pixels` from raster undo payloads and regenerate previews
  from `grid.samples` on undo/redo restore.
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
6. Add preview-based SVG export with JPEG/PNG encoding.
7. Add rectangle-based raster clipping and undo/redo support.
8. Add tests using the local geotiff.js test corpus.
9. Document supported and unsupported raster variants.
