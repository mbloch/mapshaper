/* @requires mapshaper-common */



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
  if (!data.shapes || !data.arcs || !data.bounds) error("Missing 'shapes' and/or 'arcs' properties.");
  var arcs = Utils.map(data.arcs, MapShaper.transposeXYCoords),
      shapes = data.shapes;

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
    objects: {
      polygons: {
        type: "GeometryCollection",
        geometries: getTopoJsonPolygonGeometries(shapes)
      }
    }
  };

  return JSON.stringify(obj);
};


//
//
function getTopoJsonPolygonGeometries(shapes, ids) {
  return Utils.map(shapes, function(shape, i) {
    var id = ids ? ids[i] : i;
    return getTopoJsonPolygonGeometry(shape, id);
  });
}

//
// TODO: handle holes (currently treats holes like separate rings)
//
function getTopoJsonPolygonGeometry(shape, id) {
  var obj = {};
  if (id != null) {
    obj.id = id;
  }
  if (shape.length > 1) {
    obj.type = "MultiPolygon";
    obj.arcs = getTopoJsonMultiPolygonArcs(shape);
  } else if (shape.length == 1) {
    obj.type = "Polygon";
    obj.arcs = shape;
  } else {
    obj.type = "Polygon";
    obj.arcs = []; // Is this how to represent a null polygon?
  }
  return obj;
}

// TODO: Recognize holes
// Option: Use ring direction to identify holes (shapefile import does this)
//   ... then, find containing ring ...
//
function getTopoJsonMultiPolygonArcs(shape) {
  return Utils.map(shape, function(part) {
    return [part];
  });
}