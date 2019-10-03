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

// Convert CCW rings that are not contained into CW rings
internal.fixNestingErrors2 = function(rings, arcs) {
  var ringData = internal.getPathMetadata(rings, arcs, 'polygon');
  // convert rings to shapes for PathIndex
  var shapes = rings.map(function(ids) {return [ids];});
  var index = new PathIndex(shapes, arcs);
  rings.forEach(fixRing);
  // TODO: consider other kinds of nesting errors
  function fixRing(ids, i) {
    var ringIsCW = ringData[i].area > 0;
    var containerId;
    if (!ringIsCW) {
      containerId = index.findSmallestEnclosingPolygon(ids);
      if (containerId == -1) {
        internal.reversePath(ids);
      }
    }
  }
};
