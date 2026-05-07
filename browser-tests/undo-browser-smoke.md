# Undo Browser Smoke Test

This is the remaining manual smoke test for browser undo. Core console command
undo/redo behavior, command-sequence grouping, keyboard shortcuts, common
GUI-only actions, snapshot restore, Simplify sessions, GUI import behavior, and
storage failure handling are covered by `browser-tests/undo-console.spec.mjs`.

For command implementation guidance, see
`docs/development/undo-redo-implementation.md`.

## Start The GUI

```sh
MAPSHAPER_GUI_NO_OPEN=1 bin/mapshaper-gui -p 5555 test/data/one_point.geojson
```

Open:

```text
http://localhost:5555/?undo=on&undo-test=on
```

The `MAPSHAPER_GUI_NO_OPEN` environment variable keeps browser automation from
opening an extra browser window. The `undo-test` flag exposes
`window.mapshaper.undoTest`.

## Console Workflow

Run these from the browser console while the mapshaper UI is loaded:

```js
const before = window.mapshaper.undoTest.getModelChecksum();
window.mapshaper.undoTest.getState();
```

Open the mapshaper console and run:

```text
each 'foo = "bar"'
```

Then verify:

```js
const changed = window.mapshaper.undoTest.getModelChecksum();
changed.checksum !== before.checksum;
window.mapshaper.undoTest.getState().undo.canUndo === true;
```

Press `Cmd+Z` / `Ctrl+Z`, then verify:

```js
window.mapshaper.undoTest.getModelChecksum().checksum === before.checksum;
window.mapshaper.undoTest.getState().undo.canRedo === true;
```

Press `Cmd+Shift+Z` / `Ctrl+Y`, then verify:

```js
window.mapshaper.undoTest.getModelChecksum().checksum === changed.checksum;
```

## Automated Coverage

The Playwright coverage:

- Starts `bin/mapshaper-gui` with `MAPSHAPER_GUI_NO_OPEN=1`.
- Navigates to `/?undo=on&undo-test=on`.
- Uses `window.mapshaper.undoTest.getModelChecksum()` for model assertions.
- Uses keyboard shortcuts to exercise the existing GUI undo/redo surface.
- Verifies command-sequence grouping and payload deduplication.
- Verifies storage-limit failure behavior and console warning output.

## Remaining Manual Checks

Use a normal headed browser, not just Playwright. The goal is to catch focus,
redraw, perceived latency, and cleanup issues that are hard to see in headless
tests.

### Focus And Shortcuts

- Confirm `Cmd+Z` / `Ctrl+Z` and redo shortcuts work with focus on the map,
  console input, layer menu, History menu, and Simplify controls.
- Confirm shortcuts do not fire while typing text in editable fields unless that
  field has intentionally committed its edit.

### GUI Model Actions

- Import one file into a blank session. Confirm no undo toolbar appears.
- Import a second file. Confirm undo removes the second import and redo restores
  it.
- Rename a layer in the layer menu. Confirm undo restores the original name.
- Delete a layer from the layer context menu. Confirm undo restores the layer,
  active layer, and map display.
- Add an empty layer, add content with an edit or rectangle tool, and step back
  through undo states.

### Simplify And Repair

- Open Simplify, apply simplification, change the percentage, then close the
  tool. Confirm one app undo entry appears after closing and restores the
  pre-simplified state.
- Open Simplify and close it without applying changes. Confirm no undo entry is
  created.
- With intersection detection on, use Repair during Simplify if the data has
  repairable intersections. Confirm Repair is included in the one Simplify undo
  entry after closing the tool.

### Snapshots And Session Boundaries

- Save a snapshot, make an undoable edit, restore the snapshot. Confirm the undo
  toolbar disappears and undo/redo are disabled.
- Import or restore a `.msx` snapshot into an empty session. Confirm it behaves
  as a baseline, not as an undoable edit.

### Redraw And Active Layer

- Confirm redraw/active-layer behavior looks correct after undoing and redoing
  layer creation, layer deletion, GUI import, Simplify, and geometry-heavy
  console commands.
- In particular, check blank-map cases where undo removes the only visible
  layer.

### Storage And Cleanup

- Open with a low storage limit such as
  `?undo=on&undoPayloadMaxBytes=1`, run an undoable command, and confirm the
  Messages panel shows a warning.
- In a normal browser profile, create several undo states, close the tab, and
  reopen the app. Confirm stale restore data is cleaned up on startup.
