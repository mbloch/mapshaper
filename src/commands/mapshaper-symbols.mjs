import cmd from '../mapshaper-cmd';
import { getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { getSymbolDataAccessor } from '../svg/svg-properties';
import { requirePointLayer, requireSinglePointLayer, getLayerBounds, copyLayer } from '../dataset/mapshaper-layer-utils';
import { stop, error } from '../utils/mapshaper-logging';
// import '../svg/mapshaper-svg-arrows';
import { rotateCoords, scaleAndShiftCoords, flipY } from '../symbols/mapshaper-symbol-utils';
import { getFilledArrowCoords, getStickArrowCoords } from '../symbols/mapshaper-arrow-symbols';
import { getPolygonCoords, makeCircleSymbol } from '../symbols/mapshaper-basic-symbols';
import { getStarCoords } from '../symbols/mapshaper-star-symbols';
import { getRingCoords, makeRingSymbol } from '../symbols/mapshaper-ring-symbols';
import { getAffineTransform } from '../commands/mapshaper-affine';
import { mergeOutputLayerIntoDataset } from '../dataset/mapshaper-dataset-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { requireProjectedDataset } from '../crs/mapshaper-projections';
import { makePathSymbol } from '../symbols/mapshaper-path-symbols';

// TODO: refactor to remove duplication in mapshaper-svg-style.js
cmd.symbols = function(inputLyr, dataset, opts) {
  requireSinglePointLayer(inputLyr);
  var lyr = opts.no_replace ? copyLayer(inputLyr) : inputLyr;
  var shapeMode = !!opts.geographic;
  var metersPerPx;
  if (shapeMode) {
    requireProjectedDataset(dataset);
    metersPerPx = opts.pixel_scale || getMetersPerPixel(lyr, dataset);
  }
  var records = getLayerDataTable(lyr).getRecords();
  var getSymbolData = getSymbolDataAccessor(lyr, opts);
  var geometries = lyr.shapes.map(function(shp, i) {
    if (!shp) return null;
    var d = getSymbolData(i);
    var rec = records[i] || {};

    // non-polygon symbols
    if (!shapeMode && d.type == 'circle') {
      rec['svg-symbol'] = makeCircleSymbol(d, opts);
      return;
    }
    if (!shapeMode && d.type == 'ring') {
      rec['svg-symbol'] = makeRingSymbol(d, opts);
      return;
    }

    var geojsonType = 'Polygon';
    var coords;
    // these symbols get converted to polygon shapes
    if (d.type == 'arrow' && opts.arrow_style == 'stick') {
      coords = getStickArrowCoords(d);
      geojsonType = 'MultiLineString';
    } else if (d.type == 'arrow') {
      coords = getFilledArrowCoords(d);
    } else if (d.type == 'ring') {
      coords = getRingCoords(d);
      geojsonType = 'MultiPolygon';
    } else if (d.type == 'star') {
      coords = getStarCoords(d);
    } else {
      coords = getPolygonCoords(d);
    }
    if (!coords) return null;
    rotateCoords(coords, +d.rotation || 0);
    if (!shapeMode) {
      flipY(coords);
    }
    if (+opts.scale) {
      scaleAndShiftCoords(coords, +opts.scale, [0, 0]);
    }
    if (shapeMode) {
      scaleAndShiftCoords(coords, metersPerPx, shp[0]);
      if (d.fill) rec.fill = d.fill;
      if (d.stroke) rec.stroke = d.stroke;
      if (d.opacity) rec.opacity = d.opacity;
      return createGeometry(coords, geojsonType);
    } else {
      rec['svg-symbol'] = makePathSymbol(coords, d, geojsonType);
    }
  });

  var outputLyr, dataset2;
  if (shapeMode) {
    dataset2 = importGeometries(geometries, records);
    outputLyr = mergeOutputLayerIntoDataset(inputLyr, dataset, dataset2, opts);
    outputLyr.data = lyr.data;
  } else {
    outputLyr = lyr;
  }
  return [outputLyr];
};

function importGeometries(geometries, records) {
  var features = geometries.map(function(geom, i) {
    var d = records[i];
    return {
      type: 'Feature',
      properties: records[i] || null,
      geometry: geom
    };
  });
  var geojson = {
    type: 'FeatureCollection',
    features: features
  };
  return importGeoJSON(geojson);
}

function createGeometry(coords, type) {
  return {
    type: type,
    coordinates: coords
  };
}

function getMetersPerPixel(lyr, dataset) {
  var bounds = getLayerBounds(lyr);
  // TODO: need a better way to handle a single point with no extent
  var extent = bounds.width() || bounds.height() || 1000;
  return extent / 800;
}
