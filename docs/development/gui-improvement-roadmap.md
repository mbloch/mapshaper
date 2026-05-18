---
title: GUI improvement roadmap
description: Roadmap for reducing coupling and improving correctness in Mapshaper's interactive GUI editing tools.
---

# GUI Improvement Roadmap

This roadmap is for contributors working on Mapshaper's web GUI, especially
interactive tools such as styling panels, selection tools, drawing tools, and
undo/redo. Recent GUI additions have made the application more capable, but
they have also introduced new coupling between interaction modes, command
execution, undo/redo, session history, rendering, and panel state.

The goal of this roadmap is not to rewrite the GUI. The goal is to make the
existing contracts explicit, then refactor one small boundary at a time.

## Current Problem

The GUI now has several systems that can all be involved in a single user edit:

- Interaction mode state in `gui-interaction-mode-control.mjs`
- Hit detection and selection state in `gui-hit-control.mjs`
- Floating panels such as label, point, line, and polygon style tools
- Direct table updates and command-backed updates
- Session command history in `gui-session-history.mjs`
- App-level undo/redo in `gui-undo.mjs`
- Canvas and SVG rendering in `gui-canvas.mjs` and related renderer modules
- Overlay rendering for selection and hover feedback

These systems mostly communicate through events and shared model state. That
keeps individual modules small, but it also makes ordering and ownership
ambiguous. A small UI change can require updates in several places:

- Update data
- Capture undo state
- Record replayable command history
- Refresh the model/map
- Refresh the panel controls
- Update selection or hover overlays

When one step is missed, the map, panel, undo stack, and command history can
disagree.

## Design Principles

### Prefer Explicit Contracts

If a module depends on a sequence such as "mode exits before hit selection is
cleared" or "a styler always overwrites the same properties," document that
contract near the code and add focused tests where practical.

### Keep Refactors Narrow

Avoid large file moves or broad rewrites. First introduce small facades around
existing behavior, then move one tool or panel at a time.

### Use CLI Commands As The Canonical Edit Path When Practical

When a GUI action maps naturally to an existing command, prefer running that
command instead of duplicating command behavior in panel code. This gives one
implementation for:

- Data mutation
- Schema and field update tracking
- Command undo capture
- Model update flags
- Session history text

The style panels are a good candidate now that `-style ids=` exists.

### Keep Performance-Sensitive Rendering Changes Separate

Canvas rendering is highly optimized and uses mutable style objects deliberately.
Rendering refactors should be isolated from panel and lifecycle refactors.

### Avoid Direct Non-GUI Imports From `src/gui`

The GUI bundle already accesses much of core Mapshaper through `internal`.
Prefer `internal.*` for core functions that are already exposed to the GUI. A
direct import from outside `src/gui` can silently pull large CLI, parsing, pack,
or server-oriented modules into `www/mapshaper-gui.js`.

## Target Architecture

The following contracts should become explicit over time.

### Interaction Mode Lifecycle

Each mode should have a predictable lifecycle:

1. `beforeExit(previousMode)`
2. `exit(previousMode)`
3. `beforeEnter(nextMode)`
4. `enter(nextMode)`
5. `afterEnter(nextMode)`

Today this is approximated by `interaction_mode_change` events. Several modules
listen to the same event and depend on listener ordering. A formal lifecycle
would make responsibilities clearer:

- Hit control clears stale hover/selection state.
- Panels open or close.
- Undo sessions start or finish.
- Popups hide.
- Overlay state refreshes.

This does not have to be introduced all at once. A first version could be a
small mode lifecycle helper that wraps the existing event dispatch.

### GUI Edit Operation

There should be a standard path for user-visible GUI edits:

```text
GUI control
  -> edit operation wrapper
  -> command or direct mutation
  -> model update
  -> undo/session history
  -> panel refresh
```

The wrapper should make it harder to forget one part of the update cycle. For
command-backed edits, it can call `gui.console.runMapshaperCommands()`. For
direct edits, it can dispatch the expected data update events and mark the model
updated in one place.

