import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import utils from '../utils/mapshaper-utils';

cmd.union = function(targetLayers, targetDataset, opts) {
  if (targetLayers.length < 2) {
    stop('Command requires at least two target layers');
  }
  targetLayers.forEach(requirePolygonLayer);

  // Need to add cuts before creating merged layer (arc ids may change)
  var nodes = addIntersectionCuts(targetDataset, opts);
  var allFields = [];
  var allShapes = [];
  var layerData = [];
  targetLayers.forEach(function(lyr, i) {
    var fields = lyr.data ? lyr.data.getFields() : [];
    if (opts.fields) {
      fields = opts.fields.indexOf('*') > 1 ? fields :
        fields.filter(function(name) {return opts.fields.indexOf(name) > -1;});
    }
    layerData.push({
      layer: lyr,
      fields: fields,
      records: lyr.data ? lyr.data.getRecords() : null,
      offset: allShapes.length,
      size: lyr.shapes.length
    });
    allFields = allFields.concat(fields);
    allShapes = allShapes.concat(lyr.shapes);
  });
  var unionFields = utils.uniqifyNames(allFields, function(name, n) {
    return name + '_' + n;
  });
  var mergedLyr = {
    geometry_type: 'polygon',
    shapes: allShapes
  };
  var mosaicIndex = new MosaicIndex(mergedLyr, nodes, {flat: false});
  var mosaicShapes = mosaicIndex.mosaic;
  var mosaicRecords = mosaicShapes.map(function(shp, i) {
    var mergedIds = mosaicIndex.getSourceIdsByTileId(i);
    var values = [];
    var lyrInfo, srcId, rec;
    for (var lyrId=0, n=layerData.length; lyrId < n; lyrId++) {
      lyrInfo = layerData[lyrId];
      srcId = unionFindOriginId(mergedIds, lyrInfo.offset, lyrInfo.size);
      rec = srcId == -1 || lyrInfo.records === null ? null : lyrInfo.records[srcId];
      unionAddDataValues(values, lyrInfo.fields, rec);
    }
    return unionMakeDataRecord(unionFields, values);
  });

  var unionLyr = {
    name: 'union',
    geometry_type: 'polygon',
    shapes: mosaicShapes,
    data: new DataTable(mosaicRecords)
  };
  return [unionLyr];
};

function unionFindOriginId(mergedIds, offset, length) {
  var mergedId;
  for (var i=0; i<mergedIds.length; i++) {
    mergedId = mergedIds[i];
    if (mergedId >= offset && mergedId < offset + length) {
      return mergedId - offset;
    }
  }
  return -1;
}

function unionAddDataValues(arr, fields, rec) {
  for (var i=0; i<fields.length; i++) {
    arr.push(rec ? rec[fields[i]] : null);
  }
}

function unionMakeDataRecord(fields, values) {
  var rec = {};
  for (var i=0; i<fields.length; i++) {
    rec[fields[i]] = values[i];
  }
  return rec;
}
