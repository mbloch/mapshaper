import { findPairsOfNeighbors } from '../polygons/mapshaper-polygon-neighbors';
import { insertFieldValues, requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';

// Assign a cluster id to each polygon in a dataset, which can be used with
//   one of the dissolve commands to dissolve the clusters
// Works by iteratively grouping pairs of polygons with the smallest distance
//   between centroids.
// Results are not optimal -- may be useful for creating levels of detail on
//   interactive maps, not useful for analysis.
//
cmd.cluster = function(lyr, arcs, opts) {
  requirePolygonLayer(lyr);
  var groups = calcPolygonClusters(lyr, arcs, opts);
  var idField = opts.id_field || "cluster";
  insertFieldValues(lyr, idField, groups);
  return lyr;
};

function calcPolygonClusters(lyr, arcs, opts) {
  var calcScore = getPolygonClusterCalculator(opts);
  var size = lyr.shapes.length;
  var pct = opts.pct ? utils.parsePercent(opts.pct) : 1;
  var count = Math.round(size * pct);
  var groupField = opts.group_by || null;

  // working set of polygon records
  var shapeItems = lyr.shapes.map(function(shp, i) {
    var groupId = groupField && lyr.data.getRecordAt(i)[groupField] || null;
    return {
      ids: [i],
      area: geom.getShapeArea(shp, arcs),
      bounds: arcs.getMultiShapeBounds(shp),
      centroid: geom.getShapeCentroid(shp, arcs), // centroid of largest ring
      group: groupId,
      friends: []
    };
  });

  var mergeItems = []; // list of pairs of shapes that can be merged
  var mergeIndex = {}; // keep track of merges, to prevent duplicates
  var next;

  if (groupField && !lyr.data) stop("Missing attribute data table");

  // Populate mergeItems array
  findPairsOfNeighbors(lyr, arcs).forEach(function(ab, i) {
    // ab: [a, b] indexes of two polygons
    var a = shapeItems[ab[0]],
        b = shapeItems[ab[1]],
        item, id;
    if (a.group !== b.group) return;
    item = {ids: ab};
    item.score = getScore(item);
    if (item.score < 0) return;
    id = mergeItems.length;
    a.friends.push(id);
    b.friends.push(id);
    mergeItems.push(item);
  });

  // main loop
  while (count-- > 0 && (next = nextItem())) {
    merge(next);
  }

  // Assign a sequential id to each of the remaining original shapes and the
  // new aggregated shapes
  return shapeItems.filter(Boolean).reduce(function(memo, shape, clusterId) {
    var ids = shape.ids;
    for (var i=0; i<ids.length; i++) {
      memo[ids[i]] = clusterId;
    }
    return memo;
  }, []);

  function merge(item) {
    var merged = mergeShapes(item.ids);
    var mergedId = shapeItems.length;
    shapeItems[mergedId] = merged;
    updateList(merged.friends, item.ids, mergedId);
  }

  // Find lowest-ranked merge candidate and remove it from the list
  // Scans entire list - n^2 performance - tested ~20sec for 50,000 polygons
  function nextItem() {
    var minId = -1,
        min = Infinity,
        item, i, n;
    for (i=0, n=mergeItems.length; i<n; i++) {
      item = mergeItems[i];
      if (item !== null && item.score < min) {
        min = item.score;
        minId = i;
      }
    }
    if (minId == -1) return null;
    item = mergeItems[minId];
    mergeItems[minId] = null;
    return item;
  }

  function getScore(item) {
    return calcScore(shapeItems[item.ids[0]], shapeItems[item.ids[1]]);
  }

  function mergeCentroids(dest, src) {
    var k = dest.area / (dest.area + src.area),
        a = dest.centroid,
        b = src.centroid;
    // TODO: consider using geodetic distance when appropriate
    a.x = a.x * k + b.x * (1 - k);
    a.y = a.y * k + b.y * (1 - k);
  }

  function mergeShapes(ids) {
    var dest = shapeItems[ids[0]];
    var src = shapeItems[ids[1]];
    dest.bounds.mergeBounds(src.bounds);
    dest.area += src.area;
    dest.ids = dest.ids.concat(src.ids);
    mergeCentroids(dest, src);
    shapeItems[ids[0]] = null;
    shapeItems[ids[1]] = null;
    dest.friends = filterFriends(dest.friends.concat(src.friends));
    return dest;
  }

  // remove ids of duplicate and invalid merge candidates
  function filterFriends(friends) {
    var index = {};
    var merged = [];
    var id;
    for (var i=0; i<friends.length; i++) {
      id = friends[i];
      if ((id in index === false) && mergeItems[id] !== null) {
        merged.push(id);
        index[id] = true;
      }
    }
    return merged;
  }

  // re-index merge candidates after merging two shapes into a new shape
  function updateList(friends, oldIds, newId) {
    var item, id;
    for (var i=0, n=friends.length; i<n; i++) {
      id = friends[i];
      item = mergeItems[id];
      if (contains(item.ids, oldIds)) {
        mergeItems[id] = updateItem(item, oldIds, newId);
      }
    }
  }

  // re-index a merge candidate; return null if it duplicates a previously merged
  //   pair of shapes
  function updateItem(item, oldIds, newId) {
    var a = item.ids[0];
    var b = item.ids[1];
    var key;
    if (oldIds[0] == a || oldIds[1] == a) a = newId;
    if (oldIds[0] == b || oldIds[1] == b) b = newId;
    if (a == b) return null;
    item.ids = [a, b];
    key = clusterKey(item);
    if (key in mergeIndex) return null;
    mergeIndex[key] = true;
    item.score = getScore(item);
    if (item.score < 0) return null;
    return item;
  }

  function contains(a, b) {
    return a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1];
  }

  function clusterKey(friend) {
    var a = friend.ids[0],
        b = friend.ids[1];
    if (b < a) {
      a = b;
      b = friend.ids[0];
    }
    return a + ',' + b;
  }
}

function getPolygonClusterCalculator(opts) {
  var maxWidth = opts.max_width || Infinity;
  var maxHeight = opts.max_height || Infinity;
  var maxArea = opts.max_area || Infinity;
  return function(a, b) {
    var area = a.area + b.area,
        // TODO: use geodetic distance when appropriate
        score = geom.distance2D(a.centroid.x, a.centroid.y, b.centroid.x, b.centroid.y),
        bounds = a.bounds.clone().mergeBounds(b.bounds);
    if (area > maxArea || bounds.width() > maxWidth ||
        bounds.height() > maxHeight) {
      score = -1;
    }
    return score;
  };
}
