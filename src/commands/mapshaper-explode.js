/* @requires mapshaper-common, mapshaper-shape-utils */

api.explodeFeatures = function(lyr, arcs, opts) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      explodedProperties = properties ? [] : null,
      explodedShapes = [],
      explodedLyr = utils.extend({}, lyr);

  lyr.shapes.forEach(function explodeShape(shp, shpId) {
    var exploded;
    if (!shp) {
      explodedShapes.push(null);
    } else {
      if (lyr.geometry_type == 'polygon' && shp.length > 1) {
        if (opts && opts.naive) {
          exploded = internal.explodePolygonNaive(shp, arcs);
        } else {
          exploded = internal.explodePolygon(shp, arcs);
        }
      } else {
        exploded = internal.explodeShape(shp);
      }
      utils.merge(explodedShapes, exploded);
    }
    if (explodedProperties !== null) {
      for (var i=0, n=exploded ? exploded.length : 1; i<n; i++) {
        explodedProperties.push(internal.cloneProperties(properties[shpId]));
      }
    }
  });

  explodedLyr.shapes = explodedShapes;
  if (explodedProperties !== null) {
    explodedLyr.data = new DataTable(explodedProperties);
  }
  return explodedLyr;
};

internal.explodeShape = function(shp) {
  return shp.map(function(part) {
    return [part.concat()];
  });
};

internal.explodePolygon = function(shape, arcs, reverseWinding) {
  var paths = internal.getPathMetadata(shape, arcs, "polygon");
  var groups = internal.groupPolygonRings(paths, reverseWinding);
  return groups.map(function(group) {
    return group.map(function(ring) {
      return ring.ids;
    });
  });
};

internal.explodePolygonNaive = function(shape, arcs) {
  var paths = internal.getPathMetadata(shape, arcs, "polygon");
  console.log("Naive");
  return paths.map(function(path) {
    if (path.area < 0) {
      internal.reversePath(path.ids);
    }
    return [path.ids];
  });
};

internal.cloneProperties = function(obj) {
  var clone = {};
  for (var key in obj) {
    clone[key] = obj[key];
  }
  return clone;
};
