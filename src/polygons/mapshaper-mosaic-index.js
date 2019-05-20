/* @require
mapshaper-polygon-mosaic
*/

function MosaicIndex(lyr, dataset, opts) {
  var shapes = lyr.shapes;
  var arcFilter = internal.getArcPresenceTest(shapes, dataset.arcs);
  var nodes = new NodeCollection(dataset.arcs, arcFilter);
  var divide = internal.getHoleDivider(nodes);
  var mosaic = internal.buildPolygonMosaic(nodes).mosaic;

  // map arc ids to tile ids
  var arcTileIndex = new ShapeArcIndex(mosaic, dataset.arcs);
  // keep track of which tiles have been assigned to shapes
  var usedTileIndex = new IndexIndex(mosaic.length);
  // bidirection index of tile ids <=> shape ids
  var tileShapeIndex = new TileShapeIndex(mosaic);
  // assign tiles to shapes
  var shapeTiler = new PolygonTiler(mosaic, arcTileIndex, nodes);

  this.mosaic = mosaic;
  this.nodes = nodes; // kludge

  // Assign shape ids to mosaic tile shapes.
  shapes.forEach(function(shp, shapeId) {
    var tileIds = shapeTiler.getTilesInShape(shp, shapeId);
    tileShapeIndex.indexTileIdsByShapeId(shapeId, tileIds);
  });

  // ensure each tile is assigned to only one shape
  tileShapeIndex.flatten();

  // fill gaps
  // (assumes that tiles have been allocated to shapes and mosaic has been flattened)
  this.removeGaps = function() {
    var gapTest = internal.getGapFillTest(dataset, opts);
    var gapTileIds = tileShapeIndex.getUnusedTileIds().filter(function(tileId) {
      var tile = mosaic[tileId];
      return gapTest(tile[0]); // test tile ring, ignoring any holes (does this matter?)
    });
    // find shape to assign gap tiles to
    gapTileIds.forEach(assignTileToAdjacentShape);
  };

  this.getUnusedTiles = function() {
    return getUnusedTileIds().map(tileIdToTile);
  };

  this.getTilesByShapeIds = function(shapeIds) {
    return getTileIdsByShapeIds(shapeIds).map(tileIdToTile);
  };

  function assignTileToAdjacentShape(tileId) {
    var ring = mosaic[tileId][0];
    var arcs = dataset.arcs;
    var arcId, neighborShapeId, neighborTileId, arcLen;
    var shapeId = -1, maxArcLen = 0;
    for (var i=0; i<ring.length; i++) {
      arcId = ring[i];
      neighborTileId = arcTileIndex.getShapeIdByArcId(~arcId);
      if (neighborTileId < 0) continue;
      neighborShapeId = tileShapeIndex.getShapeIdByTileId(neighborTileId);
      if (neighborShapeId < 0) continue;
      arcLen = geom.getPathPerimeter([arcId], arcs);
      if (arcLen > maxArcLen) {
        shapeId = neighborShapeId;
        maxArcLen = arcLen;
      }
    }
    if (shapeId > -1) {
      tileShapeIndex.addTileToShape(shapeId, tileId);
    }
  }

  function tileIdToTile(id) {
    return mosaic[id];
  }

  function getTileIdsByShapeIds(shapeIds) {
    var uniqIds = [];
    var tileId, tileIds, i, j;
    for (i=0; i<shapeIds.length; i++) {
      tileIds = tileShapeIndex.getTileIdsByShapeId(shapeIds[i]);
      for (j=0; j<tileIds.length; j++) {
        tileId = tileIds[j];
        // uniqify tile ids (in case the shape contains overlapping rings)
        if (usedTileIndex.hasId(tileId)) continue;
        usedTileIndex.setId(tileId);
        uniqIds.push(tileId);
      }
    }
    // clearing this index allows duplicate tile ids between calls to this function
    // (should not happen in a typical dissolve)
    usedTileIndex.clearIds(uniqIds);
    return uniqIds;
  }

}

