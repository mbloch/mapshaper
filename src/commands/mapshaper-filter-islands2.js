import { editShapes } from '../paths/mapshaper-shape-utils';
import { ringHasHoles } from '../commands/mapshaper-filter-islands';
import { countArcsInShapes } from '../paths/mapshaper-path-utils';
import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import { getVertexCountTest } from '../commands/mapshaper-filter-islands';
import { getSliverFilter } from '../polygons/mapshaper-slivers';
import { message } from '../utils/mapshaper-logging';
import { absArcId } from '../paths/mapshaper-arc-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

cmd.filterIslands2 = function(lyr, dataset, optsArg) {
  var opts = utils.extend({sliver_control: 0}, optsArg); // no sliver control
  var arcs = dataset.arcs;
  var removed = 0;
  var filter;
  if (lyr.geometry_type != 'polygon') {
    return;
  }
  if (!opts.min_area && !opts.min_vertices) {
    message("Missing a criterion for filtering islands; use min-area or min-vertices");
    return;
  }

  if (opts.min_area) {
    filter = getSliverFilter(lyr, dataset, opts).filter;
  } else {
    filter = getVertexCountTest(opts.min_vertices, arcs);
  }
  removed += filterIslands2(lyr, arcs, filter);
  if (opts.remove_empty) {
    cmd.filterFeatures(lyr, arcs, {remove_empty: true, verbose: false});
  }
  message(utils.format("Removed %'d island%s", removed, utils.pluralSuffix(removed)));
};

function buildIslandIndex(lyr, arcs, ringTest) {
  // index of all islands
  // (all rings are considered to belong to an island)
  var islandIndex = [];
  // this index maps id of first arc in each ring to
  // an island in islandIndex
  var firstArcIndex = new ArcToIdIndex(arcs);
  var shpId;
  var parts;

  lyr.shapes.forEach(function(shp, i) {
    if (!shp) return;
    shpId = i;
    forEachShapePart(parts, eachRing);

  });

  function eachRing(ring, ringId, shp) {
    var area = geom.getPathArea(ring, arcs);
    var firstArcId = ring[0];
    if (area <= 0) return; // skip holes (really?)
    var islandId = firstArcIndex.getId(firstArcId);
    var islandData;
    if (islandId == -1) {
      islandData = {
        area: 0
      };
      islandId = islandIndex.length;
      islandIndex.push(islandData);
    } else {
      islandData = islandIndex[islandId];
    }
    islandData.area += area;

  }

}


function filterIslands2(lyr, arcs, ringTest) {
  var removed = 0;
  var counts = new Uint8Array(arcs.size());
  countArcsInShapes(lyr.shapes, counts);

  var pathFilter = function(path, i, paths) {
    if (path.length == 1) { // got an island ring
      if (counts[absArcId(path[0])] === 1) { // and not part of a donut hole
        if (!ringTest || ringTest(path)) { // and it meets any filtering criteria
          // and it does not contain any holes itself
          // O(n^2), so testing this last
          if (!ringHasHoles(path, paths, arcs)) {
            removed++;
            return null;
          }
        }
      }
    }
  };
  editShapes(lyr.shapes, pathFilter);
  return removed;
}

function ArcToIdIndex(arcs) {
  var n = arcs.size();
  var fwdArcIndex = new Int32Array(n);
  var revArcIndex = new Int32Array(n);
  utils.initializeArray(fwdArcIndex, -1);
  utils.initializeArray(revArcIndex, -1);
  this.setId = function(arcId, id) {
    if (arcId >= 0) {
      fwdArcIndex[arcId] = id;
    } else {
      revArcIndex[~arcId] = id;
    }
  };

  this.getId = function(arcId) {
    var i = absArcId(arcId);
    if (i < n === false) return -1;
    return (arcId < 0 ? revArcIndex : fwdArcIndex)[i];
  };
}
