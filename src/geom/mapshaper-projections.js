/* @requires mapshaper-custom-projections */

internal.projectionAliases = {
  robinson: '+proj=robin +datum=WGS84',
  webmercator: '+proj=merc +a=6378137 +b=6378137',
  wgs84: '+proj=longlat +datum=WGS84',
  albersusa: new AlbersUSA() // with default parameters
};

// This stub is replaced when loaded in GUI, which may need to load some files
internal.initProjLibrary = function(opts, done) {done();};

// Find Proj.4 definition file names in strings like "+init=epsg:3000"
// (Used by GUI, defined here for testing)
internal.findProjLibs = function(str) {
  var matches = str.match(/\b(esri|epsg|nad83|nad27)(?=:[0-9]+\b)/ig) || [];
  return utils.uniq(matches.map(function(str) {return str.toLowerCase();}));
};



internal.looksLikeInitString = function(str) {
  return /^(esri|epsg|nad83|nad27):[0-9]+$/i.test(String(str));
};

// Returns a function for reprojecting [x, y] points; function throws an error
// if the transformation fails
// src, dest: proj4 objects
internal.getProjTransform = function(src, dest) {
  var mproj = require('mproj');
  var clampSrc = internal.isLatLngCRS(src);
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
};

// Same as getProjTransform(), but return null if projection fails
// (also faster)
internal.getProjTransform2 = function(src, dest) {
  var mproj = require('mproj'),
      xx = [0],
      yy = [0],
      preK = src.is_latlong ? mproj.internal.DEG_TO_RAD : 1,
      postK = dest.is_latlong ? mproj.internal.RAD_TO_DEG : 1,
      clampSrc = internal.isLatLngCRS(src);

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
};

internal.toLngLat = function(xy, P) {
  var proj;
  if (isLatLngCRS(P)) {
    return xy.concat();
  }
  proj = internal.getProjInfo(P, internal.getCRS('wgs84'));
  return proj(xy);
};

internal.getProjInfo = function(dataset) {
  var P, info;
  try {
    P = internal.getDatasetCRS(dataset);
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
    // console.log(e)
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
  if (internal.looksLikeProj4String(str)) {
    defn = str;
  } else if (str in mproj.internal.pj_list) {
    defn = '+proj=' + str;
  } else if (str in internal.projectionAliases) {
    defn = internal.projectionAliases[str];  // defn is a function
  } else if (internal.looksLikeInitString(str)) {
    defn = '+init=' + str.toLowerCase();
  } else {
    defn = internal.parseCustomProjection(str);
  }
  if (!defn) {
    stop("Unknown projection definition:", str);
  }
  return defn;
};

internal.looksLikeProj4String = function(str) {
  return /^(\+[^ ]+ *)+$/.test(str);
};

internal.getCRS = function(str) {
  var defn = internal.getProjDefn(str);  // defn is a string or a Proj object
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
};

// @info: info property of source dataset (instead of crs object, so wkt string
//        can be preserved if present)
internal.setDatasetCRS = function(dataset, info) {
  dataset.info = dataset.info || {};
  // Assumes that proj4 object is never mutated.
  // TODO: assign a copy of crs (if present)
  dataset.info.crs = info.crs;
  dataset.info.prj = info.prj;
};

internal.getDatasetCRS = function(dataset) {
  var info = dataset.info || {},
      P = info.crs;
  if (!P && info.prj) {
    P = internal.parsePrj(info.prj);
  }
  if (!P && internal.probablyDecimalDegreeBounds(internal.getDatasetBounds(dataset))) {
    // use wgs84 for probable latlong datasets with unknown datums
    P = internal.getCRS('wgs84');
  }
  return P;
};

// Assumes conformal projections; consider returning average of vertical and
// horizontal scale factors.
// x, y: a point location in projected coordinates
// Returns k, the ratio of coordinate distance to distance on the ground
internal.getScaleFactorAtXY = function(x, y, crs) {
  var proj = require('mproj');
  var dist = 1;
  var lp = proj.pj_inv_deg({x: x, y: y}, crs);
  var lp2 = proj.pj_inv_deg({x: x + dist, y: y}, crs);
  var k = dist / greatCircleDistance(lp.lam, lp.phi, lp2.lam, lp2.phi);
  return k;
};

internal.isProjectedCRS = function(P) {
  return !internal.isLatLngCRS(P);
};

internal.isLatLngCRS = function(P) {
  return P && P.is_latlong || false;
};

internal.printProjections = function() {
  var index = require('mproj').internal.pj_list;
  var msg = 'Proj4 projections\n';
  Object.keys(index).sort().forEach(function(id) {
    msg += '  ' + utils.rpad(id, 7, ' ') + '  ' + index[id].name + '\n';
  });
  msg += '\nAliases';
  Object.keys(internal.projectionAliases).sort().forEach(function(n) {
    msg += '\n  ' + n;
  });
  print(msg);
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
  return internal.getCRS(internal.translatePrj(str));
};
