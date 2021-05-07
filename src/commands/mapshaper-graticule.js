import { importGeoJSON } from '../geojson/geojson-import';
import { projectDataset } from '../commands/mapshaper-proj';
import { getDatasetCRS, getCRS } from '../crs/mapshaper-projections';
import { isRotatedNormalProjection } from '../crs/mapshaper-proj-info';
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
  if (isRotatedNormalProjection(P)) {
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
  var xn = Math.round(360 / xstep) + (isRotated ? 0 : 1);
  var yn = Math.round(180 / ystep) + 1;
  var xx = utils.range(xn, -180, xstep);
  var yy = utils.range(yn, -90, ystep);
  var meridians = [];
  var parallels = [];
  xx.forEach(function(x) {
    if (isRotated && Math.abs(x - antimeridian) < xstep / 5) {
      // skip meridians that are close to the enclosure of a rotated graticule
      return null;
    }
    createMeridian(x, x % xstepMajor === 0);
  });
  if (isRotated) {
    // add meridian lines that will appear on the left and right sides of the
    // projected graticule
    // offset the lines by a larger amount than the width of any cuts
    createMeridian(antimeridian - 2e-8, true);
    createMeridian(antimeridian + 2e-8, true);
  }
  yy.forEach(function(y) {
    createParallel(y);
  });
  var geojson = {
    type: 'FeatureCollection',
    features: meridians.concat(parallels)
  };
  var graticule = importGeoJSON(geojson, {});
  graticule.layers[0].name = 'graticule';
  return graticule;

  function createMeridian(x, extended) {
    createMeridianPart(x, -80, 80);
    if (extended) {
      // adding extensions as separate parts, so if the polar coordinates
      // fail to project, at least the rest of the meridian line will remain
      createMeridianPart(x, -90, -80);
      createMeridianPart(x, 80, 90);
    }
  }

  function createMeridianPart(x, ymin, ymax) {
    var coords = [];
    for (var y = ymin; y < ymax; y += precision) {
      coords.push([x, y]);
    }
    coords.push([x, ymax]);
    meridians.push(graticuleFeature(coords, {type: 'meridian', value: x}));
  }

  function createParallel(y) {
    var coords = [];
    var xmin = -180;
    var xmax = 180;
    for (var x = xmin; x < xmax; x += precision) {
      coords.push([x, y]);
    }
    coords.push([xmax, y]);
    parallels.push(graticuleFeature(coords, {type: 'parallel', value: y}));
  }
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
