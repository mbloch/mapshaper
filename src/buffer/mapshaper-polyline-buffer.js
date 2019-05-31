/* @requires mapshaper-buffer-common, mapshaper-shape-iter, mapshaper-geodesic */

internal.makePolylineBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makeShapeBufferGeoJSON(lyr, dataset, opts);
  return internal.importGeoJSON(geojson, {});
  // TODO: dissolve overlaps
};

internal.makeShapeBufferGeoJSON = function(lyr, dataset, opts) {
  var distanceFn = internal.getBufferDistanceFunction(lyr, dataset, opts);
  var geod = internal.getGeodeticSegmentFunction(dataset, false); // fast version creates artifacts
  var bearing = internal.getBearingFunction(dataset);
  var makerOpts = utils.extend({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer = internal.getPolylineBufferMaker(dataset.arcs, geod, bearing, makerOpts);
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

internal.getPathBufferMaker = function(arcs, geod, bearing, opts) {
  var pathIter = new ShapeIter(arcs);
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  // TODO: implement other join styles than round

  function makeJoin(x, y, direction1, direction2, dist) {
    var angle = getJoinAngle(direction1, direction2);
    var points;
    if (angle > 0) {
      points = makeRoundJoin(x, y, direction1, angle, dist);
    } else {
      // TODO: handle concave joins where the buffer distance is
      //   so long that points need to be interpolated
      points = [];
    }
    return points;
  }

  function makeRoundJoin(x, y, startDir, angle, dist) {
    var increment = 10;
    var endDir = startDir + angle;
    var dir = startDir + increment;
    var points = [];
    while (dir < endDir) {
      points.push(geod(x, y, dir, dist));
      dir += increment;
    }
    return points;
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
    // if (delta < -90 || delta > 270) console.log("bad delta:", delta)
    return delta;
  }

  return function(path, dist) {
    var left = [];
    var x0, y0, x1, y1, x2, y2;
    var angle, prevAngle, firstAngle;
    var i = 0;
    pathIter.init(path);

    while (pathIter.hasNext()) {
      if (pathIter.x === x2 && pathIter.y === y2) continue; // skip duplicate points
      x1 = x2;
      y1 = y2;
      x2 = pathIter.x;
      y2 = pathIter.y;
      prevAngle = angle;
      if (i >= 1) {
        angle = bearing(x1, y1, x2, y2);
        if (i >= 2) {
          // add join
          left.push.apply(left, makeJoin(x1, y1, prevAngle - 90, angle - 90, dist));
        }
        left.push(geod(x1, y1, angle - 90, dist)); // extrude first segment endpoint
        //left.push([x1, y1], geod(x1, y1, angle - 90, dist)) // debug extrusion lines
        left.push(geod(x2, y2, angle - 90, dist)); // extrude second segment endpoint
        //left.push([x2, y2], geod(x2, y2, angle - 90, dist)) // debug extrusion lines
      }
      if (i == 1) {
        firstAngle = angle;
        x0 = x1;
        y0 = y1;
      }
      i++;
    }
    // TODO: handle defective polylines

    if (x2 == x0 && y2 == y0) {
      // add join to finish closed path
      left.push.apply(left, makeJoin(x2, y2, angle - 90, firstAngle - 90, dist));
    } else {
      // add a cap to finish open path
      left.push.apply(left, makeCap(x2, y2, angle, dist));
    }
    return left;
  };
};

internal.getPolylineBufferMaker = function(arcs, geod, bearing, opts) {
  var maker = internal.getPathBufferMaker(arcs, geod, bearing, opts);
  var geomType = opts.geometry_type;

  function bufferPath(path, dist, geomType) {
    var coords = maker(path, dist);
    var revPath;
    if (geomType == 'polyline') {
      revPath  = internal.reversePath(path.concat());
      coords = coords.concat(maker(revPath, dist));
    }
    coords.push(coords[0].concat()); // close path
    return [coords];
  }

  return function(shape, dist) {
    var coords = [], part, geom;
    for (var i=0; i<shape.length; i++) {
      part = bufferPath(shape[i], dist);
      if (part) {
        coords.push(part);
      }
    }
    if (coords.length === 0) {
      geom = null;
    } else if (coords.length == 1) {
      geom = {
        type: 'Polygon',
        coordinates: coords[0]
      };
    } else {
      geom = {
        type: 'MultiPolygon',
        coordinates: coords
      };
    }
    return geom;
  };
};
