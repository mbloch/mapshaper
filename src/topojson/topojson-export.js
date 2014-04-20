/* @requires
topojson-utils
topojson-split
mapshaper-shape-geom
*/

TopoJSON.exportTopology = function(layers, arcData, opts) {
  var topology = {type: "Topology"},
      objects = {},
      // get a copy of arc data (coords are modified for topojson export)
      filteredArcs = arcData.getFilteredCopy(),
      bounds = new Bounds(),
      useDelta = true,
      transform, invTransform;

  // TODO: getting messy, refactor
  if (opts.topojson_precision) {
    transform = TopoJSON.getExportTransform(filteredArcs, null, opts.topojson_precision);
  } else if (opts.topojson_resolution === 0) {
    useDelta = true;
  } else if (opts.topojson_resolution > 0) {
    transform = TopoJSON.getExportTransform(filteredArcs, opts.topojson_resolution);
  } else if (opts.precision > 0) {
    transform = TopoJSON.getExportTransformFromPrecision(filteredArcs, opts.precision);
  } else {
    transform = TopoJSON.getExportTransform(filteredArcs); // auto quantization
  }

  // kludge: null transform likely due to collapsed shape(s)
  // using identity transform as a band-aid, need to rethink this.
  if (transform && transform.isNull()) {
    transform = new Transform();
  }

  if (transform) {
    invTransform = transform.invert();
    topology.transform = {
      scale: [invTransform.mx, invTransform.my],
      translate: [invTransform.bx, invTransform.by]
    };
    filteredArcs.applyTransform(transform, !!"round");
    // remove identical points ?
  }

  Utils.forEach(layers, function(lyr, i) {
    var name = lyr.name || "layer" + (i + 1),
        geomType = lyr.geometry_type,
        obj = TopoJSON.exportGeometryCollection(lyr.shapes, filteredArcs, geomType);
    /*
    var objectBounds = exporter.getBounds();
    if (invTransform) {
      objectBounds.transform(invTransform);
    }
    if (objectBounds.hasBounds()) {
      obj.bbox = objectBounds.toArray();
    }
    */
    objects[name] = obj;
    // bounds.mergeBounds(objectBounds);

    // export attribute data, if present
    if (lyr.data) {
      TopoJSON.exportProperties(obj.geometries, lyr.data.getRecords(), opts);
    }
  });

  topology.objects = objects;
  topology.arcs = TopoJSON.exportArcs(filteredArcs);

  // TODO: avoid if not needed
  TopoJSON.pruneArcs(topology);

  if (useDelta) {
    TopoJSON.deltaEncodeArcs(topology.arcs);
  }
  /*
  if (bounds.hasBounds()) {
    topology.bbox = bounds.toArray();
  }
  */
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
  var xy = arcData.getAverageSegment(),
      k = parseFloat(precision) || 0.02;
  return [xy[0] * k, xy[1] * k];
};

TopoJSON.exportProperties = function(geometries, records, opts) {
  geometries.forEach(function(geom, i) {
    var properties = records[i];
    if (properties) {
      if (!opts.cut_table) {
        geom.properties = properties;
      }
      if (opts.id_field) {
        geom.id = properties[opts.id_field];
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
    obj.geometries = Utils.map(shapes, function(shape, i) {
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

MapShaper.arcHasLength = function(id, coords) {
  var iter = coords.getArcIter(id), x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      if (iter.x != x || iter.y != y) return true;
    }
  }
  return false;
};

MapShaper.filterEmptyArcs = function(shape, coords) {
  if (!shape) return null;
  var shape2 = [];
  Utils.forEach(shape, function(ids) {
    var path = [];
    for (var i=0; i<ids.length; i++) {
      if (MapShaper.arcHasLength(ids[i], coords)) {
        path.push(ids[i]);
      }
    }
    if (path.length > 0) shape2.push(path);
  });
  return shape2.length > 0 ? shape2 : null;
};

TopoJSON.groupPolygonRings = function(shapes, coords) {
  var iter = new ShapeIter(coords),
      pos = [],
      neg = [],
      groups = [];

  shapes.forEach(function(ids) {
    if (!Utils.isArray(ids)) throw new Error("expected array");
    iter.init(ids);
    var area = MapShaper.getPathArea(iter),
        bounds = coords.getSimpleShapeBounds(ids);
    var path = {
      ids: ids,
      area: area,
      bounds: bounds
    };
    if (!path.area) {
      // skip 0 area rings
    } else if (path.area > 0) {
      pos.push(path);
      groups.push([ids]);
    } else {
      neg.push(path);
    }
  });

  neg.forEach(function(hole) {
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
      verbose("#groupMultiShapePaths() polygon hole is missing a containing ring, dropping.");
    } else {
      groups[containerId].push(hole.ids);
    }
  });
  return groups;
};

TopoJSON.exportPolygonGeom = function(shape, coords) {
  var geom = {};
  shape = MapShaper.filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length > 1) {
    geom.arcs = TopoJSON.groupPolygonRings(shape, coords);
    geom.type = geom.arcs.length > 1 ? "MultiPolygon" : "Polygon";
  } else if (shape.length == 1) {
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
