/* @requires
mapshaper-pathfinder
*/

// Dissolve polyline features, but also organize arcs into as few parts as possible,
// with the arcs in each part layed out in connected sequence
internal.dissolvePolylineGeometry = function(lyr, getGroupId, arcs, opts) {
  var groups = internal.getPolylineDissolveGroups(lyr.shapes, getGroupId);
  var shapes2 = groups.map(function(group) {
    return internal.dissolvePolylineArcs(group, arcs);
  });
  return shapes2;
};

internal.getPolylineDissolveGroups = function(shapes, getGroupId) {
  var groups = [];
  internal.traversePaths(shapes, function(o) {
    var groupId = getGroupId(o.shapeId);
    if (groupId in groups === false) {
      groups[groupId] = [];
    }
    groups[groupId].push(o.arcId);
  });
  return groups;
};

internal.dissolvePolylineArcs = function(ids, arcs) {
  var counts = new Uint8Array(arcs.size());
  ids.forEach(function(id) {counts[absArcId(id)] = 1;});
  var testArc = function(id) {return counts[absArcId(id)] > 0;};
  var useArc = function(id) {counts[absArcId(id)] = 0;};
  var nodes = new NodeCollection(arcs, testArc);
  var ends = internal.findPolylineEnds(ids, nodes);
  var parts = [];
  ends.forEach(function(endId) {
    var ids = [];
    var nextIds;
    while(testArc(endId)) {
      ids.push(endId);
      useArc(endId);
      nextIds = nodes.getConnectedArcs(endId).filter(testArc);
      if (nextIds.length > 0) {
        endId = ~nextIds[0]; // switch arc direction to lead away from node
      } else {
        break;
      }
    }
    if (ids.length > 0) parts.push(ids);
  });
  return parts;
};

internal.findPolylineEnds = function(ids, nodes) {
  var ends = [];
  ids.forEach(function(arcId) {
    if (nodes.getConnectedArcs(arcId).length === 0) {
      ends.push(~arcId);
    }
    if (nodes.getConnectedArcs(~arcId).length === 0) {
      ends.push(arcId);
    }
    return ends;
  });
  return ends;
};
