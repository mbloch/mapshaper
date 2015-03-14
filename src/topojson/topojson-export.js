/* @requires
mapshaper-geojson,
topojson-common,
topojson-split,
mapshaper-shape-geom,
mapshaper-arc-dissolve,
mapshaper-explode,
topojson-presimplify
*/

TopoJSON.exportTopology = function(layers, arcData, opts) {
  var topology = {type: "Topology"},
      bounds = new Bounds(),
      objects, filteredArcs, transform, invTransform;

  // some datasets may lack arcs -- e.g. only point layers
  if (arcData && arcData.size() > 0) {
    // get a copy of arc data (coords are modified for topojson export)
    filteredArcs = arcData.getFilteredCopy();

    if (opts.presimplify && !filteredArcs.getVertexData().zz) {
      // Calculate simplification thresholds if none exist
      MapShaper.simplifyPaths(filteredArcs, opts);
    }

    if (opts.no_quantization) {
      // no transform
    } else if (opts.topojson_precision) {
      transform = TopoJSON.getExportTransform(filteredArcs, null, opts.topojson_precision);
    } else if (opts.quantization > 0) {
      transform = TopoJSON.getExportTransform(filteredArcs, opts.quantization);
    } else if (opts.precision > 0) {
      transform = TopoJSON.getExportTransformFromPrecision(filteredArcs, opts.precision);
    } else {
      // default -- auto quantization
      transform = TopoJSON.getExportTransform(filteredArcs);
    }

    if (transform) {
      if (transform.isNull()) {
        // kludge: null transform likely due to collapsed shape(s)
        // using identity transform as a band-aid, need to rethink this.
        transform = new Transform();
      }
      invTransform = transform.invert();
      topology.transform = {
        scale: [invTransform.mx, invTransform.my],
        translate: [invTransform.bx, invTransform.by]
      };

      filteredArcs.applyTransform(transform, !!"round");
    }

    // dissolve arcs for more compact output
    // make shallow copy of layers, so arc ids of original layer.shapes
    // don't change
    layers = layers.map(function(lyr) {
      var shapes = lyr.shapes ? lyr.shapes.concat() : null;
      return utils.defaults({shapes: shapes}, lyr);
    });
    MapShaper.dissolveArcs(layers, filteredArcs);
  }

  objects = layers.reduce(function(objects, lyr, i) {
    var name = lyr.name || "layer" + (i + 1),
        obj = TopoJSON.exportGeometryCollection(lyr.shapes, filteredArcs, lyr.geometry_type);

    bounds.mergeBounds(MapShaper.getLayerBounds(lyr, filteredArcs));
    if (lyr.data) {
      TopoJSON.exportProperties(obj.geometries, lyr.data, opts);
    }
    objects[name] = obj;
    return objects;
  }, {});

  // replaced by dissolveArcs() above
  // if (filteredArcs) {
    // TopoJSON.pruneArcs(topology);
  // }

  if (invTransform) {
    bounds.transform(invTransform);
  }

  if (opts.bbox && bounds.hasBounds()) {
    topology.bbox = bounds.toArray();
  }

  topology.objects = objects;

  if (filteredArcs && filteredArcs.size() > 0) {
    topology.arcs = TopoJSON.exportArcsWithPresimplify(filteredArcs, opts.presimplify && bounds.width());
    if (transform) {
      TopoJSON.deltaEncodeArcs(topology.arcs);
    }
  } else {
    topology.arcs = []; // spec seems to require an array
  }

  return topology;
};

// Export arcs as arrays of [x, y] coords without delta encoding
TopoJSON.exportArcs = function(arcData) {
  var arcs = [];
  arcData.forEach(function(iter, i) {
    var arc = [];
    while (iter.hasNext()) {
      arc.push([iter.x, iter.y]);
    }
    arcs.push(arc.length > 1 ? arc : null);
  });
  return arcs;
};

