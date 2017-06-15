/* @requires
mapshaper-geojson
mapshaper-projections
mapshaper-merging
*/

api.graticule = function(dataset, opts) {
  var graticule = internal.createGraticule(opts);
  var dest, src;
  if (dataset) {
    // project graticule to match dataset
    dest = internal.getDatasetProjection(dataset);
    src = internal.getProjection('wgs84');
    if (!dest) stop("Coordinate system is unknown, unable to create a graticule");
    internal.projectDataset(graticule, src, dest, {}); // TODO: densify?
  }
  return graticule;
};

// create graticule as a dataset
internal.createGraticule = function(opts) {
  var precision = 1; // degrees between each vertex
  var step = 10;
  var majorStep = 90;
  var xn = Math.round(360 / step) + 1;
  var yn = Math.round(180 / step) + 1;
  var xx = utils.range(xn, -180, step);
  var yy = utils.range(yn, -90, step);
  var meridians = xx.map(function(x) {
    var ymin = -90,
        ymax = 90;
    if (x % majorStep !== 0) {
      ymin += step;
      ymax -= step;
    }
    return internal.createMeridian(x, ymin, ymax, precision);
  });
  var parallels = yy.map(function(y) {
    return internal.createParallel(y, -180, 180, precision);
  });
  var geojson = {
    type: 'FeatureCollection',
    features: meridians.concat(parallels)
  };
  var graticule = internal.importGeoJSON(geojson, {});
  graticule.layers[0].name = 'graticule';
  return graticule;
};

internal.graticuleFeature = function(coords, o) {
  return {
    type: 'Feature',
    properties: o,
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };
};

internal.createMeridian = function(x, ymin, ymax, precision) {
  var coords = [];
  for (var y = ymin; y < ymax; y += precision) {
    coords.push([x, y]);
  }
  coords.push([x, ymax]);
  return internal.graticuleFeature(coords, {type: 'meridian', value: x});
};

internal.createParallel = function(y, xmin, xmax, precision) {
  var coords = [];
  for (var x = xmin; x < xmax; x += precision) {
    coords.push([x, y]);
  }
  coords.push([xmax, y]);
  return internal.graticuleFeature(coords, {type: 'parallel', value: y});
};
