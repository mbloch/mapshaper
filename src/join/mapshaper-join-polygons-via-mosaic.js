import { joinTables } from '../join/mapshaper-join-tables';
import { prepJoinLayers } from '../join/mapshaper-point-polygon-join';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { mergeLayersForOverlay } from '../clipping/mapshaper-overlay-utils';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

export function joinPolygonsViaMosaic(targetLyr, targetDataset, source, opts) {
  var mergedDataset = mergeLayersForOverlay([targetLyr], targetDataset, source, opts);
  var nodes = addIntersectionCuts(mergedDataset, opts);
  var sourceLyr = mergedDataset.layers.pop();
  targetDataset.arcs = mergedDataset.arcs;
  prepJoinLayers(targetLyr, sourceLyr);
  var mergedLyr = {
    geometry_type: 'polygon',
    shapes: targetLyr.shapes.concat(sourceLyr.shapes)
  };
  var mosaicIndex = new MosaicIndex(mergedLyr, nodes, {flat: false});

  var joinOpts = utils.extend({}, opts);
  var joinFunction = getPolygonToPolygonFunction(targetLyr, sourceLyr, mosaicIndex);
  var retn = joinTables(targetLyr.data, sourceLyr.data, joinFunction, joinOpts);

  if (opts.interpolate) {
    interpolateFieldsByArea(targetLyr, sourceLyr, mosaicIndex, opts);
  }
  return retn;
}

function interpolateFieldsByArea(destLyr, sourceLyr, mosaicIndex, opts) {
  var sourceFields = opts.interpolate;
  var getShapeArea = opts.planar ? geom.getPlanarShapeArea : geom.getShapeArea;
  var sourceLen = sourceLyr.shapes.length;
  var destLen = destLyr.shapes.length;
  var mosaicShapes = mosaicIndex.mosaic;
  var arcs = mosaicIndex.nodes.arcs;
  var mosaicRecords = mosaicShapes.map(function(shp, i) {
    var rec = {
      area: getShapeArea(shp, arcs),
      weight: 0,
      sourceId: -1
    };
    return rec;
  });

  sourceLyr.shapes.forEach(function(sourceShp, sourceId) {
    var tileIds = mosaicIndex.getTileIdsByShapeId(sourceId + destLen);
    var shapeArea = getShapeArea(sourceShp, arcs);
    var tileRec;
    for (var i=0; i<tileIds.length; i++) {
      tileRec = mosaicRecords[tileIds[i]];
      if (tileRec.sourceId > -1) {
        // overlap in source layer
        continue;
      }
      tileRec.weight = tileRec.area / shapeArea;
      tileRec.sourceId = sourceId;
    }
  });

  destLyr.data.getRecords().forEach(function(destRec, destId) {
    var sourceRecords = sourceLyr.data.getRecords();
    var tileIds = mosaicIndex.getTileIdsByShapeId(destId);
    var tileRecords = [], i, field;
    for (i=0; i<tileIds.length; i++) {
      tileRecords.push(mosaicRecords[tileIds[i]]);
    }
    for (i=0; i<sourceFields.length; i++) {
      field = sourceFields[i];
      destRec[field] = getInterpolatedValue(field, tileRecords, sourceRecords);
    }
  });
}

function getInterpolatedValue(field, tileRecords, sourceRecords) {
  var value = 0, tileRec, sourceRec;
  for (var i=0; i<tileRecords.length; i++) {
    tileRec = tileRecords[i];
    if (tileRec.sourceId == -1) continue;
    sourceRec = sourceRecords[tileRec.sourceId];
    value += tileRec.weight * sourceRec[field];
  }
  return value;
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

// Returned function converts a target layer feature id to multiple source feature ids
function getPolygonToPolygonFunction(targetLyr, srcLyr, mosaicIndex) {
  var mergedToSourceIds = getIdConversionFunction(targetLyr.shapes.length, srcLyr.shapes.length);
  return function(targId) {
    var tileIds = mosaicIndex.getTileIdsByShapeId(targId);
    var sourceIds = [], tmp;
    for (var i=0; i<tileIds.length; i++) {
      tmp = mosaicIndex.getSourceIdsByTileId(tileIds[i]);
      tmp = mergedToSourceIds(tmp);
      sourceIds = sourceIds.length > 0 ? sourceIds.concat(tmp) : tmp;
    }
    sourceIds = utils.uniq(sourceIds);
    return sourceIds;
  };
}
