import { importGeoJSON } from '../geojson/geojson-import';
import { projectDataset } from '../commands/mapshaper-proj';
import { getDatasetCRS, getCRS } from '../crs/mapshaper-projections';
import { isRotatedWorldProjection } from '../crs/mapshaper-proj-info';
import { getAntimeridian } from '../geom/mapshaper-latlon';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

cmd.graticule = function(dataset, opts) {
  var graticule, dest, src;
  if (dataset) {
    // project graticule to match dataset
    dest = getDatasetCRS(dataset);
    src = getCRS('wgs84');
    if (!dest) stop("Coordinate system is unknown, unable to create a graticule");
    graticule = createGraticuleForProjection(dest, opts);
    projectDataset(graticule, src, dest, {}); // TODO: densify?
  } else {
    graticule = createGraticule(0, opts);
  }
  return graticule;
};

function createGraticuleForProjection(P, opts) {
  var lon0 = 0;
  // see mapshaper-spherical-cutting.js
  if (isRotatedWorldProjection(P)) {
    lon0 = P.lam0 * 180 / Math.PI;
  }
  return createGraticule(lon0, opts);
}

// create graticule as a dataset
function createGraticule(lon0, opts) {
  var precision = 1; // degrees between each vertex
  var xstep = 10;
  var ystep = 10;
  var xstepMajor = 90;
  var antimeridian = getAntimeridian(lon0);
  var isRotated = lon0 != 0;
  var e = 2e-8;
  var xn = Math.round(360 / xstep) + (isRotated ? 0 : 1);
  var yn = Math.round(180 / ystep) + 1;
  var xx = utils.range(xn, -180, xstep);
  var yy = utils.range(yn, -90, ystep);
  var meridians = xx.map(function(x) {
    var ymin = -90,
        ymax = 90;
    if (isRotated && Math.abs(x - antimeridian) < xstep / 5) {
      // skip meridians that are close to the enclosure of a rotated graticule
      return null;
    }
    if (x % xstepMajor !== 0) {
      ymin += ystep;
      ymax -= ystep;
    }
    return createMeridian(x, ymin, ymax, precision);
  }).filter(o => !!o);
  if (isRotated) {
    // this kludge adds
    meridians.push(createMeridian(antimeridian - e, -90, 90, precision));
    meridians.push(createMeridian(antimeridian + e, -90, 90, precision));
  }
  var parallels = yy.map(function(y) {
    return createParallel(y, -180, 180, precision);
  });
  var geojson = {
    type: 'FeatureCollection',
    features: meridians.concat(parallels)
  };
  var graticule = importGeoJSON(geojson, {});
  graticule.layers[0].name = 'graticule';
  return graticule;
}

function graticuleFeature(coords, o) {
  return {
    type: 'Feature',
    properties: o,
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };
}

function createMeridian(x, ymin, ymax, precision) {
  var coords = [];
  for (var y = ymin; y < ymax; y += precision) {
    coords.push([x, y]);
  }
  coords.push([x, ymax]);
  return graticuleFeature(coords, {type: 'meridian', value: x});
}

function createParallel(y, xmin, xmax, precision) {
  var coords = [];
  for (var x = xmin; x < xmax; x += precision) {
    coords.push([x, y]);
  }
  coords.push([xmax, y]);
  return graticuleFeature(coords, {type: 'parallel', value: y});
}
