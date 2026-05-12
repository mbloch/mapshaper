---
title: Undo/Redo implementation guide
description: Notes for wiring Mapshaper commands into the experimental web UI undo/redo system.
---

# Undo/Redo Implementation Guide

This guide is for contributors who are adding or changing commands that mutate
Mapshaper data. It explains how to make those mutations observable to the
experimental web UI undo/redo system.

Undo for console commands is state-based. A command records granular before
states for objects it is about to mutate, then the GUI stores those before
states after the command succeeds. Redo states are captured lazily if the user
actually clicks Undo. The system does not store inverse command strings or
closures. Some GUI tools use pending state-based transactions that are committed
when the tool or action completes. Interactive editing modes still use the older
operation/closure-based undo path while the tool is active, then collapse the
completed edit session into one app-level undo entry.

## Basic Rules

- Capture before mutating, then mark changed after mutating.
- Use the narrowest undo unit that fully describes the mutation.
- Do not clone whole datasets when metadata, fields, records, order, or
  simplification data are enough.
- Leave command logic in-place when possible. The undo hooks are no-ops when no
  GUI undo transaction is active, so normal CLI runs should not pay meaningful
  overhead.
- A submitted console command sequence is one undo history entry. If one object
  is captured multiple times within the same sequence, the transaction keeps the
  first before-state for that object/unit.
- Redo payloads are not stored until the user invokes Undo. This keeps disk use
  and post-command storage time lower for the common case where undo is never
  used.
- Only successful console commands are added to undo history. Failed commands
  can still update the model, but their partial state is not currently
  undoable.
- Console command undo entries are linked to session command history. Undo marks
  the command's replay-history entries inactive; redo marks them active again.
  If the user runs a new command after undoing, inactive future commands are
  discarded from replayable history.
- GUI-only model changes should follow the same granularity rules as commands.
  If a GUI action is a user-visible model mutation, it should usually create an
  undo entry unless it is establishing a new session baseline.

## Hook Pattern

Generic hooks are exported from `src/undo/mapshaper-undo-tracking.mjs`:

```js
import {
  markLayerChanged,
  noteLayerWillChange
} from '../undo/mapshaper-undo-tracking';
```

`DataTable` methods such as `captureFieldsBefore()` and
`markFieldsChanged()` are available directly on table instances, so table-only
changes often do not need imports.

Most command code should follow this shape:

```js
noteThingWillChange(thing, {operation: 'command-name'});
// mutate thing in place
markThingChanged(thing, {operation: 'command-name'});
```

For `DataTable` instances, prefer the convenience methods on the table:

```js
table.captureFieldsBefore(['name'], {operation: 'my-command'});
records.forEach(function(rec) {
  rec.name = transform(rec.name);
});
table.markFieldsChanged(['name'], {operation: 'my-command'});
```

The `operation` detail is mainly diagnostic, but it makes test failures and
future debugging much easier to interpret.

## Choosing Granularity

Use the smallest unit that restores the command correctly.

| Mutation | Preferred capture | Changed marker |
| --- | --- | --- |
| One or more records, same schema | `table.captureRecordsBefore(ids, detail)` | `table.markRecordsChanged(ids, detail)` |
| One or more existing fields | `table.captureFieldsBefore(fields, detail)` | `table.markFieldsChanged(fields, detail)` |
| Add, delete, or rename fields | `table.captureSchemaBefore(detail)` | `table.markSchemaChanged(detail)` |
| Whole table replacement | `table.captureTableBefore(detail)` | `table.markChanged(detail)` |
| Table row order only | `noteTableOrderWillChange(table, ids, detail)` | `markTableOrderChanged(table, ids, detail)` |
| Layer shape/data replacement | `noteLayerWillChange(layer, detail)` | `markLayerChanged(layer, detail)` |
| Layer name or geometry type only | `noteLayerMetadataWillChange(layer, detail)` | `markLayerMetadataChanged(layer, detail)` |
| Layer shape order only | `noteLayerOrderWillChange(layer, ids, detail)` | `markLayerOrderChanged(layer, ids, detail)` |
| Full `ArcCollection` coordinate/topology change | `noteArcsWillChange(arcs, detail)` | `markArcsChanged(arcs, detail)` |
| Simplification thresholds only (`zz`, `zlimit`) | `noteArcsSimplificationWillChange(arcs, detail)` | `markArcsSimplificationChanged(arcs, detail)` |
| Dataset layer list, arcs reference, or broad structure | `noteDatasetWillChange(dataset, detail)` | `markDatasetChanged(dataset, detail)` |
| Dataset `info` metadata only | `noteDatasetInfoWillChange(dataset, detail)` | `markDatasetInfoChanged(dataset, detail)` |
| Catalog dataset/default-target list | `noteCatalogWillChange(catalog, detail)` | `markCatalogChanged(catalog, detail)` |

