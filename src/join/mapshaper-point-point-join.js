import { PointIndex } from '../points/mapshaper-point-index';
import { stop } from '../utils/mapshaper-logging';
import { prepJoinLayers } from './mapshaper-point-polygon-join';
import { joinTables } from '../join/mapshaper-join-tables';

export function joinPointsToPoints(targetLyr, srcLyr, opts) {
  var joinFunction = getPointToPointFunction(targetLyr, srcLyr, opts);
  prepJoinLayers(targetLyr, srcLyr);
  return joinTables(targetLyr.data, srcLyr.data, joinFunction, opts);
}

function getPointToPointFunction(targetLyr, srcLyr, opts) {
  var shapes = targetLyr.shapes;
  var index = new PointIndex(srcLyr.shapes, {});
  return function(targId) {
    var srcId = index.findNearestPointFeature(shapes[targId]);
    // TODO: accept multiple hits
    return srcId > -1 ? [srcId] : null;
  };
}
