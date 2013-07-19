/* @requires mapshaper-common, mapshaper-geojson */

MapShaper.importTopoJSON = function(obj) {
  var mx = 1, my = 1, bx = 0, by = 0;
  if (obj.transform) {
    var scale = obj.transform.scale,
        translate = obj.transform.translate;
    mx = scale[0];
    my = scale[1];
    bx = translate[0];
    by = translate[1];
  }

  var arcs = Utils.map(obj.arcs, function(arc) {
    var xx = [], yy = [];
    for (var i=0, len=arc.length; i<len; i++) {
      var p = arc[i];
      xx.push(p[0] * mx + bx);
      yy.push(p[1] * my + by);
    }
    return [xx, yy];
  });

  // TODO: import objects
  return {arcs: arcs, objects: null};
};


// Export a TopoJSON string containing a single object containing a GeometryCollection
// TODO: Support ids from attribute data
// TODO: Support properties
//
MapShaper.exportTopoJSON = function(data) {
  T.start();
  if (!data.objects || !data.arcs || !data.bounds) error("#exportTopoJSON() Missing a required param.");
  var arcCoords = data.arcs.exportArcsForJSON();
  var objects = {};
  Utils.forEach(data.objects, function(src) {
    if (src.type != 'polygon' && src.type != 'polyline') error("#exportTopoJSON() Unsupported type:", src.type);
    var geomType = src.type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(data.arcs, src.type == 'polygon');
    var dest = exportTopoJSONObject(exporter, src.shapes, geomType),
        name = src.name;
    if (!dest || !name) error("#exportTopoJSON() Missing data, skipping an object");
    objects[name] = dest;
  });

  var srcBounds = data.bounds,
      resXY = findTopoJSONResolution(arcCoords),
      destBounds = new Bounds(0, 0, srcBounds.width() / resXY[0], srcBounds.height() / resXY[1]),
      tr = srcBounds.getTransform(destBounds),
      inv = tr.invert();

  Utils.forEach(arcCoords, function(arc) {
    var n = arc.length,
        p, x, y, prevX, prevY;
    for (var i=0, n=arc.length; i<n; i++) {
      if (i == 0) {
        prevX = 0,
        prevY = 0;
      } else {
        prevX = x;
        prevY = y;
      }
      p = arc[i];
      x = Math.round(p[0] * tr.mx + tr.bx);
      y = Math.round(p[1] * tr.my + tr.by);
      p[0] = x - prevX;
      p[1] = y - prevY;
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

  var json = JSON.stringify(obj);
  T.stop("Export TopoJSON");
  return json;
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


function exportTopoJSONObject(exporter, shapes, type) {
  var obj = {
    type: "GeometryCollection"
  };
  obj.geometries = Utils.map(shapes, function(shape, i) {
    var paths = exporter.exportShapeForTopoJSON(shape);
    return exportTopoJSONGeometry(paths, i, type);
  });
  return obj;
}


function exportTopoJSONGeometry(paths, id, type) {
  var obj = {
    id: id
  };

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
