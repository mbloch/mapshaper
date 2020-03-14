/* @requires mapshaper-shape-utils, mapshaper-path-index */

// Delete rings that are nested directly inside an enclosing ring with the same winding direction
// Does not remove unenclosed CCW rings (currently this causes problems when
//   rounding coordinates for SVG and TopoJSON output)
// Assumes ring boundaries do not overlap (should be true after e.g. dissolving)
//
internal.fixNestingErrors = function(rings, arcs) {
  if (rings.length <= 1) return rings;
  var ringData = internal.getPathMetadata(rings, arcs, 'polygon');
  // convert rings to shapes for PathIndex
  var shapes = rings.map(function(ids) {return [ids];});
  var index = new PathIndex(shapes, arcs);
  return rings.filter(ringIsValid);

  function ringIsValid(ids, i) {
    var containerId = index.findSmallestEnclosingPolygon(ids);
    var ringIsCW, containerIsCW;
    var valid = true;
    if (containerId > -1) {
      ringIsCW = ringData[i].area > 0;
      containerIsCW = ringData[containerId].area > 0;
      if (containerIsCW == ringIsCW) {
        // reject rings with same chirality as their containing ring
        valid = false;
      }
    }
    return valid;
  }
};

// Set winding order of polygon rings so that outer rings are CW, first-order
// nested rings are CCW, etc.
internal.rewindPolygons = function(lyr, arcs) {
  lyr.shapes = lyr.shapes.map(function(shp) {
    if (!shp) return null;
    return internal.rewindPolygon(shp, arcs);
  });
};

// Convert CCW rings that are not contained into CW rings
internal.rewindPolygon = function(rings, arcs) {
  var ringData = internal.getPathMetadata(rings, arcs, 'polygon');
  // convert rings to shapes for PathIndex
  // var shapes = rings.map(function(ids) {return [ids];});
  // var index = new PathIndex(shapes, arcs);

  // sort large to small
  ringData.sort(function(a, b) {
    return Math.abs(b.area) - Math.abs(a.area);
  });
  ringData.forEach(fixRing);
  return ringData.map(function(data) { return data.ids; });

  // TODO: consider other kinds of nesting errors
  function fixRing(ring, i) {
    var shouldBeCW = true;
    var largerRing;
    var j = i;
    while (--j >= 0) {
      largerRing = ringData[j];
      if (internal.testRingInRing(ring, largerRing, arcs)) {
        shouldBeCW = largerRing.area > 0 ? false : true; // opposite of containing ring
        break;
      }
    }
    internal.setRingWinding(ring, shouldBeCW);
  }
};

internal.setRingWinding = function(data, cw) {
  var isCW = data.area > 0;
  if (isCW != cw) {
    data.area = -data.area;
    internal.reversePath(data.ids);
  }
};

internal.getNestingTestPoint = function(ring, arcs) {
  var arcId = ring[0],
      p0 = arcs.getVertex(arcId, 0),
      p1 = arcs.getVertex(arcId, 1);
  // return [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2];
  return [p0.x, p0.y];
};


// a, b: two ring data objects (from getPathMetadata);
internal.testRingInRing = function(a, b, arcs) {
  if (b.bounds.contains(a.bounds) === false) return false;
  var p = internal.getNestingTestPoint(a.ids, arcs);
  return geom.testPointInRing(p[0], p[1], b.ids, arcs) == 1;
};
