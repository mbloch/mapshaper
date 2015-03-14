/* @requires mapshaper-common, mapshaper-shape-utils */

api.explodeFeatures = function(lyr, arcs, opts) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      explodedProperties = properties ? [] : null,
      explodedShapes = [],
      explodedLyr = utils.extend({}, lyr);

  lyr.shapes.forEach(function(shp, shpId) {
    var exploded;
    if (!shp) {
      explodedShapes.push(null);
    } else {
      if (lyr.geometry_type == 'polygon' && shp.length > 1) {
        exploded = MapShaper.explodePolygon(shp, arcs);
      } else {
        exploded = MapShaper.explodeShape(shp);
      }
      utils.merge(explodedShapes, exploded);
    }

    explodedLyr.shapes = explodedShapes;
    if (explodedProperties) {
      for (var i=0, n=exploded ? exploded.length : 1; i<n; i++) {
        explodedProperties.push(MapShaper.cloneProperties(properties[shpId]));
      }
    }
  });

  explodedLyr.shapes = explodedShapes;
  if (explodedProperties) {
    explodedLyr.data = new DataTable(explodedProperties);
  }
  return explodedLyr;
};

MapShaper.explodeShape = function(shp) {
  return shp.map(function(part) {
    return [part.concat()];
  });
};

MapShaper.explodePolygon = function(shape, arcs) {
  var paths = MapShaper.getPathMetadata(shape, arcs, "polygon");
  var groups = MapShaper.groupPolygonRings(paths);
  return groups.map(function(shape) {
    return shape.map(function(path) {
      return path.ids;
    });
  });
};

MapShaper.cloneProperties = function(obj) {
  var clone = {};
  for (var key in obj) {
    clone[key] = obj[key];
  }
  return clone;
};
