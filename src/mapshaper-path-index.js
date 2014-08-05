/* @requires mapshaper-shape-utils, mapshaper-shape-geom, mapshaper-polygon-index */

MapShaper.PathIndex = PathIndex;

function PathIndex(shapes, arcs) {
  var _index;
  var pathIndexes = {}; //
  init(shapes);

  function init(shapes) {
    var boxes = [];
    var totalArea = arcs.getBounds().area();

    shapes.forEach(function(shp) {
      if (shp) {
        MapShaper.forEachPath(shp, addPath);
      }
    });

    _index = require('rbush')();
    _index.load(boxes);

    function addPath(ids, i) {
      var bounds = arcs.getSimpleShapeBounds(ids);
      var bbox = bounds.toArray();
      bbox.ids = ids;
      bbox.i = i;
      bbox.bounds = bounds;
      boxes.push(bbox);
      if (bounds.area() > totalArea * 0.02) {
        pathIndexes[i] = new PolygonIndex([ids], arcs);
      }
    }
  }

  // Test if a polygon ring is contained within an indexed ring
  // Not a true polygon-in-polygon test
  // Assumes that the target ring does not cross an indexed ring at any point
  // or share a segment with an indexed ring. (Intersecting rings should have
  // been detected previously).
  //
  this.pathIsEnclosed = function(pathIds) {
    var pathBounds = arcs.getSimpleShapeBounds(pathIds),
        cands = _index.search(pathBounds.toArray()),
        p = getTestPoint(pathIds),
        count = 0;

    cands.forEach(function(cand) {
      if (cand.i in pathIndexes) {
        if (pathIndexes[cand.i].pointInPolygon(p.x, p.y)) {
          count++;
        }
      } else if (pathContainsPoint(cand.ids, cand.bounds, p)) {
        count++;
      }
    });
    return count % 2 == 1;
  };

  // return array of paths that are contained within a path, or null if none
  // @pathIds Array of arc ids comprising a closed path
  this.findEnclosedPaths = function(pathIds) {
    var pathBounds = arcs.getSimpleShapeBounds(pathIds),
        cands = _index.search(pathBounds.toArray()),
        paths = [];

    cands.forEach(function(cand) {
      var p = getTestPoint(cand.ids);
      if (pathContainsPoint(pathIds, pathBounds, p)) {
        paths.push(cand.ids);
      }
    });
    return paths.length > 0 ? paths : null;
  };

  this.findPathsInsideShape = function(shape) {
    var paths = [];
    shape.forEach(function(ids) {
      var enclosed = this.findEnclosedPaths(ids);
      // console.log("enclosed:", enclosed)
      if (enclosed) {
        paths = xorArrays(paths, enclosed);
        // console.log("xor:", paths)
      }
    }, this);
    return paths.length > 0 ? paths : null;
  };

  function getTestPoint(pathIds) {
    // test point halfway along first segment because ring might still be
    // enclosed if a segment endpoint touches an indexed ring.
    var p0 = arcs.getVertex(pathIds[0], 0),
        p1 = arcs.getVertex(pathIds[0], 1);
    return {
      x: (p0.x + p1.x) / 2,
      y: (p0.y + p1.y) / 2
    };
  }

  function pathContainsPoint(pathIds, pathBounds, p) {
    if (pathBounds.containsPoint(p.x, p.y) === false) return false;
    // A contains B iff some point on B is inside A
    var inside = geom.testPointInRing(p.x, p.y, pathIds, arcs);
    return inside;
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