// Export arcs as arrays of [x, y] coords without delta encoding
TopoJSON.exportArcsWithPresimplify = function(arcData, width) {
  var fromZ = width ? TopoJSON.getPresimplifyFunction(width) : null,
      arcs = [];

  arcData.forEach2(function(i, n, xx, yy, zz) {
    var arc = [],
        useZ = zz && fromZ,
        p;
    for (var j=i + n; i<j; i++) {
      p = [xx[i], yy[i]];
      if (useZ) {
        p.push(fromZ(zz[i]));
      }
      arc.push(p);
    }
    arcs.push(arc.length > 1 ? arc : null);
  });
  return arcs;
};

// Apply delta encoding in-place to an array of topojson arcs
TopoJSON.deltaEncodeArcs = function(arcs) {
  arcs.forEach(function(arr) {
    var ax, ay, bx, by, p;
    for (var i=0, n=arr.length; i<n; i++) {
      p = arr[i];
      bx = p[0];
      by = p[1];
      if (i > 0) {
        p[0] = bx - ax;
        p[1] = by - ay;
      }
      ax = bx;
      ay = by;
    }
  });
};

// Return a Transform object for converting geographic coordinates to quantized
// integer coordinates.
//
TopoJSON.getExportTransform = function(arcData, quanta, precision) {
  var srcBounds = arcData.getBounds(),
      destBounds, xmax, ymax;
  if (quanta) {
    xmax = quanta - 1;
    ymax = quanta - 1;
  } else {
    var resXY = TopoJSON.calcExportResolution(arcData, precision);
    xmax = srcBounds.width() / resXY[0];
    ymax = srcBounds.height() / resXY[1];
  }
  // rounding xmax, ymax ensures original layer bounds don't change after 'quantization'
  // (this could matter if a layer extends to the poles or the central meridian)
  // TODO: test this
  destBounds = new Bounds(0, 0, Math.ceil(xmax), Math.ceil(ymax));
  return srcBounds.getTransform(destBounds);
};

TopoJSON.getExportTransformFromPrecision = function(arcData, precision) {
  var src = arcData.getBounds(),
      dest = new Bounds(0, 0, src.width() / precision, src.height() / precision),
      transform = src.getTransform(dest);
  return transform;
};

// Find the x, y values that map to x / y integer unit in topojson output
// Calculated as 1/50 the size of average x and y offsets
// (a compromise between compression, precision and simplicity)
//
TopoJSON.calcExportResolution = function(arcData, precision) {
  // TODO: remove influence of long lines created by polar and antimeridian cuts
  var xy = arcData.getAvgSegment2(),
      k = parseFloat(precision) || 0.02;
  return [xy[0] * k, xy[1] * k];
};

TopoJSON.exportProperties = function(geometries, table, opts) {
  var records = table.getRecords(),
      idField = MapShaper.getIdField(opts.id_field, table);
  geometries.forEach(function(geom, i) {
    var properties = records[i];
    if (properties) {
      if (!(opts.cut_table || opts.drop_table)) {
        geom.properties = properties;
      }
      if (idField && idField in properties) {
        geom.id = properties[idField];
      }
    }
  });
};

TopoJSON.exportGeometryCollection = function(shapes, coords, type) {
  var exporter = TopoJSON.exporters[type];
  var obj = {
      type: "GeometryCollection"
    };
  if (exporter) {
    obj.geometries = utils.map(shapes, function(shape, i) {
      if (shape && shape.length > 0) {
        return exporter(shape, coords);
      }
      return {type: null};
    });
  } else {
    obj.geometries = [];
  }
  return obj;
};

TopoJSON.exportPolygonGeom = function(shape, coords) {
  var geom = {};
  shape = MapShaper.filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length > 1) {
    geom.arcs = MapShaper.explodePolygon(shape, coords);
    if (geom.arcs.length == 1) {
      geom.arcs = geom.arcs[0];
      geom.type = "Polygon";
    } else {
      geom.type = "MultiPolygon";
    }
  } else {
    geom.arcs = shape;
    geom.type = "Polygon";
  }
  return geom;
};

TopoJSON.exportLineGeom = function(shape, coords) {
  var geom = {};
  shape = MapShaper.filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length == 1) {
    geom.type = "LineString";
    geom.arcs = shape[0];
  } else {
    geom.type = "MultiLineString";
    geom.arcs = shape;
  }
  return geom;
};

TopoJSON.exporters = {
  polygon: TopoJSON.exportPolygonGeom,
  polyline: TopoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
};
