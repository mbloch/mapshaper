/* @requires mapshaper-common, mapshaper-geojson */

MapShaper.importTopoJSON = function(obj) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var arcs = TopoJSON.importArcs(obj.arcs, obj.transform);

  var layers = Utils.mapObjectToArray(obj.objects, function(object, name) {
    var lyr = TopoJSON.importObject(object, arcs)
    lyr.name = name;
    return lyr;
  });
  return {
    arcs: arcs,
    layers: layers,
  };
};

var TopoJSON = MapShaper.topojson = {};

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
    return [xx, yy]
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
    if (!pathImporter) {
      trace("TopoJSON.importGeometryCollection() Couldn't import geometry:", geom);
    } else {
      pathImporter(geom.arcs, importer);
    }
  })
  return importer.done();
};

TopoJSON.Importer = function(numArcs) {
  var geometries = [],
      currGeometry,
      paths = [],
      shapeProperties = [],
      shapeIds = [],
      currIdx = -1

  this.startShape = function(properties, id) {
    currIdx++;
    if (properties != null) {
      shapeProperties[currIdx] = properties;
    }
    if (id != null) {
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
      if (path.isRing == false) count++;
      return count;
    }, 0);

    return {
      paths: paths,
      geometry_type: openCount > 0 ? 'polyline' : 'polygon',
      shapes: geometries,
      properties: shapeProperties.length > 0 ? shapeProperties : null,
      ids: shapeIds.length > 0 ? shapeIds : null
    }
  };
};

TopoJSON.pathImporters = {
  LineString: function(arr, importer) {
    importer.importPath(arr, false, false)
  },
  MultiLineString: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      TopoJSON.pathImporters.LineString(arr[i], importer)
    }
  },
  Polygon: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      importer.importPath(arr[i], true, i > 0);
    }
  },
  MultiPolygon: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      TopoJSON.pathImporters.Polygon(arr[i], importer)
    }
  }
};


// Export a TopoJSON string containing a single object containing a GeometryCollection
// TODO: Support ids from attribute data
// TODO: Support properties
//
MapShaper.exportTopoJSON = function(layers, arcData) {

  var arcCoords = Utils.map(arcData.getArcs(), function(arc) {
    return arc.toArray();
  });

  var objects = {};
  Utils.forEach(layers, function(lyr) {
    var geomType = lyr.geometry_type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(arcData, lyr.geometry_type == 'polygon');
    var obj = exportTopoJSONObject(exporter, lyr, geomType);
    if (!obj) error("#exportTopoJSON() Missing data, skipping an object");
    objects[lyr.name] = obj;
  });

  var srcBounds = arcData.getBounds(),
      resXY = findTopoJSONResolution(arcCoords),
      destBounds = new Bounds(0, 0, srcBounds.width() / resXY[0], srcBounds.height() / resXY[1]),
      tr = srcBounds.getTransform(destBounds),
      inv = tr.invert();

  Utils.forEach(arcCoords, function(arc) {
    var n = arc.length,
        prevX = 0,
        prevY = 0,
        p, x, y;
    for (var i=0, n=arc.length; i<n; i++) {
      p = arc[i];
      x = Math.round(p[0] * tr.mx + tr.bx);
      y = Math.round(p[1] * tr.my + tr.by);
      p[0] = x - prevX;
      p[1] = y - prevY;
      prevX = x;
      prevY = y;
    }
  })

  var obj = {
    type: "Topology",
    transform: {
      scale: [inv.mx, inv.my],
      translate: [inv.bx, inv.by]
    },
    arcs: arcCoords,
    objects: objects
  };

  return [{
    content: JSON.stringify(obj),
    name: ""
  }]
};

// Find the x, y values that map to x / y integer unit in topojson output
// Calculated as 1/50 the size of average x and y offsets
// (a compromise between compression, precision and simplicity)
//
function findTopoJSONResolution(arcs) {
  var dx = 0, dy = 0, n = 0;
  Utils.forEach(arcs, function(arc) {
    var a, b;
    for (var i=1, len = arc.length; i<len; i++, n++) {
      a = arc[i-1];
      b = arc[i];
      dx += Math.abs(b[0] - a[0]);
      dy += Math.abs(b[1] - a[1]);
    }
  });
  var k = 0.02,
      xres = dx * k / n,
      yres = dy * k / n;
  return [xres, yres];
}


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

  if (!paths || paths.length == 0) {
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
    error ("#exportTopoJSONGeometry() unsupported type:", type)
  }
  return obj;
}
