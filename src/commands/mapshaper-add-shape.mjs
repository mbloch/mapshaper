import cmd from '../mapshaper-cmd';
import { stop, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { replaceLayers } from '../dataset/mapshaper-dataset-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';

cmd.addShape = addShape;

export function addShape(targetLayers, targetDataset, opts) {
  if (targetLayers.length > 1) {
    stop('Command expects a single target layer');
  }
  var targetLyr = targetLayers[0]; // may be undefined
  var targetType = !opts.no_replace && targetLyr && targetLyr.geometry_type || null;
  var dataset = importGeoJSON(toFeature(opts, targetType));
  var outputLyr = mergeDatasetsIntoDataset(targetDataset, [dataset])[0];
  if (opts.no_replace || !targetLyr) {
    // create new layer
    setOutputLayerName(outputLyr, targetLyr && targetLyr.name, null, opts);
    return [outputLyr];
  }
  // merge into target layer
  return cmd.mergeLayers([targetLyr, outputLyr], {force: true});
}

export function toFeature(opts, geomType) {
  if (opts.geojson) {
    return parseArg(opts.geojson);
  }

  var geom = opts.coordinates && parseCoordsAsGeometry(opts.coordinates) || null;

  if (!geom) {
    stop('Missing required shape coordinates');
  }

  if (geomType == 'point' && geom.type != 'Point') {
    stop('Expected point coordinates, received', geom.type);
  }

  if (geomType == 'polygon' && geom.type != 'Polygon') {
    stop('Expected polygon coordinates, received', geom.type);
  }

  if (geomType == 'polyline') {
    if (geom.type == 'Polygon') {
      geom.coordinates = geom.coordinates[0];
      geom.type = 'LineString';
    } else {
      stop('Expected polyline coordinates, received', geom.type);
    }
  }

  return {
    type: 'Feature',
    properties: parseProperties(opts.properties),
    geometry: geom
  };
}

function parseArg(obj) {
  return typeof obj == 'string' ? JSON.parse(obj) : obj;
}

function parseProperties(arg) {
  if (!arg) return null;
  return parseArg(arg);
}

function isArrayOfNumbers(arr) {
  return arr.length >= 2 && arr.every(utils.isNumber);
}

function isClosedPath(arr) {
  return isArrayOfPoints(arr) && arr.length > 3 && samePoint(arr[0], arr[arr.length - 1]);
}

function samePoint(a, b) {
  return a[0] == b[0] && a[1] == b[1];
}

function isArrayOfPoints(arr) {
  return arr.every(isPoint);
}

function isPoint(arr) {
  return arr && arr.length == 2 && isArrayOfNumbers(arr);
}

function transposeCoords(arr) {
  var coords = [];
  for (var i=0; i<arr.length; i+=2) {
    coords.push([arr[i], arr[i+1]]);
  }
  if (!isArrayOfPoints(coords)) {
    stop('Unable to parse x,y,x,y... coordinates');
  }
  return coords;
}

function parseCoordsAsGeometry(arg) {
  if (typeof arg == 'string') {
    arg = arg.trim();
    if (!arg.startsWith('[') && !arg.endsWith(']')) {
      arg = '[' + arg + ']';
    }
  }
  var arr = parseArg(arg);
  if (isPoint(arr)) {
    return {
      type: 'Point',
      coordinates: arr
    };
  }

  if (isArrayOfNumbers(arr)) {
    arr = transposeCoords(arr);
  }

  if (isClosedPath(arr)) {
    return {
      type: 'Polygon',
      coordinates: [arr]
    };
  }

  if (isArrayOfPoints(arr)) {
    return {
      type: 'LineString',
      coordinates: arr
    };
  }

  stop('Unable to import coordinates');
}
