/* @requires mapshaper-common, mapshaper-path-import, mapshaper-data-table */

MapShaper.importGeoJSON = function(obj, opts) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var supportedGeometries = Utils.getKeys(GeoJSON.pathImporters);
  var supportedTypes = supportedGeometries.concat(['FeatureCollection', 'GeometryCollection']);

  if (!Utils.contains(supportedTypes, obj.type)) {
    error("#importGeoJSON() Unsupported type:", obj.type);
  }

  // Convert single feature or geometry into a collection with one member
  //
  if (obj.type == 'Feature') {
    obj = {
      type: 'FeatureCollection',
      features: [obj]
    };
  } else if (Utils.contains(supportedGeometries, obj.type)) {
    obj = {
      type: 'GeometryCollection',
      geometries: [obj]
    };
  }

  var properties = null, geometries;
  if (obj.type == 'FeatureCollection') {
    properties = [];
    geometries = obj.features.map(function(feat) {
      properties.push(feat.properties);
      return feat.geometry;
    });
  } else {
    geometries = obj.geometries;
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pointCount = Utils.reduce(geometries, function(sum, geom) {
    return sum + GeoJSON.countPointsInGeom(geom);
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pointCount, opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    var f = geom && GeoJSON.pathImporters[geom.type];
    if (f) f(geom.coordinates, importer);
  });

  var importData = importer.done();
  if (properties) {
    importData.data = new DataTable(properties);
  }
  return importData;
};

var GeoJSON = MapShaper.geojson = {};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importLine(coords);
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer);
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPolygon(coords[i], i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer);
    }
  },
  Point: function(coord, importer) {
    importer.importPoint(coord);
  },
  MultiPoint: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPoint(coords[i]);
    }
  }
};

GeoJSON.countPointsInGeom = function(geom) {
  var sum = 0;
  if (geom) { // geometry may be null;
    if (geom.type in GeoJSON.geometryDepths === false) {
      error ("GeoJSON.countPoints() Unsupported geometry:", geom.type || geom);
    }
    sum = GeoJSON.countNestedPoints(geom.coordinates, GeoJSON.geometryDepths[geom.type]);
  }
  return sum;
};

// Nested depth of GeoJSON Points in coordinates arrays
//
GeoJSON.geometryDepths = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3
};

// Sum points in a GeoJSON coordinates array
GeoJSON.countNestedPoints = function(coords, depth) {
  var tally = 0;
  if (depth == 1) {
    tally = coords.length;
  } else if (depth > 1) {
    for (var i=0, n=coords.length; i<n; i++) {
      tally += GeoJSON.countNestedPoints(coords[i], depth-1);
    }
  } else if (depth === 0 && coords) {
    tally = 1;
  }
  return tally;
};

MapShaper.exportGeoJSON = function(layers, arcData, opts) {
  return layers.map(function(layer) {
    return {
      content: MapShaper.exportGeoJSONString(layer, arcData, opts),
      name: layer.name
    };
  });
};

MapShaper.exportGeoJSONString = function(layerObj, arcData, opts) {
  var type = layerObj.geometry_type,
      properties = layerObj.data && layerObj.data.getRecords() || null,
      useFeatures = !!properties && (!opts || !opts.cut_table);

  if (useFeatures && properties.length !== layerObj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }

  var objects = Utils.reduce(layerObj.shapes, function(memo, shapeIds, i) {
    var obj = MapShaper.exportGeoJSONGeometry(shapeIds, arcData, type);
    if (useFeatures) {
      obj = {
        type: "Feature",
        properties: properties[i] || null,
        geometry: obj
      };
    } else if (obj === null) {
      return memo; // null geometries not allowed in GeometryCollection, skip them
    }
    str = JSON.stringify(obj);
    return memo === "" ? str : memo + ",\n" + str;
  }, "");

  /*
  // TODO: re-introduce bounds if requested
  var output = {},
      bounds = exporter.getBounds();
  if (bounds.hasBounds()) {
    output.bbox = bounds.toArray();
  } */

  var output = useFeatures ? {
    type: "FeatureCollection",
    features: ["$"]
  } : {
    type: "GeometryCollection",
    geometries: ["$"]
  };

  var parts = JSON.stringify(output).split('"$"');
  return parts[0] + objects + parts[1];
};

MapShaper.exportGeoJSONObject = function(layerObj, arcData, opts) {
  return JSON.parse(MapShaper.exportGeoJSONString(layerObj, arcData, opts));
};