If a command mutates more than one object, capture each object before its first
mutation. For example, a topology command may need an arcs unit plus layer units
for path IDs that are rewritten.

## Common Recipes

### Existing Field Updates

Use field-level capture when the set of fields is known.

```js
var fields = ['fill', 'stroke'];
table.captureFieldsBefore(fields, {operation: 'style'});
table.getRecords().forEach(function(rec) {
  rec.fill = 'red';
  rec.stroke = 'blue';
});
table.markFieldsChanged(fields, {operation: 'style'});
```

### New Fields

Use schema capture when fields may be added or removed. If you pass `field` or
`fields`, the transaction also captures those column values for redo.

```js
table.captureSchemaBefore({operation: 'classify', field: outputField});
records.forEach(function(rec, i) {
  rec[outputField] = classify(i);
});
table.markSchemaChanged({operation: 'classify', field: outputField});
```

When a helper can update either an existing field or a new field, branch on
`table.fieldExists(fieldName)`.

### Field Renames And Filtering

Field renaming/filtering changes both schema and values. Capture schema first,
then capture the affected fields with `schema_transform: true` so redo captures
the transformed field names.

```js
var fields = table.getFields();
var detail = {operation: 'rename-fields'};
var columnDetail = Object.assign({schema_transform: true}, detail);

table.captureSchemaBefore(detail);
table.captureFieldsBefore(fields, columnDetail);
// replace records with renamed/filtered records
table.markFieldsChanged(fields, columnDetail);
table.markSchemaChanged(detail);
```

### Sorting

Do not capture full tables or shape arrays when only order changes. Capture a
permutation.

```js
var ids = utils.getSortedIds(values, ascending);
var undoIds = invertIds(ids);

noteLayerOrderWillChange(lyr, undoIds, {operation: 'sort'});
utils.reorderArray(lyr.shapes, ids);
markLayerOrderChanged(lyr, ids, {operation: 'sort'});

noteTableOrderWillChange(lyr.data, undoIds, {operation: 'sort'});
utils.reorderArray(lyr.data.getRecords(), ids);
markTableOrderChanged(lyr.data, ids, {operation: 'sort'});
```

### Layer Metadata

Use metadata capture for changes like `rename-layers`. Do not capture shapes or
data for name-only changes.

```js
noteLayerMetadataWillChange(lyr, {operation: 'rename-layers'});
lyr.name = name;
markLayerMetadataChanged(lyr, {operation: 'rename-layers'});
```

### Simplification

Simplification generally changes `zz` data and retained interval, not `xx`,
`yy`, or `nn`. Prefer simplification capture unless the command also changes
arc topology or coordinates.

```js
noteArcsSimplificationWillChange(arcs, {operation: 'simplify'});
noteDatasetInfoWillChange(dataset, {operation: 'simplify'});
// compute thresholds and update dataset.info
markArcsSimplificationChanged(arcs, {operation: 'simplify'});
markDatasetInfoChanged(dataset, {operation: 'simplify'});
```

The GUI Simplify tool is session-based. Opening the tool starts a pending
transaction that captures `arcs-simplification` and `dataset-info`, but it does
not add a visible undo entry. Slider changes, method application, and
intersection repair are treated as part of the same Simplify session. When the
tool closes, the GUI stores one app-level undo entry only if simplification
state changed. Opening and closing the tool without changes should not affect
undo history.

### Layer Or Dataset Replacement

Use layer capture when a command replaces `lyr.shapes`, `lyr.data`, or
`lyr.geometry_type`. Use dataset capture when it replaces `dataset.layers`,
`dataset.arcs`, or other broad dataset structure.

```js
noteLayerWillChange(lyr, {operation: 'filter', unit: 'shapes-data'});
lyr.shapes = filteredShapes;
lyr.data = filteredRecords ? new DataTable(filteredRecords) : null;
markLayerChanged(lyr, {operation: 'filter', unit: 'shapes-data'});
```

```js
noteDatasetWillChange(dataset, {operation: 'clip', unit: 'arcs'});
dataset.arcs = mergedDataset.arcs;
markDatasetChanged(dataset, {operation: 'clip', unit: 'arcs'});
```

