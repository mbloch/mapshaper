/* @requires mapshaper-common */

MapShaper.exportPointData = function(shape) {
  var path = MapShaper.transposePoints(shape);
  var data = {
    pathData: [path],
    pointCount: path.pointCount
  };
  if (path.pointCount > 0) {
    data.partCount = 1;
    data.bounds = MapShaper.calcXYBounds(path.xx, path.yy);
  } else {
    data.partCount = 0;
  }
  return data;
};

// TODO: used by shapefile export too -- move to another file
// also: consider splitting into polygon / polyline / point functions
MapShaper.exportPathData = function(shape, arcs, type) {
  // kludge until Shapefile refactoring is improved
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
        path.area = msSignedRingArea(path.xx, path.yy);
        valid = path.pointCount > 3 && path.area !== 0;
      } else if (type == 'polyline') {
        valid = path.pointCount > 1;
      }
      if (valid) {
        pointCount += path.pointCount;
        path.bounds = MapShaper.calcXYBounds(path.xx, path.yy);
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

// Bundle holes with their containing rings, for Topo/GeoJSON export
// Assume outer rings are CW and inner (hole) rings are CCW, like Shapefile
// @paths array of path objects from exportShapeData()
//
MapShaper.groupMultiPolygonPaths = function(paths) {
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
          contained = part.bounds.contains(hole.bounds);
      if (contained && (containerArea === 0 || part.area < containerArea)) {
        containerArea = part.area;
        containerId = i;
      }
    }
    if (containerId == -1) {
      verbose("[groupMultiShapePaths()] polygon hole is missing a containing ring, dropping.");
    } else {
      output[containerId].push(hole);
    }
  });
  return output;
};

MapShaper.transposePoints = function(points) {
  var xx = [], yy = [], n=points.length;
  for (var i=0; i<n; i++) {
    xx.push(points[i][0]);
    yy.push(points[i][1]);
  }
  return {xx: xx, yy: yy, pointCount: n};
};

MapShaper.exportPathCoords = function(iter) {
  var xx = [], yy = [],
      i = 0,
      x, y, prevX, prevY;
  while (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    if (i === 0 || prevX != x || prevY != y) {
      xx.push(x);
      yy.push(y);
      i++;
    }
    prevX = x;
    prevY = y;
  }
  return {
    xx: xx,
    yy: yy,
    pointCount: xx.length
  };
};
