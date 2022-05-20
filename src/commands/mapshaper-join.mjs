import { getColumnType } from '../datatable/mapshaper-data-utils';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { joinPolygonsToPolygons } from '../join/mapshaper-polygon-polygon-join';
import { joinPolylinesToPolygons, joinPolygonsToPolylines } from '../join/mapshaper-polyline-polygon-join';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { joinTableToLayer, validateFieldNames } from '../join/mapshaper-join-tables';
import { joinPointsToPolygons, joinPolygonsToPoints } from '../join/mapshaper-point-polygon-join';
import { joinPointsToPoints } from '../join/mapshaper-point-point-join';
import { requireDatasetsHaveCompatibleCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { initDataTable } from '../dataset/mapshaper-layer-utils';

cmd.join = function(targetLyr, targetDataset, src, opts) {
  var srcType, targetType, retn;
  if (!src || !src.dataset) {
    stop("Missing a joinable data source");
  }
  if (opts.keys) {
    // join using data in attribute fields
    if (opts.keys.length != 2) {
      stop("Expected two key fields: a target field and a source field");
    }
    if (!src.layer.data) {
      stop("Source layer is missing attribute data");
    }
    retn = joinAttributesToFeatures(targetLyr, src.layer.data, opts);
  } else {
    // spatial join
    if (!src.layer.data) {
      // KLUDGE -- users might want to join a layer without attributes
      // to test for intersection... the simplest way to support this is
      // to add an empty data table to the source layer
      initDataTable(src.layer);
    }
    requireDatasetsHaveCompatibleCRS([targetDataset, src.dataset]);
    srcType = src.layer.geometry_type;
    targetType = targetLyr.geometry_type;
    if (srcType == 'point' && targetType == 'polygon') {
      retn = joinPointsToPolygons(targetLyr, targetDataset.arcs, src.layer, opts);
    } else if (srcType == 'polygon' && targetType == 'point') {
      retn = joinPolygonsToPoints(targetLyr, src.layer, src.dataset.arcs, opts);
    } else if (srcType == 'point' && targetType == 'point') {
      retn = joinPointsToPoints(targetLyr, src.layer, getDatasetCRS(targetDataset), opts);
    } else if (srcType == 'polygon' && targetType == 'polygon') {
      retn = joinPolygonsToPolygons(targetLyr, targetDataset, src, opts);
    } else if (srcType == 'polyline' && targetType == 'polygon') {
      retn = joinPolylinesToPolygons(targetLyr, targetDataset, src, opts);
    } else if (srcType == 'polygon' && targetType == 'polyline') {
      retn = joinPolygonsToPolylines(targetLyr, targetDataset, src, opts);
    } else {
      stop(utils.format("Unable to join %s geometry to %s geometry",
          srcType || 'null', targetType || 'null'));
    }
  }

  if (retn.unmatched) {
    targetDataset.layers.push(retn.unmatched);
  }
  if (retn.unjoined) {
    targetDataset.layers.push(retn.unjoined);
  }
};

export function joinAttributesToFeatures(destLyr, srcTable, opts) {
  var keys = opts.keys,
      destKey = keys[0],
      srcKey = keys[1],
      destTable = destLyr.data,
      joinFunction = getJoinByKey(destTable, destKey, srcTable, srcKey);
  validateFieldNames(keys);
  return joinTableToLayer(destLyr, srcTable, joinFunction, opts);
}

// Return a function for translating a target id to an array of source ids based on values
// of two key fields.
function getJoinByKey(dest, destKey, src, srcKey) {
  if (!dest) {
    stop('Target layer is missing an attribute table');
  }
  if (!src) {
    stop('Source layer is missing an attribute table');
  }
  var destRecords = dest.getRecords();
  var srcRecords = src.getRecords();
  var index = createTableIndex(srcRecords, srcKey);
  var srcType, destType;
  if (srcRecords.length == 0) {
    // allow empty external tables
    return function(i) {return [];};
  }
  requireDataField(src, srcKey, 'External table is missing a field named:');
  requireDataField(dest, destKey, 'Target layer is missing key field:');
  srcType = getColumnType(srcKey, src.getRecords());
  destType = getColumnType(destKey, destRecords);
  validateJoinFieldType(srcKey, srcType);
  validateJoinFieldType(destKey, destType);
  if (srcType != destType) {
    stop("Join keys have mismatched data types:", destType, "and", srcType);
  }
  return function(i) {
    var destRec = destRecords[i],
        val = destRec ? destRec[destKey] : null,
        retn = null;
    if (destRec && val in index) {
      retn = index[val];
      if (!Array.isArray(retn)) retn = [retn];
    }
    return retn;
  };
}

function validateJoinFieldType(field, type) {
  if (!type || type == 'object') {
    stop('[' + field + '] field has an unsupported data type. Expected string or number.');
  }
}

function createTableIndex(records, f) {
  var index = {}, rec, key;
  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    key = rec[f];
    if (key in index === false) {
      index[key] = i;
    } else if (Array.isArray(index[key])) {
      index[key].push(i);
    } else {
      index[key] = [index[key], i];
    }
  }
  return index;
}
