/* @requires mapshaper-common, mapshaper-geojson */

var TopoJSON = MapShaper.topojson = {};

MapShaper.importTopoJSON = function(obj) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var arcs = TopoJSON.importArcs(obj.arcs, obj.transform);
  var layers = Utils.mapObjectToArray(obj.objects, function(object, name) {
    var lyr = TopoJSON.importObject(object, arcs);
    lyr.name = name;
    return lyr;
  });
  return {
    arcs: arcs,
    layers: layers,
  };
};

// Converts arc coordinates from rounded, delta-encoded values to
// transposed arrays of geographic coordinates.
//
TopoJSON.importArcs = function(arcs, transform) {
  var mx = 1, my = 1, bx = 0, by = 0;
  if (transform) {
    mx = transform.scale[0];
    my = transform.scale[1];
    bx = transform.translate[0];
    by = transform.translate[1];
  }

  return Utils.map(arcs, function(arc) {
    var x, y;
    var xx = [],
        yy = [],
        prevX = 0,
        prevY = 0;
    for (var i=0, len=arc.length; i<len; i++) {
      x = prevX + arc[i][0];
      y = prevY + arc[i][1];
      xx.push(x * mx + bx);
      yy.push(y * my + by);
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
    var openCount = Utils.reduce(paths, function(path, count) {
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

  var exportArcs = arcData.getFilteredCopy();
  var transform = TopoJSON.getExportTransform(exportArcs, opts.topojson_resolution || null);

  exportArcs.applyTransform(transform, true);
  var map = TopoJSON.filterExportArcs(exportArcs);
  var deltaArcs = TopoJSON.getDeltaEncodedArcs(exportArcs);
  var objects = {};
  var bounds = new Bounds();
  Utils.forEach(layers, function(lyr, i) {
    var geomType = lyr.geometry_type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(exportArcs, lyr.geometry_type == 'polygon');
    if (map) TopoJSON.remapLayerArcs(lyr.shapes, map);
    var obj = exportTopoJSONObject(exporter, lyr, geomType);
    lyr.name = lyr.name || "layer" + (i + 1);
    objects[lyr.name] = obj;
    bounds.mergeBounds(exporter.getBounds());
  });

  var inv = transform.invert();
  var obj = {
    type: "Topology",
    transform: {
      scale: [inv.mx, inv.my],
      translate: [inv.bx, inv.by]
    },
    arcs: deltaArcs,
    objects: objects,
    bbox: bounds.transform(inv).toArray()
  };

  return [{
    content: JSON.stringify(obj),
    name: ""
  }];
};

TopoJSON.remapLayerArcs = function(shapes, map) {
  Utils.forEach(shapes, function(shape) {
    if (shape) TopoJSON.remapShapeArcs(shape, map);
  });
};

// Re-index the arcs in a shape to account for removal of collapsed arcs.
//
TopoJSON.remapShapeArcs = function(shape, map) {
  if (!shape || shape.length === 0) return;

  var dest = shape,
      src = shape.splice(0, shape.length),
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

// Export arcs from @arcData as arrays of [x, y] points.
// Exported arcs use delta encoding, as per the topojson spec.
//
TopoJSON.getDeltaEncodedArcs = function(arcData) {
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

// Find the x, y values that map to x / y integer unit in topojson output
// Calculated as 1/50 the size of average x and y offsets
// (a compromise between compression, precision and simplicity)
//
TopoJSON.calcExportResolution = function(arcData) {
  var dx = 0, dy = 0, n = 0;
  arcData.forEach(function(iter) {
    var prevX, prevY;
    if (iter.hasNext()) {
      prevX = iter.x;
      prevY = iter.y;
    }
    while (iter.hasNext()) {
      n++;
      dx += Math.abs(iter.x - prevX);
      dy += Math.abs(iter.y - prevY);
      prevX = iter.x;
      prevY = iter.y;
    }
  });
  var k = 0.02,
      xres = dx * k / n,
      yres = dy * k / n;
  return [xres, yres];
};

function exportTopoJSONObject(exporter, lyr, type) {
  var properties = lyr.properties,
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
