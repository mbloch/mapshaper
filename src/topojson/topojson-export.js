/* @requires
topojson-utils
topojson-split
*/

TopoJSON.exportTopology = function(layers, arcData, opts) {
  // TODO: filter out unused arcs
  // var flags = TopoJSON.findUnusedArcs(layers, arcData);
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
  }

  var arcIdMap = TopoJSON.filterExportArcs(filteredArcs);
  var arcArr = TopoJSON.exportArcs(filteredArcs, useDelta);

  Utils.forEach(layers, function(lyr, i) {
    var geomType = lyr.geometry_type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(filteredArcs, lyr.geometry_type == 'polygon'),
        shapes = lyr.shapes;
    if (arcIdMap) shapes = TopoJSON.remapShapes(shapes, arcIdMap);
    var name = lyr.name || "layer" + (i + 1);
    var obj = TopoJSON.exportGeometryCollection(exporter, geomType, shapes);
    var objectBounds = exporter.getBounds();
    if (invTransform) {
      objectBounds.transform(invTransform);
    }
    if (objectBounds.hasBounds()) {
      obj.bbox = objectBounds.toArray();
    }
    objects[name] = obj;
    bounds.mergeBounds(objectBounds);

    // export attribute data, if present
    if (lyr.data) {
      TopoJSON.exportProperties(obj.geometries, lyr.data.getRecords(), opts);
    }
  });

  topology.objects = objects;
  topology.arcs = arcArr;
  if (bounds.hasBounds()) {
    topology.bbox = bounds.toArray();
  }
  return topology;
};

// TODO: consider refactoring and combining with remapping code from
// mapshaper-topojson-split.js
//
TopoJSON.remapShapes = function(shapes, map) {
  return Utils.map(shapes, function(shape) {
    return shape ? TopoJSON.remapShape(shape, map) : null;
  });
};

// Re-index the arcs in a shape to account for removal of collapsed arcs
// Return arrays of remapped arcs; original arcs are unmodified.
//
TopoJSON.remapShape = function(src, map) {
  if (!src || src.length === 0) return [];
  var dest = [],
      arcIds, path, arcNum, arcId, k, inv;

  for (var pathId=0, numPaths=src.length; pathId < numPaths; pathId++) {
    path = src[pathId];
    arcIds = [];
    for (var i=0, n=path.length; i<n; i++) {
      arcNum = path[i];
      inv = arcNum < 0;
      arcId = inv ? ~arcNum : arcNum;
      k = map[arcId];
      if (k == -1) {
        //
      } else if (k <= arcId) {
        arcIds.push(inv ? ~k : k);
      } else {
        error("Arc index problem");
      }
    }
    if (arcIds.length > 0) {
      dest.push(arcIds);
    }
  }
  return dest;
};

TopoJSON.findUsedArcs = function(layers, arcs) {
  // TODO: consider removing duplication wth mapshaper-topojson.split.js
  var flags = new Uint8Array(arcs.size());
  // function markFlags() {}
  layers.forEach(function(lyr) {
    TopoJSON.traverseArcs(lyr.shapes, function(id) {
      // console.log(id);
    });
  });
  return flags;
};

// Remove unused and collapsed arcs from @arcDataset (ArcDataset) and re-index remaining
// arcs.
// Return an array mapping original arc ids to new ids (See ArcDataset#filter())
//
TopoJSON.filterExportArcs = function(arcData, flags) {
  var arcMap = arcData.filter(function(iter, i) {
    var x, y;
    if (flags && !flags[i]) return false;
    if (iter.hasNext()) {
      x = iter.x;
      y = iter.y;
      while (iter.hasNext()) {
        if (iter.x !== x || iter.y !== y) return true;
      }
    }
    return false;
  });
  return arcMap;
};


// Export arcs as arrays of [x, y] coords without delta encoding
//
TopoJSON.exportArcs = function(arcData, useDelta) {
  if (useDelta) return TopoJSON.exportDeltaEncodedArcs(arcData);
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

// Export arcs with delta encoding, as per the topojson spec.
//
TopoJSON.exportDeltaEncodedArcs = function(arcData) {
  var arcs = [];
  arcData.forEach(function(iter, i) {
    var arc = [],
        x = 0,
        y = 0,
        dx, dy;
    while (iter.hasNext()) {
      dx = iter.x - x;
      dy = iter.y - y;
      if (dx !== 0 || dy !== 0) {
        arc.push([dx, dy]);
      }
      x = iter.x;
      y = iter.y;
    }
    if (arc.length <= 1) {
      verbose("TopoJSON.exportDeltaEncodedArcs() defective arc, length:", arc.length);
      // defective arcs should have been filtered out earlier with ArcDataset.filter()
    }
    arcs.push(arc);
  });
  return arcs;
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

TopoJSON.exportGeometryCollection = function(exporter, type, shapes) {
  var obj = {
        type: "GeometryCollection"
      };
  obj.geometries = Utils.map(shapes, function(shape, i) {
    var paths = exporter.exportShapeForTopoJSON(shape);
    return TopoJSON.exportGeometry(paths, type);
  });
  return obj;
};

TopoJSON.exportGeometry = function(paths, type) {
  var obj = {};
  if (!paths || paths.length === 0) {
    // null geometry
    obj.type = null;
  }
  else if (type == 'MultiPolygon') {
    if (paths.length == 1) {
      obj.type = "Polygon";
      obj.arcs = paths[0];
    } else {
      obj.type = "MultiPolygon";
      obj.arcs = paths;
    }
  }
  else if (type == "MultiLineString") {
    if (paths.length == 1) {
      obj.arcs = paths[0];
      obj.type = "LineString";
    } else {
      obj.arcs = paths;
      obj.type = "MultiLineString";
    }
  }
  else {
    error ("TopoJSON.exportGeometry() unsupported type:", type);
  }
  return obj;
};
