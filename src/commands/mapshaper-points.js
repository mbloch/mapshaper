/* @requires
mapshaper-data-table
mapshaper-dataset-utils
mapshaper-polygon-centroid
*/

api.createPointLayer = function(srcLyr, arcs, opts) {
  var destLyr = internal.getOutputLayer(srcLyr, opts);
  if (opts.vertices) {
    destLyr.shapes = internal.pointsFromVertices(srcLyr, arcs, opts);
  } else if (opts.x || opts.y) {
    destLyr.shapes = internal.pointsFromDataTable(srcLyr.data, opts);
  } else {
    destLyr.shapes = internal.pointsFromPolygons(srcLyr, arcs, opts);
  }
  destLyr.geometry_type = 'point';

  var nulls = destLyr.shapes.reduce(function(sum, shp) {
    if (!shp) sum++;
    return sum;
  }, 0);

  if (nulls > 0) {
    message(utils.format('[points] %,d of %,d points are null', nulls, destLyr.shapes.length));
  }
  if (srcLyr.data) {
    destLyr.data = opts.no_replace ? srcLyr.data.clone() : srcLyr.data;
  }
  return destLyr;
};

internal.pointsFromVertices = function(lyr, arcs, opts) {
  var coords, index;
  if (lyr.geometry_type != "polygon" && lyr.geometry_type != 'polyline') {
    stop("[points] Expected a polygon or polyline layer");
  }
  return lyr.shapes.map(function(shp, shpId) {
    coords = [];
    index = {}; // TODO: use more efficient index
    (shp || []).forEach(nextPart);
    return coords.length > 0 ? coords : null;
  });

  function nextPart(ids) {
    var iter = arcs.getShapeIter(ids);
    var key;
    while (iter.hasNext()) {
      key = iter.x + '~' + iter.y;
      if (key in index === false) {
        index[key] = true;
        coords.push([iter.x, iter.y]);
      }
    }
  }
};

internal.pointsFromPolygons = function(lyr, arcs, opts) {
  if (lyr.geometry_type != "polygon") {
    stop("[points] Expected a polygon layer");
  }
  var func = opts.inner ? geom.findInteriorPoint : geom.getShapeCentroid;
  return lyr.shapes.map(function(shp) {
    var p = func(shp, arcs);
    return p ? [[p.x, p.y]] : null;
  });
};

internal.pointsFromDataTable = function(data, opts) {
  if (!data) stop("[points] Layer is missing a data table");
  if (!opts.x || !opts.y || !data.fieldExists(opts.x) || !data.fieldExists(opts.y)) {
    stop("[points] Missing x,y data fields");
  }

  return data.getRecords().map(function(rec) {
    var x = rec[opts.x],
        y = rec[opts.y];
    if (!utils.isFiniteNumber(x) || !utils.isFiniteNumber(y)) {
      return null;
    }
    return [[x, y]];
  });

};
