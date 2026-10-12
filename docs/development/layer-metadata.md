# Layer Metadata (deferred)

Notes from a design discussion (October 2026). Implementation is deferred:
there is no workable plan yet for keeping metadata in step with the layer.

## Why it comes up

- The color scheme panel needs to know which scheme produced a layer's fills
  (to show the strip and reopen the editor).
- Map keys need class breaks. Users will expect a classified layer to know
  its classes. Today `-classify key-style=...` can draw a key only in the
  same run that computes the breaks; nothing keeps them afterwards.
- Data-driven symbol layers (radius proportional to a field, arrows by
  direction and length) will need their rules and scale stops for the same
  reasons.

## What exists now

- The scheme record is a GUI-only `WeakMap` keyed by layer object
  (`setLayerScheme` / `getLayerScheme` in `gui-color-scheme-model.mjs`).
- It is checked against the data whenever it is read
  (`schemeMatchesLayer`): the field must exist and every fill must be one of
  the scheme's colors, or for continuous ramps the fill column must hash to
  the value stored when the scheme was applied.
- Undo and redo of a panel session restore it through the panel's own hooks.
- It is not saved in snapshots or `.msx` files. `exportLayer` in
  `src/pack/mapshaper-pack.mjs` writes a fixed list of layer properties, and
  `getGuiState()` in `gui-session-snapshot-control.mjs` returns `null`.
- It survives commands that edit a layer in place (`-points`, `-filter`,
  `-proj`), and is lost when a command returns a new layer object, which
  `replaceLayers()` swaps in without copying anything (`-dissolve`, `-lines`,
  `-mosaic`, any `no-replace` output).
- General undo (`captureLayerBefore` / `restoreLayer`) covers `name`,
  `geometry_type`, `raster_type`, `raster`, `shapes` and `data` only.

## Known gaps in the current check

- Data edited without touching the fills (values changed, features
  filtered) still passes, so stored breaks can be stale, quantile breaks
  especially.
- A feature hand-recolored to another class's color still passes.
- Valid schemes are dropped by snapshot restore and by most layer-replacing
  commands.
- Cost: about 2.5 ms per 200,000 features in Node, linear in feature count.
  The style panels used to repeat the check (and their other full-layer
  scans) on every hover; they now refresh only when the selection changes
  (`gui-selection-change.mjs`).

## Challenges

1. **Rules differ by kind of metadata.** The same operation can keep,
   invalidate or need to rewrite an entry depending on its kind: `-filter`
   keeps equal-interval breaks valid but not quantile ones, `-rename-fields`
   should rewrite a field reference, `-proj` matters to a size in map units
   but not to a classification. A single keep/drop rule per command is not
   enough.
2. **Commands don't describe their effects.** The undo hooks carry some
   field- and record-level detail, but they exist for undo capture, mostly
   do nothing outside a GUI transaction, and their coverage of every
   mutation path (e.g. `-each` expressions) has not been audited. A gap
   gives silently stale metadata.
3. **Layer identity is lost often.** Most commands return new layer
   objects. The dispatcher's `replaceLayers()` call is one central place to
   hand metadata over, but many-to-one and one-to-many commands
   (`-merge-layers`, `-split`, `-union`, `-clip` with a source layer) have no
   obvious answer.
4. **Hidden state.** Styles live in attributes, where users can see and edit
   them. Metadata would need to be visible (`-info`, layer panel), settable
   and clearable from the CLI, and its loss reported.
5. **Replay.** Metadata used outside the GUI must be written by commands,
   or replaying a session's history gives a different result. Panel-only
   state (pins, vibrance, preset range) can stay GUI-side.
6. **Serialization.** `.msx` would need versioned entries that tolerate
   unknown kinds; some export formats could carry metadata.
7. **Testing.** Kinds times commands.

## Ideas considered

- **Validate on read rather than sync on write.** Each entry records what
  it depends on (geometry type, fields, feature count, a revision or content
  fingerprint) and is checked when read; a mismatch marks it stale. Commands
  need to know nothing about metadata, and a wrong call only loses the
  entry, as now.
- **Per-kind handlers, added later** where dropping is a nuisance (e.g.
  `onRenameFields`, `onReplaceLayer`), called from a few central places.
- **Per-layer command history as metadata.** Inferring whether breaks still
  apply from the commands since `-classify` needs a table of every command's
  effects, and is defeated by expressions (`-each`) and data-dependent
  results (`-filter`, `-join`). Not a good basis for validity.
- **Per-layer command counter + originating command.** The dispatcher knows
  each command's targets and could bump a counter on every targeted layer,
  independent of `mark*Changed` coverage (shared arcs and direct GUI edits
  are exceptions to handle). A `-classify` record would store its command,
  resolved breaks and colors, and the counter. On read: equal counter means
  valid; otherwise recompute the classification from the stored command as a
  dry run and compare. A log of the commands since then could explain why a
  record is stale.
- **Revisions vs. fingerprints.** Undo revisions are only as reliable as the
  `mark*Changed` coverage; a content fingerprint of the dependent fields is
  the safe fallback, affordable once per edit.

## Open questions

- Which kinds of metadata are planned beyond classification and symbol
  rules, and do they share a dependency model?
- How should metadata pass through many-to-one and one-to-many commands?
- Should metadata be exported to formats that can hold it?
- Where is it shown and edited, in the CLI and the GUI?
