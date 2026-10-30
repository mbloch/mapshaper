import { getAerialRange } from './mapshaper-hillshade';
import { getShadingReach, getSmoothingReach, runHillshadeStage } from './mapshaper-hillshade-stages';
import { copyTile, getTileLayout, pasteTileCore } from './mapshaper-raster-tiles';
import { getProcessorCount, startWorkerPool } from '../utils/mapshaper-worker-pool';

// Runs the stages of mapshaper-hillshade-stages.mjs on a grid, either in this
// thread or in workers, on overlapping tiles. The result is the same either way.

export var HILLSHADE_WORKER_SCRIPT = 'hillshade-worker.js';
// Smaller grids take under half a second, and starting workers has a cost
var MIN_AUTO_WORKER_PIXELS = 500000;
// Beyond this, the overlap of tiles cancels out most of the gain
var MAX_AUTO_WORKERS = 16;

// @grid see mapshaper-hillshade-stages.mjs
// @smoothing settings for smoothTerrain(), or null for no smoothing
// @shading settings for shadeTerrain(); aerialRange is filled in here
// @opts.workers number of workers (0 for this thread), or null for automatic
// @opts.resume optional function called after each wait for workers
//   (job.resumeCommand())
// Returns {tones, thresholds, workers}: thresholds are dynamic smoothing's
//   FPS thresholds, or null; workers is the number of workers used
export async function runHillshadeStages(grid, smoothing, shading, opts) {
  var maxWorkers = getHillshadeWorkerCount(opts.workers, grid.width * grid.height);
  var smoothTiles = smoothing ?
    getTileLayout(grid.width, grid.height, maxWorkers, getSmoothingReach(smoothing), true) : [];
  var shadeTiles = getTileLayout(grid.width, grid.height, maxWorkers, getShadingReach(shading), false);
  var poolSize = maxWorkers > 0 ? Math.max(smoothTiles.length, shadeTiles.length) : 0;
  var pool = poolSize > 0 ? await startWorkerPool(HILLSHADE_WORKER_SCRIPT, poolSize) : null;
  var resume = opts.resume || function() {};
  var thresholds = null, smoothed, shaded;
  resume();
  try {
    if (smoothing) {
      smoothed = await runStage(pool, 'smooth', grid, smoothing, smoothTiles, ['elev', 'thresholds']);
      resume();
      grid = Object.assign({}, grid, {elev: smoothed.elev});
      thresholds = smoothed.thresholds;
    }
    if (shading.aerial > 0) {
      shading = Object.assign({}, shading, {aerialRange: getAerialRange(grid.elev, grid.valid)});
    }
    shaded = await runStage(pool, 'shade', grid, shading, shadeTiles, ['tones']);
    resume();
  } finally {
    if (pool) pool.close();
  }
  return {tones: shaded.tones, thresholds: thresholds, workers: pool ? pool.size : 0};
}

// @requested a number of workers, or null for automatic
export function getHillshadeWorkerCount(requested, pixels) {
  var n;
  if (requested != null && requested >= 0) return requested;
  if (pixels < MIN_AUTO_WORKER_PIXELS) return 0;
  n = Math.min(MAX_AUTO_WORKERS, getProcessorCount());
  return n > 1 ? n : 0;
}

// @keys the arrays of the stage's result, which are assembled from the cores
//   of the tiles (a null array in the result stays null)
async function runStage(pool, stage, grid, settings, tiles, keys) {
  var parts, out;
  if (!pool) {
    return runHillshadeStage({stage: stage, grid: grid, settings: settings});
  }
  parts = await Promise.all(tiles.map(function(tile, i) {
    return pool.run(i, {stage: stage, grid: getTileGrid(grid, tile), settings: settings});
  }));
  out = {};
  keys.forEach(function(key) {
    var dest = parts[0][key] ? new parts[0][key].constructor(grid.width * grid.height) : null;
    if (dest) {
      tiles.forEach(function(tile, i) {
        pasteTileCore(dest, grid.width, tile, parts[i][key]);
      });
    }
    out[key] = dest;
  });
  return out;
}

function getTileGrid(grid, tile) {
  return {
    elev: copyTile(grid.elev, grid.width, tile),
    valid: grid.valid ? copyTile(grid.valid, grid.width, tile) : null,
    width: tile.xb - tile.xa,
    height: tile.yb - tile.ya,
    cellWidths: grid.cellWidths.slice(tile.ya, tile.yb),
    cellHeights: grid.cellHeights.slice(tile.ya, tile.yb)
  };
}
