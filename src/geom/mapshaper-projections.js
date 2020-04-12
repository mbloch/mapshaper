import { AlbersUSA, parseCustomProjection } from '../geom/mapshaper-custom-projections';
import { stop, print } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

var asyncLoader = null;

var projectionAliases = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +a=6378137 +b=6378137',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: new AlbersUSA() // with default parameters
};

// This stub is replaced when loaded in GUI, which may need to load some files
export function initProjLibrary(opts, done) {
  if (!asyncLoader) return done();
  asyncLoader(opts, done);
}

export function setProjectionLoader(loader) {
  asyncLoader = loader;
}

// Find Proj.4 definition file names in strings like "+init=epsg:3000"
// (Used by GUI, defined here for testing)
export function findProjLibs(str) {
  var matches = str.match(/\b(esri|epsg|nad83|nad27)(?=:[0-9]+\b)/ig) || [];
  return utils.uniq(matches.map(function(str) {return str.toLowerCase();}));
}

// Returns a function for reprojecting [x, y] points; function throws an error
// if the transformation fails
// src, dest: proj4 objects
export function getProjTransform(src, dest) {
  var mproj = require('mproj');
  var clampSrc = isLatLngCRS(src);
  dest = dest.__mixed_crs || dest;
  return function(x, y) {
    var xy;
    if (clampSrc) {
      // snap lng to bounds
      if (x < -180) x = -180;
      else if (x > 180) x = 180;
    }
    xy = [x, y];
    mproj.pj_transform_point(src, dest, xy);
    return xy;
  };
}

// Same as getProjTransform(), but return null if projection fails
// (also faster)
export function getProjTransform2(src, dest) {
  var mproj = require('mproj'),
      xx = [0],
      yy = [0],
      preK = src.is_latlong ? mproj.internal.DEG_TO_RAD : 1,
      postK = dest.is_latlong ? mproj.internal.RAD_TO_DEG : 1,
      clampSrc = isLatLngCRS(src);

  return function(x, y) {
    var fail;
    if (clampSrc) {
      // snap lng to bounds
      if (x < -180) x = -180;
      else if (x > 180) x = 180;
    }
    xx[0] = x * preK;
    yy[0] = y * preK;
    try {
      dest = dest.__mixed_crs || dest;
      mproj.pj_transform(src, dest, xx, yy);
      fail = xx[0] == Infinity; // mproj invalid coord value
    } catch(e) {
      fail = true;
    }
    return fail ? null : [xx[0] * postK, yy[0] * postK];
  };
}

export function toLngLat(xy, P) {
  var proj;
  if (isLatLngCRS(P)) {
    return xy.concat();
  }
  proj = getProjInfo(P, getCRS('wgs84'));
  return proj(xy);
}

export function getProjInfo(dataset) {
  var P, info;
  try {
    P = getDatasetCRS(dataset);
    if (P) {
      info = crsToProj4(P);
    }
  } catch(e) {}
  return info || "[unknown]";
}

export function crsToProj4(P) {
  return require('mproj').internal.get_proj_defn(P);
}

export function crsToPrj(P) {
  var wkt;
  try {
    wkt = require('mproj').internal.wkt_from_proj4(P);
  } catch(e) {
    // console.log(e)
  }
  return wkt;
}

export function crsAreEqual(a, b) {
  var str = crsToProj4(a);
  return !!str && str == crsToProj4(b);
}

export function getProjDefn(str) {
  var mproj = require('mproj');
  var defn;
  if (looksLikeProj4String(str)) {
    defn = str;
  } else if (str in mproj.internal.pj_list) {
    defn = '+proj=' + str;
  } else if (str in projectionAliases) {
    defn = projectionAliases[str];  // defn is a function
  } else if (looksLikeInitString(str)) {
    defn = '+init=' + str.toLowerCase();
  } else {
    defn = parseCustomProjection(str);
  }
  if (!defn) {
    stop("Unknown projection definition:", str);
  }
  return defn;
}

function looksLikeInitString(str) {
  return /^(esri|epsg|nad83|nad27):[0-9]+$/i.test(String(str));
}

export function looksLikeProj4String(str) {
  return /^(\+[^ ]+ *)+$/.test(str);
}

export function getCRS(str) {
  var defn = getProjDefn(str);  // defn is a string or a Proj object
  var P;
  if (!utils.isString(defn)) {
    P = defn;
  } else {
    try {
      P = require('mproj').pj_init(defn);
    } catch(e) {
      stop('Unable to use projection', defn, '(' + e.message + ')');
    }
  }
  return P || null;
}

export function requireProjectedDataset(dataset) {
  if (isLatLngCRS(getDatasetCRS(dataset))) {
    stop("Command requires a target with projected coordinates (not lat-long)");
  }
}

// @info: info property of source dataset (instead of crs object, so wkt string
//        can be preserved if present)
export function setDatasetCRS(dataset, info) {
  dataset.info = dataset.info || {};
  // Assumes that proj4 object is never mutated.
  // TODO: assign a copy of crs (if present)
  dataset.info.crs = info.crs;
  dataset.info.prj = info.prj;
}

export function getDatasetCRS(dataset) {
  var info = dataset.info || {},
      P = info.crs;
  if (!P && info.prj) {
    P = parsePrj(info.prj);
  }
  if (!P && probablyDecimalDegreeBounds(getDatasetBounds(dataset))) {
    // use wgs84 for probable latlong datasets with unknown datums
    P = getCRS('wgs84');
  }
  return P;
}

// Assumes conformal projections; consider returning average of vertical and
// horizontal scale factors.
// x, y: a point location in projected coordinates
// Returns k, the ratio of coordinate distance to distance on the ground
export function getScaleFactorAtXY(x, y, crs) {
  var proj = require('mproj');
  var dist = 1;
  var lp = proj.pj_inv_deg({x: x, y: y}, crs);
  var lp2 = proj.pj_inv_deg({x: x + dist, y: y}, crs);
  var k = dist / geom.greatCircleDistance(lp.lam, lp.phi, lp2.lam, lp2.phi);
  return k;
}

export function isProjectedCRS(P) {
  return !isLatLngCRS(P);
}

export function isLatLngCRS(P) {
  return P && P.is_latlong || false;
}

export function printProjections() {
  var index = require('mproj').internal.pj_list;
  var msg = 'Proj4 projections\n';
  Object.keys(index).sort().forEach(function(id) {
    msg += '  ' + utils.rpad(id, 7, ' ') + '  ' + index[id].name + '\n';
  });
  msg += '\nAliases';
  Object.keys(projectionAliases).sort().forEach(function(n) {
    msg += '\n  ' + n;
  });
  print(msg);
}

export function translatePrj(str) {
  var proj4;
  try {
    proj4 = require('mproj').internal.wkt_to_proj4(str);
  } catch(e) {
    stop('Unusable .prj file (' + e.message + ')');
  }
  return proj4;
}

// Convert contents of a .prj file to a projection object
export function parsePrj(str) {
  return getCRS(translatePrj(str));
}
