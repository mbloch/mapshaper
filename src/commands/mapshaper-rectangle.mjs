import cmd from '../mapshaper-cmd';
import { convertFourSides } from '../geom/mapshaper-units';
import { setDatasetCrsInfo, getDatasetCrsInfo, getCrsInfo } from '../crs/mapshaper-projections';
import { getLayerBounds, layerHasGeometry, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { importGeoJSON } from '../geojson/geojson-import';
import { getPointFeatureBounds } from '../points/mapshaper-point-utils';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds, clampToWorldBounds } from '../geom/mapshaper-latlon';
import { Bounds } from '../geom/mapshaper-bounds';
import { densifyPathByInterval } from '../crs/mapshaper-densify';

// Create rectangles around each feature in a layer
cmd.rectangles = function(targetLyr, targetDataset, opts) {
  if (!layerHasGeometry(targetLyr)) {
    stop("Layer is missing geometric shapes");
  }
  var crsInfo = getDatasetCrsInfo(targetDataset);
  var records = targetLyr.data ? targetLyr.data.getRecords() : null;
  var geometries = targetLyr.shapes.map(function(shp) {
    var bounds = targetLyr.geometry_type == 'point' ?
      getPointFeatureBounds(shp) : targetDataset.arcs.getMultiShapeBounds(shp);
    bounds = applyRectangleOptions(bounds, crsInfo.crs, opts);
    if (!bounds) return null;
    return convertBboxToGeoJSON(bounds.toArray(), opts);
  });
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

// Create rectangles around one or more target layers
//
cmd.rectangle2 = function(target, opts) {
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

cmd.rectangle = function(source, opts) {
  var offsets, bounds, coords, crsInfo;
  if (source) {
    bounds = getLayerBounds(source.layer, source.dataset.arcs);
    crsInfo = getDatasetCrsInfo(source.dataset);
  } else if (opts.bbox) {
    bounds = new Bounds(opts.bbox);
    crsInfo = probablyDecimalDegreeBounds(bounds) ? getCrsInfo('wgs84') : {};
  }
  bounds = bounds && applyRectangleOptions(bounds, crsInfo.crs, opts);
  if (!bounds || !bounds.hasBounds()) {
    stop('Missing rectangle extent');
  }
  var geojson = convertBboxToGeoJSON(bounds.toArray(), opts);
  var dataset = importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'rectangle';
  setDatasetCrsInfo(dataset, crsInfo);
  return dataset;
};

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

export function convertBboxToGeoJSON(bbox, optsArg) {
  var opts = optsArg || {};
  var coords = [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]],
      [bbox[2], bbox[1]], [bbox[0], bbox[1]]];
  if (opts.interval > 0) {
    coords = densifyPathByInterval(coords, opts.interval);
  }
  return opts.geometry_type == 'polyline' ? {
    type: 'LineString',
    coordinates: coords
  } : {
    type: 'Polygon',
    coordinates: [coords]
  };
}
