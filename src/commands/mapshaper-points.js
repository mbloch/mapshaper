/* @requires
mapshaper-data-table
mapshaper-dataset-utils
mapshaper-polygon-centroid
mapshaper-anchor-points
mapshaper-inner-points
mapshaper-geom
*/

api.createPointLayer = function(srcLyr, arcs, opts) {
  var destLyr = internal.getOutputLayer(srcLyr, opts);
  if (opts.interpolated) {
    // TODO: consider making attributed points, including distance from origin
    destLyr.shapes = internal.interpolatedPointsFromVertices(srcLyr, arcs, opts);
  } else if (opts.vertices) {
    destLyr.shapes = internal.pointsFromVertices(srcLyr, arcs, opts);
  } else if (opts.endpoints) {
    destLyr.shapes = internal.pointsFromEndpoints(srcLyr, arcs, opts);
  } else if (opts.x || opts.y) {
    destLyr.shapes = internal.pointsFromDataTable(srcLyr.data, opts);
  } else {
    destLyr.shapes = internal.pointsFromPolygons(srcLyr, arcs, opts);
  }
  destLyr.geometry_type = 'point';

  var nulls = destLyr.shapes.reduce(function(sum, shp) {
    if (!shp) sum++;
    return sum;
  }, 0);

  if (nulls > 0) {
    message(utils.format('%,d of %,d points are null', nulls, destLyr.shapes.length));
  }
  if (srcLyr.data) {
    destLyr.data = opts.no_replace ? srcLyr.data.clone() : srcLyr.data;
  }
  return destLyr;
};

internal.interpolatePoint2D = function(ax, ay, bx, by, k) {
  var j = 1 - k;
  return [ax * j + bx * k, ay * j + by * k];
};

internal.interpolatePointsAlongArc = function(ids, arcs, interval) {
  var iter = arcs.getShapeIter(ids);
  var distance = arcs.isPlanar() ? distance2D : greatCircleDistance;
  var coords = [];
  var elapsedDist = 0;
  var prevX, prevY;
  var segLen, k, p;
  if (iter.hasNext()) {
    coords.push([iter.x, iter.y]);
    prevX = iter.x;
    prevY = iter.y;
  }
  while (iter.hasNext()) {
    segLen = distance(prevX, prevY, iter.x, iter.y);
    while (elapsedDist + segLen >= interval) {
      k = (interval - elapsedDist) / segLen;
      // TODO: consider using great-arc distance for lat-long points
      p = internal.interpolatePoint2D(prevX, prevY, iter.x, iter.y, k);
      elapsedDist = 0;
      coords.push(p);
      prevX = p[0];
      prevY = p[1];
      segLen = distance(prevX, prevY, iter.x, iter.y);
    }
    elapsedDist += segLen;
    prevX = iter.x;
    prevY = iter.y;
  }
  if (elapsedDist > 0) {
    coords.push([prevX, prevY]);
  }
  return coords;
};

internal.interpolatedPointsFromVertices = function(lyr, arcs, opts) {
  var interval = opts.interval;
  var coords;
  if (interval > 0 === false) stop("Invalid interpolation interval:", interval);
  if (lyr.geometry_type != 'polyline') stop("Expected a polyline layer");
  return lyr.shapes.map(function(shp, shpId) {
    coords = [];
    if (shp) shp.forEach(nextPart);
    return coords.length > 0 ? coords : null;
  });
  function nextPart(ids) {
    var points = internal.interpolatePointsAlongArc(ids, arcs, interval);
    coords = coords.concat(points);
  }
};

internal.pointsFromVertices = function(lyr, arcs, opts) {
  var coords, index;
  if (lyr.geometry_type != "polygon" && lyr.geometry_type != 'polyline') {
    stop("Expected a polygon or polyline layer");
  }
  return lyr.shapes.map(function(shp, shpId) {
    coords = [];
    index = {}; // TODO: use more efficient index
    (shp || []).forEach(nextPart);
    return coords.length > 0 ? coords : null;
  });

  function addPoint(p) {
    var key = p.x + '~' + p.y;
    if (key in index === false) {
      index[key] = true;
      coords.push([p.x, p.y]);
    }
  }

  function nextPart(ids) {
    var iter = arcs.getShapeIter(ids);
    while (iter.hasNext()) {
      addPoint(iter);
    }
  }
};

internal.pointsFromEndpoints = function(lyr, arcs) {
  var coords, index;
  if (lyr.geometry_type != "polygon" && lyr.geometry_type != 'polyline') {
    stop("Expected a polygon or polyline layer");
  }
  return lyr.shapes.map(function(shp, shpId) {
    coords = [];
    index = {}; // TODO: use more efficient index
    (shp || []).forEach(nextPart);
    return coords.length > 0 ? coords : null;
  });

  function addPoint(p) {
    var key = p.x + '~' + p.y;
    if (key in index === false) {
      index[key] = true;
      coords.push([p.x, p.y]);
    }
  }

  function nextPart(ids) {
    for (var i=0; i<ids.length; i++) {
      addPoint(arcs.getVertex(ids[i], 0));
      addPoint(arcs.getVertex(ids[i], -1));
    }
  }
};

internal.pointsFromPolygons = function(lyr, arcs, opts) {
  if (lyr.geometry_type != "polygon") {
    stop("Expected a polygon layer");
  }
  var func = opts.inner ? internal.findAnchorPoint : geom.getShapeCentroid;
  return lyr.shapes.map(function(shp) {
    var p = func(shp, arcs);
    return p ? [[p.x, p.y]] : null;
  });
};

internal.pointsFromDataTable = function(data, opts) {
  if (!data) stop("Layer is missing a data table");
  if (!opts.x || !opts.y || !data.fieldExists(opts.x) || !data.fieldExists(opts.y)) {
    stop("Missing x,y data fields");
  }

  return data.getRecords().map(function(rec) {
    var x = rec[opts.x],
        y = rec[opts.y];
    if (!utils.isFiniteNumber(x) || !utils.isFiniteNumber(y)) {
      return null;
    }
    return [[x, y]];
  });

};
