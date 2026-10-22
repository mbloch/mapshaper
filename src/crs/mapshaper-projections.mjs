import { AlbersUSA, parseCustomProjection } from '../crs/mapshaper-custom-projections';
import { getLoggingSetter, setLoggingForCLI, stop, print } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetBounds, datasetIsEmpty } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { getStashedVar } from '../mapshaper-stash';
import req from '../mapshaper-require';
import { registerDymaxionProjections } from './mapshaper-dymaxion';
import { registerButterflyProjections } from './mapshaper-butterfly-projections';
import { registerNarukawa2022Projection } from './mapshaper-narukawa2022';
import { registerLeeTetrahedralProjections } from './mapshaper-lee-tetrahedral';
import { registerHemisphereProjections } from './mapshaper-hemispheres';

var mproj = req('mproj');
// Projections that mapshaper registers are not in this list
var mprojIds = mproj ? Object.keys(mproj.internal.pj_list) : [];
// Projections in mproj that are not in PROJ
var MPROJ_ONLY_IDS = ['cupola', 'gilbert', 'hill'];
// Used internally (e.g. by albersusa)
var HIDDEN_IDS = ['mixed'];
registerDymaxionProjections(mproj);
registerButterflyProjections(mproj);
registerNarukawa2022Projection(mproj);
registerLeeTetrahedralProjections(mproj);
registerHemisphereProjections(mproj);

var asyncLoader = null;

var projectionAliases = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +a=6378137 +b=6378137',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: AlbersUSA
};

// Aliases of mapshaper-only projections that are not in mproj
var compositeProjectionNames = {
  albersusa: 'U.S. composite (Albers Equal Area)'
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
  return projectPoint(xy, P, parseCrsString('wgs84'));
}

export function projectPoint(xy, crsFrom, crsTo) {
  if (crsHaveSameTransform(crsFrom, crsTo)) return xy.concat();
  var proj = getProjTransform2(crsFrom, crsTo);
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

export function crsToWkt2(P) {
  var wkt;
  try {
    wkt = mproj.internal.wkt2_from_proj4(P);
  } catch(e) {
    // WKT2 export may be unavailable for some custom definitions.
  }
  return wkt;
}

export function crsAreEqual(a, b) {
  var str = crsToProj4(a);
  return !!str && str == crsToProj4(b);
}

export function crsHaveSameTransform(a, b) {
  var str = crsToNormalizedProj4(a);
  return !!str && str == crsToNormalizedProj4(b);
}

// True only if both CRSs can be compared and they differ
export function crsTransformsDiffer(a, b) {
  var strA = crsToNormalizedProj4(a);
  var strB = crsToNormalizedProj4(b);
  return !!strA && !!strB && strA != strB;
}

function crsToNormalizedProj4(P) {
  var normalizer = mproj.internal && mproj.internal.get_normalized_proj_defn;
  return P && normalizer ? normalizer(P) : null;
}

export function isProjAlias(str) {
  return str in projectionAliases;
}

// str: projection string in a variety of forms accepted by the -proj command
//   (e.g. alias, EPSG:XXXX, Proj.4 string, bare Proj.4 projection name)
// Returns a properly formatted Proj.4 string or an instantiated mproj object
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
  if (utils.isString(defn)) {
    defn = addDefaultProjectionParams(defn);
  }
  return defn;
}

