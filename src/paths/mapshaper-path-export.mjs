
import geom from '../geom/mapshaper-geom';
import { verbose } from '../utils/mapshaper-logging';
import { Bounds } from '../geom/mapshaper-bounds';

export function exportPointData(points) {
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
}

// TODO: remove duplication with internal.getPathMetadata()
export function exportPathData(shape, arcs, type) {
  // kludge until Shapefile exporting is refactored
  if (type == 'point') return exportPointData(shape);

  var pointCount = 0,
      bounds = new Bounds(),
      paths = [];

  if (shape && (type == 'polyline' || type == 'polygon')) {
    shape.forEach(function(arcIds, i) {
      var iter = arcs.getShapeIter(arcIds),
          path = exportPathCoords(iter),
          valid = true;
      path.ids = arcIds;
      if (type == 'polygon') {
        path.area = geom.getPlanarPathArea2(path.points);
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
}

function exportPathCoords(iter) {
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
}
