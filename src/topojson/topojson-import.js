/* @requires topojson-common, mapshaper-point-utils */

// Convert a TopoJSON topology into mapshaper's internal format
// Side-effect: data in topology is modified
//
MapShaper.importTopoJSON = function(topology, opts) {
  var dataset, arcs, layers;

  if (utils.isString(topology)) {
    topology = JSON.parse(topology);
  }

  if (topology.arcs && topology.arcs.length > 0) {
    // TODO: apply transform to ArcCollection, not input arcs
    if (topology.transform) {
      TopoJSON.decodeArcs(topology.arcs, topology.transform);
    }

    if (opts && opts.precision) {
      TopoJSON.roundCoords(topology.arcs, opts.precision);
    }

    arcs = new ArcCollection(topology.arcs);
  }

  layers = Object.keys(topology.objects).reduce(function(memo, name) {
    var layers = TopoJSON.importObject(topology.objects[name], opts),
        lyr;
    for (var i=0, n=layers.length; i<n; i++) {
      lyr = layers[i];
      lyr.name = name; // TODO: consider type-suffixes if different-typed layers
      memo.push(lyr);
    }
    return memo;
  }, []);

  layers.forEach(function(lyr) {
    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }
    if (lyr.geometry_type == 'point' && topology.transform) {
      TopoJSON.decodePoints(lyr.shapes, topology.transform);
    }
    if (lyr.data) {
      MapShaper.fixInconsistentFields(lyr.data.getRecords());
    }
  });

  dataset = {
    layers: layers,
    arcs: arcs,
    info: {}
  };
  MapShaper.importCRS(dataset, topology);
  return dataset;
};

TopoJSON.decodePoints = function(shapes, transform) {
  MapShaper.forEachPoint(shapes, function(p) {
    p[0] = p[0] * transform.scale[0] + transform.translate[0];
    p[1] = p[1] * transform.scale[1] + transform.translate[1];
  });
};

TopoJSON.decodeArcs = function(arcs, transform) {
  var mx = transform.scale[0],
      my = transform.scale[1],
      bx = transform.translate[0],
      by = transform.translate[1];

  arcs.forEach(function(arc) {
    var prevX = 0,
        prevY = 0,
        xy, x, y;
    for (var i=0, len=arc.length; i<len; i++) {
      xy = arc[i];
      x = xy[0] + prevX;
      y = xy[1] + prevY;
      xy[0] = x * mx + bx;
      xy[1] = y * my + by;
      prevX = x;
      prevY = y;
    }
  });
};

// TODO: consider removing dupes...
TopoJSON.roundCoords = function(arcs, precision) {
  var round = getRoundingFunction(precision),
      p;
  arcs.forEach(function(arc) {
    for (var i=0, len=arc.length; i<len; i++) {
      p = arc[i];
      p[0] = round(p[0]);
      p[1] = round(p[1]);
    }
  });
};

TopoJSON.importObject = function(obj, opts) {
  var importer = new TopoJSON.GeometryImporter(opts);
  var geometries = obj.type == 'GeometryCollection' ? obj.geometries : [obj];
  geometries.forEach(importer.addGeometry, importer);
  return importer.done();
};

//
//
TopoJSON.GeometryImporter = function(opts) {
  var idField = opts && opts.id_field || GeoJSON.ID_FIELD,
      properties = [],
      shapes = [], // topological ids
      types = [],
      dataNulls = 0,
      shapeNulls = 0,
      collectionType = null;

  this.addGeometry = function(geom) {
    var type = GeoJSON.translateGeoJSONType(geom.type),
        shapeId = shapes.length,
        rec = geom.properties || null,
        shape = null;

    if ('id' in geom) {
      rec = rec || {};
      rec[idField] = geom.id;
    }
    if (type == 'point') {
      shape = this.importPointGeometry(geom);
    } else if (geom.type in TopoJSON.pathImporters) {
      shape = TopoJSON.pathImporters[geom.type](geom.arcs);
    } else {
      if (geom.type) {
        verbose("[TopoJSON] Unknown geometry type:", geom.type);
      }
      // null geometry -- ok
    }
    properties.push(rec);
    shapes.push(shape);
    types.push(type);
    if (!rec) dataNulls++;
    if (!shape) shapeNulls++;
    this.updateCollectionType(type);
  };

  this.importPointGeometry = function(geom) {
    var shape = null;
    if (geom.type == 'Point') {
      shape = [geom.coordinates];
    } else if (geom.type == 'MultiPoint') {
      shape = geom.coordinates;
    } else {
      stop("Invalid TopoJSON point geometry:", geom);
    }
    return shape;
  };

  this.updateCollectionType = function(type) {
    if (!collectionType) {
      collectionType = type;
    } else if (type && collectionType != type) {
      collectionType = 'mixed';
    }
  };

  this.done = function() {
    var layers;
    if (collectionType == 'mixed') {
      layers = MapShaper.divideFeaturesByType(shapes, properties, types);
    } else {
      layers = [{
        geometry_type: collectionType,
        shapes : collectionType ? shapes : null,
        data: dataNulls < shapes.length ? new DataTable(properties) : null
      }];
    }
    return layers;
  };
};

TopoJSON.pathImporters = {
  LineString: function(arcs) {
    return [arcs];
  },
  MultiLineString: function(arcs) {
    return arcs;
  },
  Polygon: function(arcs) {
    return arcs;
  },
  MultiPolygon: function(arcs) {
    return arcs.reduce(function(memo, arr) {
      return memo ? memo.concat(arr) : arr;
    }, null);
  }
};
