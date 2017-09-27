/* @requires
mapshaper-pathfinder
mapshaper-polygon-holes
mapshaper-dissolve
mapshaper-data-aggregation
mapshaper-ring-nesting
*/

// Assumes points have been inserted at all segment intersections
internal.dissolvePolygonLayer2 = function(lyr, arcs, opts) {
  opts = opts || {};
  var getGroupId = internal.getCategoryClassifier(opts.field, lyr.data);
  var groups = lyr.shapes.reduce(function(groups, shape, i) {
    var i2 = getGroupId(i);
    if (i2 in groups === false) {
      groups[i2] = [];
    }
    internal.extendShape(groups[i2], shape);
    return groups;
  }, []);
  var shapes2 = internal.dissolvePolygons2(groups, arcs, opts);
  return internal.composeDissolveLayer(lyr, shapes2, getGroupId, opts);
};


internal.getGapFillTest = function(arcs, opts) {
  var threshold = opts.min_gap_area;
  var test;
  if (threshold === 0) {
    test = function() {return false;}; // don't fill any gaps
  } else if (threshold > 0) {
    test = internal.getMinAreaTest(threshold, arcs);
  } else {
    test = internal.getSliverTest(arcs); // default is same as -filter-slivers default
  }
  return test;
};

internal.dissolvePolygons2 = function(shapes, arcs, opts) {
  var arcFilter = internal.getArcPresenceTest(shapes, arcs.size());
  var nodes = new NodeCollection(arcs, arcFilter);
  nodes.detachAcyclicArcs(); // remove spikes
  var divide = internal.getHoleDivider(nodes);
  var dissolve = internal.getRingIntersector(nodes, 'dissolve');
  var gapTest = internal.getGapFillTest(arcs, opts);
  T.start();
  var mosaic = internal.buildPolygonMosaic(nodes).mosaic;
  T.stop("Build mosaic");
  var fwdArcIndex = new Int32Array(arcs.size());
  var revArcIndex = new Int32Array(arcs.size());
  var shapeWeights = [];
  var unassignedTiles = [];
  var tileGroups = shapes.map(function() {return [];});
  T.start();
  shapes.forEach(indexPolygon);
  mosaic.forEach(assignMosaicRing);
  unassignedTiles = unassignedTiles.filter(assignRemainingTile);
  var shapes2 = tileGroups.map(dissolveTileGroup);
  T.stop('Dissolve tiles');
  return shapes2;

  function dissolveTileGroup(group) {
    var rings = [],
        holes = [],
        dissolved, tile;
    for (var i=0, n=group.length; i<n; i++) {
      tile = mosaic[group[i]];
      rings.push(tile[0]);
      if (tile.length > 1) {
        holes = holes.concat(tile.slice(1));
      }
    }
    dissolved = dissolve(rings.concat(holes));
    if (dissolved.length > 1) {
      // Commenting-out nesting order repair -- new method should prevent nesting errors
      // dissolved = internal.fixNestingErrors(dissolved, arcs);
    }
    return dissolved.length > 0 ? dissolved : null;
  }

  function assignRemainingTile(tileId) {
    var tile = mosaic[tileId];
    var ring = tile[0];
    var shapeId = -1;
    for (var i=0, n=ring.length; i<n; i++) {
      // find highest-priority neighboring shape
      shapeId = chooseShape(shapeId, getShapeId(~ring[i]));
    }
    if (shapeId > -1 && gapTest(ring)) {
      tileGroups[shapeId].push(tileId);
    }
    return shapeId < 0;
  }

  function assignMosaicRing(tile, tileId) {
    var shapeId = -1;
    var ring = tile[0]; // cw ring
    for (var i=0, n=ring.length; i<n; i++) {
      shapeId = chooseShape(shapeId, getShapeId(ring[i]));
    }
    if (shapeId == -1) {
      unassignedTiles.push(tileId);
    } else {
      tileGroups[shapeId].push(tileId);
    }
  }

  function chooseShape(a, b) {
    var shpId = a;
    if (a == -1 || b > -1 && shapeWeights[a] < shapeWeights[b]) {
      shpId = b;
    }
    return shpId;
  }

  function indexPolygon(shape, shapeId) {
    // TODO: support other metrics than area
    //       consider per-ring metrics
    var weight = geom.getShapeArea(shape, arcs);
    var cw = [], ccw = [], i, n;
    shapeWeights[shapeId] = weight;
    divide(shape, cw, ccw);
    if (ccw.length > 0) {
      shape = cw.concat(ccw);
      internal.fixNestingErrors2(shape, arcs);
    } else {
      shape = cw;
    }
    for (i=0, n=shape.length; i<n; i++) {
      indexRing(shape[i], shapeId);
    }
  }

  function indexRing(ring, shapeId) {
    for (var i=0, n=ring.length; i<n; i++) {
      indexArc(ring[i], shapeId);
    }
  }

  function indexArc(arcId, shapeId) {
    var storedId = getShapeId(arcId);
    if (storedId === -1 || chooseShape(shapeId, storedId) == shapeId) {
      setShapeId(arcId, shapeId);
    }
  }

  function getShapeId(arcId) {
    var absId = absArcId(arcId);
    // index is 1-based, 0 is null
    return (absId == arcId ? fwdArcIndex : revArcIndex)[absId] - 1;
  }

  function setShapeId(arcId, shpId) {
    var absId = absArcId(arcId);
    (absId == arcId ? fwdArcIndex : revArcIndex)[absId] = shpId + 1;
  }

};

internal.extendShape = function(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
};
