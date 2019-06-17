/* @requires
mapshaper-buffer-common
mapshaper-shape-iter
mapshaper-geodesic
mapshaper-geojson
mapshaper-path-buffer
*/

internal.makePolylineBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = internal.importGeoJSON(geojson, {});
  internal.dissolveBufferDataset(dataset2, opts);
  return dataset2;
};

internal.makeShapeBufferGeoJSON = function(lyr, dataset, opts) {
  var distanceFn = internal.getBufferDistanceFunction(lyr, dataset, opts);
  var toleranceFn = internal.getBufferToleranceFunction(dataset, opts);
  var geod = internal.getGeodeticSegmentFunction(dataset, false);
  var getBearing = internal.getBearingFunction(dataset);
  var makerOpts = utils.extend({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer = internal.getPolylineBufferMaker(dataset.arcs, geod, getBearing, makerOpts);
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
};

internal.getPolylineBufferMaker = function(arcs, geod, getBearing, opts) {
  var maker = internal.getPathBufferMaker(arcs, geod, getBearing, opts);
  var geomType = opts.geometry_type;
  // polyline output could be used for debugging
  var outputGeom = opts.output_geometry == 'polyline' ? 'polyline' : 'polygon';
  var singleType = outputGeom == 'polyline' ? 'LineString' : 'Polygon';
  var multiType = outputGeom == 'polyline' ? 'MultiLineString' : 'MultiPolygon';

  function bufferPath(path, dist) {
    var coords = maker(path, dist);
    var revPath;
    if (geomType == 'polyline') {
      revPath = internal.reversePath(path.concat());
      coords = coords.concat(maker(revPath, dist));
    }
    coords.push(coords[0].concat()); // close path
    return coords;
  }

  return function(shape, dist) {
    var coords = [], part, geom;
    for (var i=0; i<shape.length; i++) {
      part = bufferPath(shape[i], dist);
      if (!part) continue;
      coords.push(outputGeom == 'polyline' ? part : [part]);
    }
    if (coords.length === 0) {
      geom = null;
    } else if (coords.length == 1) {
      geom = {
        type: singleType,
        coordinates: coords[0]
      };
    } else {
      geom = {
        type: multiType,
        coordinates: coords
      };
    }
    return geom;
  };
};
