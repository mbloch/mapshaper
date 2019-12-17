/* @requires
mapshaper-pathfinder
mapshaper-polygon-holes
mapshaper-dissolve
mapshaper-data-aggregation
mapshaper-ring-nesting
mapshaper-polygon-mosaic
mapshaper-mosaic-index
mapshaper-gaps
*/


// Assumes that arcs do not intersect except at endpoints
internal.dissolvePolygonLayer2 = function(lyr, dataset, opts) {
  opts = utils.extend({}, opts);
  if (opts.field) {
    opts.fields = [opts.field]; // support old "field" parameter
  }
  var getGroupId = internal.getCategoryClassifier(opts.fields, lyr.data);
  var groups = internal.groupPolygons2(lyr, getGroupId);
  var shapes2 = internal.dissolvePolygonGroups2(groups, lyr, dataset, opts);
  return internal.composeDissolveLayer(lyr, shapes2, getGroupId, opts);
};


internal.getArcLayer = function(arcs, name) {
  var records = [];
  var lyr = {
    geometry_type: 'polyline',
    shapes: [],
    name: name
  };
  for (var i=0, n=arcs.size(); i<n; i++) {
    lyr.shapes.push([[i]]);
    records.push({arc_id: i});
  }
  lyr.data = new DataTable(records);
  return lyr;
};

internal.composeMosaicLayer = function(lyr, shapes2) {
  var records = shapes2.map(function(shp, i) {
    return {tile_id: i};
  });
  return utils.defaults({
    shapes: shapes2,
    data: new DataTable(records)
  }, lyr);
};

internal.groupPolygons2 = function(lyr, getGroupId) {
  return lyr.shapes.reduce(function(groups, shape, shapeId) {
    var groupId = getGroupId(shapeId);
    if (groupId in groups === false) {
      groups[groupId] = [];
    }
    groups[groupId].push(shapeId);
    return groups;
  }, []);
};

internal.dissolvePolygonGroups2 = function(groups, lyr, dataset, opts) {
  var arcFilter = internal.getArcPresenceTest(lyr.shapes, dataset.arcs);
  var nodes = new NodeCollection(dataset.arcs, arcFilter);
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: true});
  mosaicIndex.removeGaps(internal.getGapFillTest(dataset, opts));

  var dissolve = internal.getRingIntersector(mosaicIndex.nodes, 'dissolve');
  var dissolvedShapes = groups.map(function(shapeIds) {
    var tiles = mosaicIndex.getTilesByShapeIds(shapeIds);
    if (opts.tiles) {
      return tiles.reduce(function(memo, tile) {
        return memo.concat(tile);
      }, []);
    }
    return internal.dissolveTileGroup2(tiles, dissolve);
  });
  return dissolvedShapes;
};

internal.dissolveTileGroup2 = function(tiles, dissolve) {
  var rings = [],
      holes = [],
      dissolved, tile;
  for (var i=0, n=tiles.length; i<n; i++) {
    tile = tiles[i];
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
};
