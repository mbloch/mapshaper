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


// Export a TopoJSON string containing a single object, "polygons", containing a GeometryCollection
//   of Polygon and MultiPolygon shapes
// TODO: Adjust quantization to suit the amount of detail in the vector lines
// TODO: Support ids from attribute data
// TODO: Handle holes correctly
//
MapShaper.exportTopoJSON = function(data) {
  if (!data.objects || !data.arcs || !data.bounds) error("Missing 'shapes' and/or 'arcs' properties.");
  var arcs = data.arcs;
  var objects = {};
  Utils.forEach(data.objects, function(src) {
    var dest = exportTopoJSONObject(src.shapes, src.type),
        name = src.name;
    if (!dest || !name) error("#exportTopoJSON() Missing data, skipping an object");
    objects[name] = dest;
  });

  var srcBounds = data.bounds,
      destBounds = new Bounds([0, 0, 100000, 100000]),
      tr = srcBounds.getTransform(destBounds),
      inv = tr.invert();

  Utils.forEach(arcs, function(arc) {
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
    arcs: arcs,
    objects: objects
  };

  return JSON.stringify(obj);
};

function exportTopoJSONObject(shapes, type) {
  var obj = {
    type: "GeometryCollection"
  };
  if (type == 'MultiPolygon') {
    obj.geometries = Utils.map(shapes, function(ringGroups, i) {
      return exportTopoJSONPolygon(ringGroups, i);
    });
  } else {
    error("#convertTopoJSONObject() Don't know what to do with type:", type);
  }
  return obj;
}

function exportTopoJSONPolygon(ringGroups, id) {
  var obj = {
    id: id
  }
  if (ringGroups.length == 0) {
    obj.type = "Polygon";
    obj.arcs = [];
  }
  else if (ringGroups.length == 1) {
    obj.type = "Polygon";
    obj.arcs = exportArcsForTopoJSON(ringGroups[0]);
  } else  {
    obj.type = "MultiPolygon";
    obj.arcs = Utils.map(ringGroups, exportArcsForTopoJSON);
  }
  return obj;
}

function exportArcsForTopoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.ids;
  });
}

