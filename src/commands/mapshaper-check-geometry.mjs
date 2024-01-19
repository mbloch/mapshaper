
import cmd from '../mapshaper-cmd';
import { stop, message } from '../utils/mapshaper-logging';
import { findSegmentIntersections } from '../paths/mapshaper-segment-intersection';

// currently undocumented, used in tests
cmd.checkGeometry = function(targetLayer, dataset, opts) {
  if (!dataset.arcs) return;

  // TODO: only check the target layer for intersections
  var intersections = findSegmentIntersections(dataset.arcs);
  if (intersections.length > 0) {
    handleError(`Found ${intersections.length} intersection${intersections.length > 1 ? 's' : ''}.`, opts);
  }

  // TODO: look for other geometry errors
};

function handleError(msg, opts) {
  var report = opts.strict ? stop : message;
  report(msg);
}

