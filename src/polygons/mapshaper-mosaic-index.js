/* @requires
mapshaper-polygon-mosaic
mapshaper-index-index
*/

function MosaicIndex(lyr, nodes, optsArg) {
  var opts = optsArg || {};
  var shapes = lyr.shapes;
  var divide = internal.getHoleDivider(nodes);
  var mosaic = internal.buildPolygonMosaic(nodes).mosaic;

  // map arc ids to tile ids
  var arcTileIndex = new ShapeArcIndex(mosaic, nodes.arcs);
  // keep track of which tiles have been assigned to shapes
  var fetchedTileIndex = new IndexIndex(mosaic.length);
  // bidirection index of tile ids <=> shape ids
  var tileShapeIndex = new TileShapeIndex(mosaic, opts);
  // assign tiles to shapes
  var shapeTiler = new PolygonTiler(mosaic, arcTileIndex, nodes, opts);

  this.mosaic = mosaic;
  this.nodes = nodes; // kludge
  this.getSourceIdsByTileId = tileShapeIndex.getShapeIdsByTileId; // expose for -mosaic command
  this.getTileIdsByShapeId = tileShapeIndex.getTileIdsByShapeId;
  // Assign shape ids to mosaic tile shapes.
  shapes.forEach(function(shp, shapeId) {
    var tileIds = shapeTiler.getTilesInShape(shp, shapeId);
    tileShapeIndex.indexTileIdsByShapeId(shapeId, tileIds);
  });

  // ensure each tile is assigned to only one shape
  if (opts.flat) {
    tileShapeIndex.flatten();
  }

  // fill gaps
  // (assumes that tiles have been allocated to shapes and mosaic has been flattened)
  this.removeGaps = function(gapTest) {
    if (!opts.flat) {
      error('MosaicIndex#removeGaps() should only be called with flat mosaic');
    }
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

  this.overlayShapes = function(shapes) {

  };

  function tileIdToTile(id, i) {
    return mosaic[id];
  }

  function assignTileToAdjacentShape(tileId) {
    var ring = mosaic[tileId][0];
    var arcs = nodes.arcs;
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

  function getTileIdsByShapeIds(shapeIds) {
    var uniqIds = [];
    var tileId, tileIds, i, j;
    for (i=0; i<shapeIds.length; i++) {
      tileIds = tileShapeIndex.getTileIdsByShapeId(shapeIds[i]);
      for (j=0; j<tileIds.length; j++) {
        tileId = tileIds[j];
        // uniqify tile ids (in case the shape contains overlapping rings)
        if (fetchedTileIndex.hasId(tileId)) continue;
        fetchedTileIndex.setId(tileId);
        uniqIds.push(tileId);
      }
    }
    // clearing this index allows duplicate tile ids between calls to this function
    // (should not happen in a typical dissolve)
    fetchedTileIndex.clearIds(uniqIds);
    return uniqIds;
  }
}

// Convert polygon shapes to tiles
//
function PolygonTiler(mosaic, arcTileIndex, nodes, opts) {
  var visitedTileIndex = new IndexIndex(mosaic.length);
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
    if (opts.no_holes) {
      divide(shp, cw, ccw);
      // ccw.forEach(internal.reversePath);
      // cw = cw.concat(ccw);
    } else {
      // divide shape into rings and holes (splits self-intersecting rings)
      // TODO: rewrite divide() -- it is a performance bottleneck and can convert
      //   space-filling areas into ccw holes
      divide(shp, cw, ccw);
      ccw.forEach(procShapeHole);
      holeIndex.setIds(currHoles);
    }
    cw.forEach(procShapeRing);
    retn = tilesInShape;
    // reset tmp vars, etc
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
    procArcIds(path);
    ringIndex.clearIds(path);
    // allow overlapping rings to visit the same tiles
    visitedTileIndex.clearIds(tilesInShape);
  }

  // ids: an array of arcIds
  function procArcIds(ids) {
    var tileIds = [], tileId;
    for (var i=0, n=ids.length; i<n; i++) {
      tileId = procRingArc(ids[i]);
      if (tileId > -1) tileIds.push(tileId);
    }
    if (tileIds.length > 0) traverseFromTiles(tileIds);
  }

  function traverseFromTiles(tileIds) {
    // breadth-first traversal, to prevent call stack overflow when there is
    // a large number of tiles within a ring (due to many partially overlapping rings)
    var arcIds = [];
    for (var i=0, n=tileIds.length; i<n; i++) {
      accumulateTraversibleArcIds(arcIds, mosaic[tileIds[i]]);
    }
    if (arcIds.length > 0) procArcIds(arcIds);
  }

  function accumulateTraversibleArcIds(ids, tile) {
    var arcId, ring;
    for (var j=0; j<tile.length; j++) {
      ring = tile[j];
      for (var i=0; i<ring.length; i++) {
        arcId = ring[i];
        if (arcIsTraversible(arcId)) {
          ids.push(~arcId);
        }
      }
    }
  }

  function arcIsTraversible(tileArc) {
    var neighborArc = ~tileArc;
    // don't cross boundary of the current ring or of any hole in the current shape
    return !(holeIndex.hasId(tileArc) || holeIndex.hasId(neighborArc)  ||
      ringIndex.hasId(tileArc) || ringIndex.hasId(neighborArc));
  }

  function procRingArc(arcId) {
    var tileId = arcTileIndex.getShapeIdByArcId(arcId);
    if (tileId == -1 || visitedTileIndex.hasId(tileId)) return -1;
    visitedTileIndex.setId(tileId);
    tilesInShape.push(tileId);
    return tileId;
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
function TileShapeIndex(mosaic, opts) {
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

  // return ids of all shapes that include a tile
  this.getShapeIdsByTileId = function(id) {
    var singleId = singleIndex[id];
    if (singleId >= 0) {
      return [singleId];
    }
    if (singleId == -1) {
      return [];
    }
    return multipleIndex[id];
  };

  this.indexTileIdsByShapeId = function(shapeId, tileIds) {
    // shapeIndex[shapeId] = tileIds;
    shapeIndex[shapeId] = [];
    for (var i=0; i<tileIds.length; i++) {
      indexShapeIdByTileId(shapeId, tileIds[i]);
    }
  };

  // remove many-to-one tile=>shape mappings
  this.flatten = function() {
    var c = 0;
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
    if (val != -1 && opts.flat) {
      return;
    }
    if (val == -1) {
      singleIndex[tileId] = shapeId;
    } else if (val == -2) {
      multipleIndex[tileId].push(shapeId);
    } else {
      multipleIndex[tileId] = [val, shapeId];
      singleIndex[tileId] = -2;
    }
    shapeIndex[shapeId].push(tileId);
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