// export GeoJSON or TopoJSON point geometry
GeoJSON.exportPointGeom = function(shapeIds, arcs) {
  var points = [],
      geom = null;
  Utils.forEach(shapeIds, function(arcIds) {
    var iter = arcs.getShapeIter(arcIds);
    while (iter.hasNext()) {
      points.push([iter.x, iter.y]);
    }
  });
  if (points.length == 1) {
    geom = {
      type: "Point",
      coordinates: points[0]
    };
  } else if (points.length > 1) {
    geom = {
      type: "MultiPoint",
      coordinates: points
    };
  }
  return geom;
};

GeoJSON.exportLineGeom = function(ids, arcs) {
  var obj = MapShaper.exportPathData(ids, arcs, false);
  if (obj.pointCount === 0) return null;
  var coords = obj.pathData.map(function(path) {
    return MapShaper.transposeXYCoords(path.xx, path.yy);
  });
  return coords.length == 1 ? {
    type: "LineString",
    coordinates: coords[0]
  } : {
    type: "MultiLineString",
    coordinates: coords
  };
};

GeoJSON.exportPolygonGeom = function(ids, arcs) {
  var obj = MapShaper.exportPathData(ids, arcs, true);
  if (obj.pointCount === 0) return null;
  var groups = MapShaper.groupMultiPolygonPaths(obj.pathData);
  var coords = groups.map(function(paths) {
    return paths.map(function(path) {
      return MapShaper.transposeXYCoords(path.xx, path.yy);
    });
  });
  return coords.length == 1 ? {
    type: "Polygon",
    coordinates: coords[0]
  } : {
    type: "MultiPolygon",
    coordinates: coords
  };
};

// Used by shapefile export too --
MapShaper.exportPathData = function(ids, arcs, closed) {
  var pointCount = 0,
      bounds = new Bounds(),
      paths = [];

  Utils.forEach(ids, function(arcIds) {
    var iter = arcs.getShapeIter(arcIds);
    var path = MapShaper.exportPathCoords(iter);
    if (closed) {
      path.area = msSignedRingArea(path.xx, path.yy);
    }
    var valid = closed ? path.pointCount > 3 && path.area !== 0 :
        path.pointCount > 1;
    if (valid) {
      pointCount += path.pointCount;
      path.bounds = MapShaper.calcXYBounds(path.xx, path.yy);
      bounds.mergeBounds(path.bounds);
      paths.push(path);
    }
  });

  return {
    pointCount: pointCount,
    pathData: paths,
    bounds: bounds
  };
};

// Bundle holes with their containing rings, for Topo/GeoJSON export
// Assume outer rings are CW and inner (hole) rings are CCW, like Shapefile
// @paths array of path objects from exportShapeData()
//
MapShaper.groupMultiPolygonPaths = function(paths) {
  var pos = [],
      neg = [];
  Utils.forEach(paths, function(path) {
    if (path.area > 0) {
      pos.push(path);
    } else if (path.area < 0) {
      neg.push(path);
    } else {
      // verbose("Zero-area ring, skipping");
    }
  });

  var output = Utils.map(pos, function(part) {
    return [part];
  });

  Utils.forEach(neg, function(hole) {
    var containerId = -1,
        containerArea = 0;
    for (var i=0, n=pos.length; i<n; i++) {
      var part = pos[i],
          contained = part.bounds.contains(hole.bounds);
      if (contained && (containerArea === 0 || part.area < containerArea)) {
        containerArea = part.area;
        containerId = i;
      }
    }
    if (containerId == -1) {
      verbose("[groupMultiShapePaths()] polygon hole is missing a containing ring, dropping.");
    } else {
      output[containerId].push(hole);
    }
  });
  return output;
};

MapShaper.exportPathCoords = function(iter) {
  var xx = [], yy = [],
      i = 0,
      x, y, prevX, prevY;
  while (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    if (i === 0 || prevX != x || prevY != y) {
      xx.push(x);
      yy.push(y);
      i++;
    }
    prevX = x;
    prevY = y;
  }

  return {
    xx: xx,
    yy: yy,
    pointCount: xx.length
  };
};

MapShaper.exportGeoJSONGeometry = function(ids, arcs, type) {
  return ids ? GeoJSON.exporters[type](ids, arcs) : null;
};

GeoJSON.exporters = {
  polygon: GeoJSON.exportPolygonGeom,
  polyline: GeoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
};
