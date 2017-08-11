/* @requires
mapshaper-shape-utils
mapshaper-dataset-utils
mapshaper-shape-geom
mapshaper-polygon-index
*/

function PathIndex(shapes, arcs) {
  var _index;
  var totalArea = internal.getPathBounds(shapes, arcs).area();
  init(shapes);

  function init(shapes) {
    var boxes = [];

    shapes.forEach(function(shp, shpId) {
      var n = shp ? shp.length : 0;
      for (var i=0; i<n; i++) {
        addPath(shp[i], shpId);
      }
    });

    _index = require('rbush')();
    _index.load(boxes);

    function addPath(ids, shpId) {
      var bounds = arcs.getSimpleShapeBounds(ids);
      var bbox = rbushBounds(bounds.toArray());
      bbox.ids = ids;
      bbox.bounds = bounds;
      bbox.id = shpId;
      boxes.push(bbox);
    }
  }

  this.findEnclosingShape = function(p) {
    var shpId = -1;
    var shapes = findPointHitShapes(p);
    shapes.forEach(function(paths) {
      if (testPointInRings(p, paths)) {
        shpId = paths[0].id;
      }
    });
    return shpId;
  };

  this.pointIsEnclosed = function(p) {
    return testPointInRings(p, findPointHitRings(p));
  };

  // return id or -1
  this.findSmallestEnclosingPolygon = function(ring, shpId) {
    var bounds = arcs.getSimpleShapeBounds(ring);
    var p = getTestPoint(ring[0]);
    var candidates = findPointHitRings(p);
    var smallest;
    candidates.forEach(function(cand) {
      if (cand.bounds.contains(bounds) &&
          shpId != cand.id &&
          !(smallest && smallest.bounds.area() < cand.bounds.area()) &&
          testPointInRing(p, cand)) {
        smallest = cand;
      }
    });

    return smallest ? smallest.id : -1;
  };

  this.arcIsEnclosed = function(arcId) {
    return this.pointIsEnclosed(getTestPoint(arcId));
  };

  // Test if a polygon ring is contained within an indexed ring
  // Not a true polygon-in-polygon test
  // Assumes that the target ring does not cross an indexed ring at any point
  // or share a segment with an indexed ring. (Intersecting rings should have
  // been detected previously).
  //
  this.pathIsEnclosed = function(pathIds) {
    var arcId = pathIds[0];
    var p = getTestPoint(arcId);
    return this.pointIsEnclosed(p);
  };

  // return array of paths that are contained within a path, or null if none
  // @pathIds Array of arc ids comprising a closed path
  this.findEnclosedPaths = function(pathIds) {
    var pathBounds = arcs.getSimpleShapeBounds(pathIds),
        cands = _index.search(rbushBounds(pathBounds.toArray())),
        paths = [],
        index;

    if (cands.length > 6) {
      index = new PolygonIndex([pathIds], arcs);
    }
    cands.forEach(function(cand) {
      var p = getTestPoint(cand.ids[0]);
      var isEnclosed = pathBounds.containsPoint(p[0], p[1]) && (index ?
        index.pointInPolygon(p[0], p[1]) : geom.testPointInRing(p[0], p[1], pathIds, arcs));
      if (isEnclosed) {
        paths.push(cand.ids);
      }
    });
    return paths.length > 0 ? paths : null;
  };

  this.findPathsInsideShape = function(shape) {
    var paths = [];
    shape.forEach(function(ids) {
      var enclosed = this.findEnclosedPaths(ids);
      if (enclosed) {
        paths = xorArrays(paths, enclosed);
      }
    }, this);
    return paths.length > 0 ? paths : null;
  };

  function testPointInRing(p, cand) {
    if (!cand.bounds.containsPoint(p[0], p[1])) return false;
    if (!cand.index && cand.bounds.area() > totalArea * 0.01) {
      // index larger polygons (because they are slower to test via pointInRing()
      //    and they are more likely to be involved in repeated hit tests).
      cand.index = new PolygonIndex([cand.ids], arcs);
    }
    return cand.index ?
        cand.index.pointInPolygon(p[0], p[1]) :
        geom.testPointInRing(p[0], p[1], cand.ids, arcs);
  }

  function testPointInRings(p, cands) {
    var isOn = false,
        isIn = false;
    cands.forEach(function(cand) {
      var inRing = testPointInRing(p, cand);
      if (inRing == -1) {
        isOn = true;
      } else if (inRing == 1) {
        isIn = !isIn;
      }
    });
    return isOn || isIn;
  }

  function rbushBounds(arr) {
    return {
      minX: arr[0],
      minY: arr[1],
      maxX: arr[2],
      maxY: arr[3]
    };
  }

  function findPointHitShapes(p) {
    var rings = findPointHitRings(p),
        shapes = [],
        shape, bbox;
    if (rings.length > 0) {
      rings.sort(function(a, b) {return a.id - b.id;});
      for (var i=0; i<rings.length; i++) {
        bbox = rings[i];
        if (i === 0 || bbox.id != rings[i-1].id) {
          shapes.push(shape=[]);
        }
        shape.push(bbox);
      }
    }
    return shapes;
  }

  function findPointHitRings(p) {
    var x = p[0],
        y = p[1];
    return _index.search(rbushBounds([x, y, x, y]));
  }

  function getTestPoint(arcId) {
    // test point halfway along first segment because ring might still be
    // enclosed if a segment endpoint touches an indexed ring.
    var p0 = arcs.getVertex(arcId, 0),
        p1 = arcs.getVertex(arcId, 1);
    return [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2];
  }

  function xorArrays(a, b) {
    var xor = [];
    a.forEach(function(el) {
      if (b.indexOf(el) == -1) xor.push(el);
    });
    b.forEach(function(el) {
      if (xor.indexOf(el) == -1) xor.push(el);
    });
    return xor;
  }
}
