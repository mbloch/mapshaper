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
      var item = rbushBounds(bounds.toArray());
      item.ids = ids;
      item.bounds = bounds;
      item.id = shpId;
      boxes.push(item);
    }
  }

  // Returns shape ids of all polygons that intersect point p
  // (p is inside a ring or on the boundary)
  this.findEnclosingShapes = function(p) {
    var ids = [];
    var groups = groupItemsByShapeId(findPointHitCandidates(p));
    groups.forEach(function(group) {
      if (testPointInRings(p, group)) {
        ids.push(group[0].id);
      }
    });
    return ids;
  };

  // Returns shape id of a polygon that intersects p or -1
  // (If multiple intersections, returns on of the polygons)
  this.findEnclosingShape = function(p) {
    var shpId = -1;
    var groups = groupItemsByShapeId(findPointHitCandidates(p));
    groups.forEach(function(group) {
      if (testPointInRings(p, group)) {
        shpId = group[0].id;
      }
    });
    return shpId;
  };

  this.findPointEnclosureCandidates = function(p, buffer) {
    var items = findPointHitCandidates(p, buffer);
    return utils.pluck(items, 'id');
  };

  this.pointIsEnclosed = function(p) {
    return testPointInRings(p, findPointHitCandidates(p));
  };

  // Finds the polygon containing the smallest ring that entirely contains @ring
  // Assumes ring boundaries do not cross.
  // Unhandled edge case:
  //   two rings share at least one segment but are not congruent.
  // @ring: array of arc ids
  // Returns id of enclosing polygon or -1 if none found
  this.findSmallestEnclosingPolygon = function(ring) {
    var bounds = arcs.getSimpleShapeBounds(ring);
    var p = getTestPoint(ring);
    var smallest;
    findPointHitCandidates(p).forEach(function(cand) {
      if (cand.bounds.contains(bounds) && // skip partially intersecting bboxes (can't be enclosures)
          !cand.bounds.sameBounds(bounds) && // skip self, congruent and reversed-congruent rings
          !(smallest && smallest.bounds.area() < cand.bounds.area()) &&
          testPointInRing(p, cand)) {
        smallest = cand;
      }
    });

    return smallest ? smallest.id : -1;
  };

  this.arcIsEnclosed = function(arcId) {
    return this.pointIsEnclosed(getTestPoint([arcId]));
  };

  // Test if a polygon ring is contained within an indexed ring
  // Not a true polygon-in-polygon test
  // Assumes that the target ring does not cross an indexed ring at any point
  // or share a segment with an indexed ring. (Intersecting rings should have
  // been detected previously).
  //
  this.pathIsEnclosed = function(pathIds) {
    return this.pointIsEnclosed(getTestPoint(pathIds));
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
      var p = getTestPoint(cand.ids);
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

  //
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

  function groupItemsByShapeId(items) {
    var groups = [],
        group, item;
    if (items.length > 0) {
      items.sort(function(a, b) {return a.id - b.id;});
      for (var i=0; i<items.length; i++) {
        item = items[i];
        if (i === 0 || item.id != items[i-1].id) {
          groups.push(group=[]);
        }
        group.push(item);
      }
    }
    return groups;
  }

  function findPointHitCandidates(p, buffer) {
    var b = buffer > 0 ? buffer : 0;
    var x = p[0], y = p[1];
    return _index.search(rbushBounds([p[0] - b, p[1] - b, p[0] + b, p[1] + b]));
  }

  // Find a point on a ring to use for point-in-polygon testing
  function getTestPoint(ring) {
    // Use the point halfway along first segment rather than an endpoint
    // (because ring might still be enclosed if a segment endpoint touches an indexed ring.)
    // The returned point should work for point-in-polygon testing if two rings do not
    // share any common segments (which should be true for topological datasets)
    // TODO: consider alternative of finding an internal point of @ring (slower but
    //   potentially more reliable).
    var arcId = ring[0],
        p0 = arcs.getVertex(arcId, 0),
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
