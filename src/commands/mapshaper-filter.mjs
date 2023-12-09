import { getBBoxIntersectionTest } from '../commands/mapshaper-filter-geom';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getOutputLayer, getFeatureCount, copyLayer } from '../dataset/mapshaper-layer-utils';
import { requireBooleanResult } from '../expressions/mapshaper-expression-utils';
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
    filter = compileFeatureExpression(opts.expression, lyr, arcs);
  }

  if (opts.ids) {
    filter = combineFilters(filter, getIdFilter(opts.ids));
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
    requireBooleanResult(result);
    if (invert) result = !result;
    if (result === true) {
      if (shapes) filteredShapes.push(shapes[shapeId] || null);
      if (records) filteredRecords.push(records[shapeId] || null);
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

// TODO: update filter command to use this function
export function filterLayerInPlace(lyr, filter, invert) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes || null,
      n = getFeatureCount(lyr),
      filteredShapes = shapes ? [] : null,
      filteredRecords = records ? [] : null;
  utils.repeat(n, function(shapeId) {
    var result = filter(shapeId);
    requireBooleanResult(result);
    if (invert) result = !result;
    if (result === true) {
      if (shapes) filteredShapes.push(shapes[shapeId] || null);
      if (records) filteredRecords.push(records[shapeId] || null);
    }
  });
  lyr.shapes = filteredShapes;
  lyr.data = filteredRecords ? new DataTable(filteredRecords) : null;
}

function getIdFilter(ids) {
  var set = new Set(ids);
  return function(i) {
    return set.has(i);
  };
}

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
