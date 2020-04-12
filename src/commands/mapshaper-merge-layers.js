import { getColumnType } from '../datatable/mapshaper-data-utils';
import { fixInconsistentFields } from '../datatable/mapshaper-data-utils';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { message, stop, error } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

// Merge layers, checking for incompatible geometries and data fields.
cmd.mergeLayers = function(layersArg, opts) {
  var layers = layersArg.filter(getFeatureCount); // ignore empty layers
  var merged = {};
  opts = opts || {};
  if (!layers.length) return null;
  if (layers.length == 1) {
    message('Use the target= option to specify multiple layers for merging');
    return layers.concat();
  }
  merged.data = mergeDataFromLayers(layers, opts.force);
  merged.name = mergeLayerNames(layers);
  merged.geometry_type = getMergedLayersGeometryType(layers);
  if (merged.geometry_type) {
    merged.shapes = mergeShapesFromLayers(layers);
  }
  if (merged.shapes && merged.data && merged.shapes.length != merged.data.size()) {
    error("Mismatch between geometry and attribute data");
  }
  return [merged];
};

function getMergedLayersGeometryType(layers) {
  var geoTypes = utils.uniq(utils.pluck(layers, 'geometry_type'))
    .filter(function(type) {return !!type;}); // ignore null-type layers
  if (geoTypes.length > 1) {
    stop("Incompatible geometry types:", geoTypes.join(', '));
  }
  return geoTypes[0] || null;
}

function mergeShapesFromLayers(layers) {
  return layers.reduce(function(memo, lyr) {
    return memo.concat(lyr.shapes);
  }, []);
}

function mergeDataFromLayers(layers, force) {
  var allFields = utils.uniq(layers.reduce(function(memo, lyr) {
    return memo.concat(lyr.data ? lyr.data.getFields() : []);
  }, []));
  if (allFields.length === 0) return null; // no data in any fields
  var missingFields = checkMergeLayersInconsistentFields(allFields, layers, force);
  var mergedRecords = layers.reduce(function(memo, lyr) {
    var records = lyr.data ? lyr.data.getRecords() : new DataTable(getFeatureCount(lyr)).getRecords();
    return memo.concat(records);
  }, []);
  if (missingFields.length > 0) {
    fixInconsistentFields(mergedRecords);
  }
  return new DataTable(mergedRecords);
}

function checkMergeLayersInconsistentFields(allFields, layers, force) {
  var msg;
  // handle fields that are missing from one or more layers
  // (warn if force-merging, else error)
  var missingFields = utils.uniq(layers.reduce(function(memo, lyr) {
    return memo.concat(utils.difference(allFields, lyr.data ? lyr.data.getFields() : []));
  }, []));
  if (missingFields.length > 0) {
    msg = '[' + missingFields.join(', ') + ']';
    msg = (missingFields.length == 1 ? 'Field ' + msg + ' is missing' : 'Fields ' + msg + ' are missing') + ' from one or more layers';
    if (force) {
      message('Warning: ' + msg);
    } else {
      stop(msg);
    }
  }
  // check for fields with incompatible data types (e.g. number, string)
  checkMergeLayersFieldTypes(allFields, layers);
  return missingFields;
}

function checkMergeLayersFieldTypes(fields, layers) {
  fields.forEach(function(key) {
    var types = checkFieldTypes(key, layers);
    if (types.length > 1) {
      stop("Inconsistent data types in \"" + key + "\" field:", types.join(', '));
    }
  });
}

function checkFieldTypes(key, layers) {
  // ignores empty-type fields
  return layers.reduce(function(memo, lyr) {
    var type = lyr.data ? getColumnType(key, lyr.data.getRecords()) : null;
    if (type && memo.indexOf(type) == -1) {
      memo.push(type);
    }
    return memo;
  }, []);
}

export function mergeLayerNames(layers) {
  return layers.reduce(function(memo, lyr) {
    if (memo === null) {
      memo = lyr.name || null;
    } else if (memo && lyr.name) {
      memo = utils.mergeNames(memo, lyr.name);
    }
    return memo;
  }, null) || '';
}
