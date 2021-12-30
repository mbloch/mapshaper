import cmd from '../mapshaper-cmd';
import { getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { compileValueExpression } from '../expressions/mapshaper-expressions';
import { getSymbolDataAccessor } from '../svg/svg-properties';
import { requirePointLayer, requireSinglePointLayer, getLayerBounds, copyLayer } from '../dataset/mapshaper-layer-utils';
import { stop, error } from '../utils/mapshaper-logging';
// import { symbolBuilders } from '../svg/svg-common';
// import '../svg/mapshaper-svg-arrows';
import { rotateCoords, scaleAndShiftCoords, flipY, roundCoordsForSVG } from '../symbols/mapshaper-symbol-utils';
import { getFilledArrowCoords } from '../symbols/mapshaper-arrow-symbols';
import { getPolygonCoords } from '../symbols/mapshaper-basic-symbols';
import { getRingCoords } from '../symbols/mapshaper-ring-symbols';
import { getAffineTransform } from '../commands/mapshaper-affine';
import { mergeOutputLayerIntoDataset } from '../dataset/mapshaper-dataset-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { getDatasetCRS, getCRS, requireProjectedDataset } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-state';

// TODO: refactor to remove duplication in mapshaper-svg-style.js
cmd.symbols = function(inputLyr, dataset, opts) {
  requireSinglePointLayer(inputLyr);
  var lyr = opts.no_replace ? copyLayer(inputLyr) : inputLyr;
  var polygonMode = !!opts.polygons;
  var metersPerPx;
  if (polygonMode) {
    requireProjectedDataset(dataset);
    metersPerPx = opts.pixel_scale || getMetersPerPixel(lyr, dataset);
  }
  var records = getLayerDataTable(lyr).getRecords();
  var getSymbolData = getSymbolDataAccessor(lyr, opts);
  var geometries = lyr.shapes.map(function(shp, i) {
    if (!shp) return null;
    var d = getSymbolData(i);
    var rec = records[i] || {};
    var geojsonType = 'Polygon';
    var coords;
    if (d.type == 'arrow') {
      coords = getFilledArrowCoords(d);
    } else if (d.type == 'ring') {
      coords = getRingCoords(d);
      geojsonType = 'MultiPolygon';
    } else {
      coords = getPolygonCoords(d);
    }
    if (!coords) return null;
    rotateCoords(coords, +d.rotation || 0);
    if (!polygonMode) {
      flipY(coords);
    }
    if (+opts.scale) {
      scaleAndShiftCoords(coords, +opts.scale, [0, 0]);
    }
    if (polygonMode) {
      scaleAndShiftCoords(coords, metersPerPx, shp[0]);
      if (d.tfill) rec.fill = d.fill;
      return createGeometry(coords, geojsonType);
    } else {
      rec['svg-symbol'] = makeSvgPolygonSymbol(coords, d, geojsonType);
    }
  });

  var outputLyr, dataset2;
  if (polygonMode) {
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

  // TODO: handle single point, no extent
  var bounds = getLayerBounds(lyr);
  return bounds.width() / 800;
}

// Returns an svg-symbol data object for one symbol
function makeSvgPolygonSymbol(coords, properties, geojsonType) {
  if (geojsonType == 'MultiPolygon') {
    coords = convertMultiPolygonCoords(coords);
  } else if (geojsonType != 'Polygon') {
    error('Unsupported type:', geojsonType);
  }
  roundCoordsForSVG(coords);
  return {
    type: 'polygon',
    coordinates: coords,
    fill: properties.fill || 'magenta'
  };
}

function convertMultiPolygonCoords(coords) {
  return coords.reduce(function(memo, poly) {
    return memo.concat(poly);
  }, []);
}
