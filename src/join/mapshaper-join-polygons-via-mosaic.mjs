import { joinTables, joinTableToLayer } from '../join/mapshaper-join-tables';
import { prepJoinLayers } from '../join/mapshaper-point-polygon-join';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { mergeLayersForOverlay } from '../clipping/mapshaper-overlay-utils';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { error, stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertAreaParam } from '../geom/mapshaper-units';
import { getColumnType } from '../datatable/mapshaper-data-utils';

export function joinPolygonsViaMosaic(targetLyr, targetDataset, source, opts) {
  // merge source and target layers
  var mergedDataset = mergeLayersForOverlay([targetLyr], targetDataset, source, opts);
  var nodes = addIntersectionCuts(mergedDataset, opts);
  var sourceLyr = mergedDataset.layers.pop();
  targetDataset.arcs = mergedDataset.arcs;
  prepJoinLayers(targetLyr, sourceLyr);
  var mergedLyr = {
    geometry_type: 'polygon',
    shapes: targetLyr.shapes.concat(sourceLyr.shapes)
  };
  // make a mosaic from merged shapes of both layers
  var mosaicIndex = new MosaicIndex(mergedLyr, nodes, {flat: false});
  var joinOpts = utils.extend({}, opts);
  if (joinOpts.min_overlap_area) {
    // convert area arg to square meters (typically)
    joinOpts.min_overlap_area = convertAreaParam(joinOpts.min_overlap_area, getDatasetCRS(targetDataset));
  }

  var joinFunction = getPolygonToPolygonFunction(targetLyr, sourceLyr, mosaicIndex, joinOpts);
  var retn = joinTableToLayer(targetLyr, sourceLyr.data, joinFunction, joinOpts);
  if (opts.interpolate) {
    if (opts.duplication) stop('duplication and interpolate options cannot be used together');
    interpolateFieldsByArea(targetLyr, sourceLyr, mosaicIndex, opts);
  }
  return retn;
}


function interpolateFieldsByArea(destLyr, sourceLyr, mosaicIndex, opts) {
  var mosaicRecords = getOverlapDataByTile(destLyr, sourceLyr, mosaicIndex, opts);
  var sourceFields = opts.interpolate;
  var sourceRecords = sourceLyr.data.getRecords();

  // Use different interpolation methods for qualitative and quantitative data
  // Assumes string and boolean fields are qualitative and numeric fields are
  //   quantitative (TODO: somehow recognize numeric index data as qualitative)
  var quantitativeFields = [];
  var qualitativeFields = [];
  sourceFields.forEach(function(field) {
    var type = getColumnType(field, sourceRecords);
    if (type == 'number') {
      quantitativeFields.push(field);
    } else if (type == 'string' || type == 'boolean') {
      qualitativeFields.push(field);
    } else {
      message(`"${field}" field appears to contain ${type}-type data. No interpolation method is available.`);
    }
  });

  // for each destination polygon, calculate interpolated values,
  // using the data calculated in previous steps
  destLyr.data.getRecords().forEach(function(destRec, destId) {
    var tileIds = mosaicIndex.getTileIdsByShapeId(destId);
    var tileRecords = [], i, field;
    for (i=0; i<tileIds.length; i++) {
      tileRecords.push(mosaicRecords[tileIds[i]]);
    }
    for (i=0; i<quantitativeFields.length; i++) {
      field = sourceFields[i];
      destRec[field] = getInterpolatedNumber(field, tileRecords, sourceRecords);
    }
    for (i=0; i<qualitativeFields.length; i++) {
      field = sourceFields[i];
      destRec[field] = getInterpolatedCategory(field, tileRecords, sourceRecords);
    }
  });
}

function getOverlapDataByTile(destLyr, sourceLyr, mosaicIndex, opts) {
  var getShapeArea = opts.planar ? geom.getPlanarShapeArea : geom.getShapeArea;
  var destLen = destLyr.shapes.length;
  var mosaicShapes = mosaicIndex.mosaic;
  var arcs = mosaicIndex.nodes.arcs;
  // initialize data objects for each mosaic tile
  var mosaicRecords = mosaicShapes.map(function(tile, i) {
    var rec = {
      area: getShapeArea(tile, arcs),
      weights: null,
      sourceIds: null
    };
    return rec;
  });

  // identify the source polygon that overlaps each tile,
  // and calculate the percentage of the source shape represented by each tile
  sourceLyr.shapes.forEach(function(sourceShp, sourceId) {
    var tileIds = mosaicIndex.getTileIdsByShapeId(sourceId + destLen);
    var shapeArea = getShapeArea(sourceShp, arcs);
    var tileRec, weight;
    for (var i=0; i<tileIds.length; i++) {
      tileRec = mosaicRecords[tileIds[i]];
      weight = tileRec.area / shapeArea;
      if (!tileRec.weights) {
        tileRec.weights = [];
        tileRec.sourceIds = [];
      }
      tileRec.weights.push(weight);
      tileRec.sourceIds.push(sourceId);
    }
  });
  return mosaicRecords;
}


// function getInterpolatedValue(field, tileRecords, sourceRecords) {
//   var value = 0, tileRec, sourceRec;
//   for (var i=0; i<tileRecords.length; i++) {
//     tileRec = tileRecords[i];
//     if (tileRec.sourceId == -1) continue;

//     sourceRec = sourceRecords[tileRec.sourceId];
//     value += tileRec.weight * sourceRec[field];
//   }
//   return value;
// }

function getInterpolatedNumber(field, tileRecords, sourceRecords) {
  var value = 0, tileRec, sourceRec, sourceId;
  for (var i=0; i<tileRecords.length; i++) {
    tileRec = tileRecords[i];
    if (!tileRec.sourceIds) continue;
    for (var j=0; j<tileRec.sourceIds.length; j++) {
      sourceId = tileRec.sourceIds[j];
      sourceRec = sourceRecords[sourceId];
      value += tileRec.weights[j] * sourceRec[field];
    }
  }
  return value;
}

