/* @requires mapshaper-mixed-projection */

MapShaper.projectionIndex = null;

MapShaper.getProjection = function(name, opts) {
  var mproj = require('mproj');
  var P;
  if (name in mproj.internal.pj_list) {
    name = '+proj=' + name;
  }
  if (/^\+/.test(name)) {
    try {
      P = mproj.pj_init(name);
    } catch(e) {
      stop('Unable to use projection', name, '(' + e.message + ')');
    }
  } else {
    MapShaper.initProjections();
    P = MapShaper.projectionIndex[name.toLowerCase().replace(/-_ /g, '')];
  }
  if (P) {
    // kludge to prevent wrapping
    P.over_orig = P.over;
    P.over = true;
  }
  return P;
};

MapShaper.printProjections = function() {
  MapShaper.initProjections();

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

MapShaper.initProjections = function() {
  if (MapShaper.projectionIndex) return;
  var mproj = require('mproj');
  var index = MapShaper.projectionIndex = {};
  // aliases for some common projections
  index.robinson = mproj.pj_init('+proj=robin +datum=WGS84');
  index.webmercator = mproj.pj_init('+proj=merc +ellps=sphere');
  index.albersusa = new AlbersNYT();
  index.wgs84 = mproj.pj_init('+proj=longlat +datum=WGS84');
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
