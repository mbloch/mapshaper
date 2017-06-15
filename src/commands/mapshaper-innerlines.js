/* @requires mapshaper-shape-utils */

api.convertPolygonsToInnerLines = function(lyr, arcs, opts) {
  if (lyr.geometry_type != 'polygon') {
    stop("Command requires a polygon layer");
  }
  var arcs2 = internal.convertShapesToArcs(lyr.shapes, arcs.size(), 'inner'),
      lyr2 = internal.convertArcsToLineLayer(arcs2, null);
  if (lyr2.shapes.length === 0) {
    message("No shared boundaries were found");
  }
  lyr2.name = opts && opts.no_replace ? null : lyr.name;
  return lyr2;
};

api.convertPolygonsToTypedLines = function(lyr, arcs, fields, opts) {
  if (lyr.geometry_type != 'polygon') {
    stop("Command requires a polygon layer");
  }
  var arcCount = arcs.size(),
      outerArcs = internal.convertShapesToArcs(lyr.shapes, arcCount, 'outer'),
      typeCode = 0,
      allArcs = [],
      allData = [],
      innerArcs, lyr2;

  function addArcs(typeArcs) {
    var typeData = utils.repeat(typeArcs.length, function(i) {
          return {TYPE: typeCode};
        }) || [];
    allArcs = utils.merge(typeArcs, allArcs);
    allData = utils.merge(typeData, allData);
    typeCode++;
  }

  addArcs(outerArcs);

  if (utils.isArray(fields)) {
    if (!lyr.data) {
      stop("Missing a data table:");
    }
    fields.forEach(function(field) {
      if (!lyr.data.fieldExists(field)) {
        stop("Unknown data field:", field);
      }
      var dissolved = api.dissolve(lyr, arcs, {field: field, silent: true}),
          dissolvedArcs = internal.convertShapesToArcs(dissolved.shapes, arcCount, 'inner');
      dissolvedArcs = utils.difference(dissolvedArcs, allArcs);
      addArcs(dissolvedArcs);
    });
  }

  innerArcs = internal.convertShapesToArcs(lyr.shapes, arcCount, 'inner');
  innerArcs = utils.difference(innerArcs, allArcs);
  addArcs(innerArcs);
  lyr2 = internal.convertArcsToLineLayer(allArcs, allData);
  lyr2.name = opts && opts.no_replace ? null : lyr.name;
  return lyr2;
};


internal.convertArcsToLineLayer = function(arcs, data) {
  var shapes = internal.convertArcsToShapes(arcs),
      lyr = {
        geometry_type: 'polyline',
        shapes: shapes
      };
  if (data) {
    lyr.data = new DataTable(data);
  }
  return lyr;
};

internal.convertArcsToShapes = function(arcs) {
  return arcs.map(function(id) {
    return [[id]];
  });
};

internal.convertShapesToArcs = function(shapes, arcCount, type) {
  type = type || 'all';
  var counts = new Uint8Array(arcCount),
      arcs = [],
      count;

  internal.countArcsInShapes(shapes, counts);

  for (var i=0, n=counts.length; i<n; i++) {
    count = counts[i];
    if (count > 0) {
      if (type == 'all' || type == 'outer' && count == 1 ||
          type == 'inner' && count > 1) {
        arcs.push(i);
      }
    }
  }
  return arcs;
};
