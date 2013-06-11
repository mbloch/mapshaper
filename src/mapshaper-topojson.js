/* @requires mapshaper-common */

//
//
//
MapShaper.exportTopoJSON = function(data) {
  if (!data.shapes || !data.arcs || !data.bounds) error("Missing 'shapes' and/or 'arcs' properties.");
  var arcs = Utils.map(data.arcs, MapShaper.transposeXYCoords),
      shapes = data.shapes;

  var srcBounds = data.bounds,
      destBounds = new Bounds([0, 0, 100000, 100000]),
      // TODO: adjust output bounds to suit amount of detail in output vectors
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
        type: "Polygon",
        arcs: data.shapes
      }
    }
  };

  return JSON.stringify(obj);
};


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

  return {arcs: arcs, objects: null};
};

