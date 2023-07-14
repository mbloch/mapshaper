import { importGeoJSON } from '../geojson/geojson-import';
import { projectDataset } from '../commands/mapshaper-proj';
import { getDatasetCrsInfo, setDatasetCrsInfo, getCrsInfo, parseCrsString, isLatLngDataset } from '../crs/mapshaper-projections';
import { isMeridianBounded, getBoundingMeridian } from '../crs/mapshaper-proj-info';
import { getAntimeridian } from '../geom/mapshaper-latlon';
import { getOutlineDataset, getPolygonDataset } from '../crs/mapshaper-proj-extents';
import { densifyPathByInterval } from '../crs/mapshaper-densify';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { buildTopology } from '../topology/mapshaper-topology';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { cleanLayers } from '../commands/mapshaper-clean';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';

cmd.graticule = function(dataset, opts) {
  var name = opts.name || opts.polygon && 'polygon' || 'graticule';
  var graticule, destInfo;
  if (dataset && !isLatLngDataset(dataset)) {
    // project graticule to match dataset
    destInfo = getDatasetCrsInfo(dataset);
    if (!destInfo.crs) stop("Coordinate system is unknown, unable to create a graticule");
    graticule = opts.polygon ?
      createProjectedPolygon(destInfo.crs, opts) :
      createProjectedGraticule(destInfo.crs, opts);
    setDatasetCrsInfo(graticule, destInfo);
  } else {
    graticule = opts.polygon ?
      createUnprojectedPolygon(opts) :
      createUnprojectedGraticule(opts);
    setDatasetCrsInfo(graticule, getCrsInfo('wgs84'));
  }
  graticule.layers[0].name = name;
  return graticule;
};

function createUnprojectedPolygon(opts) {
  var crs = parseCrsString('wgs84');
  return getPolygonDataset(crs, crs, opts);
}

function createProjectedPolygon(dest, opts) {
  var src = parseCrsString('wgs84');
  return getPolygonDataset(src, dest, opts);
}

function createUnprojectedGraticule(opts) {
  var src = parseCrsString('wgs84');
  var graticule = importGeoJSON(createGraticule(src, false, opts));
  return graticule;
}

function createProjectedGraticule(dest, opts) {
  var src = parseCrsString('wgs84');
  // var outline = getOutlineDataset(src, dest, {inset: 0, geometry_type: 'polyline'});
  var outline = getOutlineDataset(src, dest, {});
  var graticule = importGeoJSON(createGraticule(dest, !!outline, opts));
  projectDataset(graticule, src, dest, {no_clip: false}); // TODO: densify?
  if (outline) {
    graticule = addOutlineToGraticule(graticule, outline);
  }
  buildTopology(graticule); // needed for cleaning to work
  cleanLayers(graticule.layers, graticule, {verbose: false});
  return graticule;
}

function addOutlineToGraticule(graticule, outline) {
  var merged = mergeDatasets([graticule, outline]);
  var src = merged.layers.pop();
  var dest = merged.layers[0];
  var records = dest.data.getRecords();
  src.shapes.forEach(function(shp) {
    dest.shapes.push(shp);
    records.push({type: 'outline', value: null});
  });
  return merged;
}

// Create graticule as a polyline dataset
//
function createGraticule(P, outlined, opts) {
  var interval = opts.interval || 10;
  if (![5,10,15,20,30,45].includes(interval)) stop('Invalid interval:', interval);
  var lon0 = P.lam0 * 180 / Math.PI;
  var precision = interval > 10 ? 1 : 0.5; // degrees between each vertex
  var xstep = interval;
  var ystep = interval;
  var xstepMajor = 90;
  var xn = Math.round(360 / xstep);
  var yn = Math.round(180 / ystep) + 1;
  var xx = utils.range(xn, -180 + xstep, xstep);
  var yy = utils.range(yn, -90, ystep);
  var meridians = [];
  var parallels = [];
  var edgeMeridians = isMeridianBounded(P) ? getEdgeMeridians(P) : null;
  xx.forEach(function(x) {
    if (edgeMeridians && (tooClose(x, edgeMeridians[0]) || tooClose(x, edgeMeridians[1]))) {
      return;
    }
    createMeridian(x, x % xstepMajor === 0);
  });

  if (edgeMeridians && !outlined) {
    // add meridian lines that will appear on the left and right sides of the
    // projected graticule
    createMeridian(edgeMeridians[0], true);
    createMeridian(edgeMeridians[1], true);
  }

  yy.forEach(function(y) {
    createParallel(y);
  });

  var geojson = {
    type: 'FeatureCollection',
    features: meridians.concat(parallels)
  };
  return geojson;

  function tooClose(a, b) {
    return Math.abs(a - b) < interval / 5;
  }

  function createMeridian(x, extended) {
    var y0 = ystep <= 15 ? ystep : 0;
    createMeridianPart(x, -90 + y0, 90 - y0);
    if (extended && y0 > 0) {
      // adding extensions as separate parts, so if the polar coordinates
      // fail to project, at least the rest of the meridian line will remain
      createMeridianPart(x, -90, -90 + y0);
      createMeridianPart(x, 90 - y0, 90);
    }
  }

  function createMeridianPart(x, ymin, ymax) {
    var coords = densifyPathByInterval([[x, ymin], [x, ymax]], precision);
    meridians.push(graticuleFeature(coords, {type: 'meridian', value: roundCoord(x)}));
  }

  function createParallel(y) {
    var coords = densifyPathByInterval([[-180, y], [180, y]], precision);
    parallels.push(graticuleFeature(coords, {type: 'parallel', value: y}));
  }
}

// remove tiny offsets
function roundCoord(x) {
  return +x.toFixed(3) || 0;
}

function getEdgeMeridians(P) {
  var lon = getBoundingMeridian(P);
  // offs must be larger than gutter width in mapshaper-spherical-cutting.js
  var offs = 2e-8;
  return lon == 180 ? [-180, 180] : [lon - offs, lon + offs];
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
