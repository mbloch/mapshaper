import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { aggregateDataRecords } from '../dissolve/mapshaper-data-aggregation';
import { cloneShapes } from '../paths/mapshaper-shape-utils';
import { dissolvePointGeometry } from '../dissolve/mapshaper-point-dissolve';
import { dissolvePolylineGeometry } from '../dissolve/mapshaper-polyline-dissolve';
import { dissolvePolygonGeometry } from '../dissolve/mapshaper-polygon-dissolve';
import { getCategoryClassifier } from '../dissolve/mapshaper-data-aggregation';
import { applyCommandToLayerSelection } from '../dataset/mapshaper-command-utils';
import utils from '../utils/mapshaper-utils';
import { message, stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';

// Generate a dissolved layer
// @opts.fields (optional) names of data fields (dissolves all if falsy)
// @opts.sum-fields (Array) (optional)
// @opts.copy-fields (Array) (optional)
//
cmd.dissolve = function(lyr, arcs, opts) {
  var dissolveShapes, getGroupId;
  opts = utils.extend({}, opts);
  if (opts.where) {
    return applyCommandToLayerSelection(cmd.dissolve, lyr, arcs, opts);
  }
  if (opts.field) opts.fields = [opts.field]; // support old "field" parameter
  getGroupId = getCategoryClassifier(opts.fields, lyr.data);
  if (opts.multipart || opts.group_points) {
    dissolveShapes = makeMultipartShapes(lyr, getGroupId);
  } else if (lyr.geometry_type == 'polygon') {
    dissolveShapes = dissolvePolygonGeometry(lyr.shapes, getGroupId);
  } else if (lyr.geometry_type == 'polyline') {
    dissolveShapes = dissolvePolylineGeometry(lyr, getGroupId, arcs, opts);
  } else if (lyr.geometry_type == 'point') {
    dissolveShapes = dissolvePointGeometry(lyr, getGroupId, opts);
  }
  return composeDissolveLayer(lyr, dissolveShapes, getGroupId, opts);
};

function makeMultipartShapes(lyr, getGroupId) {
  if (!lyr.shapes || !lyr.geometry_type) {
    stop('Layer is missing geometry');
  }
  var shapes = cloneShapes(lyr.shapes);
  var shapes2 = [];
  lyr.shapes.forEach(function(shp, i) {
    var groupId = getGroupId(i);
    if (!shp) return;
    if (!shapes2[groupId]) {
      shapes2[groupId] = shp;
    } else {
      shapes2[groupId].push.apply(shapes2[groupId], shp);
    }
  });
  return shapes2;
}

// @lyr: original undissolved layer
// @shapes: dissolved shapes
export function composeDissolveLayer(lyr, shapes, getGroupId, opts) {
  var records = null;
  var lyr2;
  if (lyr.data) {
    records = aggregateDataRecords(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=records.length; i<n; i++) {
      if (shapes && !shapes[i]) {
        shapes[i] = null;
      }
    }
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    shapes: shapes,
    data: records ? new DataTable(records) : null,
    geometry_type: lyr.geometry_type
  };
  if (!opts.silent) {
    printDissolveMessage(lyr, lyr2);
  }
  return lyr2;
}

function printDissolveMessage(pre, post) {
  var n1 = getFeatureCount(pre),
      n2 = getFeatureCount(post),
      msg = utils.format('Dissolved %,d feature%s into %,d feature%s',
        n1, utils.pluralSuffix(n1), n2,
        utils.pluralSuffix(n2));
  message(msg);
}
