/* @requires
geojson-common
mapshaper-path-import
mapshaper-data-table
*/

MapShaper.importGeoJSON = function(src, opts) {
  var srcObj = utils.isString(src) ? JSON.parse(src) : src,
      supportedGeometries = Object.keys(GeoJSON.pathImporters),
      idField = opts.id_field || GeoJSON.ID_FIELD,
      importer = new PathImporter(opts),
      srcCollection, dataset;

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

  (srcCollection.features || srcCollection.geometries || []).forEach(function(o) {
    var geom, rec;
    if (o.type == 'Feature') {
      geom = o.geometry;
      rec = o.properties || {};
      if ('id' in o) {
        rec[idField] = o.id;
      }
    } else if (o.type) {
      geom = o;
    }
    importer.startShape(rec);
    if (geom) GeoJSON.importGeometry(geom, importer);
  });

  dataset = importer.done();

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
    verbose("GeoJSON.importGeometry() Unsupported geometry type:", geom.type);
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
