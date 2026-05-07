# Undo/Redo Performance Review

Date: 2026-05-05

This review measures the experimental web UI command undo path. The goal is to
identify overhead from enabling undo, payload size risks, and places where
capture granularity should be narrowed.

## Runner

Use `scripts/undo-performance-runner.mjs` to compare command execution with undo
disabled and enabled.

```sh
node --import ./test/_register.mjs scripts/undo-performance-runner.mjs \
  --repeat 1 \
  --out /tmp/mapshaper-undo-performance \
  /path/to/workflow.txt
```

By default, an initial `-i` command is treated as setup and excluded from the
timed command list. Use `--include-import` to include import time. The runner
uses the production `UndoTransaction` path and the undo unit/payload store
adapter, backed by an in-memory payload store. This is useful for measuring
capture and serialization overhead, but it is not a substitute for browser
IndexedDB timing.

## Workflows

The review used four workflows from `/Users/matthewbloch/Development/mapshaper/undo`:

| Workflow | Input | Main coverage |
| --- | --- | --- |
| `test1.txt` | `COUNTY_2019_US_SL050_Coast_Clipped.shp` | large polygon simplification |
| `test2.txt` | congressional districts + land clip polygon | clip, clean, dissolve topology |
| `test3.txt` | `AdmA_Cntry.shp` | projection, simplify, layer creation, table/style edits |
| `test4.txt` | `COUNTY_2019_US_SL050_Coast_Clipped.shp` | split into many layers |

`test5.txt` uses a 650 MB shapefile and was not run in this pass. It should be
reserved for an explicit stress test because it may require substantially more
time and memory.

## Fixes Made During Review

Two low-risk optimizations were added before final measurements:

- `Catalog.setDefaultTargets()` now returns early when the requested target is
  identical to the current target. This avoids no-op catalog undo units from
  routine command target resets.
- `estimatePayloadSize()` in `gui-undo-payload-store.mjs` now estimates nested
  payload sizes recursively and handles typed arrays by `byteLength`. Previously
  large typed-array payload objects could fall through to `JSON.stringify()`,
  producing multi-second overhead in the memory-backed benchmark.

## Results

Final measurements, one run per workflow:

| Workflow | Disabled | Enabled | Overhead | Payloads | Payload Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `simplify-polygons` | 5909 ms | 6347 ms | +438 ms / 7.4% | 2 | 71.0 MB |
| `dissolve-clip-clean` | 2848 ms | 2846 ms | -2 ms / -0.1% | 24 | 194.9 MB |
| `project-simplify-lines-points-labels-styles` | 714 ms | 694 ms | -20 ms / -2.8% | 20 | 51.3 MB |
| `split` | 17 ms | 26 ms | +9 ms / 52.9% | 2 | 601.8 KB |

Small negative overhead values are timing noise. The meaningful finding is that,
after the size-estimation fix, command-time capture overhead is low in this
Node/in-memory benchmark. The main remaining risk is payload volume, not CPU
time.

Representative command-level payloads:

| Command | Undo units | Payload bytes |
| --- | --- | ---: |
| `-simplify 30%` on large counties | `arcs-simplification`, `dataset-info` | 71.0 MB |
| `-clip ...` in topology workflow | `arcs`, `layer` x4, `dataset` x2, `arcs-simplification`, `catalog` | 67.2 MB |
| `-clean` in topology workflow | `arcs`, `layer` x2, `dataset`, `arcs-simplification` | 63.9 MB |
| `-dissolve STATEFP` | `arcs`, `layer`, `dataset`, `catalog` | 63.8 MB |
| `-proj robin` on `AdmA_Cntry` | `arcs`, `dataset` | 41.1 MB |
| `-each KM2 = ...` | `table` | 44.8 KB |
| `-style ...` | `table-schema`, `table-fields` | 3.1 KB |
| `-split STATEFP` | `layer`, `dataset`, `catalog` | 601.8 KB |

## Interpretation

Table and metadata changes are efficient. Field/schema-level units are tiny, and
whole-table capture for the tested `-each` command was only tens of KB because
the source table was small.

Simplification capture is correctly narrower than full arcs capture, but it can
still be large on dense data because both undo and redo store `zz` arrays. This
is expected and should be managed with undo storage caps.

Topology-heavy commands remain the largest storage risk. `clip`, `clean`, and
`dissolve` require broad `arcs`, `layer`, and `dataset` units today. Some of
these may be inherently broad, but they are the best candidates for future
granularity work if large-dataset undo feels too heavy.

The Node runner uses an in-memory backend. Browser IndexedDB will add structured
clone and disk-write cost, so these numbers should be treated as a lower bound
for storage-heavy commands.

## Follow-Up Recommendations

- Run a headed-browser timing pass on one large simplification and one topology
  workflow to measure actual IndexedDB storage cost.
- Stress-test `test5.txt` separately with generous time and memory limits.
- Keep the default command undo history cap conservative while this remains
  experimental.
- Consider a lower default per-payload/session limit for very large workflows,
  with graceful warning behavior already covered by tests.
- Investigate whether topology commands can avoid redundant broad captures,
  especially combinations that capture both full `arcs` and
  `arcs-simplification`.
