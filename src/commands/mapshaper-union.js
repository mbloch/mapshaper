/* @require mapshaper-overlay-utils */

api.union = function(targetLayers, src, targetDataset, opts) {
  var sourceDataset;
  if (!src || !src.layer || !src.dataset) {
    error("Unexpected source layer argument");
  }
  var mergedDataset = internal.mergeLayersForOverlay(targetLayers, src, targetDataset, opts);
  var nodes = internal.addIntersectionCuts(mergedDataset, opts);
  var unionLyr = mergedDataset.layers.pop();
  var outputLayers = targetLayers.map(function(targetLyr) {
    return internal.unionTwoLayers(targetLyr, unionLyr, nodes, opts);
  });
  targetDataset.arcs = nodes.arcs;
  return outputLayers;
};

internal.unionTwoLayers = function(targetLyr, sourceLyr, nodes, opts) {
  if (targetLyr.geometry_type != 'polygon' || sourceLyr.geometry_type != 'polygon') {
    stop('Command requires two polygon layers');
  }
  var mergedLayer = {
    geometry_type: 'polygon',
    shapes: targetLyr.shapes.concat(sourceLyr.shapes)
  };
  // Use suffixes to disambiguate same-name fields
  // TODO: add an option to override these defaults
  var suffixA = '_A';
  var suffixB = '_B';
  var decorateRecord = opts.each ? internal.getUnionRecordDecorator(opts.each, targetLyr, sourceLyr, nodes.arcs) : null;
  var mosaicIndex = new MosaicIndex(mergedLayer, nodes, {flat: false});
  var mosaicShapes = mosaicIndex.mosaic;
  var targetRecords = targetLyr.data ? targetLyr.data.getRecords() : null;
  var targetFields = targetLyr.data ? targetLyr.data.getFields() : [];
  var targetSize = targetLyr.shapes.length;
  var sourceRecords = sourceLyr.data ? sourceLyr.data.getRecords() : null;
  var sourceFields = sourceLyr.data ? sourceLyr.data.getFields() : [];
  var sourceSize = sourceLyr.shapes.length;
  var targetMap = internal.unionGetFieldMap(targetFields, sourceFields, suffixA);
  var sourceMap = internal.unionGetFieldMap(sourceFields, targetFields, suffixB);

  var mosaicRecords = mosaicShapes.map(function(shp, i) {
    var mergedIds = mosaicIndex.getSourceIdsByTileId(i);
    var targetId = internal.unionFindOriginId(mergedIds, targetSize, sourceSize);
    var sourceId = internal.unionFindOriginId(mergedIds, 0, targetSize);
    var rec = {};
    var targetRec = targetId > -1 && targetRecords ? targetRecords[targetId] : null;
    var sourceRec = sourceId > -1 && sourceRecords ? sourceRecords[sourceId] : null;
    internal.unionMergeDataProperties(rec, targetRec, targetFields, targetMap);
    internal.unionMergeDataProperties(rec, sourceRec, sourceFields, sourceMap);
    if (opts.add_fid) {
      rec.FID_A = targetId;
      rec.FID_B = sourceId;
    }
    return rec;
  });
  var unionLyr = {
    geometry_type: 'polygon',
    shapes: mosaicShapes,
    data: new DataTable(mosaicRecords)
  };
  if ('name' in targetLyr) unionLyr.name = targetLyr.name;
  return unionLyr;
};

internal.unionFindOriginId = function(mergedIds, offset, length) {
  var mergedId;
  for (var i=0; i<mergedIds.length; i++) {
    mergedId = mergedIds[i];
    if (mergedId >= offset && mergedId < offset + length) {
      return mergedId - offset;
    }
  }
  return -1;
};

internal.unionMergeDataProperties = function(outRec, inRec, fields, fieldMap) {
  for (var i=0; i<fields.length; i++) {
    outRec[fieldMap[fields[i]]] = inRec ? inRec[fields[i]] : null;
  }
};

internal.unionGetFieldMap = function(fields, otherFields, suffix) {
  return fields.reduce(function(memo, field) {
    memo[field] = otherFields.indexOf(field) > -1 ? field + suffix : field;
    return memo;
  }, {});
};