## GUI Action Rules

Not every undoable change comes from a console command. GUI controls that mutate
the model should either run inside a transaction or capture directly on a
transaction, then use `createStoredUndoHistory(gui).addTransaction()` to store a
state-based app undo entry.

Current GUI conventions:

- **Layer menu delete**: catalog/dataset membership change; undo restores the
  previous catalog state.
- **Layer menu rename**: metadata-only change; undo captures
  `layer-metadata`, not shapes or attributes.
- **Add empty layer**: catalog-level change; undo removes the newly added empty
  dataset/layer.
- **Subsequent GUI imports**: catalog-level change; undo removes imported
  datasets/layers as one import-group entry. The initial GUI import is not
  undoable because it establishes the session baseline.
- **Simplify tool**: pending session entry; undo is committed only when the tool
  closes and simplification state changed.
- **Snapshot restore**: not undoable. Restoring a snapshot replaces the current
  session baseline and clears app undo/redo history.

When adding a new GUI action, decide whether it is a baseline operation or a
model edit. Baseline operations should clear or leave undo history empty.
User-visible edits should create a granular undo entry.

### Session Baselines

The following actions establish or replace a session baseline and should not be
ordinary app undo entries:

- initial import into an empty GUI session,
- URL/preload import at startup,
- full `.msx` session restore into an empty model,
- restoring a saved snapshot.

Subsequent imports into an existing session are different: they append data to
an active project and are undoable as one catalog-level entry.

## Storage Notes

The GUI stores large undo payloads outside the in-memory history entry using
`gui-undo-unit-store.mjs` and `gui-undo-payload-store.mjs`.

Undo payloads are stored when the history entry is created. Redo payloads are
captured and stored lazily on the first Undo. If the per-session payload limit
would be exceeded while saving a new state, the undo history evicts complete
oldest entries, deletes their payloads, and posts a warning to the Messages
panel before retrying. The default per-session limit is 1 GB and the default
per-payload limit is 512 MB. The system still rejects a state if one of its
individual payloads exceeds the per-payload limit, or if the state cannot fit
after all evictable entries are removed.

Payload-backed unit data currently includes:

- `table.records`
- `table-records.records`
- `table-fields.columns`
- `table-schema.fields`
- `arcs` typed arrays and `zlimit`
- `arcs-simplification.zz`
- `layer.shapes`
- `layer.raster`

Avoid adding live objects with methods or browser-only handles to payload-backed
fields. IndexedDB uses structured cloning, so payloads should be plain objects,
arrays, typed arrays, strings, numbers, booleans, or null. Complex references
such as `DataTable`, `ArcCollection`, CRS objects, catalog datasets, and layer
data references should stay in unit metadata unless they are explicitly
serialized.

Raster layer payloads are packed specially. Undo stores canonical
`raster.grid.samples` and raster metadata, but strips derived
`raster.view.preview.pixels` before writing the payload. On undo/redo restore,
the preview is regenerated from `grid.samples` and the view recipe. This avoids
counting both sample pixels and an RGBA preview cache in the History menu's
"restore data stored on-disk" total.

## Restore Flags

`getUndoRestoreFlags()` in `gui-undo-unit-store.mjs` derives GUI invalidation
flags from undo unit types. If you add a new unit type, update this function so
undo/redo redraws the right parts of the UI.

Current conventions:

- `arcs`: set `arc_count`.
- `arcs-simplification`: set `simplify`.
- table units: set `same_table = false`.
- `catalog` and `dataset`: set `select` and `arc_count`.
- `dataset-info`: set `info`.
- layer units: set `select`.

## Session Command History

The console `history` command, snapshots, and runtime context expose the active
replay sequence only. This means command history should reproduce the current
map state, not every command the user has ever typed in the session.

`gui-session-history.mjs` keeps command entries with internal IDs and active
flags. `gui-console.mjs` records the IDs for commands that create undo entries
and toggles those IDs during undo/redo. Inactive entries are retained only while
redo is possible. When a new command is submitted after undoing, inactive tail
entries are discarded, matching the undo stack branch behavior.

## Developer Query Flags

These URL query flags are intended for development, debugging, and browser test
fixtures. They are not part of the public user documentation.

