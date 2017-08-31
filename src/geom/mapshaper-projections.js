/* @requires mapshaper-mixed-projection */

// some aliases
internal.projectionIndex = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +a=6378137 +b=6378137',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: AlbersNYT
};

// This stub is replaced when loaded in GUI, which may need to load some files
internal.initProjLibrary = function(opts, done) {done();};

// Find Proj.4 definition file names in strings like "+init=epsg:3000"
// (Used by GUI, defined here for testing)
internal.findProjLibs = function(str) {
  return utils.uniq(str.match(/\b(esri|epsg|nad83|nad27)(?=:[0-9]+\b)/g) || []);
};

internal.getProjInfo = function(dataset) {
  var P, info;
  try {
    P = internal.getDatasetProjection(dataset);
    if (P) {
      info = internal.crsToProj4(P);
    }
  } catch(e) {}
  return info || "[unknown]";
};

internal.crsToProj4 = function(P) {
  return require('mproj').internal.get_proj_defn(P);
};

internal.crsToPrj = function(P) {
  var wkt;
  try {
    wkt = require('mproj').internal.wkt_from_proj4(P);
  } catch(e) {

  }
  return wkt;
};

internal.crsAreEqual = function(a, b) {
  var str = internal.crsToProj4(a);
  return !!str && str == internal.crsToProj4(b);
};

internal.getProjDefn = function(str) {
  var mproj = require('mproj');
  var defn;
  if (str in internal.projectionIndex) {
    defn = internal.projectionIndex[str];
  } else if (str in mproj.internal.pj_list) {
    defn = '+proj=' + str;
  } else if (/^\+/.test(str)) {
    defn = str;
  } else {
    stop("Unknown projection definition:", str);
  }
  return defn;
};

internal.getProjection = function(str) {
  var defn = internal.getProjDefn(str);
  var P;
  if (typeof defn == 'function') {
    P = defn();
  } else {
    try {
      P = require('mproj').pj_init(defn);
    } catch(e) {
      stop('Unable to use projection', defn, '(' + e.message + ')');
    }
  }
  return P || null;
};

internal.setDatasetProjection = function(dataset, info) {
  dataset.info = dataset.info || {};
  // Assumes that proj4 object is never mutated.
  // TODO: assign a copy of crs (if present)
  dataset.info.crs = info.crs;
  dataset.info.prj = info.prj;
};

internal.getDatasetProjection = function(dataset) {
  var info = dataset.info || {},
      P = info.crs;
  if (!P && info.prj) {
    P = internal.parsePrj(info.prj);
  }
  if (!P && internal.probablyDecimalDegreeBounds(internal.getDatasetBounds(dataset))) {
    // use wgs84 for probable latlong datasets with unknown datums
    P = internal.getProjection('wgs84');
  }
  return P;
};

internal.printProjections = function() {
  var index = require('mproj').internal.pj_list;
  var msg = 'Proj4 projections\n';
  Object.keys(index).sort().forEach(function(id) {
    msg += '  ' + utils.rpad(id, 7, ' ') + '  ' + index[id].name + '\n';
  });
  msg += '\nAliases';
  Object.keys(internal.projectionIndex).sort().forEach(function(n) {
    msg += '\n  ' + n;
  });
  message(msg);
};

internal.translatePrj = function(str) {
  var proj4;
  try {
    proj4 = require('mproj').internal.wkt_to_proj4(str);
  } catch(e) {
    stop('Unusable .prj file (' + e.message + ')');
  }
  return proj4;
};

// Convert contents of a .prj file to a projection object
internal.parsePrj = function(str) {
  return internal.getProjection(internal.translatePrj(str));
};

function AlbersNYT() {
  var mproj = require('mproj');
  var lcc = mproj.pj_init('+proj=lcc +lon_0=-96 +lat_0=39 +lat_1=33 +lat_2=45');
  var aea = mproj.pj_init('+proj=aea +lon_0=-96 +lat_0=37.5 +lat_1=29.5 +lat_2=45.5');
  var mixed = new MixedProjection(aea)
    .addFrame(lcc, {lam: -152, phi: 63}, {lam: -115, phi: 27}, 6e6, 3e6, 0.31, 29.2) // AK
    .addFrame(lcc, {lam: -157, phi: 20.9}, {lam: -106.6, phi: 28.2}, 3e6, 5e6, 0.9, 40); // HI
  return mixed;
}
