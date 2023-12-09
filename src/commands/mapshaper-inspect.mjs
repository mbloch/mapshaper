import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { requireBooleanResult } from '../expressions/mapshaper-expression-utils';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { getAttributeTableInfo, formatAttributeTableInfo } from '../commands/mapshaper-info';
import geom from '../geom/mapshaper-geom';
import { stop, message } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

cmd.inspect = function(lyr, arcs, opts) {
  var ids = selectFeatures(lyr, arcs, opts);
  var msg;
  if (ids.length == 1) {
    msg = getFeatureInfo(ids[0], lyr, arcs);
  } else {
    msg = utils.format("Expression matched %d feature%s. Select one feature for details", ids.length, utils.pluralSuffix(ids.length));
  }
  message(msg);
};

function getFeatureInfo(id, lyr, arcs) {
    var msg = "Feature " + id + '\n';
    msg += getShapeInfo(id, lyr, arcs);
    msg += formatAttributeTableInfo(getAttributeTableInfo(lyr, id));
    return msg;
}

function getShapeInfo(id, lyr, arcs) {
  var shp = lyr.shapes ? lyr.shapes[id] : null;
  var type = lyr.geometry_type;
  var info, msg;
  if (!shp || !type) {
    return 'Geometry: [null]\n';
  }
  msg = 'Geometry\n  Type: ' + type + '\n';
  if (type == 'point') {
    msg += '  Points: ' + shp.length + '\n';
  } else if (type == 'polyline') {
    msg += '  Parts: ' + shp.length + '\n';
  } else if (type == 'polygon') {
    info = getPolygonInfo(shp, arcs);
    msg += utils.format('  Rings: %d cw, %d ccw\n', info.cw, info.ccw);
    msg += '  Planar area: ' + info.area + '\n';
    if (info.sph_area) {
      msg += '  Spherical area: ' + info.sph_area + ' sq. meters\n';
    }
  }
  return msg;
}

function getPolygonInfo(shp, arcs) {
  var o = {rings: shp.length, cw: 0, ccw: 0, area: 0};
  var area;
  for (var i=0; i<shp.length; i++) {
    area = geom.getPlanarPathArea(shp[i], arcs);
    if (area > 0) {
      o.cw++;
    } else if (area < 0) {
      o.ccw++;
    }
    o.area += area;
  }
  if (!arcs.isPlanar()) {
    o.sph_area = geom.getSphericalShapeArea(shp, arcs);
  }
  return o;
}

function selectFeatures(lyr, arcs, opts) {
  var n = getFeatureCount(lyr),
      ids = [],
      filter;
  if (!opts.expression) {
    stop("Missing a JS expression for selecting a feature");
  }
  filter = compileFeatureExpression(opts.expression, lyr, arcs);
  utils.repeat(n, function(id) {
    var result = filter(id);
    requireBooleanResult(result, 'Expression must return true or false');
    if (result === true) {
      ids.push(id);
    }
  });
  return ids;
}
