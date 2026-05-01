---
title: Mapshaper snapshot (.msx)
description: A single-file binary snapshot of a Mapshaper session, used to save work in progress and share reproducible projects.
---

# Mapshaper snapshot (.msx)

A Mapshaper snapshot captures the current state of a session &mdash; arcs, layers, attributes, CRS metadata, topology and (when written from the web app) the command history that produced it &mdash; as a single binary file. Snapshots are Mapshaper-specific and not intended for interchange with other GIS tools; for that, use [Shapefile](/docs/formats/shapefile.html), [GeoPackage](/docs/formats/geopackage.html), [FlatGeobuf](/docs/formats/flatgeobuf.html) or [GeoJSON](/docs/formats/geojson.html).

**File extension:** `.msx` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** &check;

### When to use a snapshot

- **Saving work-in-progress** for later editing, with topology, layer order and (in the web app) command history intact.
- **Bundling a collection of datasets** into a single compact file that is quicker to re-open than re-running an import pipeline.
- **In the browser, as a quick "save point"** before doing something experimental that might fail or give the wrong result &mdash; restore the snapshot to roll back.

### From the CLI

`-o foo.msx` captures the **entire session** &mdash; every dataset and every layer Mapshaper has loaded, not just the ones currently selected by `-target`. This makes a `.msx` file a faithful "save point" of the working state, regardless of which layers happen to be active.

`-target` controls *visibility and stacking order*, not which layers are written:

- Layers matched by the active `-target` (or the `target=` option on `-o` itself) come back **visible** in the web app, with no further setup.
- They are stacked in the order matched by `-target` &mdash; first targeted on the bottom, last on top &mdash; so the GUI's layer stack matches the draw order you'd get from an SVG export of the same target list.
- Layers that weren't targeted come along **hidden**, parked at the bottom of the layer panel. They're still in the file (so you can pin them visible later), but they don't get in the way of the intended view.
- If you want to drop layers from the snapshot rather than just hide them, run an explicit step like `-filter-layers` or `-target b -drop` before `-o foo.msx`.

### In the web app

The ribbon icon in the layer panel opens the **snapshot menu**. From there you can:

- **Create a snapshot** &mdash; saves to in-browser storage. These are session-scoped and intended to be temporary; Mapshaper tries to clean them up when the tab closes or the page reloads. For anything you want to keep, **Save snapshot to file** writes a `.msx` file you can re-open later.
- **Export** a stored snapshot to a `.msx` file on disk. Persisted `.msx` files survive browser restarts and can be re-imported by drag-drop, the **Add files** button, or the `?files=` URL parameter.
- **Restore** a stored snapshot into the current session.

## External resources

- [msgpack.org](https://msgpack.org/) &mdash; the binary serialization format used inside `.msx` (via the [msgpackr](https://github.com/kriszyp/msgpackr) library).
