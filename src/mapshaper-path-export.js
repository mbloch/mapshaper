/* @requires mapshaper-common */

// TODO: refactor
MapShaper.exportPointData = function(points) {
  var data, path;
  if (!points || points.length === 0) {
    data = {partCount: 0, pointCount: 0};
  } else {
    path = {
      points: points,
      pointCount: points.length,
      bounds: geom.getPathBounds(points)
    };
    data = {
      bounds: path.bounds,
      pathData: [path],
      partCount: 1,
      pointCount: path.pointCount
    };
  }
  return data;
};

// TODO: refactor
MapShaper.exportPathData = function(shape, arcs, type) {
  // kludge until Shapefile exporting is refactored
  if (type == 'point') return MapShaper.exportPointData(shape);

  var pointCount = 0,
      bounds = new Bounds(),
      paths = [];

  if (type == 'polyline' || type == 'polygon') {
    Utils.forEach(shape, function(arcIds) {
      var iter = arcs.getShapeIter(arcIds),
          path = MapShaper.exportPathCoords(iter),
          valid = true;
      if (type == 'polygon') {
        path.area = geom.getPathArea2(path.points);
        valid = path.pointCount > 3 && path.area !== 0;
      } else if (type == 'polyline') {
        valid = path.pointCount > 1;
      }
      if (valid) {
        pointCount += path.pointCount;
        path.bounds = geom.getPathBounds(path.points);
        bounds.mergeBounds(path.bounds);
        paths.push(path);
      } else {
        verbose("Skipping a collapsed", type, "path");
      }
    });
  }

  return {
    pointCount: pointCount,
    pathData: paths,
    pathCount: paths.length,
    bounds: bounds
  };
};

// Bundle holes with their containing rings for Topo/GeoJSON polygon export.
// Assumes outer rings are CW and inner (hole) rings are CCW.
// @paths output from MapShaper.exportPathData() or TopoJSON.groupPolygonRings()
//
// TODO: Improve reliability. Currently uses winding order, area and bbox to
//   identify holes and their enclosures -- could be confused by strange
//   geometry.
//
MapShaper.groupPolygonRings = function(paths) {
  var pos = [],
      neg = [];
  Utils.forEach(paths, function(path) {
    if (path.area > 0) {
      pos.push(path);
    } else if (path.area < 0) {
      neg.push(path);
    } else {
      // verbose("Zero-area ring, skipping");
    }
  });

  var output = Utils.map(pos, function(part) {
    return [part];
  });

  Utils.forEach(neg, function(hole) {
    var containerId = -1,
        containerArea = 0;
    for (var i=0, n=pos.length; i<n; i++) {
      var part = pos[i],
          contained = part.bounds.contains(hole.bounds) && part.area > -hole.area;
      if (contained && (containerArea === 0 || part.area < containerArea)) {
        containerArea = part.area;
        containerId = i;
      }
    }
    if (containerId == -1) {
      verbose("[groupPolygonRings()] polygon hole is missing a containing ring, dropping.");
    } else {
      output[containerId].push(hole);
    }
  });
  return output;
};

MapShaper.exportPathCoords = function(iter) {
  var points = [],
      i = 0,
      x, y, prevX, prevY;
  while (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    if (i === 0 || prevX != x || prevY != y) {
      points.push([x, y]);
      i++;
    }
    prevX = x;
    prevY = y;
  }
  return {
    points: points,
    pointCount: points.length
  };
};

MapShaper.arcHasLength = function(id, coords) {
  var iter = coords.getArcIter(id), x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      if (iter.x != x || iter.y != y) return true;
    }
  }
  return false;
};

MapShaper.filterEmptyArcs = function(shape, coords) {
  if (!shape) return null;
  var shape2 = [];
  Utils.forEach(shape, function(ids) {
    var path = [];
    for (var i=0; i<ids.length; i++) {
      if (MapShaper.arcHasLength(ids[i], coords)) {
        path.push(ids[i]);
      }
    }
    if (path.length > 0) shape2.push(path);
  });
  return shape2.length > 0 ? shape2 : null;
};
