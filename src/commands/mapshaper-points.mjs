import { requirePolylineLayer } from '../dataset/mapshaper-layer-utils';
import { parseDMS } from '../geom/mapshaper-dms';
import { findAnchorPoint } from '../points/mapshaper-anchor-points';
import { polylineToPoint, polylineToMidpoints } from '../paths/mapshaper-polyline-to-point';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertIntervalParam } from '../geom/mapshaper-units';
import { calcSegmentIntersectionStripeCount } from '../paths/mapshaper-segment-intersection';
import { calcSegmentIntersectionStripeCount2 } from '../paths/mapshaper-segment-intersection';
import { getOutputLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { stop, message } from '../utils/mapshaper-logging';
import { findSegmentIntersections } from '../paths/mapshaper-segment-intersection';
import { interpolatePoint2D } from '../geom/mapshaper-geodesic';

cmd.createPointLayer = function(srcLyr, dataset, opts) {
  var destLyr = getOutputLayer(srcLyr, opts);
  var arcs = dataset.arcs;
  if (opts.intersections) {
    testIntersections(arcs);
    destLyr = srcLyr;
  } else if (opts.interpolated) {
    // TODO: consider making attributed points, including distance from origin
    destLyr.shapes = interpolatedPointsFromVertices(srcLyr, dataset, opts);
  } else if (opts.vertices) {
    destLyr.shapes = pointsFromVertices(srcLyr, arcs, opts);
  } else if (opts.vertices2) {
    destLyr.shapes = pointsFromVertices2(srcLyr, arcs, opts);
  } else if (opts.endpoints) {
    destLyr.shapes = pointsFromEndpoints(srcLyr, arcs, opts);
  } else if (opts.x || opts.y) {
    destLyr.shapes = pointsFromDataTable(srcLyr.data, opts);
  } else if (srcLyr.geometry_type == 'polygon') {
    destLyr.shapes = pointsFromPolygons(srcLyr, arcs, opts);
  } else if (opts.midpoints) {
    requirePolylineLayer(srcLyr);
    destLyr.shapes = midpointsFromPolylines(srcLyr, arcs, opts);
  } else if (srcLyr.geometry_type == 'polyline') {
    destLyr.shapes = pointsFromPolylines(srcLyr, arcs, opts);
  } else if (!srcLyr.geometry_type) {
    destLyr.shapes = pointsFromDataTableAuto(srcLyr.data);
  } else {
    stop("Expected a polygon or polyline layer");
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

// TODO: finish testing stripe count functions and remove
function testIntersections(arcs) {
  var pointCount =  arcs.getFilteredPointCount(),
      arcCount = arcs.size(),
      segCount = pointCount - arcCount,
      stripes = calcSegmentIntersectionStripeCount2(arcs),
      stripes2 = Math.ceil(stripes / 10),
      stripes3 = stripes * 10,
      stripes4 = calcSegmentIntersectionStripeCount(arcs);

  console.log("points:", pointCount, "arcs:", arcCount, "segs:", segCount);
  [stripes2, stripes, stripes3, stripes4].forEach(function(n) {
    console.time(n + ' stripes');
    findSegmentIntersections(arcs, {stripes: n});
    console.timeEnd(n + ' stripes');
  });
}

function interpolatePointsAlongArc(ids, arcs, interval) {
  var iter = arcs.getShapeIter(ids);
  var distance = arcs.isPlanar() ? geom.distance2D : geom.greatCircleDistance;
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
      p = interpolatePoint2D(prevX, prevY, iter.x, iter.y, k);
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
}

function interpolatedPointsFromVertices(lyr, dataset, opts) {
  var interval = convertIntervalParam(opts.interval, getDatasetCRS(dataset));
  var coords;
  if (interval > 0 === false) stop("Invalid interpolation interval:", opts.interval);
  if (lyr.geometry_type != 'polyline') stop("Expected a polyline layer");
  return lyr.shapes.map(function(shp, shpId) {
    coords = [];
    if (shp) shp.forEach(nextPart);
    return coords.length > 0 ? coords : null;
  });
  function nextPart(ids) {
    var points = interpolatePointsAlongArc(ids, dataset.arcs, interval);
    coords = coords.concat(points);
  }
}

// Unique vertices within each feature
function pointsFromVertices(lyr, arcs, opts) {
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
}

// Simple conversion of path vertices to points (duplicate locations not removed)
// TODO: Provide some way to rebuild paths from points (e.g. multipart features)
function pointsFromVertices2(lyr, arcs, opts) {
  var coords;
  if (lyr.geometry_type != "polygon" && lyr.geometry_type != 'polyline') {
    stop("Expected a polygon or polyline layer");
  }
  return lyr.shapes.map(function(shp, shpId) {
    coords = [];
    (shp || []).forEach(nextPart);
    return coords.length > 0 ? coords : null;
  });

  function nextPart(ids) {
    var iter = arcs.getShapeIter(ids);
    while (iter.hasNext()) {
      coords.push([iter.x, iter.y]);
    }
  }
}

function pointsFromEndpoints(lyr, arcs) {
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
}

function midpointsFromPolylines(lyr, arcs, opts) {
  return lyr.shapes.map(function(shp) {
    return polylineToMidpoints(shp, arcs, opts);
  });
}

function pointsFromPolylines(lyr, arcs, opts) {
  return lyr.shapes.map(function(shp) {
    var p = polylineToPoint(shp, arcs, opts);
    return p ? [[p.x, p.y]] : null;
  });
}

export function pointsFromPolygons(lyr, arcs, opts) {
  var func = opts.inner ? findAnchorPoint : geom.getShapeCentroid;
  return lyr.shapes.map(function(shp) {
    var p = func(shp, arcs);
    return p ? [[p.x, p.y]] : null;
  });
}

export function coordinateFromValue(val) {
  var tmp;
  if (utils.isFiniteNumber(val)) {
    return val;
  }
  // exclude empty string (not a valid coordinate, but would get coerced to 0)
  if (utils.isString(val) && val !== '') {
    tmp = +val;
    if (utils.isFiniteNumber(tmp)) {
      return tmp;
    }
    tmp = parseDMS(val); // try to parse as DMS
    if (utils.isFiniteNumber(tmp)) {
      return tmp;
    }
  }
  return NaN;
}

export function findXField(fields) {
  var rxp = /^(lng|long?|longitude|x)$/i;
  return utils.find(fields, function(name) {
    return rxp.test(name);
  });
}

export function findYField(fields) {
  var rxp = /^(lat|latitude|y)$/i;
  return utils.find(fields, function(name) {
    return rxp.test(name);
  });
}

function pointsFromDataTableAuto(data) {
  var fields = data ? data.getFields() : [];
  var opts = {
    x: findXField(fields),
    y: findYField(fields)
  };
  return pointsFromDataTable(data, opts);
}

function pointsFromDataTable(data, opts) {
  if (!data) stop("Layer is missing a data table");
  if (!opts.x || !opts.y || !data.fieldExists(opts.x) || !data.fieldExists(opts.y)) {
    stop("Missing x,y data fields");
  }

  return data.getRecords().map(function(rec) {
    var x = coordinateFromValue(rec[opts.x]),
        y = coordinateFromValue(rec[opts.y]);
    if (isNaN(x) || isNaN(y)) {
      return null;
    }
    return [[x, y]];
  });
}
