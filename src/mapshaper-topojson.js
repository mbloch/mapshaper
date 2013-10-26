/* @requires mapshaper-common, mapshaper-geojson */

var TopoJSON = MapShaper.topojson = {};

MapShaper.importTopoJSON = function(obj, opts) {
  var round = opts && opts.precision ? getRoundingFunction(opts.precision) : null;

  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var arcs = TopoJSON.importArcs(obj.arcs, obj.transform, round),
      layers = [];
  Utils.forEach(obj.objects, function(object, name) {
    var layerData = TopoJSON.importObject(object, arcs);
    var data;
    if (layerData.properties) {
      data = new DataTable(layerData.properties);
    }
    layers.push({
      name: name,
      data: data,
      shapes: layerData.shapes,
      geometry_type: layerData.geometry_type
    });
  });

  return {
    arcs: new ArcDataset(arcs),
    layers: layers
  };
};

// Converts arc coordinates from rounded, delta-encoded values to
// transposed arrays of geographic coordinates.
//
TopoJSON.importArcs = function(arcs, transform, round) {
  var mx = 1, my = 1, bx = 0, by = 0,
      useDelta = !!transform;
  if (transform) {
    mx = transform.scale[0];
    my = transform.scale[1];
    bx = transform.translate[0];
    by = transform.translate[1];
  }

  return Utils.map(arcs, function(arc) {
    var xx = [],
        yy = [],
        prevX = 0,
        prevY = 0,
        scaledX, scaledY, x, y;
    for (var i=0, len=arc.length; i<len; i++) {
      x = arc[i][0];
      y = arc[i][1];
      if (useDelta) {
        x += prevX;
        y += prevY;
      }
      scaledX = x * mx + bx;
      scaledY = y * my + by;
      if (round) {
        scaledX = round(scaledX);
        scaledY = round(scaledY);
      }
      xx.push(scaledX);
      yy.push(scaledY);
      prevX = x;
      prevY = y;
    }
    return [xx, yy];
  });
};

TopoJSON.importObject = function(obj, arcs) {
  if (obj.type != 'GeometryCollection') {
    obj = {
      type: "GeometryCollection",
      geometries: [obj]
    };
  }
  return TopoJSON.importGeometryCollection(obj, arcs);
};

TopoJSON.importGeometryCollection = function(obj, arcs) {
  var importer = new TopoJSON.Importer(arcs.length);
  Utils.forEach(obj.geometries, function(geom) {
    importer.startShape(geom.properties, geom.id);
    var pathImporter = TopoJSON.pathImporters[geom.type];
    if (pathImporter) {
      pathImporter(geom.arcs, importer);
    } else if (geom.type) {
      trace("TopoJSON.importGeometryCollection() Unsupported geometry type:", geom.type);
    } else {
      // null geometry -- ok
    }
  });
  return importer.done();
};

TopoJSON.Importer = function(numArcs) {
  var geometries = [],
      currGeometry,
      paths = [],
      shapeProperties = [],
      shapeIds = [],
      currIdx = -1;

  this.startShape = function(properties, id) {
    currIdx++;
    if (properties) {
      shapeProperties[currIdx] = properties;
    }
    if (id !== null && id !== undefined) {
      shapeIds[currIdx] = id;
    }
    currGeometry = geometries[currIdx] = [];
  };

  this.importPath = function(ids, isRing, isHole) {
    paths.push({
      isRing: !!isRing,
      isHole: !!isHole,
      shapeId: currIdx
    });
    currGeometry.push(ids);
  };

  this.done = function() {
    var data;
    var openCount = Utils.reduce(paths, function(count, path) {
      if (!path.isRing) count++;
      return count;
    }, 0);

    return {
      paths: paths,
      geometry_type: openCount > 0 ? 'polyline' : 'polygon',
      shapes: geometries,
      properties: shapeProperties.length > 0 ? shapeProperties : null,
      ids: shapeIds.length > 0 ? shapeIds : null
    };
  };
};

TopoJSON.pathImporters = {
  LineString: function(arr, importer) {
    importer.importPath(arr, false, false);
  },
  MultiLineString: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      TopoJSON.pathImporters.LineString(arr[i], importer);
    }
  },
  Polygon: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      importer.importPath(arr[i], true, i > 0);
    }
  },
  MultiPolygon: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      TopoJSON.pathImporters.Polygon(arr[i], importer);
    }
  }
};