// Convert polygon shapes to tiles
//
function PolygonTiler(mosaic, arcTileIndex, nodes) {
  var usedTileIndex = new IndexIndex(mosaic.length);
  var divide = internal.getHoleDivider(nodes);
  // temp vars
  var currHoles; // arc ids of all holes in shape
  var currShapeId;
  var tilesInShape; // tile ids of tiles in shape
  var ringIndex = new IndexIndex(nodes.arcs.size());
  var holeIndex = new IndexIndex(nodes.arcs.size());

  // return ids of tiles in shape
  this.getTilesInShape = function(shp, shapeId) {
    var cw = [], ccw = [], retn;
    tilesInShape = [];
    currHoles = [];
    currShapeId = shapeId;
    // divide shape into rings and holes (splits self-intersecting rings)
    // TODO: rewrite divide() -- it is a performance bottleneck and can convert
    //   space-filling areas into ccw holes
    divide(shp, cw, ccw);
    if (ccw.length > 0) {
      ccw.forEach(procShapeHole);
      holeIndex.setIds(currHoles);
    }
    cw.forEach(procShapeRing);
    retn = tilesInShape;
    // reset tmp vars, etc
    usedTileIndex.clearIds(tilesInShape);
    tilesInShape = null;
    holeIndex.clearIds(currHoles);
    currHoles = null;
    return retn;
  };

  function procShapeHole(path) {
    currHoles = currHoles ? currHoles.concat(path) : path;
  }

  function procShapeRing(path) {
    ringIndex.setIds(path);
    for (var i=0; i<path.length; i++) {
      procRingArc(path[i], true);
      // TODO: only add first arc?
      //   .. might cause problems, if shape contains overlapping rings
    }
    ringIndex.clearIds(path);
  }

  function procRingArc(arcId, fromTileId, fromHole) {
    var tileId = arcTileIndex.getShapeIdByArcId(arcId);
    if (tileId == -1 || usedTileIndex.hasId(tileId)) return;
    usedTileIndex.setId(tileId);
    tilesInShape.push(tileId);
    traverseToTileNeighbors(mosaic[tileId], tileId);
  }

  function traverseToTileNeighbors(tile, fromTileId) {
    traverseToTileRingNeighbors(tile[0], fromTileId);
    for (var i=1; i<tile.length; i++) {
      traverseToTileHoleNeighbors(tile[i], fromTileId);
    }
  }

  function traverseToTileHoleNeighbors(tileHole, fromTileId) {
    var neighborArc, tileArc;
    for (var i=0, n=tileHole.length; i<n; i++) {
      tileArc = tileHole[i];
      neighborArc = ~tileArc;
      if (holeIndex.hasId(tileArc)) {
        // don't cross inner boundary of any hole
        continue;
      }
      if (ringIndex.hasId(neighborArc)) {
       // don't cross the (inner) boundary of a hole
        continue;
      }
      if (ringIndex.hasId(tileArc)) {
        // error condition indicating invalid mosaic topology
        continue;
      }
      procRingArc(neighborArc, fromTileId, true);
    }
  }

  function traverseToTileRingNeighbors(tileRing, fromTileId) {
    var neighborArc, tileArc;
    for (var i=0, n=tileRing.length; i<n; i++) {
      tileArc = tileRing[i];
      neighborArc = ~tileArc;
      if (ringIndex.hasId(tileArc)) {
        // don't cross outer boundary of the current ring
        continue;
      }
      if (holeIndex.hasId(neighborArc)) {
        // from inside to outside of the boundary of a hole (seems like it shouldn't happen)
        continue;
      }
      if (holeIndex.hasId(tileArc)) {
        // from outside to inside of the boundary of a hole
        continue;
      }
      procRingArc(neighborArc, fromTileId);
    }
  }

}

// Map arc ids to shape ids, assuming perfect topology
// (an arcId maps to at most one shape)
// Supports looking up a shape id using an arc id.
function ShapeArcIndex(shapes, arcs) {
  var n = arcs.size();
  var fwdArcIndex = new Int32Array(n);
  var revArcIndex = new Int32Array(n);
  var shapeId;
  utils.initializeArray(fwdArcIndex, -1);
  utils.initializeArray(revArcIndex, -1);
  shapes.forEach(onShape);

  function onShape(shp, i) {
    shapeId = i;
    shp.forEach(onPart);
  }
  function onPart(path) {
    var arcId;
    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      if (arcId < 0) {
        revArcIndex[~arcId] = shapeId;
      } else {
        fwdArcIndex[arcId] = shapeId;
      }
    }
  }

  // returns -1 if shape has not been indexed
  this.getShapeIdByArcId = function(arcId) {
    var idx = absArcId(arcId);
    if (idx >= n) return -1; // TODO: throw error (out-of-range id)
    return arcId < 0 ? revArcIndex[idx] : fwdArcIndex[idx];
  };
}

