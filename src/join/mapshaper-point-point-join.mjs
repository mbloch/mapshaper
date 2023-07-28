import { PointIndex } from '../points/mapshaper-point-index';
import { stop } from '../utils/mapshaper-logging';
import { prepJoinLayers } from './mapshaper-point-polygon-join';
import { joinTables, joinTableToLayer } from '../join/mapshaper-join-tables';
import { isLatLngCRS } from '../crs/mapshaper-projections';

export function joinPointsToPoints(targetLyr, srcLyr, crs, opts) {
  var joinFunction = getPointToPointFunction(targetLyr, srcLyr, crs, opts);
  prepJoinLayers(targetLyr, srcLyr);
  return joinTableToLayer(targetLyr, srcLyr.data, joinFunction, opts);
}

function getPointToPointFunction(targetLyr, srcLyr, crs, opts) {
  var shapes = targetLyr.shapes;
  var index = new PointIndex(srcLyr, crs, opts);
  return function(targId) {
    var matches = index.lookupByMultiPoint(shapes[targId]);
    return matches.length > 0 ? matches : null;
  };
}

function getNearestPointFunction(targetLyr, srcLyr, crs, opts) {

}

function getInverseNearestPointFunction(targetLyr, srcLyr, crs, opts) {


}

