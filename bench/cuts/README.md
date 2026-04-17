# addIntersectionCuts benchmarks

Small harness used while optimising `addIntersectionCuts()` and the surrounding
hot path (`snapAndCut`, `findSegmentIntersections`, `cleanArcReferences`,
`buildTopology`, `cleanPolygonLayerGeometry`, `clipPolygons`, mosaic
construction, etc.).

## Test data

Drop the files referenced in `cases.mjs` into some directory on disk and
point the harness at it. Either:

- copy `.env.example` to `.env` in this directory and set
  `MAPSHAPER_BENCH_DATA=/absolute/path/to/your/data`, or
- export `MAPSHAPER_BENCH_DATA` in your shell.

`.env` is gitignored. Expected files:

- `COUNTY_2019_US_SL050_Coast_Clipped.shp` (200 MB, US counties, EPSG:4326)
- `srprec_061_g24_v01.shp` (6.9 MB, CA Placer precincts, NAD83)
- `roads.geojson` (12 MB, Web Mercator polylines)
- `usa_land_area.geojson` (2 MB, USA land mask, EPSG:4326)
- `torture-test.shp` (120 MB, high-self-intersection stress case)

## Running

After editing source files, rebuild the bundle once:

```bash
npx rollup --config
```

Then:

```bash
# All cases, default run counts
node bench/cuts/run.mjs

# A single case, with explicit run count
node bench/cuts/run.mjs F-roads-buffer-dissolve --runs 5

# Capture results for diffing later
node bench/cuts/run.mjs --tag baseline --json bench/cuts/results-baseline.json
```

For a clean comparison, prefer running with extra heap and exposed GC:

```bash
node --max-old-space-size=8000 --expose-gc bench/cuts/run.mjs
```

## Comparing baselines vs after-optimisation

```bash
node bench/cuts/run.mjs --tag baseline --json /tmp/base.json
# ... apply an optimisation, rebuild ...
node bench/cuts/run.mjs --tag after --json /tmp/after.json
node bench/cuts/compare.mjs /tmp/base.json /tmp/after.json
```

Output prints both per-case wall-time deltas and per-phase deltas of the
`addIntersectionCuts` profile.

## Phases captured

The profiler in `src/utils/mapshaper-profile.mjs` is opened/closed at:

- `addIntersectionCuts`
  - `flatten`
  - `snapAndCut`
    - `snap`, `dedupCoords`, `cutPathsAtIntersections`
      - `findClippingPoints`
        - `findSegmentIntersections` → `stripeSetup`, `intersectSegments`, `dedupIntersections`
        - `convertIntersectionsToCutPoints`
      - `insertCutPoints` → `sortCutPoints`, `filterSortedCutPoints`, `rewriteVertexData`
  - `buildTopology`
  - `cleanShapes`
  - `cleanArcReferences` → `NodeCollection#1`, `findDuplicateArcs`, `replaceIndexedArcIds`, `deleteUnusedArcs`, `NodeCollection#2`
- `cleanLayers` → `cleanPolygonLayerGeometry` → `dissolvePolygonGroups2` → `dpg2.MosaicIndex` → `mi.buildPolygonMosaic` → `bpm.findEnclosingForCCW`, `bpm.findMosaicRings`
- `clipLayers` → `clipPolygons` → `cp.dissolveTargetRings`, `cp.clipShapes`, `cp.findInteriorPaths`
- `dissolveArcs` → `dissolveArcs.translatePaths`, `dissolveArcs.dissolveArcCollection`

Add new `profileStart` / `profileEnd` calls anywhere you want a more
fine-grained breakdown — they are no-ops when profiling is off.

## Related tooling

- `robust-stats.mjs` — counts fast-vs-robust calls into `segmentIntersection()`
  for a given case.
