import { countArcsInShapes } from '../paths/mapshaper-path-utils';
import { getSliverTest } from '../polygons/mapshaper-slivers';
import { getDefaultSliverThreshold } from '../polygons/mapshaper-slivers';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { getSliverFilter } from '../polygons/mapshaper-slivers';
import { message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { absArcId } from '../paths/mapshaper-arc-utils';

// Remove small-area polygon rings (very simple implementation of sliver removal)
// TODO: more sophisticated sliver detection (e.g. could consider ratio of area to perimeter)
// TODO: consider merging slivers into adjacent polygons to prevent gaps from forming
// TODO: consider separate gap removal function as an alternative to merging slivers
//
cmd.filterSlivers = function(lyr, dataset, opts) {
  if (lyr.geometry_type != 'polygon') {
    return 0;
  }
  return filterSlivers(lyr, dataset, opts);
};

function filterSlivers(lyr, dataset, optsArg) {
  var opts = utils.extend({sliver_control: 1}, optsArg);
  var filterData = getSliverFilter(lyr, dataset, opts);
  var ringTest = filterData.filter;
  var removed = 0;
  var pathFilter = function(path, i, paths) {
    if (ringTest(path)) {
      removed++;
      return null;
    }
  };

  editShapes(lyr.shapes, pathFilter);
  message(utils.format("Removed %'d sliver%s using %s", removed, utils.pluralSuffix(removed), filterData.label));
  return removed;
}

export function filterClipSlivers(lyr, clipLyr, arcs) {
  var threshold = getDefaultSliverThreshold(lyr, arcs);
  // message('Using variable sliver threshold (based on ' + (threshold / 1e6) + ' sqkm)');
  var ringTest = getSliverTest(arcs, threshold, 1);
  var flags = new Uint8Array(arcs.size());
  var removed = 0;
  var pathFilter = function(path) {
    var prevArcs = 0,
        newArcs = 0;
    for (var i=0, n=path && path.length || 0; i<n; i++) {
      if (flags[absArcId(path[i])] > 0) {
        newArcs++;
      } else {
        prevArcs++;
      }
    }
    // filter paths that contain arcs from both original and clip/erase layers
    //   and are small
    if (newArcs > 0 && prevArcs > 0 && ringTest(path)) {
      removed++;
      return null;
    }
  };

  countArcsInShapes(clipLyr.shapes, flags);
  editShapes(lyr.shapes, pathFilter);
  return removed;
}

