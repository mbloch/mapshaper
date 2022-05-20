import { reversePath, getPathMetadata } from '../paths/mapshaper-path-utils';
import { getBoundsSearchFunction } from '../geom/mapshaper-bounds-search';
import { PathIndex } from '../paths/mapshaper-path-index';
import geom from '../geom/mapshaper-geom';
import { debug } from '../utils/mapshaper-logging';

// Delete rings that are nested directly inside an enclosing ring with the same winding direction
// Does not remove unenclosed CCW rings (currently this causes problems when
//   rounding coordinates for SVG and TopoJSON output)
// Assumes ring boundaries do not overlap (should be true after e.g. dissolving)
//
export function fixNestingErrors(rings, arcs) {
  if (rings.length <= 1) return rings;
  var ringData = getPathMetadata(rings, arcs, 'polygon');
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
}

// Set winding order of polygon rings so that outer rings are CW, first-order
// nested rings are CCW, etc.
export function rewindPolygons(lyr, arcs) {
  lyr.shapes = lyr.shapes.map(function(shp) {
    if (!shp) return null;
    return rewindPolygon(shp, arcs);
  });
}

// Update winding order of rings in a polygon so that outermost rings are
// CW and nested rings alternate between CCW and CW.
function rewindPolygon(rings, arcs) {
  var ringData = getPathMetadata(rings, arcs, 'polygon');

  // Sort rings by area, from large to small
  ringData.sort(function(a, b) {
    return Math.abs(b.area) - Math.abs(a.area);
  });
  // If a ring is contained by one or more rings, set it to the opposite
  //   direction as its immediate parent
  // If a ring is not contained, make it CW.
  ringData.forEach(function(ring, i) {
    var shouldBeCW = true;
    var j = i;
    var largerRing;
    while (--j >= 0) {
      largerRing = ringData[j];
      if (testRingInRing(ring, largerRing, arcs)) {
        // set to opposite of containing ring
        shouldBeCW = largerRing.area > 0 ? false : true;
        break;
      }
    }
    setRingWinding(ring, shouldBeCW);
  });
  return ringData.map(function(data) { return data.ids; });
}

// data: a ring data object
function setRingWinding(data, cw) {
  var isCW = data.area > 0;
  if (isCW != cw) {
    data.area = -data.area;
    reversePath(data.ids);
  }
}

// a, b: two ring data objects (from getPathMetadata);
function testRingInRing(a, b, arcs) {
  if (b.bounds.contains(a.bounds) === false) return false;
  // Don't test with first point -- this may return false if a hole intersects
  // the containing ring at the first vertex.
  // Instead, use the midpoint of the first segment
  var p = getFirstMidpoint(a.ids[0], arcs);
  //// test with first point in the ring
  // var p = arcs.getVertex(a.ids[0], 0);
  return geom.testPointInRing(p.x, p.y, b.ids, arcs) == 1;
}

function getFirstMidpoint(arcId, arcs) {
  var p1 = arcs.getVertex(arcId, 0);
  var p2 = arcs.getVertex(arcId, 1);
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

// Bundle holes with their containing rings for Topo/GeoJSON polygon export.
// Assumes outer rings are CW and inner (hole) rings are CCW, unless
//   the reverseWinding flag is set.
// @paths array of objects with path metadata -- see internal.exportPathData()
//
export function groupPolygonRings(paths, arcs, reverseWinding) {
  var holes = [],
      groups = [],
      sign = reverseWinding ? -1 : 1,
      boundsQuery;

  (paths || []).forEach(function(path) {
    if (path.area * sign > 0) {
      groups.push([path]);
    } else if (path.area * sign < 0) {
      holes.push(path);
    } else {
      // Zero-area ring, skipping
    }
  });

  if (holes.length === 0) {
    return groups;
  }

  // Using a spatial index to improve performance when the current feature
  // contains many holes and space-filling rings.
  // (Thanks to @simonepri for providing an example implementation in PR #248)
  boundsQuery = getBoundsSearchFunction(groups.map(function(group, i) {
    return {
      bounds: group[0].bounds,
      idx: i
    };
  }));

  // Group each hole with its containing ring
  holes.forEach(function(hole) {
    var containerId = -1,
        containerArea = 0,
        holeArea = hole.area * -sign,
        b = hole.bounds,
        // Find rings that might contain this hole
        candidates = boundsQuery(b.xmin, b.ymin, b.xmax, b.ymax),
        ring, ringId, ringArea, isContained;

    // Group this hole with the smallest-area ring that contains it.
    // (Assumes that if a ring's bbox contains a hole, then the ring also
    //  contains the hole).
    for (var i=0, n=candidates.length; i<n; i++) {
      ringId = candidates[i].idx;
      ring = groups[ringId][0];
      ringArea = ring.area * sign;
      isContained = ring.bounds.contains(hole.bounds) && ringArea > holeArea;
      if (isContained && candidates.length > 1 && !testRingInRing(hole, ring, arcs)) {
        // Using a more precise ring-in-ring test in the unusual case that
        // this hole is contained within the bounding box of multiple rings.
        // TODO: consider doing a ring-in-ring test even when there is only one
        // candidate ring, based on bbox-in-bbox test (this may affect performance
        // with some datasets).
        continue;
      }
      if (isContained && (containerArea === 0 || ringArea < containerArea)) {
        containerArea = ringArea;
        containerId = ringId;
      }
    }
    if (containerId == -1) {
      debug("[groupPolygonRings()] polygon hole is missing a containing ring, dropping.");
    } else {
      groups[containerId].push(hole);
    }
  });

  return groups;
}