function addDefaultProjectionParams(defn) {
  var oceanic = /(^| )\+proj=(igh_o|imoll_o)(?= |$)/.test(defn);
  var hasLon0 = /(^| )\+lon_0=/.test(defn);
  return oceanic && !hasLon0 ? defn + ' +lon_0=-160' : defn;
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

// Parse a CRS string that may well be unusable, without the failure reaching
// the user: returns null instead of stopping. This is for CRS metadata read out
// of a file, where mapshaper is guessing and the caller has a fallback. (In the
// web app a stop() shows a modal popup as it throws, which is too much for a
// guess that did not come off, and interrupts whatever the user was doing.)
export function tryParseCrsString(str) {
  var revertLogging = getLoggingSetter();
  var crs = null;
  setLoggingForCLI();
  try {
    crs = parseCrsString(str);
  } catch(e) {
    // an unparseable string is one of the expected outcomes here
  }
  revertLogging();
  return crs;
}

// The WKT counterpart of tryParseCrsString(), for a projection read out of a
// .prj or .aux.xml file, in either WKT dialect. Returns the proj4 equivalent of
// the WKT, or null.
export function tryParseWktToProj(str) {
  var revertLogging = getLoggingSetter();
  var proj = null;
  setLoggingForCLI();
  try {
    proj = wktToProj(str);
  } catch(e) {
    // WKT that cannot be converted is one of the expected outcomes here
  }
  revertLogging();
  return proj || null;
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

function copyCrsProperties(obj) {
  var props = 'crs,crs_string,wkt1,geopackage_crs,flatgeobuf_crs'.split(',');
  return Object.fromEntries(props.map(k => [k, obj[k]]));
}

export function setDatasetCrsInfo(dataset, crsInfo) {
  crsInfo = crsInfo || {}; // also accepts null/unknown crs info
  dataset.info = Object.assign(dataset.info || {}, copyCrsProperties(crsInfo));
  return dataset;
}

export function getDatasetCrsInfo(dataset) {
  var info = copyCrsProperties(dataset.info || {});
  if (!info.crs && info.wkt1) {
    info.crs = parseCrsString(wkt1ToProj(info.wkt1));
  } else if (!info.crs && info.crs_string) {
    info.crs = parseCrsString(info.crs_string);
  }
  if (!info.crs) {
    if (probablyDecimalDegreeBounds(getDatasetBounds(dataset))) {
      // use wgs84 for probable latlong datasets with unknown datums
      info.crs_string = 'wgs84';
      info.crs = parseCrsString(info.crs_string);
    }
  }
  return info;
}

export function getDatasetCRS(dataset) {
  return getDatasetCrsInfo(dataset).crs;
}

export function requireDatasetsHaveCompatibleCRS(arr, msg) {
  arr.reduce(function(memo, dataset) {
    var P = getDatasetCRS(dataset);
    if (memo && P) {
      if (isLatLngCRS(memo) != isLatLngCRS(P)) {
        stop(msg || "Unable to combine projected and unprojected datasets");
      }
    }
    return P || memo;
  }, null);
}

// Overlay sources (-clip, -erase, -join, ...) are stricter than merging:
// projected data must also be in the same projection. (Lat-long data in
// different datums can still be combined.)
export function requireOverlaySourceCRS(targetDataset, sourceDataset) {
  var P = getDatasetCRS(targetDataset);
  var Q = getDatasetCRS(sourceDataset);
  requireDatasetsHaveCompatibleCRS([targetDataset, sourceDataset]);
  if (P && Q && !isLatLngCRS(P) && !isLatLngCRS(Q) && crsTransformsDiffer(P, Q)) {
    stop("Unable to combine datasets that use different projections");
  }
}

// Assumes conformal projections; consider returning average of vertical and
// horizontal scale factors.
// x, y: a point location in projected coordinates
// Returns k, the ratio of coordinate distance to distance on the ground
// Returns NaN if the scale factor can't be calculated, e.g. if a CRS without
// an inverse has no location at x, y (such as a gap in an interrupted projection)
export function getScaleFactorAtXY(x, y, crs) {
  var meters = 1;
  var lp, lp2, k;
  if (isInvertibleCRS(crs)) {
    lp = mproj.pj_inv_deg({x: x, y: y}, crs);
    lp2 = mproj.pj_inv_deg({x: x + meters / crs.to_meter, y: y}, crs);
  } else if (numericScaleCache.crs == crs && numericScaleCache.x === x && numericScaleCache.y === y) {
    return numericScaleCache.k;
  } else {
    // Forward projections can be noisy at the scale of centimeters (Markley's
    // is off by up to half a meter), so the numerical inverse is only asked
    // to be accurate to a meter, over a 10 km step: k is good to about 1e-4.
    meters = 10000;
    lp = invertNumerically(x, y, crs, null, 1 / crs.to_meter);
    lp2 = lp && invertNumerically(x + meters / crs.to_meter, y, crs, lp, 1 / crs.to_meter);
    k = lp2 ? meters / geom.greatCircleDistance(lp.lam, lp.phi, lp2.lam, lp2.phi) : NaN;
    // the GUI asks again on every redraw of the map
    numericScaleCache = {crs: crs, x: x, y: y, k: k};
    return k;
  }
  return meters / geom.greatCircleDistance(lp.lam, lp.phi, lp2.lam, lp2.phi);
}

var numericScaleCache = {};

// Finds the lng/lat location of projected point x, y using only the forward
// projection, for a CRS that has no inverse.
// guess (optional): {lam, phi} of a nearby location, in degrees
// tolerance (optional): how far from x, y the location may project, in CRS
//   units. Should be well above the noise in the forward projection.
// Returns {lam, phi} in degrees, or null if no location was found
export function invertNumerically(x, y, crs, guess, tolerance) {
  var starts = guess ? [guess] : findNearestGridLocations(x, y, crs, 4);
  var p = null;
  if (tolerance > 0 === false) tolerance = 0.01 / crs.to_meter;
  for (var i = 0; i < starts.length && !p; i++) {
    p = refineInverse(x, y, crs, starts[i], tolerance);
  }
  return p;
}

// Newton's method, starting from location @p
function refineInverse(x, y, crs, p, tolerance) {
  var xy = forwardOrNull(p.lam, p.phi, crs);
  var err = xy ? Math.hypot(xy.x - x, xy.y - y) : Infinity;
  var i, j, hlam, hphi, xyLam, xyPhi, dxdlam, dydlam, dxdphi, dydphi,
      det, dlam, dphi, p2, xy2, err2;
  for (i = 0; i < 50 && err > tolerance; i++) {
    // Finite-difference steps (in degrees) point away from the poles
    // and the antimeridian, to stay inside the projection's domain. About
    // 100 m, so that noise in the forward projection barely affects the
    // derivatives; an approximate derivative only slows convergence.
    hlam = p.lam > 0 ? -1e-3 : 1e-3;
    hphi = p.phi > 0 ? -1e-3 : 1e-3;
    xyLam = forwardOrNull(p.lam + hlam, p.phi, crs);
    xyPhi = forwardOrNull(p.lam, p.phi + hphi, crs);
    if (!xyLam || !xyPhi) return null;
    dxdlam = (xyLam.x - xy.x) / hlam;
    dydlam = (xyLam.y - xy.y) / hlam;
    dxdphi = (xyPhi.x - xy.x) / hphi;
    dydphi = (xyPhi.y - xy.y) / hphi;
    det = dxdlam * dydphi - dxdphi * dydlam;
    if (!det) return null;
    dlam = ((x - xy.x) * dydphi - dxdphi * (y - xy.y)) / det;
    dphi = (dxdlam * (y - xy.y) - (x - xy.x) * dydlam) / det;
    // halve the Newton step until it reduces the error
    for (j = 0; j < 20; j++) {
      p2 = {lam: p.lam + dlam, phi: Math.max(-90, Math.min(90, p.phi + dphi))};
      xy2 = forwardOrNull(p2.lam, p2.phi, crs);
      err2 = xy2 ? Math.hypot(xy2.x - x, xy2.y - y) : Infinity;
      if (err2 < err) break;
      dlam /= 2;
      dphi /= 2;
    }
    if (err2 < err === false) return null;
    p = p2;
    xy = xy2;
    err = err2;
  }
  return err > tolerance ? null : p;
}

// Starting points for invertNumerically(): the @n grid locations that project
// nearest to x, y. Newton's method can fail from a start beside a seam, and
// seams, poles and central meridians tend to fall on round-numbered
// coordinates, so the grid is offset from them.
function findNearestGridLocations(x, y, crs, n) {
  var found = [];
  var lam, phi, xy;
  for (lam = -177.5; lam < 180; lam += 5) {
    for (phi = -87.5; phi < 90; phi += 5) {
      xy = forwardOrNull(lam, phi, crs);
      if (xy) found.push({lam: lam, phi: phi, dist: Math.hypot(xy.x - x, xy.y - y)});
    }
  }
  return found.sort(function(a, b) { return a.dist - b.dist; }).slice(0, n);
}

function forwardOrNull(lam, phi, crs) {
  var xy;
  try {
    xy = mproj.pj_fwd_deg({lam: lam, phi: phi}, crs);
  } catch(e) {
    return null;
  }
  return xy && isFinite(xy.x) && isFinite(xy.y) ? xy : null;
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
  var lists = getProjectionCodeLists();
  var msg = formatProjectionList('Projection codes (PROJ)', lists.proj) + '\n' +
    formatProjectionList('Projection codes (mapshaper only)', lists.mapshaper) + '\n' +
    'Aliases';
  Object.keys(projectionAliases).sort().forEach(function(n) {
    if (n in compositeProjectionNames) return;
    msg += '\n  ' + n;
  });
  print(msg);

  function formatProjectionList(title, ids) {
    var width = Math.max.apply(null, ids.map(function(id) { return id.length; }));
    return ids.reduce(function(memo, id) {
      var name = index[id] ? index[id].name : compositeProjectionNames[id];
      return memo + '  ' + utils.rpad(id, width, ' ') + '  ' + name + '\n';
    }, title + '\n');
  }
}

// Returns sorted lists of the projection codes that PROJ also supports and the
// ones that only mapshaper supports
export function getProjectionCodeLists() {
  var lists = {proj: [], mapshaper: []};
  var ids = Object.keys(mproj.internal.pj_list).concat(Object.keys(compositeProjectionNames));
  ids.sort().forEach(function(id) {
    if (HIDDEN_IDS.includes(id)) return;
    if (MPROJ_ONLY_IDS.includes(id) || !mprojIds.includes(id)) {
      lists.mapshaper.push(id);
    } else {
      lists.proj.push(id);
    }
  });
  return lists;
}

export function wkt1ToProj(str) {
  var proj4;
  try {
    proj4 = mproj.internal.wkt_to_proj4(str);
  } catch(e) {
    stop('Unusable .prj file (' + e.message + ')');
  }
  return proj4;
}

export function wkt2ToProj(str) {
  var proj4;
  try {
    proj4 = mproj.internal.wkt2_to_proj4(str);
  } catch(e) {
    stop('Unusable WKT2 CRS (' + e.message + ')');
  }
  return proj4;
}

export function wktToProj(str) {
  var proj4;
  try {
    proj4 = mproj.internal.wkt2_to_proj4(str);
  } catch(e) {
    try {
      proj4 = mproj.internal.wkt_to_proj4(str);
    } catch(e2) {
      stop('Unusable WKT CRS (' + e2.message + ')');
    }
  }
  return proj4;
}

// Convert contents of a .prj file to a projection object
export function parsePrj(str) {
  return parseCrsString(wkt1ToProj(str));
}

export function parseWkt(str) {
  return parseCrsString(wktToProj(str));
}

// Extract an EPSG (or other authority) code from a short string like
// "epsg:4326" or "ESRI:54030". Returns {org, code} or null.
export function parseAuthorityCodeString(str) {
  if (!str || typeof str != 'string') return null;
  var match = str.match(/^([a-z]+):(\d+)$/i);
  if (!match) return null;
  var code = +match[2];
  if (!code) return null;
  return {
    org: match[1].toUpperCase(),
    code: code
  };
}

// Extract the top-level AUTHORITY clause from a WKT1 .prj string.
// Returns {org, code} or null. Skips nested AUTHORITY clauses on inner
// elements like the datum or unit, which would otherwise produce the
// wrong code for projected CRSes.
export function parseAuthorityCodeFromWkt(wkt) {
  if (!wkt || typeof wkt != 'string') return null;
  var depth = 0;
  var inQuote = false;
  for (var i = 0; i < wkt.length; i++) {
    var c = wkt.charAt(i);
    if (c == '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (c == '[' || c == '(') {
      depth++;
      continue;
    }
    if (c == ']' || c == ')') {
      depth--;
      continue;
    }
    if (depth != 1) continue;
    var slice = wkt.slice(i, i + 10).toUpperCase();
    if (slice == 'AUTHORITY[' || slice.slice(0, 10) == 'AUTHORITY(') {
      var match = wkt.slice(i).match(/^AUTHORITY\s*[[(]\s*"([^"]+)"\s*,\s*"?(\d+)"?\s*[\])]/i);
      if (match) {
        return {
          org: String(match[1]).toUpperCase(),
          code: +match[2]
        };
      }
    }
  }
  return null;
}
