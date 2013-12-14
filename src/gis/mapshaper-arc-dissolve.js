/* @require mapshaper-shapes, mapshaper-dissolve, mapshaper-topology */

// Remove arc endpoints that are only shared by two arcs
// (Useful for reducing number of arcs after a polygon dissolve)
//
MapShaper.dissolveArcs = function(layers, arcs) {
  T.start();
  // Map old arc ids to new arc ids
  var map = arcDissolveFirstPass(layers, arcs); // 101 ms
  // Update layers and return an updated ArcDataset
  var arcs2 = arcDissolveSecondPass(layers, arcs, map); // 350 ms
  arcs2.setRetainedInterval(arcs.getRetainedInterval());
  T.stop("Dissolve arcs");
  //console.log("pre:", arcs.size(), "post:", arcs2.size())
  return arcs2;
};

function convertArcs(groups, arcs) {
  var src = arcs.getVertexData(),
      abs = MapShaper.absArcId,
      offs = 0,
      pointCount = countPoints(groups, src.nn),
      nn2 = new Int32Array(groups.length),
      xx2 = new Float64Array(pointCount),
      yy2 = new Float64Array(pointCount),
      zz2 = new Float64Array(pointCount);

  Utils.forEach(groups, function(oldIds, newId) {
    Utils.forEach(oldIds, function(oldId) {
      extendNewArc(newId, oldId);
    });
  });

  return new ArcDataset(nn2, xx2, yy2, zz2);

  function countPoints(groups, nn) {
    var total = 0,
        subtotal, n, ids;
    for (var i=0; i<groups.length; i++) {
      ids = groups[i];
      subtotal = 0;
      for (var j=0; j<ids.length; j++) {
        n = nn[abs(ids[j])];
        if (n > 0) subtotal += n - 1;
      }
      if (subtotal > 0) subtotal++;
      total += subtotal;
    }
    return total;
  }

  function extendNewArc(newId, oldId) {
    var absId = abs(oldId),
        rev = oldId < 0,
        n = src.nn[absId],
        i = src.ii[absId],
        n2 = nn2[newId];

    if (n > 0) {
      if (n2 > 0) {
        n--;
        if (!rev) i++;
      }
      MapShaper.copyElements(src.xx, i, xx2, offs, n, rev);
      MapShaper.copyElements(src.yy, i, yy2, offs, n, rev);
      MapShaper.copyElements(src.zz, i, zz2, offs, n, rev);
      nn2[newId] += n;
      offs += n;
    }
  }
}

function arcDissolveSecondPass(layers, arcs, map) {
  var abs = MapShaper.absArcId,
      convertedIndex = [],
      groups = [];

  Utils.forEach(layers, function(lyr) {
    MapShaper.traverseShapes(lyr.shapes, null, updatePaths, null);
  });

  return convertArcs(groups, arcs);

  function updatePaths(obj) {
    var newPath = [],
        ids = obj.arcs,
        mappedId = -1,
        arcCount = 0,
        dissolveGroup,
        oldId, newId,
        firstGroupId, firstGroup,
        startingNewGroup, converted;

    for (var i=0; i<ids.length; i++) {
      oldId = ids[i];
      newId = map[abs(oldId)];
      startingNewGroup = newId != mappedId;
      converted = oldId in convertedIndex;

      if (newId === undefined) error("updatePaths() null arc id");
      if (startingNewGroup) {
        mappedId = newId;
        arcCount++;

        if (converted) {
          if (convertedIndex[oldId] == -1) {
            newId = ~newId;
          }
        } else {
          if (newId < 0) error("updatePaths() unexpected negative id");
          if (newId in groups && groups[newId] !== firstGroup) {
            error("[arc dissolve] traversal errro");
          }
          dissolveGroup = [];
          groups[newId] = dissolveGroup;
        }
        newPath.push(newId);

        if (i === 0) {
          firstGroupId = newId;
          if (dissolveGroup) {
            firstGroup = dissolveGroup;
          }
        }
      }

      if (!converted) {
        dissolveGroup.push(oldId);
        convertedIndex[oldId] = 1;
        convertedIndex[~oldId] = -1;
      }
    }

    if (arcCount > 1 && newId == firstGroupId) {
      newPath.pop();
      if (firstGroup) {
        dissolveGroup = Utils.merge(dissolveGroup, firstGroup);
      }
    }

    if (newPath.length === 0) error("updatePaths() empty path");
    obj.shape.parts[obj.i] = newPath;
  }
}

function arcDissolveFirstPass(layers, arcs) {
  var src = arcs.getVertexData(),
      xx2 = [],
      yy2 = [],
      nn2 = [];

  // Use mapshaper's topology function to identify dissolvable sequences of
  // arcs across all layers (hackish)
  Utils.forEach(layers, function(lyr) {
    MapShaper.traverseShapes(lyr.shapes, null, translatePath);
  });
  var topo = buildPathTopology(xx2, yy2, nn2);
  return getArcMap(topo.arcs);

  function translatePath(obj) {
    nn2.push(0);
    Utils.forEach(obj.arcs, extendPath);
  }

  function extendPath(arcId) {
    var absId = MapShaper.absArcId(arcId),
        pathId = nn2.length - 1,
        first = src.ii[absId],
        last = first + src.nn[absId] - 1,
        start, end;

    if (arcId < 0) {
      start = last;
      end = first;
    } else {
      start = first;
      end = last;
    }

    // TODO: check for empty paths
    if (nn2[pathId] === 0) {
      nn2[pathId]++;
      xx2.push(src.xx[start]);
      yy2.push(src.yy[start]);
    }
    xx2.push(absId);
    xx2.push(src.xx[end]);
    yy2.push(-1); // TODO: replace with a unique y value
    yy2.push(src.yy[end]);
    nn2[pathId] += 2;
  }

  // map old arc ids to new ids
  function getArcMap(arcs) {
    var map = [];
    arcs.forEach3(function(xx, yy, zz, id) {
      var oldId;
      for (var i=1, n=xx.length; i<n; i+=2) {
        oldId = xx[i];
        if (oldId in map && map[oldId] != id) error("mapping error");
        map[oldId] = id;
      }
    });
    return map;
  }
}