function getInterpolatedCategory(field, tileRecords, sourceRecords) {
  var value, tileRec, sourceRec, sourceId, idx;
  var areas = [];
  var values = [];
  for (var i=0; i<tileRecords.length; i++) {
    tileRec = tileRecords[i];
    if (!tileRec.sourceIds) continue;
    for (var j=0; j<tileRec.sourceIds.length; j++) {
      sourceId = tileRec.sourceIds[j];
      sourceRec = sourceRecords[sourceId];
      value = sourceRec[field];
      idx = values.indexOf(value);
      if (idx == -1) {
        values.push(value);
        areas.push(tileRec.area);
      } else {
        areas[idx] += tileRec.area;
      }
    }
  }
  var maxArea = Math.max.apply(null, areas);
  var maxIdx = areas.indexOf(maxArea);
  return maxIdx == -1 ? null : values[maxIdx];
}


function getIdConversionFunction(offset, length) {
  return function (mergedIds) {
    var ids = [], id;
    for (var i=0; i<mergedIds.length; i++) {
      id = mergedIds[i] - offset;
      if (id >= 0 && id < length) ids.push(id);
    }
    return ids;
  };
}

function getMinPctFunction(minPct, destLyr, mosaicIndex) {
  var arcs = mosaicIndex.nodes.arcs;
  var destLen = destLyr.shapes.length;

  return function(destId, srcIds) {
    var destTileIds = mosaicIndex.getTileIdsByShapeId(destId);
    var destArea = getAreaOfTiles(destTileIds, mosaicIndex);
    return srcIds.filter(function(srcId, i) {
      var srcTileIds = mosaicIndex.getTileIdsByShapeId(srcId + destLen);
      var sharedIds = utils.intersection(destTileIds, srcTileIds);
      var overlapArea = getAreaOfTiles(sharedIds, mosaicIndex);
      var overlapPct = overlapArea / destArea || 0;
      return overlapPct >= minPct;
    });
  };
}

function getMinAreaFunction(minArea, destLyr, mosaicIndex) {
  var arcs = mosaicIndex.nodes.arcs;
  var destLen = destLyr.shapes.length;

  return function(destId, srcIds) {
    var destTileIds = mosaicIndex.getTileIdsByShapeId(destId);

    return srcIds.filter(function(srcId, i) {
      var srcTileIds = mosaicIndex.getTileIdsByShapeId(srcId + destLen);
      var sharedIds = utils.intersection(destTileIds, srcTileIds);
      var overlapArea = getAreaOfTiles(sharedIds, mosaicIndex);
      return overlapArea >= minArea;
    });
  };
}

function getAreaOfTiles(tileIds, mosaicIndex) {
  var arcs = mosaicIndex.nodes.arcs;
  var area = 0;
  for (var i=0; i<tileIds.length; i++) {
    area += geom.getShapeArea(mosaicIndex.mosaic[tileIds[i]], arcs);
  }
  return area;
}

function getMaxOverlapFunction(destLyr, mosaicIndex) {
  var destLen = destLyr.shapes.length;

  return function(destId, srcIds) {
    var destTileIds = mosaicIndex.getTileIdsByShapeId(destId);
    var maxArea = 0;
    var maxId = -1;
    srcIds.forEach(function(srcId, i) {
      var srcTileIds = mosaicIndex.getTileIdsByShapeId(srcId + destLen);
      var sharedIds = utils.intersection(destTileIds, srcTileIds);
      var area = getAreaOfTiles(sharedIds, mosaicIndex);
      if (area >= maxArea) {
        maxId = srcId;
        maxArea = area;
      }
    });
    if (maxId == -1) error('Geometry error');
    return [maxId];
  };
}


// Returned function converts a target layer feature id to multiple source feature ids
// TODO: option to ignore source polygon with small overlaps
//       (as a percentage of the area of one or the other polygon?)
function getPolygonToPolygonFunction(targetLyr, srcLyr, mosaicIndex, opts) {
  var mergedToSourceIds = getIdConversionFunction(targetLyr.shapes.length, srcLyr.shapes.length);
  var selectMaxOverlap;
  var minAreaFilter;
  var minPctFilter;
  if (opts.largest_overlap) {
    selectMaxOverlap = getMaxOverlapFunction(targetLyr, mosaicIndex);
  }
  if (opts.min_overlap_pct) {
    minPctFilter = getMinPctFunction(opts.min_overlap_pct, targetLyr, mosaicIndex);
  }
  if (opts.min_overlap_area) {
    minAreaFilter = getMinAreaFunction(opts.min_overlap_area, targetLyr, mosaicIndex);
  }

  return function(targId) {
    var tileIds = mosaicIndex.getTileIdsByShapeId(targId);
    var sourceIds = [], overlappingTiles = [], tmp;
    for (var i=0; i<tileIds.length; i++) {
      tmp = mosaicIndex.getSourceIdsByTileId(tileIds[i]);
      tmp = mergedToSourceIds(tmp);
      sourceIds = sourceIds.length > 0 ? sourceIds.concat(tmp) : tmp;
    }
    sourceIds = utils.uniq(sourceIds);
    if (sourceIds.length > 1 && opts.largest_overlap) {
      sourceIds = selectMaxOverlap(targId, sourceIds);
    }
    if (minAreaFilter) {
      sourceIds = minAreaFilter(targId, sourceIds);
    }
    if (minPctFilter) {
      sourceIds = minPctFilter(targId, sourceIds);
    }
    return sourceIds;
  };
}
