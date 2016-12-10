/* @requires
mapshaper-polygon-neighbors
mapshaper-common
mapshaper-shape-geom
mapshaper-polygon-centroid
*/

api.cluster = function(lyr, arcs, opts) {
  MapShaper.requirePolygonLayer(lyr, "[cluster] Command requires a polygon layer");
  var idField = opts.id_field || "cluster";
  var groups = MapShaper.calcPolygonClusters(lyr, arcs, opts);
  MapShaper.insertFieldValues(lyr, idField, groups);
  return lyr;
};

MapShaper.calcPolygonClusters = function(lyr, arcs, opts) {
  var calcScore = MapShaper.getPolygonClusterCalculator(opts);
  var groupField = opts.group_by || null;
  var size = lyr.shapes.length;
  var count = Math.round(size * (opts.pct || 1));

  if (groupField && !lyr.data) stop("[aggregate] Missing attribute data table");

  // working set of shapes
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

  var aggItems = [];
  var aggIndex = {};
  var next;

  MapShaper.findNeighbors(lyr.shapes, arcs).forEach(function(ab, i) {
    // ab: [a, b] indexes of shape items
    var a = shapeItems[ab[0]],
        b = shapeItems[ab[1]],
        item, id;
    if (a.group !== b.group) return;
    item = {ids: ab};
    item.score = getScore(item);
    if (item.score < 0) return;
    id = aggItems.length;
    a.friends.push(id);
    b.friends.push(id);
    aggItems.push(item);
  });

  while (count-- > 0 && (next = nextItem())) {
    merge(next);
  }

  // Assign a sequential id to each of the remaining original shapes and the
  // new aggregated shapes
  return shapeItems.filter(Boolean).reduce(function(memo, shape, aggId) {
    var ids = shape.ids;
    for (var i=0; i<ids.length; i++) {
      memo[ids[i]] = aggId;
    }
    return memo;
  }, []);

  function merge(item) {
    var merged = mergeShapes(item.ids);
    var mergedId = shapeItems.length;
    shapeItems[mergedId] = merged;
    updateList2(merged.friends, item.ids, mergedId);
  }

  function nextItem() {
    var minId = -1, min = Infinity, item;
    for (var i=0, n=aggItems.length; i<n; i++) {
      item = aggItems[i];
      if (item === null) {
        continue;
      }
      if (item.score < min) {
        min = item.score;
        minId = i;
      }
    }
    if (minId == -1) return null;
    item = aggItems[minId];
    aggItems[minId] = null;
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

  function filterFriends(friends) {
    var index = {};
    var merged = [];
    var id;
    for (var i=0; i<friends.length; i++) {
      id = friends[i];
      if ((id in index === false) && aggItems[id] !== null) {
        merged.push(id);
        index[id] = true;
      }
    }
    return merged;
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

  function updateList2(friends, oldIds, newId) {
    var item, id;
    for (var i=0, n=friends.length; i<n; i++) {
      id = friends[i];
      item = aggItems[id];
      if (contains(item.ids, oldIds)) {
        aggItems[id] = updateItem(item, oldIds, newId);
      }
    }
  }

  function updateItem(item, oldIds, newId) {
    var a = item.ids[0];
    var b = item.ids[1];
    var key;
    if (oldIds[0] == a || oldIds[1] == a) a = newId;
    if (oldIds[0] == b || oldIds[1] == b) b = newId;
    if (a == b) return null;
    item.ids = [a, b];
    key = clusterKey(item);
    if (key in aggIndex) return null;
    aggIndex[key] = true;
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
};

MapShaper.getPolygonClusterCalculator = function(opts) {
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
};
