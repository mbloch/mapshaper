import cmd from '../mapshaper-cmd';
import { convertFourSides, parseSizeParam } from '../geom/mapshaper-units';
import { setDatasetCrsInfo, getDatasetCrsInfo, getCrsInfo } from '../crs/mapshaper-projections';
import {
  getLayerBounds,
  layerHasGeometry,
  setOutputLayerName,
  initDataTable,
  layerIsRectangle,
  getFeatureCount
} from '../dataset/mapshaper-layer-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { importGeoJSON } from '../geojson/geojson-import';
import { getPointFeatureBounds } from '../points/mapshaper-point-utils';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds, clampToWorldBounds } from '../geom/mapshaper-latlon';
import { Bounds } from '../geom/mapshaper-bounds';
import { densifyPathByInterval } from '../crs/mapshaper-densify';
import { bboxToCoords } from '../paths/mapshaper-rectangle-utils';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';

// Create rectangles around each feature in a layer
cmd.rectangles = function(targetLyr, targetDataset, opts) {
  var crsInfo = getDatasetCrsInfo(targetDataset);
  var records = targetLyr.data ? targetLyr.data.getRecords() : null;
  var geometries;

  if (opts.bbox) {
    geometries = bboxExpressionToGeometries(opts.bbox, targetLyr, targetDataset, opts);

  } else {
    if (!layerHasGeometry(targetLyr)) {
      stop("Layer is missing geometric shapes");
    }
    geometries = shapesToBoxGeometries(targetLyr, targetDataset, opts);
  }

  var geojson = {
    type: 'FeatureCollection',
    features: geometries.map(function(geom, i) {
      var rec = records && records[i] || null;
      if (rec && opts.no_replace) {
        rec = utils.extend({}, rec); // make a copy
      }
      return {
        type: 'Feature',
        properties: rec,
        geometry: geom
      };
    })
  };
  var dataset = importGeoJSON(geojson, {});
  setDatasetCrsInfo(dataset, crsInfo);
  var outputLayers = mergeDatasetsIntoDataset(targetDataset, [dataset]);
  setOutputLayerName(outputLayers[0], targetLyr, null, opts);
  return outputLayers;
};

function shapesToBoxGeometries(lyr, dataset, opts) {
  var crsInfo = getDatasetCrsInfo(dataset);
  return lyr.shapes.map(function(shp) {
    var bounds = lyr.geometry_type == 'point' ?
      getPointFeatureBounds(shp) : dataset.arcs.getMultiShapeBounds(shp);
    bounds = applyRectangleOptions(bounds, crsInfo.crs, opts);
    if (!bounds) return null;
    return bboxToPolygon(bounds.toArray(), opts);
  });
}

function bboxExpressionToGeometries(exp, lyr, dataset, opts) {
  var compiled = compileFeatureExpression(exp, lyr, dataset.arcs, {});
  var n = getFeatureCount(lyr);
  var result;
  var geometries = [];
  for (var i=0; i<n; i++) {
    result = compiled(i);
    if (!looksLikeBbox(result)) {
      stop('Invalid bbox value (expected a GeoJSON-type bbox):', result);
    }
    geometries.push(bboxToPolygon(result));
  }
  return geometries;
}

function looksLikeBbox(o) {
  if (!o || o.length != 4) return false;
  if (o.some(isNaN)) return false;
  if (o[0] <= o[2] == false || o[1] <= o[3] == false) return false;
  return true;
}

// Create rectangles around one or more target layers
//
cmd.rectangle2 = function(target, opts) {
  // if target layer is a rectangle and we're applying frame properties,
  // turn the target into a frame instead of creating a new rectangle
  if (target.layers.length == 1 && opts.width &&
    layerIsRectangle(target.layers[0], target.dataset.arcs)) {
    applyFrameProperties(target.layers[0], opts);
    return;
  }
  var datasets = target.layers.map(function(lyr) {
    var dataset = cmd.rectangle({layer: lyr, dataset: target.dataset}, opts);
    setOutputLayerName(dataset.layers[0], lyr, null, opts);
    if (!opts.no_replace) {
      dataset.layers[0].name = lyr.name || dataset.layers[0].name;
    }
    return dataset;
  });
  return mergeDatasetsIntoDataset(target.dataset, datasets);
};

cmd.rectangle = function(target, opts) {
  var offsets, bounds, crsInfo;
  if (opts.bbox) {
    bounds = new Bounds(opts.bbox);
    crsInfo = target && getDatasetCrsInfo(target.dataset) ||
      probablyDecimalDegreeBounds(bounds) && getCrsInfo('wgs84') || {};
  } else if (target) {
    bounds = getLayerBounds(target.layer, target.dataset.arcs);
    crsInfo = getDatasetCrsInfo(target.dataset);
  }
  bounds = bounds && applyRectangleOptions(bounds, crsInfo.crs, opts);
  if (!bounds || !bounds.hasBounds()) {
    stop('Missing rectangle extent');
  }
  var feature = {
    type: 'Feature',
    properties: {},
    geometry: bboxToPolygon(bounds.toArray(), opts)
  };
  var dataset = importGeoJSON(feature, {});
  applyFrameProperties(dataset.layers[0], opts);
  dataset.layers[0].name = opts.name || 'rectangle';
  setDatasetCrsInfo(dataset, crsInfo);
  return dataset;
};

function applyFrameProperties(lyr, opts) {
  if (!opts.width) return;
  if (!lyr.data) initDataTable(lyr);
  var d = lyr.data.getRecords()[0] || {};
  d.width = parseSizeParam(opts.width);
  d.type = 'frame';
}

function applyRectangleOptions(bounds, crs, opts) {
  var isGeoBox = probablyDecimalDegreeBounds(bounds);
  if (opts.offset) {
    bounds = applyBoundsOffset(opts.offset, bounds, crs);
  }
  if (bounds.area() > 0 === false) return null;
  if (opts.aspect_ratio) {
    bounds = applyAspectRatio(opts.aspect_ratio, bounds);
  }
  if (isGeoBox) {
    bounds = clampToWorldBounds(bounds);
  }
  return bounds;
}

// opt: aspect ratio as a single number or a range (e.g. "1,2");
export function applyAspectRatio(opt, bounds) {
  var range = String(opt).split(',').map(parseFloat),
    aspectRatio = bounds.width() / bounds.height(),
    min, max; // min is height limit, max is width limit
  if (range.length == 1) {
    range.push(range[0]);
  } else if (range[0] > range[1]) {
    range.reverse();
  }
  min = range[0];
  max = range[1];
  if (!min && !max) return bounds;
  if (!min) min = -Infinity;
  if (!max) max = Infinity;
  if (aspectRatio < min) {
    bounds.fillOut(min);
  } else if (aspectRatio > max) {
    bounds.fillOut(max);
  }
  return bounds;
}

function applyBoundsOffset(offsetOpt, bounds, crs) {
  var offsets = convertFourSides(offsetOpt, crs, bounds);
  bounds.padBounds(offsets[0], offsets[1], offsets[2], offsets[3]);
  return bounds;
}

export function bboxToPolygon(bbox, optsArg) {
  var opts = optsArg || {};
  var coords = bboxToCoords(bbox);
  if (opts.interval > 0) {
    coords = densifyPathByInterval(coords, opts.interval);
  }
  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}
