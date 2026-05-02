---
title: What's new
description: A curated log of recently added user-visible features in Mapshaper, with links into the rest of the docs.
---

# What's new

This is a curated list of recently added features. For the full list of changes, including bug fixes and internal work, see the [changelog](https://github.com/mbloch/mapshaper/blob/master/CHANGELOG.md) on GitHub.

## May 2026


<div class="whats-new-entry">

**GeoParquet support.** Mapshaper reads and writes GeoParquet (`.parquet`) files.

→ See [GeoParquet](/docs/formats/geoparquet.html).
</div>

## April 2026

<div class="whats-new-entry">

**Messages panel.** Warnings and informational messages are now collected in a messages panel. When new messages are available, an icon with a count appears in the header bar; clicking it opens the panel. This keeps important information accessible without interrupting your session with a modal popup.

</div>

<div class="whats-new-entry">

**Undo/redo buttons.** The web UI now has an undo/redo toolbar. Undo and redo were already supported in the geometry and attribute editing modes; the toolbar makes them more discoverable for users who didn't know the keyboard shortcuts (**⌘Z** / **⌘⇧Z**) existed.

</div>

<div class="whats-new-entry">

**Command files.** A sequence of Mapshaper commands can be written to a `.txt` file with `#` comments and no shell quoting, and run with `-run <file>` (or just `mapshaper commands.txt`). Command files can also be written in a shell-compatible way, if you want to be able to paste the commands into the terminal or add them to a shell script. In a future release, these files will also be runnable in the browser.

```bash
mapshaper build.txt
```

→ See [Command files](/docs/reference.html#command-files) in the reference.
</div>

<div class="whats-new-entry">

**Variable interpolation in commands.** Command files and command lines support `{{VAR}}` placeholders, resolved at run time against environment variables (`{{env.HOME}}`), values set with the new `-vars` and `-defaults` commands, and variables defined dynamically by `-calc`, `-define` and `-each` expressions.

```bash
mapshaper -vars YEAR=2030 PCT=5 -run build.txt
```

→ See [Variable interpolation](/docs/reference.html#variable-interpolation), [`-vars`](/docs/reference.html#-vars) and [`-defaults`](/docs/reference.html#-defaults).
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