### Panel Session

Panels that remain open while the user makes multiple edits should have a
session concept:

- Start session when panel mode opens.
- Allow fine-grained undo/redo while the panel is open.
- Collapse to one durable edit-session undo entry when the mode exits.
- Keep command history replayable and compact when printed.

The existing edit-session undo path already does part of this. The contract
should be documented and eventually wrapped by a panel session helper.

### Session History Compaction

Session history should remain literal internally so undo/redo can mark command
entries active or inactive safely. Compaction should happen when history is
printed or exported.

Current first-pass rule:

- Cull earlier `-style` commands when a later `-style` command targets the same
  feature group and overwrites a superset of style properties.
- Cull repeated `-classify colors=random non-adjacent` commands when they target
  the same feature group.

This should stay as a pure, well-tested function over command strings.

## Proposed Milestones

### 1. Document Existing Lifecycles

Create short notes or diagrams for:

- Interaction mode changes
- GUI command execution
- Panel open/close
- Undo/redo
- Session history
- Overlay rendering

The purpose is to identify implicit dependencies before changing code.

### 2. Add A Command-Backed GUI Edit Wrapper

Introduce a small helper, for example `runGuiEditCommand(gui, cmd, opts)`, that:

- Runs the command through `gui.console.runMapshaperCommands()`
- Handles errors consistently
- Refreshes the initiating panel if needed
- Provides a place for future session metadata, timing, or debug logging

Start with line and polygon style panel actions.

### 3. Formalize Panel Session Behavior

Add a helper for panels that participate in edit sessions:

- `startPanelSession(mode, target)`
- `finishPanelSession(mode)`
- `onPanelUndoRedo()`
- `refreshPanelControls()`

At first, this can be a thin wrapper around current events and existing undo
behavior.

### 4. Convert One Panel At A Time

Use the line/polygon style panel as the reference implementation. Then evaluate:

- Label styles
- Point symbols
- Selection tools
- Drawing tools

Do not convert multiple panels in one refactor unless the shared contract is
already proven.

### 5. Audit GUI Bundle Boundaries

Add a simple review checklist:

- New `src/gui` files should not import deep core modules directly unless there
  is a clear reason.
- Prefer `internal.*` when the function is already part of the GUI-facing API.
- Rebuild and check `www/mapshaper-gui.js` size after adding imports.

This could become a lightweight script or test later.

### 6. Add Regression Tests Around Pure Contracts

Prefer tests for small pure modules and command behavior:

- `-style ids=`
- Session history compaction
- Command output from GUI edit wrappers
- Undo transaction boundaries where test APIs exist
- Styler contracts where rendering behavior can be isolated

Browser-level tests are useful, but most lifecycle bugs should be reduced to
smaller testable contracts first.

## Risks

### Broad Reorganization

Moving many files or changing many tools at once is likely to introduce
regressions. Prefer adding one explicit boundary at a time.

### Undo/History Coupling

Command undo entries are linked to session command history. Avoid add-time
history culling unless undo/redo semantics are also redesigned. Print-time
history culling is safer.

### Rendering Performance

Do not casually add object allocation or per-shape work to hot rendering loops.
Renderer changes should be measured or kept very narrow.

### Parser And Bundle Dependencies

The GUI can access parser functions through `internal`, but direct imports from
CLI modules can pull large dependencies into `mapshaper-gui.js`. Be careful when
adding utility modules used by the GUI.

## Near-Term Next Steps

1. Keep line/polygon style actions command-backed and use them as the reference
   pattern.
2. Add a small `runGuiEditCommand()` wrapper around existing command execution.
3. Move line/polygon style command execution into that wrapper.
4. Write focused tests for wrapper behavior where possible.
5. Decide whether label styling should move to command-backed edits or remain
   direct until label-specific CLI behavior is audited.

This sequence should improve structure without changing too much behavior at
once.
