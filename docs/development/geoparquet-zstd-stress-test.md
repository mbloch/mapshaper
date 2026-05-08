# GeoParquet ZSTD Stress Test

Date: 2026-05-08

This document records ad-hoc stress testing of GeoParquet export using
`@bokuweb/zstd-wasm`. It is not part of the automated test suite.

## Goal

- Validate that GeoParquet export with `compression=zstd` is stable across
  `level=1..22`.
- Measure rough size/time tradeoffs by level.
- Capture what we learned about `zstd-codec` as an alternative compressor.

## Test Setup

- Command runner: `bin/mapshaper-xl` (8 GB heap).
- Input fixtures:
  - `test/data/flatgeobuf/__big/ns-water_water-junc.fgb` (~54 MB)
  - `test/data/flatgeobuf/__big/ns-water_water-poly.fgb` (~632 MB)
- Output format: `-o format=geoparquet compression=zstd level=<n>`

## Commands Used

```sh
# Full level sweep on ~54 MB fixture
for lvl in $(seq 1 22); do
  bin/mapshaper-xl "test/data/flatgeobuf/__big/ns-water_water-junc.fgb" \
    -o format=geoparquet compression=zstd level=$lvl "tmp/zstd-stress/levels/l${lvl}.parquet"
done

# High-level spot check on ~632 MB fixture
bin/mapshaper-xl "test/data/flatgeobuf/__big/ns-water_water-poly.fgb" \
  -o format=geoparquet compression=zstd level=10 "tmp/zstd-stress/big-poly/l10.parquet"
bin/mapshaper-xl "test/data/flatgeobuf/__big/ns-water_water-poly.fgb" \
  -o format=geoparquet compression=zstd level=22 "tmp/zstd-stress/big-poly/l22.parquet"
```

## Results: 54 MB Fixture (`ns-water_water-junc.fgb`)

All levels succeeded (`22/22`). No OOM or abort errors.

| Level | Status | Seconds | Bytes |
| ---: | :--- | ---: | ---: |
| 1 | ok | 2 | 11,845,009 |
| 2 | ok | 2 | 11,505,446 |
| 3 | ok | 2 | 11,628,736 |
| 4 | ok | 1 | 11,748,276 |
| 5 | ok | 2 | 11,715,347 |
| 6 | ok | 2 | 11,380,930 |
| 7 | ok | 2 | 11,333,471 |
| 8 | ok | 2 | 11,250,723 |
| 9 | ok | 2 | 11,246,141 |
| 10 | ok | 3 | 11,374,137 |
| 11 | ok | 2 | 11,367,156 |
| 12 | ok | 3 | 11,361,553 |
| 13 | ok | 3 | 10,491,910 |
| 14 | ok | 4 | 10,127,798 |
| 15 | ok | 5 | 10,113,654 |
| 16 | ok | 4 | 10,071,636 |
| 17 | ok | 5 | 10,071,405 |
| 18 | ok | 4 | 10,071,284 |
| 19 | ok | 7 | 10,046,737 |
| 20 | ok | 7 | 10,046,634 |
| 21 | ok | 7 | 10,046,634 |
| 22 | ok | 7 | 10,046,603 |

Observations:

- Compression improves significantly from low levels to high teens.
- Diminishing returns appear around levels `19-22` (very small size deltas).
- Runtime increases with higher levels but remained reasonable on this fixture.

## Results: 632 MB Fixture (`ns-water_water-poly.fgb`)

High-level spot checks succeeded:

| Level | Status | Seconds | Bytes |
| ---: | :--- | ---: | ---: |
| 10 | ok | 76 | 166,592,799 |
| 22 | ok | 146 | 153,993,505 |

Observation:

- `@bokuweb/zstd-wasm` remained stable at high levels on a much larger input.
- Level 22 gave smaller output than level 10 at roughly 2x runtime.

## What We Learned About `zstd-codec`

`zstd-codec` was tested separately as an alternative compressor backend and is
being dropped from consideration for now.

Key findings:

- It reproducibly threw `abort(OOM)` at `level=10` with larger page sizes
  (notably around `pageSize=1MB`), including on relatively modest synthetic
  workloads.
- The same workloads succeeded when page size was reduced (`64KB-256KB`),
  indicating sensitivity to memory constraints rather than obvious data issues.
- `@bokuweb/zstd-wasm` handled equivalent test cases that failed with
  `zstd-codec`.

Conclusion:

- `zstd-codec` may be conditionally usable with strict safeguards, but it is
  not robust enough as a default backend for Mapshaper GeoParquet export at
  this time.
- `@bokuweb/zstd-wasm` is currently the preferred ZSTD backend.
