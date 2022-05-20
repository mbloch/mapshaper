import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Maps tile ids to shape ids (both are non-negative integers). Supports
//    one-to-many mapping (a tile may belong to multiple shapes)
// Also maps shape ids to tile ids. A shape may contain multiple tiles
// Also supports 'flattening' -- removing one-to-many tile-shape mappings by
//    removing all but one shape from a tile.
// Supports one-to-many mapping
export function TileShapeIndex(mosaic, opts) {
  // indexes for mapping tile ids to shape ids
  var singleIndex = new Int32Array(mosaic.length);
  utils.initializeArray(singleIndex, -1);
  var multipleIndex = [];
  // index that maps shape ids to tile ids
  var shapeIndex = [];

  this.getTileIdsByShapeId = function(shapeId) {
    var ids = shapeIndex[shapeId];
    // need to filter out tile ids that have been set to -1 (indicating removal)
    return ids ? ids.filter(function(id) {return id >= 0;}) : [];
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

  this.indexTileIdsByShapeId = function(shapeId, tileIds, weightFunction) {
    shapeIndex[shapeId] = [];
    for (var i=0; i<tileIds.length; i++) {
      indexShapeIdByTileId(shapeId, tileIds[i], weightFunction);
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
  function indexShapeIdByTileId(shapeId, tileId, weightFunction) {
    var singleId = singleIndex[tileId];
    if (singleId != -1 && opts.flat) {
      // pick the best shape if we have a weight function
      if (weightFunction && weightFunction(shapeId) > weightFunction(singleId)) {
        // replace existing shape reference
        removeTileFromShape(tileId, singleId); // bottleneck when overlaps are many
        singleIndex[tileId] = singleId;
        singleId = -1;
      } else {
        // keep existing shape reference
        return;
      }
    }
    if (singleId == -1) {
      singleIndex[tileId] = shapeId;
    } else if (singleId == -2) {
      multipleIndex[tileId].push(shapeId);
    } else {
      multipleIndex[tileId] = [singleId, shapeId];
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
        removeTileFromShape(tileId, shapeId);
      }
    }
  }

  function removeTileFromShape(tileId, shapeId) {
    var tileIds = shapeIndex[shapeId];
    for (var i=0; i<tileIds.length; i++) {
      if (tileIds[i] === tileId) {
        tileIds[i] = -1;
        break;
      }
    }
  }

  // This function was a bottleneck in datasets with many overlaps
  function removeTileFromShape_old(tileId, shapeId) {
    shapeIndex[shapeId] = shapeIndex[shapeId].filter(function(tileId2) {
      return tileId2 != tileId;
    });
    if (shapeIndex[shapeId].length > 0 === false) {
      // TODO: make sure to test the case where a shape becomes empty
      // error("empty shape")
    }
  }
}