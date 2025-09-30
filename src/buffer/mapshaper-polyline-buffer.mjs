import { getPolylineBufferMaker as getPolylineBufferMaker_v3 } from '../buffer/mapshaper-path-buffer-v3';
import { getPolylineBufferMaker as getPolylineBufferMaker_v2 } from '../buffer/mapshaper-path-buffer-v2';
import { getPolylineBufferMaker as getPolylineBufferMaker_v1} from '../buffer/mapshaper-path-buffer-v1';
import { getBufferDistanceFunction, dissolveBufferDataset, dissolveBufferDataset2 } from '../buffer/mapshaper-buffer-common';
import { importGeoJSON } from '../geojson/geojson-import';
import { time, timeEnd } from '../utils/mapshaper-logging';

export function makePolylineBuffer(lyr, dataset, opts) {
  time('buffer');
  var geojson = makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = importGeoJSON(geojson, {});
  if (!opts.debug_points) {
    dissolveBufferDataset2(dataset2, opts);
  }
  timeEnd('buffer');
  return dataset2;
}

export function makeShapeBufferGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  // var toleranceFn = getBufferToleranceFunction(dataset, opts);
  var makerOpts = Object.assign({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer =
    opts.v2 && getPolylineBufferMaker_v2(dataset, makerOpts) ||
    opts.v3 && getPolylineBufferMaker_v3(dataset, makerOpts) ||
    getPolylineBufferMaker_v1(dataset, makerOpts);
  // var records = lyr.data ? lyr.data.getRecords() : null;
  var arr = lyr.shapes.reduce(function(memo, shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return memo;
    // retn might be an array of features or a single feature
    var retn = makeShapeBuffer(shape, distance);
    return memo.concat(retn);
  }, []);
  var geojsonType = arr?.[0].type;
  // TODO: make sure that importer supports null geometries (not standard GeoJSON);
  // console.log(arr)
  return geojsonType == 'Feature' ? {
    type: 'FeatureCollection',
    features: arr
  } : {
    type: 'GeometryCollection',
    geometries: arr
  };
}

