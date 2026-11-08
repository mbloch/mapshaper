// Entry point of www/deshadow-worker.js, which runs deshadowImage() off the
// main thread, as a browser worker or a Node worker thread (see
// mapshaper-deshadow.mjs in src/commands). Import only pure modules here.
import { deshadowImage } from './rasters/mapshaper-deshadow';
import { serveWorkerTasks } from './utils/mapshaper-worker-messages';

serveWorkerTasks(function(task, report) {
  return deshadowImage(task.image, task.terrain, task.nir, task.pixelSize, task.demPixelSize, task.path, report,
    task.options);
});
