import { verbose, warn } from '../utils/mapshaper-logging';
import GeoJSON from '../geojson/geojson-common';
import utils from '../utils/mapshaper-utils';
import { PathImporter } from '../paths/mapshaper-path-import';
import { copyRecord } from '../datatable/mapshaper-data-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';

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
  captureGeoJSONMetadata(dataset, srcObj);
  warnIfProjectedCoords(dataset, srcObj, opts);
  return dataset;
}

// RFC 7946 GeoJSON is required to be in WGS84 lon/lat (so omits the legacy
// `crs` member). If the imported file makes no CRS claim but its coordinates
// are clearly outside lat-long range, warn the user: silent fallthrough here
// usually surfaces later as cryptic -proj errors or grossly wrong output.
function warnIfProjectedCoords(dataset, jsonObj, opts) {
  if (!opts.warn_projected_coords) return;
  if (jsonObj && jsonObj.crs) return; // user has explicitly declared a CRS
  var bounds = getRoughDatasetBounds(dataset);
  if (!bounds || !bounds.hasBounds()) return;
  if (probablyDecimalDegreeBounds(bounds)) return;
  warn('Imported GeoJSON has coordinates outside the lat-long range -- ' +
    ' importing as projected geometry with unknown CRS. Commands ' +
    'like -proj that require a CRS will not work until you set a source ' +
    'CRS, e.g. -proj init=EPSG:3857.');
}

// Local bounds helper to avoid pulling getDatasetBounds (and its transitive
// dependency on mapshaper-merging / mapshaper-topology) into the GeoJSON
// import path.
function getRoughDatasetBounds(dataset) {
  var bounds = new Bounds();
  if (dataset.arcs) {
    bounds.mergeBounds(dataset.arcs.getBounds());
  }
  (dataset.layers || []).forEach(function(lyr) {
    if (lyr.geometry_type !== 'point' || !lyr.shapes) return;
    lyr.shapes.forEach(function(shape) {
      if (!shape) return;
      shape.forEach(function(pt) {
        if (pt && pt.length >= 2) bounds.mergePoint(pt[0], pt[1]);
      });
    });
  });
  return bounds;
}

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
    if (geom && geom.type == 'GeometryCollection') {
      GeoJSON.importComplexFeature(importer, geom, rec, opts);
    } else if (opts.single_part && isMultiPartGeometry(geom)) {
      GeoJSON.importMultiAsSingles(importer, geom, rec, opts);
    } else {
      GeoJSON.importSimpleFeature(importer, geom, rec, opts);
    }
  };

  this.done = function() {
    return importer.done();
  };
}

GeoJSON.importComplexFeature = function(importer, geom, rec, opts) {
  var types = divideGeometriesByType(geom.geometries || []);
  if (types.length === 0) {
    importer.startShape(rec); // import a feature with null geometry
    return;
  }
  types.forEach(function(geometries, i) {
    importer.startShape(copyRecord(rec));
    geometries.forEach(function(geom) {
      GeoJSON.importSimpleGeometry(importer, geom, opts);
    });
  });
};

function divideGeometriesByType(geometries, index) {
  index = index || {};
  geometries.forEach(function(geom) {
    if (!geom) return;
    var mtype = GeoJSON.translateGeoJSONType(geom.type);
    if (mtype) {
      if (mtype in index === false) {
        index[mtype] = [];
      }
      index[mtype].push(geom);
    } else if (geom.type == 'GeometryCollection') {
      divideGeometriesByType(geom.geometries || [], index);
    }
  });
  return Object.values(index);
}

function isMultiPartGeometry(geom) {
  return geom && geom.type && geom.type.indexOf('Multi') === 0;
}

GeoJSON.importSimpleFeature = function(importer, geom, rec, opts) {
  importer.startShape(rec);
  GeoJSON.importSimpleGeometry(importer, geom, opts);
};

// Split a multi-part feature into several single features
GeoJSON.importMultiAsSingles = function(importer, geom, rec, opts) {
  geom.coordinates.forEach(function(coords, i) {
    var geom2 = {
      type: geom.type.substr(5),
      coordinates: coords
    };
    var rec2 = i === 0 ? rec : copyRecord(rec);
    GeoJSON.importSimpleFeature(importer, geom2, rec2, opts);
  });
};

GeoJSON.importSimpleGeometry = function(importer, geom, opts) {
  var type = geom ? geom.type : null;
  if (type === null) {
    // no geometry to import
  } else if (type in GeoJSON.pathImporters) {
    if (opts.geometry_type && opts.geometry_type != GeoJSON.translateGeoJSONType(type)) {
      // kludge to filter out all but one type of geometry
      return;
    }
    GeoJSON.pathImporters[type](geom.coordinates, importer);
  } else {
    verbose("Unsupported geometry type:", geom.type);
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

// Structural GeoJSON members that describe geometry/collection shape.
// These are reconstructed on export, so they are not preserved as metadata.
// Note: "bbox" is intentionally excluded from the metadata (mapshaper
// regenerates it), but "crs" and "id" and any non-standard members are kept.
var GEOJSON_STRUCTURAL_MEMBERS = ['type', 'bbox', 'features', 'geometries',
  'geometry', 'coordinates', 'properties'];

// Preserve non-structural top-level members of a GeoJSON object (e.g. a legacy
// "crs" object, a top-level "id", or non-standard members such as "metadata"
// or "name") so they can be re-emitted when the "metadata" output option is set.
export function captureGeoJSONMetadata(dataset, jsonObj) {
  if (!jsonObj || typeof jsonObj != 'object') return;
  var meta = {};
  var found = false;
  Object.keys(jsonObj).forEach(function(key) {
    if (GEOJSON_STRUCTURAL_MEMBERS.indexOf(key) > -1) return;
    meta[key] = jsonObj[key];
    found = true;
  });
  if (found) {
    dataset.info.input_geojson_metadata = meta;
  }
}
