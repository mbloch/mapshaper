import { getBBoxIntersectionTest } from '../commands/mapshaper-filter-geom';
import { compileValueExpression } from '../expressions/mapshaper-expressions';
import { getOutputLayer, getFeatureCount, copyLayer } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { stop, message } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import geom from '../geom/mapshaper-geom';

cmd.filterFeatures = function(lyr, arcs, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes || null,
      n = getFeatureCount(lyr),
      filteredShapes = shapes ? [] : null,
      filteredRecords = records ? [] : null,
      filteredLyr = getOutputLayer(lyr, opts),
      invert = !!opts.invert,
      filter;

  if (opts.expression) {
    filter = compileValueExpression(opts.expression, lyr, arcs);
  }

  if (opts.remove_empty) {
    filter = combineFilters(filter, getNullGeometryFilter(lyr, arcs));
  }

  if (opts.bbox) {
    filter = combineFilters(filter, getBBoxIntersectionTest(opts.bbox, lyr, arcs));
  }

  if (!filter) {
    stop("Missing a filter criterion");
  }

  utils.repeat(n, function(shapeId) {
    var result = filter(shapeId);
    if (invert) result = !result;
    if (result === true) {
      if (shapes) filteredShapes.push(shapes[shapeId] || null);
      if (records) filteredRecords.push(records[shapeId] || null);
    } else if (result !== false) {
      stop("Expression must return true or false");
    }
  });

  filteredLyr.shapes = filteredShapes;
  filteredLyr.data = filteredRecords ? new DataTable(filteredRecords) : null;
  if (opts.no_replace) {
    // if adding a layer, don't share objects between source and filtered layer
    filteredLyr = copyLayer(filteredLyr);
  }

  if (opts.verbose !== false) {
    message(utils.format('Retained %,d of %,d features', getFeatureCount(filteredLyr), n));
  }

  return filteredLyr;
};

function getNullGeometryFilter(lyr, arcs) {
  var shapes = lyr.shapes;
  if (lyr.geometry_type == 'polygon') {
    return getEmptyPolygonFilter(shapes, arcs);
  }
  return function(i) {return !!shapes[i];};
}

function getEmptyPolygonFilter(shapes, arcs) {
  return function(i) {
    var shp = shapes[i];
    return !!shp && geom.getPlanarShapeArea(shapes[i], arcs) > 0;
  };
}

function combineFilters(a, b) {
  return (a && b && function(id) {
      return a(id) && b(id);
    }) || a || b;
}
