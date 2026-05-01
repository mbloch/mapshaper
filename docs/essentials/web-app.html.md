---
title: The web app
description: A tour of Mapshaper's web interface, including loading data, the console, the right-click menu, snapshots, browser support and running it locally.
---

# The web app

The Mapshaper web app at [mapshaper.org](/) is designed for interactive editing and visual exploration. Its built-in console supports the same editing syntax as the CLI for most workflows once data is loaded.

All processing happens in your browser. Your data stays on your machine, even when you use the public website.

## Loading data

Drag-drop, paste, or use the **Add files** button to import data.

A few less-obvious behaviors:

- **Drop a `.zip` containing a Shapefile bundle** &mdash; Mapshaper unzips it on the fly and pulls out the sidecars. (Same goes for `.gz` for single-file formats and `.kmz` for KML.)
- **Paste a URL** anywhere on the page to import the file at that address.
- **Query-string preload** &mdash; `https://mapshaper.org/?files=URL1,URL2` imports a comma-separated list of URLs. All files need to be served from a host that allows cross-origin requests. Append `&q` to skip the import dialog and open the files immediately.
- **With advanced options** is a freeform text field. Anything you'd pass after `-i` on the CLI works here, including `encoding=`, `string-fields=`, `csv-fields=`, `csv-filter=`, `combine-files`, `name=` and so on.
- **Multiple files do not auto-combine.** Selecting several files at once imports them as independent layers. To get a shared topology (so common boundaries simplify identically), tick **with advanced options** and add `combine-files`.

### Tips for importing Shapefiles

- Drag-drop or select the `.shp`, `.dbf` and `.prj` files together. Without `.dbf` you'll have geometry but no attributes; without `.prj`, projection-dependent commands won't know what to do.
- If you see a warning about an unknown text encoding, re-import using the **with advanced options** checkbox and set `encoding=` (for example, `encoding=big5` for Big-5).

## The console

The Console (top-right of the header, or **space bar** to toggle) is the most powerful part of the UI. Most [CLI](/docs/reference.html.md) commands are available here, except file-loading commands like `-i`, `-include` and `-require`, which are disabled in the browser console.

### Keyboard

- **Space** &mdash; open or close the console (only when you're not typing in another text field).
- **Esc** &mdash; close the console, or close any open panel.
- **Up / Down** &mdash; cycle through previous commands. The history persists across page reloads.
- **Backslash `\` at end of line** &mdash; continue a long command on the next line. The Enter key adds the wrap; another **Enter** runs the full command.

### Syntax

- The leading `-` is optional in the console: `clip places` works the same as `-clip places`.
- Commands run on the **currently-selected layer** by default. Switch layers in the layer panel before issuing a command, or pass `target=` to be explicit (`target=*` runs against every layer).

### Magic words at the prompt

These are recognized directly by the console, not by Mapshaper:

- `history` &mdash; print the current session as a single command-line string. Handy for reproducing an interactive workflow as a script.
- `layers` &mdash; print the list of loaded layers.
- `clear` &mdash; clear the console buffer.
- `close` / `exit` / `quit` &mdash; close the console.

### Discovering commands

- `help` lists every available command.
- `help <command>` shows the full options for one command, e.g. `help dissolve`.
- The [command reference](/docs/reference.html.md) is the same content with a search box.

## The map

### Right-click menu

The right-click menu adapts to what's under the cursor:

- **Copy lon, lat** &mdash; copy the WGS84 coordinates of the click point to the clipboard.
- **Copy x, y** &mdash; copy the projected coordinates of the click point.
- **Copy as GeoJSON** &mdash; copy the selected feature(s) to the clipboard as GeoJSON. Useful for snipping out one polygon for use elsewhere.
- **Delete vertex** / **delete point** / **delete feature** &mdash; available in the corresponding edit modes.

### Layer navigation

- **Left / Right arrows** (when not typing) &mdash; cycle through the loaded layers.

## Display options

The **Display** button at the top right opens the display options panel.

- **Detect line intersections** &mdash; highlights self-intersections in red as you simplify or edit. The quickest way to spot simplification damage. The setting is remembered between sessions.

## Snapshots and session history

The ribbon icon in the layer panel opens the snapshot menu. Snapshots save the current state of a session so you can return to it. They also record the **session history** that produced the snapshot, so when you re-open one the full history is available too.

- **Create a snapshot** &mdash; saves to in-browser storage. These are session-scoped and intended to be temporary; Mapshaper tries to clean them up when the tab closes or the page reloads. For anything you want to keep, **Save snapshot to file** writes a `.msx` file you can re-open later.
- **View session history** &mdash; a shortcut for typing `history` in the console: prints the full sequence of commands that produced the current state.

See the [Mapshaper snapshot format page](/docs/formats/snapshot.html.md) for more on what a `.msx` file contains and how to use it from the CLI.

## Running the web UI locally

`mapshaper-gui` (installed alongside `mapshaper` when you `npm install -g mapshaper`) starts a local Node web server and opens the web UI at `http://localhost:5555`. Use `--port` to pick a different port.

You can pre-load files by listing them on the command line, which skips the import dialog:

```bash
mapshaper-gui states.shp rivers.shp
```

## Browser support

When importing very large files (hundreds of megabytes), the web app may run out of memory and crash. Firefox used to be better than Chrome at handling large files, but Chrome seems to have improved recently. If the web app crashes, try the [`mapshaper-xl` command-line tool](/docs/essentials/command-line.html.md), which can allocate a large amount of memory.

## Privacy

The Mapshaper web app runs entirely in your browser. No file content is uploaded to any server. The only network traffic is for static assets (the app itself), basemap tiles when you've enabled a basemap, and analytics for `mapshaper.org` page loads. See the [privacy policy](/privacy.html) for details.
