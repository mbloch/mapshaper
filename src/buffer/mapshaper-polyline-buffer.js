/* @requires mapshaper-buffer-common, mapshaper-shape-iter, mapshaper-geodesic, mapshaper-geojson */

internal.makePolylineBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = internal.importGeoJSON(geojson, {});
  internal.dissolveBufferDataset(dataset2, opts);
  return dataset2;
};

internal.makeShapeBufferGeoJSON = function(lyr, dataset, opts) {
  var distanceFn = internal.getBufferDistanceFunction(lyr, dataset, opts);
  var geod = internal.getGeodeticSegmentFunction(dataset, true);
  var getBearing = internal.getBearingFunction(dataset);
  var makerOpts = utils.extend({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer = internal.getPolylineBufferMaker(dataset.arcs, geod, getBearing, makerOpts);
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return makeShapeBuffer(shape, dist, lyr.geometry_type);
  });
  // TODO: make sure that importer supports null geometries (not standard GeoJSON);
  return {
    type: 'GeometryCollection',
    geometries: geometries
  };
};

internal.getPathBufferMaker = function(arcs, geod, getBearing, opts) {
  var pathIter = new ShapeIter(arcs);
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  // TODO: implement other join styles than round

  function addRoundJoin(arr, x, y, startDir, angle, dist) {
    var increment = 10;
    var endDir = startDir + angle;
    var dir = startDir + increment;
    while (dir < endDir) {
      addVertex(arr, geod(x, y, dir, dist));
      dir += increment;
    }
  }

  // Test if two points are within a snapping tolerance
  // TODO: calculate the tolerance more sensibly
  function veryClose(x1, y1, x2, y2) {
    // return false;
    var tol = 0.00001;
    var dist = geom.distance2D(x1, y1, x2, y2);
    return dist < tol;
  }

  function veryCloseToPrevPoint(arr, x, y) {
    var prev = arr[arr.length - 1];
    return veryClose(prev[0], prev[1], x, y);
  }

  function addVertex(arr, d) {
    var maxBacktrack = opts.backtrack >= 0 ? opts.backtrack : 10;
    var pointsToRemove = 0;
    var len = arr.length;
    var a, b, c, idx, hit;
    if (len < 3) {
      arr.push(d);
      return;
    }
    c = arr[len - 1];
    for (var i=0; i<maxBacktrack; i++) {
      idx = len - 3 - i;
      if (idx < 0) break; // reached beginning of the line
      a = arr[idx];
      b = arr[idx + 1];
      // TODO: consider using a geodetic intersection function for lat-long datasets
      hit = geom.segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      if (hit) {
        // TODO: handle collinear segments
        // if (hit.length != 2) console.log('COLLINEAR')
        pointsToRemove = i + 2; // remove interior points
        break;
      }
    }
    if (hit && pointsToRemove > 0) {
      // segments intersect -- replace two internal segment endpoints with xx point
      while (pointsToRemove--) arr.pop();
      // TODO: check proximity of hit to several points
      arr.push(hit);
    }

    // TODO: check proximity to previous point
    arr.push(d); // add new point
  }

  function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    if (ax < cx && ax < dx && bx < cx && bx < dx) return null;
    if (ax > cx && ax > dx && bx > cx && bx > dx) return null;
    if (ay < cy && ay < dy && by < cy && by < dy) return null;
    if (ay > cy && ay > dy && by > cy && by > dy) return null;
    return geom.segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy);
  }

  function makeCap(x, y, direction, dist) {
    if (capStyle == 'flat') {
      return [[x, y]];
    }
    return makeRoundCap(x, y, direction, dist);
  }

  function makeRoundCap(x, y, segmentDir, dist) {
    var points = [];
    var increment = 10;
    var startDir = segmentDir - 90;
    var angle = increment;
    while (angle < 180) {
      points.push(geod(x, y, startDir + angle, dist));
      angle += increment;
    }
    return points;
  }

  // get angle between two extruded segments in degrees
  // positive angle means join in convex (range: 0-180 degrees)
  // negative angle means join is concave (range: -180-0 degrees)
  function getJoinAngle(direction1, direction2) {
    var delta = direction2 - direction1;
    if (delta > 180) {
      delta -= 360;
    }
    if (delta < -180) {
      delta += 360;
    }
    return delta;
  }

  return function(path, dist) {
    var left = [];
    var x0, y0, x1, y1, x2, y2;
    var p1, p2;
    var bearing, prevBearing, firstBearing, joinAngle;
    var i = 0;
    pathIter.init(path);

    while (pathIter.hasNext()) {
      // TODO: use a tolerance
      if (pathIter.x === x2 && pathIter.y === y2) continue; // skip duplicate points
      x1 = x2;
      y1 = y2;
      x2 = pathIter.x;
      y2 = pathIter.y;
      if (i >= 1) {
        prevBearing = bearing;
        bearing = getBearing(x1, y1, x2, y2);
        p1 = geod(x1, y1, bearing - 90, dist);
        p2 = geod(x2, y2, bearing - 90, dist);
        // left.push([x1, y1], p1) // debug extrusion lines
        // left.push([x2, y2], p2) // debug extrusion lines
      }
      if (i == 1) {
        firstBearing = bearing;
        x0 = x1;
        y0 = y1;
        left.push(p1, p2);
      }
      if (i > 1) {
        joinAngle = getJoinAngle(prevBearing, bearing);
        if (veryCloseToPrevPoint(left, p1[0], p1[1])) {
          // skip first point
          addVertex(left, p2);
        } else if (joinAngle > 0) {
          addRoundJoin(left, x1, y1, prevBearing - 90, joinAngle, dist);
          addVertex(left, p1);
          addVertex(left, p2);
        } else {
          addVertex(left, p1);
          addVertex(left, p2);
        }
      }
      i++;
    }
    // TODO: handle defective polylines

    if (x2 == x0 && y2 == y0) {
      // add join to finish closed path
      joinAngle = getJoinAngle(bearing, firstBearing);
      if (joinAngle > 0) {
        addRoundJoin(left, x2, y2, bearing - 90, joinAngle, dist);
      }
    } else {
      // add a cap to finish open path
      left.push.apply(left, makeCap(x2, y2, bearing, dist));
    }
    return left;
  };
};

internal.getPolylineBufferMaker = function(arcs, geod, getBearing, opts) {
  var maker = internal.getPathBufferMaker(arcs, geod, getBearing, opts);
  var geomType = opts.geometry_type;
  // polyline output could be used for debugging
  var outputGeom = opts.output_geometry == 'polyline' ? 'polyline' : 'polygon';
  var singleType = outputGeom == 'polyline' ? 'LineString' : 'Polygon';
  var multiType = outputGeom == 'polyline' ? 'MultiLineString' : 'MultiPolygon';

  function bufferPath(path, dist) {
    var coords = maker(path, dist);
    var revPath;
    if (geomType == 'polyline') {
      revPath = internal.reversePath(path.concat());
      coords = coords.concat(maker(revPath, dist));
    }
    coords.push(coords[0].concat()); // close path
    return coords;
  }

  return function(shape, dist) {
    var coords = [], part, geom;
    for (var i=0; i<shape.length; i++) {
      part = bufferPath(shape[i], dist);
      if (!part) continue;
      coords.push(outputGeom == 'polyline' ? part : [part]);
    }
    if (coords.length === 0) {
      geom = null;
    } else if (coords.length == 1) {
      geom = {
        type: singleType,
        coordinates: coords[0]
      };
    } else {
      geom = {
        type: multiType,
        coordinates: coords
      };
    }
    return geom;
  };
};
