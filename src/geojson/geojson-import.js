import { verbose } from '../utils/mapshaper-logging';
import GeoJSON from '../geojson/geojson-common';
import utils from '../utils/mapshaper-utils';
import { PathImporter } from '../paths/mapshaper-path-import';

export function GeoJSONParser(opts) {
  var idField = opts.id_field || GeoJSON.ID_FIELD,
      importer = new PathImporter(opts),
      dataset;

  this.parseObject = function(o) {
    var geom, rec;
    if (!o || !o.type) {
      // not standard GeoJSON -- importing as null record
      // (useful when parsing GeoJSON generated internally)
      geom = null;
    } else if (o.type == 'Feature') {
      geom = o.geometry;
      rec = o.properties || {};
      if ('id' in o) {
        rec[idField] = o.id;
      }
    } else {
      geom = o;
    }
    // TODO: improve so geometry_type option skips features instead of creating null geometries
    importer.startShape(rec);
    if (geom) GeoJSON.importGeometry(geom, importer, opts);
  };

  this.done = function() {
    return importer.done();
  };
}

export function importGeoJSON(src, optsArg) {
  var opts = optsArg || {};
  var supportedGeometries = Object.keys(GeoJSON.pathImporters),
      srcObj = utils.isString(src) ? JSON.parse(src) : src,
      importer = new GeoJSONParser(opts),
      srcCollection, dataset;

  // Convert single feature or geometry into a collection with one member
  if (srcObj.type == 'Feature') {
    srcCollection = {
      type: 'FeatureCollection',
      features: [srcObj]
    };
  } else if (supportedGeometries.includes(srcObj.type)) {
    srcCollection = {
      type: 'GeometryCollection',
      geometries: [srcObj]
    };
  } else {
    srcCollection = srcObj;
  }
  (srcCollection.features || srcCollection.geometries || []).forEach(importer.parseObject);
  dataset = importer.done();
  importCRS(dataset, srcObj); // TODO: remove this
  return dataset;
}

GeoJSON.importGeometry = function(geom, importer, opts) {
  var type = geom.type;
  if (type in GeoJSON.pathImporters) {
    if (opts.geometry_type && opts.geometry_type != GeoJSON.translateGeoJSONType(type)) {
      // kludge to filter out all but one type of geometry
      return;
    }
    GeoJSON.pathImporters[type](geom.coordinates, importer);
  } else if (type == 'GeometryCollection') {
    geom.geometries.forEach(function(geom) {
      GeoJSON.importGeometry(geom, importer, opts);
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


export function importCRS(dataset, jsonObj) {
  if ('crs' in jsonObj) {
    dataset.info.input_geojson_crs = jsonObj.crs;
  }
}
