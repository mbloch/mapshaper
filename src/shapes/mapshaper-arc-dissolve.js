/* @requires
mapshaper-innerlines
mapshaper-endpoints
mapshaper-dataset-utils
*/

// Dissolve arcs that can be merged without affecting topology of layers
// remove arcs that are not referenced by any layer; remap arc ids
// in layers. (In-place).
MapShaper.dissolveArcs = function(dataset) {
  var arcs = dataset.arcs,
      layers = dataset.layers.filter(MapShaper.layerHasPaths),
      test = MapShaper.getArcDissolveTest(layers, arcs),
      groups = [],
      totalPoints = 0,
      arcIndex = new Int32Array(arcs.size()), // maps old arc ids to new ids
      arcStatus = new Uint8Array(arcs.size());
      // arcStatus: 0 = unvisited, 1 = dropped, 2 = remapped, 3 = remapped + reversed
  layers.forEach(function(lyr) {
    // modify copies of the original shapes; original shapes should be unmodified
    // (need to test this)
    lyr.shapes = lyr.shapes.map(function(shape) {
      return MapShaper.editPaths(shape && shape.concat(), translatePath);
    });
  });
  MapShaper.dissolveArcCollection(arcs, groups, totalPoints);

  function translatePath(path) {
    var pointCount = 0;
    var path2 = [];
    var group, arcId, absId, arcLen, fw, arcId2;

    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      absId = absArcId(arcId);
      fw = arcId === absId;

      if (arcs.arcIsDegenerate(arcId)) {
        // skip
      } else if (arcStatus[absId] === 0) {
        arcLen = arcs.getArcLength(arcId);

        if (group && test(path[i-1], arcId)) {
          if (arcLen > 0) {
            arcLen--; // shared endpoint not counted;
          }
          group.push(arcId);  // arc data is appended to previous arc
          arcStatus[absId] = 1; // arc is dropped from output
        } else {
          // new group (i.e. new dissolved arc)
          group = [arcId];
          arcIndex[absId] = groups.length;
          groups.push(group);
          arcStatus[absId] = fw ? 2 : 3; // 2: unchanged; 3: reversed
        }
        pointCount += arcLen;
      } else {
        group = null;
      }

      if (arcStatus[absId] > 1) {
        // arc is retained (and renumbered) in the dissolved path.
        arcId2 = arcIndex[absId];
        if (fw && arcStatus[absId] == 3 || !fw && arcStatus[absId] == 2) {
          arcId2 = ~arcId2;
        }
        path2.push(arcId2);
      }
    }
    totalPoints += pointCount;
    return path2;
  }
};

MapShaper.dissolveArcCollection = function(arcs, groups, len2) {
  var nn2 = new Uint32Array(groups.length),
      xx2 = new Float64Array(len2),
      yy2 = new Float64Array(len2),
      src = arcs.getVertexData(),
      zz2 = src.zz ? new Float64Array(len2) : null,
      offs = 0;

  groups.forEach(function(group, newId) {
    group.forEach(function(oldId, i) {
      extendDissolvedArc(oldId, newId);
    });
  });

  arcs.updateVertexData(nn2, xx2, yy2, zz2);

  function extendDissolvedArc(oldId, newId) {
    var absId = absArcId(oldId),
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
      if (zz2) MapShaper.copyElements(src.zz, i, zz2, offs, n, rev);
      nn2[newId] += n;
      offs += n;
    }
  }
};

MapShaper.getArcDissolveTest = function(layers, arcs) {
  var nodes = MapShaper.getFilteredNodeCollection(layers, arcs),
      count = 0,
      lastId;

  return function(id1, id2) {
    if (id1 == id2 || id1 == ~id2) {
      verbose("Unexpected arc sequence:", id1, id2);
      return false; // This is unexpected; don't try to dissolve, anyway
    }
    count = 0;
    nodes.forEachConnectedArc(id1, countArc);
    return count == 1 && lastId == ~id2;
  };

  function countArc(arcId, i) {
    count++;
    lastId = arcId;
  }
};

MapShaper.getFilteredNodeCollection = function(layers, arcs) {
  var counts = MapShaper.countArcReferences(layers, arcs),
      test = function(arcId) {
        return counts[absArcId(arcId)] > 0;
      };
  return new NodeCollection(arcs, test);
};

MapShaper.countArcReferences = function(layers, arcs) {
  var counts = new Uint32Array(arcs.size());
  layers.forEach(function(lyr) {
    MapShaper.countArcsInShapes(lyr.shapes, counts);
  });
  return counts;
};
