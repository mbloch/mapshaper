/* @requires mapshaper-mixed-projection */

// some aliases
MapShaper.projectionIndex = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +a=6378137 +b=6378137',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: AlbersNYT
};

MapShaper.getProjInfo = function(dataset) {
  var P, info;
  try {
    P = MapShaper.getDatasetProjection(dataset);
    if (P) {
      info = require('mproj').internal.get_proj_defn(P);
    }
    if (!info) {
      info = "unknown";
    }
  } catch(e) {
    info = e.message;
  }
  return info;
};

MapShaper.getProjDefn = function(str) {
  var mproj = require('mproj');
  var defn;
  if (str in MapShaper.projectionIndex) {
    defn = MapShaper.projectionIndex[str];
  } else if (str in mproj.internal.pj_list) {
    defn = '+proj=' + str;
  } else if (/^\+/.test(str)) {
    defn = str;
  } else {
    stop("Unknown projection definition:", str);
  }
  return defn;
};

MapShaper.getProjection = function(str) {
  var defn = MapShaper.getProjDefn(str);
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

MapShaper.getDatasetProjection = function(dataset) {
  var info = dataset.info || {},
      P = info.crs;
  if (!P && info.input_prj) {
    P = MapShaper.parsePrj(info.input_prj);
  }
  if (!P && MapShaper.probablyDecimalDegreeBounds(MapShaper.getDatasetBounds(dataset))) {
    // use wgs84 for probable latlong datasets with unknown datums
    P = MapShaper.getProjection('wgs84');
  }
  return P;
};

MapShaper.printProjections = function() {
  var index = require('mproj').internal.pj_list;
  message('Proj4 projections');
  Object.keys(index).sort().forEach(function(id) {
    message('  ' + utils.rpad(id, 7, ' ') + '  ' + index[id].name);
  });
  message('\nAliases');
  Object.keys(MapShaper.projectionIndex).sort().forEach(function(n) {
    message('  ' + n);
  });
};

// Convert contents of a .prj file to a projection object
MapShaper.parsePrj = function(str) {
  var proj4;
  try {
    proj4 = require('mproj').internal.wkt_to_proj4(str);
  } catch(e) {
    stop('Unusable .prj file (' + e.message + ')');
  }
  return MapShaper.getProjection(proj4);
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
