
import { getBoundsSearchFunction } from '../geom/mapshaper-bounds-search';
import { getPathBounds } from '../paths/mapshaper-path-utils';
import { PolygonIndex } from '../polygons/mapshaper-polygon-index';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';

// PathIndex supports several kinds of spatial query on a layer of polyline or polygon shapes
export function PathIndex(shapes, arcs) {
  var boundsQuery = getBoundsSearchFunction(getRingData(shapes, arcs));
  var totalArea = getPathBounds(shapes, arcs).area();

  function getRingData(shapes, arcs) {
    var arr = [];
    shapes.forEach(function(shp, shpId) {
      var n = shp ? shp.length : 0;
      for (var i=0; i<n; i++) {
        arr.push({
          ids: shp[i],
          id: shpId,
          bounds: arcs.getSimpleShapeBounds(shp[i])
        });
      }
    });
    return arr;
  }

  // Returns shape ids of all polygons that intersect point p
  // (p is inside a ring or on the boundary)
  this.findEnclosingShapes = function(p) {
    var ids = [];
    var cands = findPointHitCandidates(p);
    var groups = groupItemsByShapeId(cands);
    groups.forEach(function(group) {
      if (testPointInRings(p, group)) {
        ids.push(group[0].id);
      }
    });
    return ids;
  };

  // Returns shape id of a polygon that intersects p or -1
  // (If multiple intersections, returns one of the polygons)
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

  // Returns shape ids of polygons that contain an arc
  // (arcs that are )
  // Assumes that input arc is either inside, outside or coterminous with indexed
  // arcs (i.e. input arc does not cross an indexed arc)
  this.findShapesEnclosingArc = function(arcId) {
    var p = getTestPoint([arcId]);
    return this.findEnclosingShapes(p);
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
    var cands = findPointHitCandidates(p);
    cands.forEach(function(cand) {
      if (cand.bounds.contains(bounds) && // skip partially intersecting bboxes (can't be enclosures)
        !cand.bounds.sameBounds(bounds) && // skip self, congruent and reversed-congruent rings
        !(smallest && smallest.bounds.area() < cand.bounds.area())) {
            if (testPointInRing(p, cand)) {
              smallest = cand;
            }
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
    var b = arcs.getSimpleShapeBounds(pathIds),
        cands = boundsQuery(b.xmin, b.ymin, b.xmax, b.ymax),
        paths = [],
        index;

    if (cands.length > 6) {
      index = new PolygonIndex([pathIds], arcs);
    }
    cands.forEach(function(cand) {
      var p = getTestPoint(cand.ids);
      var isEnclosed = b.containsPoint(p[0], p[1]) &&
        // added a bounds-in-bounds test to handle a case where the test point
        // fell along the shared boundary of two rings, but the rings did no overlap
        // (this gave a false positive for the enclosure test)
        // (for speed, the midpoint of an arc is used as the test point; this
        // works well in the typical case where rings to not share an edge.
        // Finding an internal test point would be better, we just need a fast
        // function to find internal points)
        b.contains(cand.bounds) &&
        (index ? index.pointInPolygon(p[0], p[1]) : geom.testPointInRing(p[0], p[1], pathIds, arcs));
      if (isEnclosed) {
        paths.push(cand.ids);
      }
    });
    return paths.length > 0 ? paths : null;
  };

  // return array of indexed paths within a given shape
  this.findPathsInsideShape = function(shape) {
    var paths = []; // list of enclosed paths
    shape.forEach(function(ids) {
      var enclosed = this.findEnclosedPaths(ids);
      if (enclosed) {
        // any paths that are enclosed by an even number of rings are removed from list
        // (given normal topology, such paths are inside holes)
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
    return boundsQuery(p[0] - b, p[1] - b, p[0] + b, p[1] + b);
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

  // concatenate arrays, removing elements that are in both
  function xorArrays(a, b) {
    var xor = [], i;
    for (i=0; i<a.length; i++) {
      if (b.indexOf(a[i]) == -1) xor.push(a[i]);
    }
    for (i=0; i<b.length; i++) {
      if (a.indexOf(b[i]) == -1) xor.push(b[i]);
    }
    return xor;
  }
}

