/* @requires
mapshaper-pathfinder
*/

// Dissolve polyline features, but also organize arcs into as few parts as possible,
// with the arcs in each part laid out in connected sequence
internal.dissolvePolylineGeometry = function(lyr, getGroupId, arcs, opts) {
  var groups = internal.getPolylineDissolveGroups(lyr.shapes, getGroupId);
  var dissolve = internal.getPolylineDissolver(arcs);
  return groups.map(dissolve);
};

// Create one array of arc ids for each group
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

internal.getPolylineDissolver = function(arcs) {
  var flags = new Uint8Array(arcs.size());
  var testArc = function(id) {return flags[absArcId(id)] > 0;};
  var useArc = function(id) {flags[absArcId(id)] = 0;};
  var nodes = new NodeCollection(arcs);
  return function(ids) {
    ids.forEach(function(id) {flags[absArcId(id)] = 1;});
    var ends = internal.findPolylineEnds(ids, nodes, testArc);
    var straightParts = internal.collectPolylineArcs(ends, nodes, testArc, useArc);
    var ringParts = internal.collectPolylineArcs(ids, nodes, testArc, useArc);
    var allParts = straightParts.concat(ringParts);
    ids.forEach(function(id) {flags[absArcId(id)] = 0;}); // may not be necessary
    return allParts;
  };
};

// TODO: use polygon pathfinder shared code
internal.collectPolylineArcs = function(ids, nodes, testArc, useArc) {
  var parts = [];
  ids.forEach(function(startId) {
    var part = [];
    var nextId = startId;
    var nextIds;
    while (testArc(nextId)) {
      part.push(nextId);
      nextIds = nodes.getConnectedArcs(nextId, testArc);
      useArc(nextId); // use (unset) arc after connections have been found
      if (nextIds.length > 0) {
        nextId = ~nextIds[0]; // switch arc direction to lead away from node
      } else {
        break;
      }
    }
    if (part.length > 0) parts.push(part);
  });
  return parts;
};

// Return array of dead-end arcs for a dissolved group.
internal.findPolylineEnds = function(ids, nodes, filter) {
  var ends = [];
  ids.forEach(function(arcId) {
    if (nodes.getConnectedArcs(arcId, filter).length === 0) {
      ends.push(~arcId); // arc points away from terminus
    }
    if (nodes.getConnectedArcs(~arcId, filter).length === 0) {
      ends.push(arcId);
    }
  });
  return ends;
};
