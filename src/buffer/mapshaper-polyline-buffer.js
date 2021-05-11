import { getPolylineBufferMaker } from '../buffer/mapshaper-path-buffer';
import { getPolylineBufferMaker2 } from '../buffer/mapshaper-path-buffer2';
import { getBearingFunction } from '../geom/mapshaper-geodesic';
import { getFastGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { getBufferToleranceFunction, getBufferDistanceFunction, dissolveBufferDataset } from '../buffer/mapshaper-buffer-common';
import { importGeoJSON } from '../geojson/geojson-import';
import { getDatasetCRS } from '../crs/mapshaper-projections';

export function makePolylineBuffer(lyr, dataset, opts) {
  var geojson = makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = importGeoJSON(geojson, {});
  dissolveBufferDataset(dataset2, opts);
  return dataset2;
}

export function makeShapeBufferGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var toleranceFn = getBufferToleranceFunction(dataset, opts);
  var geod = getFastGeodeticSegmentFunction(getDatasetCRS(dataset));
  var getBearing = getBearingFunction(dataset);
  var makerOpts = Object.assign({geometry_type: lyr.geometry_type}, opts);
  var factory = opts.v2 ? getPolylineBufferMaker2 : getPolylineBufferMaker;
  var makeShapeBuffer = factory(dataset.arcs, geod, getBearing, makerOpts);
  var records = lyr.data ? lyr.data.getRecords() : null;
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return makeShapeBuffer(shape, dist, lyr.geometry_type);
  });
  // TODO: make sure that importer supports null geometries (not standard GeoJSON);
  return {
    type: 'GeometryCollection',
    geometries: geometries
  };
}

