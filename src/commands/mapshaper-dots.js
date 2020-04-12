
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import geom from '../geom/mapshaper-geom';

cmd.dots = function(lyr, arcs, opts) {
  requirePolygonLayer(lyr);
  requireDataField(lyr, opts.field);
  var records = lyr.data ? lyr.data.getRecords() : [];
  var shapes = [];
  lyr.shapes.forEach(function(shp, i) {
    var d = records[i];
    var n = d ? +d[opts.field] : 0;
    var coords = null;
    if (n > 0) {
      coords = createInnerPoints(shp, arcs, n);
    }
    shapes.push(coords);
  });
  return {
    type: 'point',
    shapes: shapes
  };
};

function createInnerPoints(shp, arcs, n) {
  if (!shp || shp.length != 1) {
    return null; // TODO: support polygons with holes and multipart polygons
  }
  return fillPolygonWithDots(shp, arcs, n);
}


function fillPolygonWithDots(shp, arcs, n) {
  var area = geom.getPlanarShapeArea(shp, arcs);
  var bounds = arcs.getMultiShapeBounds(shp);
}
