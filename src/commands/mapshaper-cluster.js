/* @requires mapshaper-polygon-neighbors, mapshaper-common, mapshaper-shape-geom */

api.cluster = function(lyr, arcs, opts) {
  MapShaper.requirePolygonLayer(lyr, "[cluster] Command requires a polygon layer");
  var idField = opts.id_field || "cluster";
  var groups = MapShaper.calcAggregationGroups(lyr, arcs, opts);
  MapShaper.insertFieldValues(lyr, idField, groups);
  return lyr;
};

MapShaper.calcAggregationGroups = function(lyr, arcs, opts) {
  var calcScore = MapShaper.getAggregationCalculator(opts);
  var groupField = opts.group_by || null;
  var size = lyr.shapes.length;
  var count = Math.round(size * (opts.pct || 1));
  var tmp;

  if (groupField && !lyr.data) stop("[aggregate] Missing attribute data table");

  // working set of shapes
  var shapeItems = lyr.shapes.map(function(shp, i) {
    var groupId = groupField && lyr.data.getRecordAt(i)[groupField] || null;
    return {
      ids: [i],
      area: geom.getShapeArea(shp, arcs),
      bounds: arcs.getMultiShapeBounds(shp),
      group: groupId,
      friends: []
    };
  });

  var aggItems = MapShaper.findNeighbors(lyr.shapes, arcs).reduce(function(memo, ab, i) {
    // ab: [a, b] indexes of shape items
    var a = shapeItems[ab[0]],
        b = shapeItems[ab[1]],
        score, item;
    if (a.group === b.group) {
      score = calcScore(a, b);
      if (score > 0) {
        item = {
          ids: ab,
          score: score,
          key: String(i) // for deduping during merges
        };
        a.friends.push(item);
        b.friends.push(item);
        memo.push(item);
      }
    }
    return memo;
  }, []);

  while (count > 0 && (tmp = nextItem())) {
    merge(tmp);
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

  function nextItem() {
    var nextId = -1, next = null, item;
    for (var i=0, n=aggItems.length; i<n; i++) {
      item = aggItems[i];
      if (!item) continue;
      if (item.score <=0) {
        aggItems[i] = null;
      } else if (!next || item.score < next.score) {
        nextId = i;
        next = item;
      }
    }
    if (next) aggItems[nextId] = null;
    return next;
  }

  function getScore(ab) {
    return calcScore(shapeItems[ab[0]], shapeItems[ab[1]]);
  }

  function merge(item) {
    var shape, shapeId, i;
    var newId = shapeItems.length;
    var merged = { // new shape
      ids: [],
      friends: [],
      area: 0,
      bounds: new Bounds()
    };
    shapeItems[newId] = merged;
    for (i=0; i<item.ids.length; i++) {
      shapeId = item.ids[i];
      shape = shapeItems[shapeId];
      merged.ids = merged.ids.concat(shape.ids);
      merged.bounds.mergeBounds(shape.bounds);
      merged.area += shape.area;
      shapeItems[shapeId] = null;
      merged.friends = mergeFriends(merged.friends, shape.friends, item);
      if (shapeId < size) count--;
    }
    // update friends
    for (i=0; i<merged.friends.length; i++) {
      updateFriend(merged.friends[i], item, newId);
    }
  }

  function mergeFriends(a, b, exclude) {
    var index = {};
    var merged = [];
    var i;
    index[exclude.key] = true;
    for (i=0; i<a.length; i++) {
      if (a[i].key in index === false) merged.push(a[i]);
      index[a[i].key] = true;
    }
    for (i=0; i<b.length; i++) {
      if (b[i].key in index === false) merged.push(b[i]);
    }
    return merged;
  }

  function updateFriend(friend, item, newId) {
    var oldIds = item.ids;
    var i, j, friendId, itemId;
    for (i=0; i < oldIds.length; i++) {
      itemId = oldIds[i];
      for (j=0; j<friend.ids.length; j++) {
        friendId = friend.ids[j];
        if (friendId == itemId) {
          friend.ids[j] = newId; // update to id of merged shape
          // this may create friend that points twice to the same shape --
          // currently handling in getScore()
        }
      }
    }
    friend.score = getScore(friend.ids);
  }
};

MapShaper.getAggregationCalculator = function(opts) {
  var maxWidth = opts.max_width || Infinity;
  var maxHeight = opts.max_height || Infinity;
  var maxArea = opts.max_area || Infinity;
  return function(a, b) {
    var area = a.area + b.area,
        score = area,
        bounds = a.bounds.clone().mergeBounds(b.bounds);
    if (area > maxArea || bounds.width() > maxWidth ||
        bounds.height() > maxHeight) {
      score = -1;
    }
    if (a == b) {
      score = -1; // TODO: prevent this condition
    }
    return score;
  };
};