// Export a TopoJSON string containing a single object containing a GeometryCollection
// TODO: Support ids from attribute data
// TODO: Support properties
//
MapShaper.exportTopoJSON = function(layers, arcData, opts) {

  // KLUDGE: make a copy of layer objects, so layer properties can be replaced
  // without side-effects outside this function
  layers = Utils.map(layers, function(lyr) {
    return Utils.extend({}, lyr);
  });

  var filteredArcs = arcData.getFilteredCopy();
  var transform = null;
  if (opts.topojson_resolution === 0) {
    // no transform
  } else if (opts.topojson_resolution > 0) {
    transform = TopoJSON.getExportTransform(filteredArcs, opts.topojson_resolution);
  } else if (opts.precision > 0) {
    transform = TopoJSON.getExportTransformFromPrecision(filteredArcs, opts.precision);
  } else {
    transform = TopoJSON.getExportTransform(filteredArcs); // auto quantization
  }

  var arcs, map;
  if (transform) {
    filteredArcs.applyTransform(transform, !!"round");
    map = TopoJSON.filterExportArcs(filteredArcs);
    arcs = TopoJSON.exportDeltaEncodedArcs(filteredArcs);
  } else {
    map = TopoJSON.filterExportArcs(filteredArcs);
    arcs = TopoJSON.exportArcs(filteredArcs);
  }
  var objects = {};
  var bounds = new Bounds();
  Utils.forEach(layers, function(lyr, i) {
    var geomType = lyr.geometry_type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(filteredArcs, lyr.geometry_type == 'polygon');
    if (map) lyr.shapes = TopoJSON.remapLayerArcs(lyr.shapes, map);
    var obj = exportTopoJSONObject(exporter, lyr, geomType);
    var name = lyr.name || "layer" + (i + 1);
    objects[name] = obj;
    bounds.mergeBounds(exporter.getBounds());
  });

  var obj = {
    type: "Topology",
    arcs: arcs,
    objects: objects
  };

  if (transform) {
    var inv = transform.invert();
    obj.transform = {
      scale: [inv.mx, inv.my],
      translate: [inv.bx, inv.by]
    };
    obj.bbox = bounds.transform(inv).toArray();
  } else {
    obj.bbox = bounds.toArray();
  }

  return [{
    content: JSON.stringify(obj),
    name: ""
  }];
};

TopoJSON.remapLayerArcs = function(shapes, map) {
  return Utils.map(shapes, function(shape) {
    return shape ? TopoJSON.remapShapeArcs(shape, map) : null;
  });
};

// Re-index the arcs in a shape to account for removal of collapsed arcs.
//
TopoJSON.remapShapeArcs = function(src, map) {
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

// Remove collapsed arcs from @arcDataset (ArcDataset) and re-index remaining
// arcs.
// Return an array mapping original arc ids to new ids (See ArcDataset#filter())
//
TopoJSON.filterExportArcs = function(arcData) {
  var arcMap = arcData.filter(function(iter, i) {
    var x, y;
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

// Export arcs with delta encoding, as per the topojson spec.
//
TopoJSON.exportDeltaEncodedArcs = function(arcData) {
  var arcs = [];
  arcData.forEach(function(iter, i) {
    var arc = [],
        x = 0,
        y = 0;
    while (iter.hasNext()) {
      arc.push([iter.x - x, iter.y - y]);
      x = iter.x;
      y = iter.y;
    }
    arcs.push(arc.length > 1 ? arc : null);
  });
  return arcs;
};

// Return a Transform object for converting geographic coordinates to quantized
// integer coordinates.
//
TopoJSON.getExportTransform = function(arcData, quanta) {
  var srcBounds = arcData.getBounds(),
      destBounds, xmax, ymax;
  if (quanta) {
    xmax = quanta - 1;
    ymax = quanta - 1;
  } else {
    var resXY = TopoJSON.calcExportResolution(arcData);
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
TopoJSON.calcExportResolution = function(arcData) {
  var xy = arcData.getAverageSegment(),
      k = 0.02;
  return [xy[0] * k, xy[1] * k];
};

function exportTopoJSONObject(exporter, lyr, type) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      ids = lyr.ids,
      obj = {
        type: "GeometryCollection"
      };
  obj.geometries = Utils.map(lyr.shapes, function(shape, i) {
    var paths = exporter.exportShapeForTopoJSON(shape),
        geom = exportTopoJSONGeometry(paths, type);
    geom.id = ids ? ids[i] : i;
    if (properties) {
      geom.properties = properties[i] || null;
    }
    return geom;
  });
  return obj;
}

function exportTopoJSONGeometry(paths, type) {
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
    error ("#exportTopoJSONGeometry() unsupported type:", type);
  }
  return obj;
}
