/* @requires
mapshaper-pathfinder
mapshaper-polygon-holes
mapshaper-dissolve
mapshaper-data-aggregation
mapshaper-ring-nesting
*/


// TODO: remove this obsolete dissolve code (still used by clip)

internal.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    internal.extendShape(memo, shape);
    return memo;
  }, []);
};

internal.extendShape = function(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
};

internal.getPolygonDissolver = function(nodes, spherical) {
  spherical = spherical && !nodes.arcs.isPlanar();
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = internal.getHoleDivider(nodes, spherical);
  var flatten = internal.getRingIntersector(nodes, 'flatten', flags, spherical);
  var dissolve = internal.getRingIntersector(nodes, 'dissolve', flags, spherical);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(internal.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(internal.reversePath);

    var shp2 = internal.appendHolestoRings(cw, ccw);
    var dissolved = dissolve(shp2);

    if (dissolved.length > 1) {
      dissolved = internal.fixNestingErrors(dissolved, nodes.arcs);
    }

    return dissolved.length > 0 ? dissolved : null;
  };
};

internal.getPolygonDissolver2 = function(nodes) {
  nodes.detachAcyclicArcs(); // remove spikes, which interfere with building mosaic
  var arcs = nodes.arcs;
  var mosaic = internal.findMosaicRings(nodes).cw;
  // index of mosaic tiles: each tile can be used once as ring and once as hole
  var ringFlags = new Uint8Array(mosaic.length);
  var holeFlags = new Uint8Array(mosaic.length);
  // arc ids mapped to mosaic tile ids
  var fwdArcIndex = new Int32Array(arcs.size());
  var revArcIndex = new Int32Array(arcs.size());
  var divide = internal.getHoleDivider(nodes);
  var dissolve = internal.getRingIntersector(nodes, 'dissolve');
  // console.log("mosaic:", mosaic);

  initMosaicIndexes(mosaic, fwdArcIndex, revArcIndex);

  function initMosaicIndexes(mosaic, fwd, rev) {
    utils.initializeArray(fwd, -1);
    utils.initializeArray(rev, -1);
    mosaic.forEach(function(ring, ringId) {
      var absId;
      for (var i=0; i<ring.length; i++) {
        absId = absArcId(ring[i]);
        (absId == ring[i] ? fwd : rev)[absId] = ringId;
      }
    });
  }

  function dissolveHoles(tileIds, dissolvedRings) {
    var tiles, dissolvedHoles;
    markArcs(dissolvedRings, -2);
    tiles = tileIds.reduce(reduceHoleTile, []);
    markArcs(dissolvedRings, -3);
    dissolvedHoles = dissolve(tiles);
    dissolvedHoles.forEach(internal.reversePath);
    return dissolvedHoles;
  }

  function reduceRingToTileId(memo, ring) {
    var tileId;
    for (var i=0; i<ring.length; i++) {
      tileId = reserveTile(ring[i], false);
      if (tileId > -1) memo.push(tileId);
    }
    return memo;
  }

  function reduceHoleToTileId(memo, hole) {
    var tileId;
    for (var i=0; i<hole.length; i++) {
      tileId = reserveTile(~hole[i], true);
      if (tileId > -1) memo.push(tileId);
    }
    return memo;
  }

  function ringsToTileIds(rings) {
    return rings.reduce(reduceRingToTileId, []);
  }

  function holesToTileIds(holes) {
    return holes.reduce(reduceHoleToTileId, []);
  }

  function reserveTile(arcId, isHole) {
    var tileId = getArcValue(arcId);
    var flags = isHole ? holeFlags : ringFlags;
    var retn = -1;
    if (tileId < 0) {
      // no tile for this arc
    } else if (isHole && ringFlags[tileId] == 1) {
      // tile is reserved by a ring -- can't use it
    } else if (flags[tileId] === 0) {
      flags[tileId] = 1; // reserve the tile
      retn = tileId;
    }
    return retn;
  }

  function useRingTile(tileId) {
    ringFlags[tileId] = 2; // use tile
    return mosaic[tileId];
  }

  function reduceHoleTile(memo, tileId) {
    var tile = mosaic[tileId];
    if (holeTileIsUsable(tile)) {
      holeFlags[tileId] = 2; // use tile
      memo.push(tile);
    } else {
      holeFlags[tileId] = 0; // release tile
    }
    return memo;
  }

  function holeTileIsUsable(tile) {
    // tile is unusable if it contains an arc that is also used by a
    // ring of the current shape (an edge condition caused by atypical topology)
    for (var i=0; i<tile.length; i++) {
      if (getArcValue(~tile[i]) == -2) return false;
    }
    return true;
  }

  function markArcs(rings, value) {
    rings.forEach(function(ring) {
      for (var i=0; i<ring.length; i++) {
        setArcValue(ring[i], value);
      }
    });
  }

  function getArcValue(arcId) {
    var absId = absArcId(arcId);
    var index = absId == arcId ? fwdArcIndex : revArcIndex;
    return index[absId];
  }

  function setArcValue(arcId, val) {
    var absId = absArcId(arcId);
    var index = absId == arcId ? fwdArcIndex : revArcIndex;
    index[absId] = val;
  }

  return function(polygon, shpId) {
    if (!polygon) return null;
    var cw = [],
        ccw = [],
        ringTileIds, holeTileIds, dissolvedRings, dissolvedHoles, dissolvedPolygon;

    divide(polygon, cw, ccw);

    ringTileIds = ringsToTileIds(cw);
    holeTileIds = holesToTileIds(ccw);
    dissolvedRings = dissolve(ringTileIds.map(useRingTile));

    debug("cw:", cw, "n:", cw.length);
    debug("ringTiles:", ringTileIds);
    debug("dissolved rings:", dissolvedRings, 'n:', dissolvedRings.length);

    if (ccw.length > 0) {
      dissolvedHoles = dissolveHoles(holeTileIds, dissolvedRings);
      dissolvedPolygon = internal.appendHolestoRings(dissolvedRings, dissolvedHoles);
      debug("ccw rings:", ccw);
      debug("dissolved holes:", dissolvedHoles);
    } else {
      dissolvedPolygon = dissolvedRings;
    }

    if (dissolvedPolygon.length > 1) {
      dissolvedPolygon = internal.fixNestingErrors(dissolvedPolygon, arcs);
    }

    return dissolvedPolygon.length > 0 ? dissolvedPolygon : null;
  };
};

// TODO: to prevent invalid holes,
// could erase the holes from the space-enclosing rings.
internal.appendHolestoRings = function(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
};
