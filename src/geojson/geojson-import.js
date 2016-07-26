/* @requires
geojson-common
mapshaper-path-import
mapshaper-data-table
*/

MapShaper.importGeoJSON = function(src, opts) {
  var srcObj = utils.isString(src) ? JSON.parse(src) : src,
      supportedGeometries = Object.keys(GeoJSON.pathImporters),
      idField = opts.id_field || GeoJSON.ID_FIELD,
      properties = null,
      geometries, srcCollection, importer, dataset;

  // Convert single feature or geometry into a collection with one member
  if (srcObj.type == 'Feature') {
    srcCollection = {
      type: 'FeatureCollection',
      features: [srcObj]
    };
  } else if (utils.contains(supportedGeometries, srcObj.type)) {
    srcCollection = {
      type: 'GeometryCollection',
      geometries: [srcObj]
    };
  } else {
    srcCollection = srcObj;
  }

  if (srcCollection.type == 'FeatureCollection') {
    properties = [];
    geometries = srcCollection.features.map(function(feat) {
      var rec = feat.properties || {};
      if ('id' in feat) {
        rec[idField] = feat.id;
      }
      properties.push(rec);
      return feat.geometry;
    });
  } else if (srcCollection.type == 'GeometryCollection') {
    geometries = srcCollection.geometries;
  } else {
    stop("[i] Unsupported GeoJSON type:", srcCollection.type);
  }

  if (!geometries) {
    stop("[i] Missing geometry data");
  }

  // Import GeoJSON geometries
  importer = new PathImporter(opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    if (geom) {
      GeoJSON.importGeometry(geom, importer);
    }
  });
  dataset = importer.done();

  if (properties) {
    dataset.layers[0].data = new DataTable(properties);
  }
  MapShaper.importCRS(dataset, srcObj);

  return dataset;
};

GeoJSON.importGeometry = function(geom, importer) {
  var type = geom.type;
  if (type in GeoJSON.pathImporters) {
    GeoJSON.pathImporters[type](geom.coordinates, importer);
  } else if (type == 'GeometryCollection') {
    geom.geometries.forEach(function(geom) {
      GeoJSON.importGeometry(geom, importer);
    });
  } else {
    verbose("TopoJSON.importGeometryCollection() Unsupported geometry type:", geom.type);
  }
};

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
      importer.importRing(coords[i], i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer);
    }
  },
  Point: function(coord, importer) {
    importer.importPoints([coord]);
  },
  MultiPoint: function(coords, importer) {
    importer.importPoints(coords);
  }
};

MapShaper.importCRS = function(dataset, jsonObj) {
  if ('crs' in jsonObj) {
    dataset.info.input_geojson_crs = jsonObj.crs;
  }
};