| Flag | Effect |
| --- | --- |
| `undo=on` | Forces app command undo on for the session. The History menu shows `App undo: On (URL)` and disables the toggle. |
| `undo=commands` | Enables command undo and the undo test API without implying broader UI defaults. |
| `undo=test` | Enables the undo test API. Use with other test setup as needed. |
| `undo-test=on` | Enables `window.mapshaper.undoTest` for Playwright and manual browser debugging. |
| `undoStorageMaxBytes=<bytes>` | Overrides the total per-session undo payload storage limit. |
| `undoPayloadMaxBytes=<bytes>` | Overrides the maximum size of an individual undo payload. Useful for failure-path tests. |
| `command-timing=on` | Logs command execution timing to the browser developer console. |
| `undo-timing=on` | Also enables command timing logs, with emphasis on redo-state capture and payload storage overhead. |

Examples:

```text
http://localhost/?undo=on
http://localhost/?undo=on&command-timing=on
http://localhost/?undo=on&undoPayloadMaxBytes=1
```

When adding a new query flag for undo development, keep the parser local to the
feature that uses it and update this table. Prefer explicit `=on` flags for
booleans and byte values for storage limits.

## Testing A New Command

Add focused tests at the level where the risk lives.

### Transaction Unit Tests

Use `test/undo-transaction-test.mjs` when adding a new granularity or changing
restore behavior. Assert the captured unit type and that `restore()` returns the
object to its previous state.

Good transaction tests also assert what was not captured. For example, a
metadata-only change should produce `layer-metadata`, not `layer`.

### Payload Store Tests

Use `test/gui-undo-unit-store-test.mjs` when changing which fields are stored as
payloads or how payloads are packed. Check that bulky fields are stripped from
the in-memory unit and restored after hydration.

Use `test/gui-undo-payload-store-test.mjs` for storage limits, cleanup, and
lifecycle behavior.

### Browser Command Tests

Add command coverage to `browser-tests/undo-console.spec.mjs` when a command is
expected to work through the web console.

For a normal editing command, add a case to `COMMAND_CASES`:

```js
{
  name: 'my command',
  command: 'my-command option=value',
  fixture: POLYGON_FIXTURE
}
```

The shared test verifies:

- the model checksum changes after the command,
- undo restores the previous checksum,
- redo restores the changed checksum.

Use `payloadTypes` to assert expected granular payloads:

```js
{
  name: 'field-only command',
  command: 'my-field-command',
  payloadTypes: ['table-fields'],
  noPayloadTypes: ['table']
}
```

Use a dedicated Playwright test for behavior that does not fit the generic
matrix, such as:

- command sequences being one undo entry,
- keyboard shortcut behavior,
- storage-limit failures,
- visible console warning output,
- GUI-only actions such as layer-menu delete/rename, empty-layer creation,
  Simplify tool sessions, snapshot restore, and subsequent GUI imports.

Run browser tests manually with:

```sh
npm run test:browser -- browser-tests/undo-console.spec.mjs
```

Do not add Playwright tests to `npm test`.

### Manual Smoke Testing

`browser-tests/undo-browser-smoke.md` tracks the remaining headed-browser checks. Use it
when changing focus behavior, redraw behavior, active-layer restoration, or
temporary storage cleanup.

### Performance Testing

Use `scripts/undo-performance-runner.mjs` when adding hooks to commands that may
capture large tables, layers, or arcs. See
`docs/development/undo-performance-review.md` for runner usage and baseline
results.

## Checklist For Command Authors

- Identify every object the command mutates in place.
- Capture each object before its first mutation.
- Mark each object after mutation.
- Prefer record, field, schema, order, metadata, simplification, or info units
  over whole table/layer/dataset/arcs units.
- Add or update transaction tests for new granularity.
- Add a browser command case for console-visible editing commands.
- Include `payloadTypes` or `noPayloadTypes` assertions when granularity matters.
- Run focused unit tests plus `npm run test:browser -- browser-tests/undo-console.spec.mjs`.
- Run `npm test` before committing.

## Checklist For GUI Action Authors

- Decide whether the action is a model edit or a new baseline.
- For model edits, start a transaction before the first mutation.
- Capture the narrowest unit: catalog for dataset/layer membership,
  `layer-metadata` for name/type-only changes, `arcs-simplification` for
  threshold-only changes.
- Commit one stored undo entry for a completed user action or tool session.
- Do not show an undo entry for opening a tool or panel if no model change was
  applied.
- Clear app undo history when replacing the session baseline, such as snapshot
  restore.
- Add a focused browser regression for the GUI workflow.
