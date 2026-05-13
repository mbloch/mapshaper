---
title: What's new
description: A curated log of recently added user-visible features in Mapshaper, with links into the rest of the docs.
---

# What's new

This is a curated list of recently added features. For the full list of changes, including bug fixes and internal work, see the [changelog](https://github.com/mbloch/mapshaper/blob/master/CHANGELOG.md) on GitHub.

## May 2026

<div class="whats-new-entry">

**Raster layer support.** Mapshaper can now import GeoTIFF rasters, plus PNG and JPEG images with world-file georeferencing, preview them in the web UI, clip them with the rectangle tool, and export as images embedded in SVG. Mapshaper's default options for raster importing and projecting rasters should work well for typical image layers. When importing rasters containing data, you may need to set additional options, which are documented in the command reference.

→ See [`-i`](/docs/reference.html#-i-input).
</div>

<div class="whats-new-entry">

**Point icons with `-style`.** The `-style` command has new `icon=`, `icon-size=` and `icon-color=` options for drawing simple point icons, including circles, squares, rings and stars. Icons can be combined with labels on the same point layer.

→ See [`-style`](/docs/reference.html#-style).
</div>

<div class="whats-new-entry">

**Undo/redo for web UI commands.** The web UI can now save temporary restore data while you work, so console commands and other data edits can be undone and redone from a pop-up toolbar. **This feature is very new and may have bugs, please report any problems that you encounter**. Turn on undo from the new History menu.

</div>

<div class="whats-new-entry">

**More grid options.** The `-grid` command can now create rhombus and triangle grids. There are new `cols=`, `rows=` and `cells=` options for controlling the size of the grid cells, as alternatives to the original `interval=` option. A new `cell-scale=` option lets you scale each cell within the grid (creating gaps or overlaps between adjacent cells).

→ See [`-grid`](/docs/reference.html#-grid).
</div>

<div class="whats-new-entry">

**GeoParquet support.** Mapshaper reads and writes GeoParquet (`.parquet`) files. To use ZSTD compression (instead of the default Snappy compression), add `compression=zstd` to the output options.

→ See [GeoParquet](/docs/formats/geoparquet.html).
</div>

## April 2026

<div class="whats-new-entry">

**Messages panel.** Warnings and informational messages are now collected in a messages panel. When new messages are available, an icon with a count appears in the header bar; clicking it opens the panel. This keeps important information accessible without interrupting your session with a modal popup.

</div>

<div class="whats-new-entry">

**Command files.** A sequence of Mapshaper commands can be written to a `.txt` file with `#` comments and no shell quoting, and run with `-run <file>` (or just `mapshaper commands.txt`). Command files can also be written in a shell-compatible way, if you want to be able to paste the commands into the terminal or add them to a shell script. In a future release, these files will also be runnable in the browser.

```bash
mapshaper build.txt
```

→ See [Command files](/docs/essentials/command-line.html#command-files) in the reference.
</div>

<div class="whats-new-entry">

**Variable interpolation in commands.** Command files and command lines support `{{VAR}}` placeholders, resolved at run time against environment variables (`{{env.HOME}}`), values set with the new `-vars` and `-defaults` commands, and variables defined dynamically by `-calc`, `-define` and `-each` expressions.

```bash
mapshaper -vars YEAR=2030 PCT=5 -run build.txt
```

→ See [Variable interpolation](/docs/essentials/command-line.html#variable-interpolation), [`-vars`](/docs/reference.html#-vars) and [`-defaults`](/docs/reference.html#-defaults).
</div>

<div class="whats-new-entry">

**Farewell to dissolve2.** The `-dissolve` command now uses Mapshaper's most robust dissolve function, which can handle overlaps, gaps and other topology errors. The legacy faster algorithm is still available as `-dissolve no-repair`. (The old `-dissolve2` is just an alias for `-dissolve`.)

→ See [`-dissolve`](/docs/reference.html#-dissolve).
</div>

<div class="whats-new-entry">

**FlatGeobuf and GeoPackage support.** Mapshaper reads and writes FlatGeobuf (`.fgb`) and GeoPackage (`.gpkg`) files.

→ See [FlatGeobuf](/docs/formats/flatgeobuf.html), [GeoPackage](/docs/formats/geopackage.html) and [`-i layers=`](/docs/reference.html#-i-input).
</div>

<div class="whats-new-entry">

**SVG import.** SVG files exported by Mapshaper can be re-imported &mdash; useful for making stylistic edits.

→ See [SVG](/docs/formats/svg.html).
</div>
