import { AlbersUSA, parseCustomProjection } from '../crs/mapshaper-custom-projections';
import { stop, print } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { getStashedVar } from '../mapshaper-stash';
import req from '../mapshaper-require';

var mproj = req('mproj');

var asyncLoader = null;

var projectionAliases = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +a=6378137 +b=6378137',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: AlbersUSA
};

export async function initProjLibrary(opts) {
  if (asyncLoader) await asyncLoader(opts);
}

// used by web UI to support loading projection assets asyncronously
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
  var xx = [0],
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
  proj = getProjTransform(P, parseCrsString('wgs84'));
  return proj(xy[0], xy[1]);
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
  return mproj.internal.get_proj_defn(P);
}

export function crsToPrj(P) {
  var wkt;
  try {
    wkt = mproj.internal.wkt_from_proj4(P);
  } catch(e) {
    // console.log(e)
  }
  return wkt;
}

export function crsAreEqual(a, b) {
  var str = crsToProj4(a);
  return !!str && str == crsToProj4(b);
}

export function isProjAlias(str) {
  return str in projectionAliases;
}

export function getProjDefn(str) {
  var defn;
  // prepend '+proj=' to bare proj names
  str = str.replace(/(^| )([\w]+)($| )/, function(a, b, c, d) {
    if (c in mproj.internal.pj_list) {
      return b + '+proj=' + c + d;
    }
    return a;
  });
  if (looksLikeProj4String(str)) {
    defn = str;
  } else if (isProjAlias(str)) {
    defn = projectionAliases[str];
    if (utils.isFunction(defn)) {
      defn = defn();
    }
  } else if (looksLikeInitString(str)) {
    defn = '+init=' + str.toLowerCase();
  } else if (str in (getStashedVar('defs') || {})) {
    // a proj4 alias could be dynamically created in a -calc expression
    defn = getStashedVar('defs')[str];
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

export function getCrsInfo(str) {
  return {
    crs_string: str,
    crs: parseCrsString(str)
  };
}

export function parseCrsString(str) {
  var defn = getProjDefn(str);  // defn is a string or a Proj object
  var P;
  if (!utils.isString(defn)) {
    P = defn;
  } else {
    try {
      P = mproj.pj_init(defn);
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
export function setDatasetCrsInfo(dataset, crsInfo) {
  crsInfo = crsInfo || {}; // also accepts null/unknown crs info
  dataset.info = dataset.info || {};
  // Assumes that proj4 object is never mutated.
  // TODO: assign a copy of crs (if present)
  dataset.info.crs = crsInfo.crs;
  dataset.info.prj = crsInfo.prj;
  dataset.info.crs_string = crsInfo.crs_string;
  return dataset;
}

export function getDatasetCrsInfo(dataset) {
  var info = dataset.info || {},
      P = info.crs,
      str = info.crs_string;
  if (!P && info.prj) {
    P = parseCrsString(translatePrj(info.prj));
  }
  if (!P && probablyDecimalDegreeBounds(getDatasetBounds(dataset))) {
    // use wgs84 for probable latlong datasets with unknown datums
    str = 'wgs84';
    P = parseCrsString(str);
  }
  return {
    crs: P || null,
    crs_string: str,
    prj: info.prj
  };
}

export function getDatasetCRS(dataset) {
  return getDatasetCrsInfo(dataset).crs;
}

export function requireDatasetsHaveCompatibleCRS(arr) {
  arr.reduce(function(memo, dataset) {
    var P = getDatasetCRS(dataset);
    if (memo && P) {
      if (isLatLngCRS(memo) != isLatLngCRS(P)) {
        stop("Unable to combine projected and unprojected datasets");
      }
    }
    return P || memo;
  }, null);
}

// Assumes conformal projections; consider returning average of vertical and
// horizontal scale factors.
// x, y: a point location in projected coordinates
// Returns k, the ratio of coordinate distance to distance on the ground
export function getScaleFactorAtXY(x, y, crs) {
  var dist = 1;
  var lp = mproj.pj_inv_deg({x: x, y: y}, crs);
  var lp2 = mproj.pj_inv_deg({x: x + dist, y: y}, crs);
  var k = dist / geom.greatCircleDistance(lp.lam, lp.phi, lp2.lam, lp2.phi);
  return k;
}

export function isProjectedCRS(P) {
  return !isLatLngCRS(P);
}

export function isInvertibleCRS(P) {
  if (!P || !P.inv) return false;
  return true;
}

export function isLatLngCRS(P) {
  return P && P.is_latlong || false;
}

export function isWGS84(P) {
  if (!isLatLngCRS(P)) return false;
  var proj4 = crsToProj4(P);
  return proj4.toLowerCase().includes('84');
}

export function isWebMercator(P) {
  if (!P) return false;
  var str = crsToProj4(P);
  // e.g. +proj=merc +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +wktext +a=6378137 +b=6378137 +nadgrids=@null
  // e.g. +proj=merc +a=6378137 +b=6378137
  // TODO: support  https://proj.org/operations/projections/webmerc.html
  return str.includes('+proj=merc') && str.includes('+a=6378137') && str.includes('+b=6378137');
}

export function isLatLngDataset(dataset) {
  return isLatLngCRS(getDatasetCRS(dataset));
}

export function printProjections() {
  var index = mproj.internal.pj_list;
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
    proj4 = mproj.internal.wkt_to_proj4(str);
  } catch(e) {
    stop('Unusable .prj file (' + e.message + ')');
  }
  return proj4;
}

// Convert contents of a .prj file to a projection object
export function parsePrj(str) {
  return parseCrsString(translatePrj(str));
}
