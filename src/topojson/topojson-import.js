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
  geometries.forEach(importer.addGeometryObject, importer);
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
      collectionType = null,
      shapeId;

  this.addGeometryObject = function(geom) {
    var rec = geom.properties || null;
    shapeId = shapes.length;
    shapes[shapeId] = null;
    if ('id' in geom) {
      rec = rec || {};
      rec[idField] = geom.id;
    }
    properties[shapeId] = rec;
    if (!rec) dataNulls++;
    if (geom.type) {
      this.addShape(geom);
    }
    if (shapes[shapeId] === null) {
      shapeNulls++;
    }
  };

  this.addShape = function(geom) {
    var curr = shapes[shapeId];
    var type = GeoJSON.translateGeoJSONType(geom.type);
    var shape, importer;
    if (geom.type == "GeometryCollection") {
      geom.geometries.forEach(this.addShape, this);
    } else if (type) {
      this.setGeometryType(type);
      shape = TopoJSON.shapeImporters[geom.type](geom);
      // TODO: better shape validation
      if (!shape || !shape.length || !Array.isArray(shape[0])) {
        stop("Invalid TopoJSON", geom.type, "geometry");
      }
      shapes[shapeId] = curr ? curr.concat(shape) : shape;
    } else if (geom.type) {
      stop("Invalid TopoJSON geometry type:", geom.type);
    }
  };

  this.setGeometryType = function(type) {
    var currType = shapeId < types.length ? types[shapeId] : null;
    if (!currType) {
      types[shapeId] = type;
      this.updateCollectionType(type);
    } else if (currType != type) {
      stop("Unable to import mixed-type TopoJSON geometries");
    }
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

TopoJSON.shapeImporters = {
  Point: function(geom) {
    return [geom.coordinates];
  },
  MultiPoint: function(geom) {
    return geom.coordinates;
  },
  LineString: function(geom) {
    return [geom.arcs];
  },
  MultiLineString: function(geom) {
    return geom.arcs;
  },
  Polygon: function(geom) {
    return geom.arcs;
  },
  MultiPolygon: function(geom) {
    return geom.arcs.reduce(function(memo, arr) {
      return memo ? memo.concat(arr) : arr;
    }, null);
  }
};
