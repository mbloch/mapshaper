/* @requires mapshaper-mixed-projection */

// some aliases
MapShaper.projectionIndex = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +ellps=sphere',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: AlbersNYT
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

MapShaper.getDatasetProjInfo = function(dataset) {
  var P = MapShaper.getDatasetProjection(dataset);
  var info;
  if (!P) {

  }
};

MapShaper.printProjections = function() {
  message('Proj4 projections');
  var index = require('mproj').internal.pj_list;
  var msg = Object.keys(index).sort().map(function(id) {
    return '  ' + id + '\t ' + index[id].name;
  }).join('\n');
  message(msg);
  message('\nAliases');
  Object.keys(MapShaper.projectionIndex).sort().forEach(function(n) {
    message('  ' + n);
  });
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