// Maps tile ids to shape ids (both are non-negative integers). Supports
//    one-to-many mapping (a tile may belong to multiple shapes)
// Also maps shape ids to tile ids. A shape may contain multiple tiles
// Also supports 'flattening' -- removing one-to-many tile-shape mappings by
//    removing all but one shape from a tile.
// Supports one-to-many mapping
function TileShapeIndex(mosaic) {
  // indexes for mapping tile ids to shape ids
  var singleIndex = new Int32Array(mosaic.length);
  utils.initializeArray(singleIndex, -1);
  var multipleIndex = [];
  // index that maps shape ids to tile ids
  var shapeIndex = [];

  this.getTileIdsByShapeId = function(id) {
    return shapeIndex[id];
  };

  // assumes index has been flattened
  this.getShapeIdByTileId = function(id) {
    var shapeId = singleIndex[id];
    return shapeId >= 0 ? shapeId : -1;
  };

  this.indexTileIdsByShapeId = function(shapeId, tileIds) {
    shapeIndex[shapeId] = tileIds;
    for (var i=0; i<tileIds.length; i++) {
      indexShapeIdByTileId(shapeId, tileIds[i]);
    }
  };

  // remove many-to-one tile=>shape mappings
  this.flatten = function() {
    multipleIndex.forEach(function(shapeIds, tileId) {
      flattenStackedTile(tileId);
    });
    multipleIndex = [];
  };

  this.getUnusedTileIds = function() {
    var ids = [];
    for (var i=0, n=singleIndex.length; i<n; i++) {
      if (singleIndex[i] == -1) ids.push(i);
    }
    return ids;
  };

  // used by gap fill; assumes that flatten() has been called
  this.addTileToShape = function(shapeId, tileId) {
    if (shapeId in shapeIndex === false || singleIndex[tileId] != -1) {
      error('Internal error');
    }
    singleIndex[tileId] = shapeId;
    shapeIndex[shapeId].push(tileId);
  };

  // add a shape id to a tile
  function indexShapeIdByTileId(shapeId, tileId) {
    var val = singleIndex[tileId];
    if (val >= -2 === false) error("tile index error");
    if (val == -1) {
      singleIndex[tileId] = shapeId;
    } else if (val == -2) {
      multipleIndex[tileId].push(shapeId);
    } else {
      multipleIndex[tileId] = [val, shapeId];
      singleIndex[tileId] = -2;
    }
  }

  function flattenStackedTile(tileId) {
    // TODO: select the best shape (using some metric)
    var shapeIds = multipleIndex[tileId];
    // if (!shapeIds || shapeIds.length > 1 === false) error('flattening error');
    var selectedId = shapeIds[0];
    var shapeId;
    singleIndex[tileId] = selectedId; // add shape to single index
    // remove tile from other stacked shapes
    for (var i=0; i<shapeIds.length; i++) {
      shapeId = shapeIds[i];
      if (shapeId != selectedId) {
        shapeIndex[shapeId] = shapeIndex[shapeId].filter(tileTest);
        if (shapeIndex[shapeId].length > 0 === false) {
          // TODO: make sure to test the case where a shape becomes empty
          // error("empty shape")
        }
      }
    }

    function tileTest(tileId2) {
      return tileId != tileId2;
    }
  }

}


// Keep track of whether integer ids (indexes) are 'used' or not.
// Accepts positive and negative ids.
function IndexIndex(n) {
  var index = new Uint8Array(n);

  this.setId = function(id) {
    if (id < 0) {
      index[~id] |= 2;
    } else {
      index[id] |= 1;
    }
  };

  this.hasId = function(id) {
    return id < 0 ? (index[~id] & 2) == 2 : (index[id] & 1) == 1;
  };

  this.clearIds = function(ids) {
    for (var i=0; i<ids.length; i++) {
      index[absArcId(ids[i])] = 0;
    }
  };

  this.setIds = function(ids) {
    for (var i=0; i<ids.length; i++) {
      this.setId(ids[i]);
    }
  };
}
