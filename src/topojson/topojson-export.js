/* @requires
mapshaper-geojson,
topojson-common,
mapshaper-shape-geom,
mapshaper-arc-dissolve,
mapshaper-explode,
topojson-presimplify
*/

// Convert a dataset object to a TopoJSON topology object
TopoJSON.exportTopology = function(src, opts) {
  var dataset = TopoJSON.copyDatasetForExport(src),
      arcs = dataset.arcs,
      topology = {type: "Topology"},
      bounds;

  // generate arcs and transform
  if (arcs && arcs.size() > 0) {
    bounds = MapShaper.getDatasetBounds(dataset);
    if (opts.bbox && bounds.hasBounds()) {
      topology.bbox = bounds.toArray();
    }
    if (!opts.no_quantization) {
      topology.transform = TopoJSON.transformDataset(dataset, bounds, opts);
    }
    topology.arcs = TopoJSON.exportArcs(arcs, bounds, opts);
    if (topology.transform) {
      TopoJSON.deltaEncodeArcs(topology.arcs);
    }
  } else {
    // some datasets may lack arcs; spec seems to require an array anyway
    topology.arcs = [];
  }

  // export layers as TopoJSON named objects
  topology.objects = dataset.layers.reduce(function(objects, lyr, i) {
    var name = lyr.name || "layer" + (i + 1);
    objects[name] = TopoJSON.exportLayer(lyr, arcs, opts);
    return objects;
  }, {});

  // retain crs data if relevant
  MapShaper.exportCRS(dataset, topology);
  return topology;
};

// Clone arc data (this gets modified in place during TopoJSON export)
// Shallow-copy shape data in each layer (gets replaced with remapped shapes)
TopoJSON.copyDatasetForExport = function(dataset) {
  var copy = {info: dataset.info};
  copy.layers = dataset.layers.map(function(lyr) {
    var shapes = lyr.shapes ? lyr.shapes.concat() : null;
    return utils.defaults({shapes: shapes}, lyr);
  });
  if (dataset.arcs) {
    copy.arcs = dataset.arcs.getFilteredCopy();
  }
  return copy;
};

TopoJSON.transformDataset = function(dataset, bounds, opts) {
  var bounds2 = TopoJSON.calcExportBounds(bounds, dataset.arcs, opts),
      transform = bounds.getTransform(bounds2),
      inv = transform.invert();
  dataset.arcs.applyTransform(transform, true); // flag -> round coords
  MapShaper.dissolveArcs(dataset); // dissolve/prune arcs for more compact output
  // TODO: think about handling geometrical errors introduced by quantization,
  // e.g. segment intersections and collapsed polygon rings.
  return {
    scale: [inv.mx, inv.my],
    translate: [inv.bx, inv.by]
  };
};

TopoJSON.exportArcs = function(arcs, bounds, opts) {
  var fromZ = null;
  if (opts.presimplify) {
    if (!arcs.getVertexData().zz) {
      // Calculate simplification thresholds if none exist
      MapShaper.simplifyPaths(arcs, opts);
    }
    fromZ = TopoJSON.getPresimplifyFunction(bounds.width());
  }
  return TopoJSON.exportArcsWithPresimplify(arcs, fromZ);
};

// Export arcs as arrays of [x, y] and possibly [z] coordinates
TopoJSON.exportArcsWithPresimplify = function(arcData, fromZ) {
  var arcs = [];
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

// Calculate the x, y extents that map to an integer unit in topojson output
// as a fraction of the x- and y- extents of the average segment.
TopoJSON.calcExportResolution = function(arcs, k) {
  // TODO: think about the affect of long lines, e.g. from polar cuts.
  var xy = arcs.getAvgSegment2();
  return [xy[0] * k, xy[1] * k];
};

// Calculate the bounding box of quantized topojson coordinates using one
// of several methods.
TopoJSON.calcExportBounds = function(bounds, arcs, opts) {
  var unitXY, xmax, ymax;
  if (opts.topojson_precision > 0) {
    unitXY = TopoJSON.calcExportResolution(arcs, opts.topojson_precision);
  } else if (opts.quantization > 0) {
    unitXY = [opts.quantization / bounds.width(), opts.quantization / bounds.height()];
  } else if (opts.precision > 0) {
    unitXY = [1 / opts.precision, 1 / opts.precision];
  } else {
    // default -- auto quantization at 0.02 of avg. segment len
    unitXY = TopoJSON.calcExportResolution(arcs, 0.02);
  }
  xmax = Math.ceil(bounds.width() * unitXY[0]);
  ymax = Math.ceil(bounds.height() * unitXY[1]);
  return new Bounds(0, 0, xmax, ymax);
};

TopoJSON.exportProperties = function(geometries, table, opts) {
  var properties = MapShaper.exportProperties(table, opts),
      ids = MapShaper.exportIds(table, opts);
  geometries.forEach(function(geom, i) {
    if (properties) {
      geom.properties = properties[i];
    }
    if (ids) {
      geom.id = ids[i];
    }
  });
};

// Export a mapshaper layer as a GeometryCollection
TopoJSON.exportLayer = function(lyr, arcs, opts) {
  var n = MapShaper.getFeatureCount(lyr),
      geometries = [];
  // initialize to null geometries
  for (var i=0; i<n; i++) {
    geometries[i] = {type: null};
  }
  if (MapShaper.layerHasGeometry(lyr)) {
    TopoJSON.exportGeometries(geometries, lyr.shapes, arcs, lyr.geometry_type);
  }
  if (lyr.data) {
    TopoJSON.exportProperties(geometries, lyr.data, opts);
  }
  return {
    type: "GeometryCollection",
    geometries: geometries
  };
};

TopoJSON.exportGeometries = function(geometries, shapes, coords, type) {
  var exporter = TopoJSON.exporters[type];
  if (exporter && shapes) {
    shapes.forEach(function(shape, i) {
      if (shape && shape.length > 0) {
        geometries[i] = exporter(shape, coords);
      }
    });
  }
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
