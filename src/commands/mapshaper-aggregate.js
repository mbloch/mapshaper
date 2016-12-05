/* @requires mapshaper-polygon-neighbors, mapshaper-common, mapshaper-shape-geom */

api.aggregate = function(lyr, arcs, opts) {
  MapShaper.requirePolygonLayer(lyr, "[aggregate] Command requires a polygon layer");
  // var groups = MapShaper.aggregatePolygons(lyr, arcs, opts);
};

MapShaper.aggregatePolygons = function(lyr, arcs, opts) {
  var maxArea = opts.max_area || null;
  var pct = opts.pct || 1;
  var count = 0;
  var n = lyr.shapes.length;
  var aggItem;
  var shapeItems = lyr.shapes.map(function(shp, i) {
    return {
      group: [i],
      merges: [], // backreferences to agg items that reference this shape
      area: geom.getShapeArea(shp, arcs)
    };
  });
  var aggItems = MapShaper.findNeighbors(lyr.shapes, arcs).map(function(ab) {
    var item = {
      a: ab[0], // a & b are indexes of ShapeItems
      b: ab[1],
      score: 0
    },
    a = shapeItems[item.a],
    b = shapeItems[item.b];
    a.merges.push(item);
    b.merges.push(item);
    item.score = MapShaper.calcAggregationScore(a, b);
    return item;
  });

  MapShaper.sortAggregationQueue(aggItems);

  while (aggregate(aggItems.pop())) {
    if (++count >= n) break;
  }

  function aggregate(item) {
    if (item.score > maxArea) return false;
    var a = item.a;
    var b = item.b;
    // a merged into b
    shapeItems[a] = null;
    shapeItems[b] = MapShaper.mergeTwoShapes(shapeItems[a], shapeItems[b]);

  }

  //console.log(aggItems);
  //console.log(shapeItems);
};

// a, b: shape indexes
MapShaper.updateBackreferences = function(refs, removedItem) {
  var updated = [];
  var item;
  for (var i=0; i<refs.length; i++) {
    item = refs[i];
    if (item == removedItem) continue;
    // update

  }

};

MapShaper.mergeTwoShapes = function(a, b, item) {
  var arefs = MapShaper.updateBackreferences(a.merges, item);
  var brefs = MapShaper.updateBackreferences(b.merges, item);
  var merged = {
    groups: a.groups.concat(b.group),
    merges: arefs.concat(brefs),
    area: a.area + b.area
  };
  return merged;
};

MapShaper.sortAggregationQueue = function(arr) {
  arr.sort(function(a, b) {
    return b.score - a.score;
  });
};

MapShaper.calcAggregationScore = function(a, b) {
  return a.area + b.area || 0;
};
