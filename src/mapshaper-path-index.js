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

  // test if path is contained within an indexed path
  // assumes paths don't intersect (intersections should have been handled previously)
  this.pathIsEnclosed = function(pathIds) {
    var pathBounds = arcs.getSimpleShapeBounds(pathIds),
        cands = _index.search(pathBounds.toArray()),
        count = 0;

    cands.forEach(function(cand) {
      if (cand.i in pathIndexes) {
        var p = arcs.getVertex(pathIds[0], 0);
        if (pathIndexes[cand.i].pointInPolygon(p.x, p.y)) count++;
      } else if (pathContainsPath(cand.ids, cand.bounds, pathIds, pathBounds)) {
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
      if (pathContainsPath(pathIds, pathBounds, cand.ids, cand.bounds)) paths.push(cand.ids);
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

  // assume polygon paths do not intersect (may be adjacent)
  function pathContainsPath(idsA, boundsA, idsB, boundsB) {
    if (boundsA.contains(boundsB) === false) return false;

    // A contains B iff some point on B is inside A
    // TODO: improve performance with large polygons
    var p = arcs.getVertex(idsB[0], 0);
    var inside = geom.testPointInRing(p.x, p.y, idsA, arcs);
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
