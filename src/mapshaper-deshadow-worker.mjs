// Entry point of www/deshadow-worker.js, which runs deshadowImage() off the
// main thread, or helps another worker fit the sun's position, as a browser
// worker or a Node worker thread (see mapshaper-deshadow.mjs in src/commands).
// Import only pure modules here.
import { deshadowImage, deshadowImageWithHelpers, serveDeshadowHelper } from './rasters/mapshaper-deshadow';
import { serveWorkerTasks } from './utils/mapshaper-worker-messages';

// A task is an image to deshadow, with ports to any helpers, or a port to
// serve as a helper on
serveWorkerTasks(function(task, report) {
  if (task.helper) {
    serveDeshadowHelper(task.port);
    return true;
  }
  if (task.helpers && task.helpers.length > 0) {
    return deshadowImageWithHelpers(task.image, task.terrain, task.nir, task.pixelSize, task.demPixelSize,
      task.path, report, task.options, task.helpers);
  }
  return deshadowImage(task.image, task.terrain, task.nir, task.pixelSize, task.demPixelSize, task.path, report,
    task.options);
});
