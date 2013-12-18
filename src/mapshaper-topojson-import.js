
var TopoJSON = {};

// Converts arc coordinates from rounded, delta-encoded values to
// transposed arrays of geographic coordinates.
//
TopoJSON.importArcs = function(arcs, transform, round) {
  TopoJSON.decodeArcs(arcs, transform, round);
  return Utils.map(arcs, function(arc) {
    var xx = [],
        yy = [];
    for (var i=0, len=arc.length; i<len; i++) {
      xx.push(arc[i][0]);
      yy.push(arc[i][1]);
    }
    return [xx, yy];
  });
};

TopoJSON.decodeArcs = function(arcs, transform, round) {
  var mx = 1, my = 1, bx = 0, by = 0,
      useDelta = !!transform;
  if (transform) {
    mx = transform.scale[0];
    my = transform.scale[1];
    bx = transform.translate[0];
    by = transform.translate[1];
  }

  Utils.forEach(arcs, function(arc) {
    var prevX = 0,
        prevY = 0,
        scaledX, scaledY, xy, x, y;
    for (var i=0, len=arc.length; i<len; i++) {
      xy = arc[i];
      x = xy[0];
      y = xy[1];
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
      xy[0] = scaledX;
      xy[1] = scaledY;
      prevX = x;
      prevY = y;
    }
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
