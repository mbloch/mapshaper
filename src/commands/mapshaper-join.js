import { getColumnType } from '../datatable/mapshaper-data-utils';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { joinPolygonsToPolygons } from '../join/mapshaper-polygon-polygon-join';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { joinTables, validateFieldNames } from '../join/mapshaper-join-tables';
import { joinPointsToPolygons, joinPolygonsToPoints, joinPointsToPoints } from '../join/mapshaper-point-polygon-join';

cmd.join = function(targetLyr, dataset, src, opts) {
  var srcType, targetType, retn;
  if (!src || !src.layer.data || !src.dataset) {
    stop("Missing a joinable data source");
  }
  if (opts.keys) {
    // join using data in attribute fields
    if (opts.keys.length != 2) {
      stop("Expected two key fields: a target field and a source field");
    }
    retn = joinAttributesToFeatures(targetLyr, src.layer.data, opts);
  } else {
    // spatial join
    srcType = src.layer.geometry_type;
    targetType = targetLyr.geometry_type;
    if (srcType == 'point' && targetType == 'polygon') {
      retn = joinPointsToPolygons(targetLyr, dataset.arcs, src.layer, opts);
    } else if (srcType == 'polygon' && targetType == 'point') {
      retn = joinPolygonsToPoints(targetLyr, src.layer, src.dataset.arcs, opts);
    } else if (srcType == 'point' && targetType == 'point') {
      retn = joinPointsToPoints(targetLyr, src.layer, opts);
    } else if (srcType == 'polygon' && targetType == 'polygon') {
      retn = joinPolygonsToPolygons(targetLyr, dataset, src, opts);
    } else {
      stop(utils.format("Unable to join %s geometry to %s geometry",
          srcType || 'null', targetType || 'null'));
    }
  }

  if (retn.unmatched) {
    dataset.layers.push(retn.unmatched);
  }
  if (retn.unjoined) {
    dataset.layers.push(retn.unjoined);
  }
};

export function joinAttributesToFeatures(lyr, srcTable, opts) {
  var keys = opts.keys,
      destKey = keys[0],
      srcKey = keys[1],
      destTable = lyr.data,
      joinFunction = getJoinByKey(destTable, destKey, srcTable, srcKey);
  validateFieldNames(keys);
  return joinTables(destTable, srcTable, joinFunction, opts);
}

// Return a function for translating a target id to an array of source ids based on values
// of two key fields.
function getJoinByKey(dest, destKey, src, srcKey) {
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
