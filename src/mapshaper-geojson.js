/* @requires mapshaper-common */

MapShaper.importJSON = function(obj) {
  if (obj.type == "Topology") {
    error("TODO: TopoJSON import.")
    return MapShaper.importTopoJSON(obj);
  }
  return MapShaper.importGeoJSON(obj);
};

MapShaper.importGeoJSON = function(obj) {
  // TODO: support individual features and geometries by converting to collections of one

  var supported = ['FeatureCollection', 'GeometryCollection'];

  if (!Utils.contains(supported, obj.type)) {
    error("MapShaper.importGeoJSON() Unsupported type:", obj.type, "Expected one of:", supported.join(', '));
  }

  // first, convert to a simpler format
  var converted = MapShaper.convertGeoJSONCollection(obj);

  // next, convert to input format for topology function
  var xx = new Float64Array(converted.pointCount),
      yy = new Float64Array(converted.pointCount),
      offs = 0;

  Utils.forEach(converted.paths, function(path) {
    var points = path && path.coordinates,
        p;
    if (!points) return;
    for (var i=0, n=points.length; i<n; i++) {
      p = points[i];
      xx[offs] = p[0];
      yy[offs] = p[1];
      offs++;
    }
    path.coordinates = null; // no longer need array of points
  });

  // TODO: do something with converted.properties
  var bounds = MapShaper.calcXYBounds(xx, yy);
  var justRings = Utils.every(converted.paths, function(path) {
    return path.isRing === true;
  });
  var info = {
    input_bounds: bounds.toArray(),
    input_point_count: converted.pointCount,
    input_part_count: converted.paths.length,
    input_geometry_type: justRings ? 'polygon' : 'polyline'
  };

  return {
    xx: xx,
    yy: yy,
    pathData: converted.paths,
    properties: converted.properties || null, // may be null
    info: info
  };
};

// Enforce CW/CCW rule for positive/negative space rings
// Reverse points array if wrong direction
// TODO: check whether ring is closed?
// Return true if valid ring, false if ring is collapsed or otherwise invalid
//
MapShaper.validateGeoJSONRing = function(points, isHole) {
  var n = points.length,
      sum = 0,
      x, y, prevX, prevY;

  if (n < 4) {
    return false;
  }
  for (var i=0; i<n; i++) {
    x = points[i][0], y = points[i][1];
    if (i > 0) {
      sum += x * prevY - y * prevX;
    }
    prevX = x, prevY = y;
  }
  if (sum == 0) return false;
  if (sum > 0 && isHole || sum < 0 && !isHole) {
    points.reverse();
  }
  return true;
};

// Convert FeatureCollection and GeometryCollection types to an intermediate format
//
MapShaper.convertGeoJSONCollection = function(obj) {
  var features = obj.type == 'FeatureCollection';
  var properties = features ? [] : null;
  var paths = [];
  var pointCount = 0;
  var converters = {
    LineString: function(coords, paths, shapeId) {
      var size = coords.length;
      if (size > 1 == false) return 0;
      paths.push({
        size: size,
        coordinates: coords,
        shapeId: shapeId,
        isRing: false,
        isHole: false
      });
      return size;
    },
    MultiLineString: function(coords, paths, shapeId) {
      var count = 0;
      for (var i=0; i<coords.length; i++) {
        count += converters.LineString(coords[i], paths, shapeId);
      }
      return count;
    },
    Polygon: function(coords, paths, shapeId) {
      var count = 0,
          points, isHole;
      for (var i=0; i<coords.length; i++) {
        isHole = i > 0;
        points = coords[i];
        if (!MapShaper.validateGeoJSONRing(points, isHole)) continue;
        size = points.length;
        paths.push({
          size: points.length,
          coordinates: points,
          shapeId: shapeId,
          isRing: true,
          isHole: isHole
        });
        count += points.length;
      }
      return count;
    },
    MultiPolygon: function(coords, paths, shapeId) {
      var count = 0;
      for (var i=0; i<coords.length; i++) {
        count += converters.Polygon(coords[i], paths, shapeId);
      }
      return count;
    }
  };

  Utils.forEach(features ? obj.features : obj.geometries, function(obj, i) {
    var geom, converter;
    if (features) {
      properties.push(obj.properties);
      geom = obj.geometry;
    } else {
      geom = obj;
    }

    var converter = converters[geom.type];
    if (converter) {
      pointCount += converter(geom.coordinates, paths, i);
    } else {
      trace("No GeoJSON importer for geometry type:", geom.type);
    }
  });

  return {
    paths: paths,
    properties: properties,
    pointCount: pointCount
  };
};


MapShaper.exportGeoJSON = function(obj) {
  T.start();
  if (!obj.shapes) error("#exportGeoJSON() Missing 'shapes' param.");

  if (obj.type != "MultiPolygon" && obj.type != "MultiLineString") error("#exportGeoJSON() Unsupported type:", obj.type);

  var properties = obj.properties,
      useFeatures = !!properties;

  if (useFeatures && properties.length !== obj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }

  var objects = Utils.map(obj.shapes, function(shape, i) {
    if (!shape || !Utils.isArray(shape)) {
      error("[exportGeoJSON()] Missing or invalid param/s");
    }
    if (useFeatures) {
      return MapShaper.exportGeoJSONFeature(shape, obj.type, properties[i]);
    } else {
      return MapShaper.exportGeoJSONGeometry(shape, obj.type);
    }
  });

  var output = {};
  if (useFeatures) {
    output.type = 'FeatureCollection';
    output.features = objects;
  } else {
    output.type = 'GeometryCollection';
    output.geometries = objects;
  }

  T.stop("Export GeoJSON");
  return JSON.stringify(output);
};


MapShaper.exportGeoJSONGeometry = function(paths, type) {
  var geom = {};

  if (paths.length == 0) {
    geom = null; // null geometry
  }
  else if (type == 'MultiPolygon') {
    if (paths.length == 1) {
      geom.type = "Polygon";
      geom.coordinates = exportCoordsForGeoJSON(paths[0]);
    } else {
      geom.type = "MultiPolygon";
      geom.coordinates = Utils.map(paths, exportCoordsForGeoJSON);
    }
  }
  else if (type == 'MultiLineString') {
    if (paths.length == 1) {
      geom.type = "LineString";
      geom.coordinates = paths[0].toArray();
    } else {
      geom.type = "MultiLineString";
      geom.coordinates = exportCoordsForGeoJSON(paths);
    }
  }
  else {
    geom = null;
  }
  return geom;
}


//
//
MapShaper.exportGeoJSONFeature = function(pathGroups, type, properties) {
  var feature = {
    type: "Feature",
    properties: properties || null,
    geometry: MapShaper.exportGeoJSONGeometry(pathGroups, type)
  };
  return feature;
};

function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}
