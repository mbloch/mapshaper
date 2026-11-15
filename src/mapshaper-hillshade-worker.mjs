// Entry point of www/hillshade-worker.js, which runs the stages of -hillshade
// on tiles of a grid, as a browser worker or a Node worker thread (see
// mapshaper-hillshade-runner.mjs). Import only pure modules here: the bundle
// should stay a small fraction of mapshaper.js, since every worker loads it.
import { runHillshadeStage } from './rasters/mapshaper-hillshade-stages';
import { serveWorkerTasks } from './utils/mapshaper-worker-messages';

serveWorkerTasks(runHillshadeStage);
