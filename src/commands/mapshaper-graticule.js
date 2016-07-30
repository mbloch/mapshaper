/* @requires
mapshaper-geojson
mapshaper-projections
mapshaper-merging
*/

api.graticule = function(dataset, opts) {
  var graticule = MapShaper.createGraticule(opts);
  var dest, src;
  if (dataset) {
    // project graticule to match dataset
    dest = MapShaper.getDatasetProjection(dataset);
    src = MapShaper.getProjection('wgs84');
    if (!dest) stop("[graticule] Coordinate system is unknown, unable to create a graticule");
    MapShaper.projectDataset(graticule, src, dest, {}); // TODO: densify?
    // add graticule layer to original dataset (TODO: improve)
    utils.extend(dataset, MapShaper.mergeDatasets([dataset, graticule]));
  } else {
    dataset = graticule;
  }
  return dataset;
};

// create graticule as a dataset
MapShaper.createGraticule = function(opts) {
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
    return MapShaper.createMeridian(x, ymin, ymax, precision);
  });
  var parallels = yy.map(function(y) {
    return MapShaper.createParallel(y, -180, 180, precision);
  });
  var geojson = {
    type: 'FeatureCollection',
    features: meridians.concat(parallels)
  };
  var graticule = MapShaper.importGeoJSON(geojson, {});
  graticule.layers[0].name = 'graticule';
  return graticule;
};

MapShaper.graticuleFeature = function(coords, o) {
  return {
    type: 'Feature',
    properties: o,
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };
};

MapShaper.createMeridian = function(x, ymin, ymax, precision) {
  var coords = [];
  for (var y = ymin; y < ymax; y += precision) {
    coords.push([x, y]);
  }
  coords.push([x, ymax]);
  return MapShaper.graticuleFeature(coords, {type: 'meridian', value: x});
};

MapShaper.createParallel = function(y, xmin, xmax, precision) {
  var coords = [];
  for (var x = xmin; x < xmax; x += precision) {
    coords.push([x, y]);
  }
  coords.push([xmax, y]);
  return MapShaper.graticuleFeature(coords, {type: 'parallel', value: y});
};
