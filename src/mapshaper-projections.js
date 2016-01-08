/* @requires mapshaper-common */

MapShaper.projectionIndex = {
  webmercator: WebMercator,
  mercator: Mercator,
  albers: AlbersEqualAreaConic,
  albersusa: AlbersNYT,
  albersnyt: AlbersNYT,
  lambertcc: LambertConformalConic,
  transversemercator: TransverseMercator,
  utm: UTM,
  winkeltripel: WinkelTripel,
  robinson: Robinson
};

var DEG2RAD = Math.PI / 180.0;

// @params (optional) array of decimal-degree params that should be present in opts
function initProj(proj, name, opts, params) {
  var base = {
    spherical: false, // Toggle for spherical / ellipsoidal formulas
    x0: 0,   // false easting (used by UTM and some other projections)
    y0: 0,   // false northing
    k0: 1,   // scale factor
    to_meter: 1,
    R: 6378137, // Earth radius / semi-major axis (spherical / ellipsoidal formulas)
    // E: flattening parameter for GRS80 ellipsoid (others not supported)
    E: 0.0818191908426214943348,

    projectLatLng: function(lat, lng, xy) {
      xy = xy || {};
      this.forward(lng * DEG2RAD, lat * DEG2RAD, xy);
      xy.x = (this.R * xy.x + this.x0) / this.to_meter;
      xy.y = (this.R * xy.y + this.y0) / this.to_meter;
      return xy;
    },
    unprojectXY: function(x, y, ll) {
      x = (x * this.to_meter - this.x0) / this.R;
      y = (y * this.to_meter - this.y0) / this.R;
      ll = ll || {};
      this.inverse(x , y, ll);
      ll.lat /= DEG2RAD;
      ll.lng /= DEG2RAD;
      return ll;
    },
    // Approximate the inverse ellipsoidal projection function when
    // the forward ellipsoidal formula and both spheroidal formulas are known.
    // (Many ellipsoidal inverse projections lack closed formulas and/or are a hassle to implement).
    // Accuracy depends on # of iterations, projection, etc.
    // n of 4 gives ~1e-10 degree accuracy with Lambert CC.
    inverseEllApprox: function(x, y, ll) {
      var xy = {};
      var dx = 0, dy = 0;
      var n = 4;
      while (true) {
        this.spherical = true;
        this.inverse(x + dx, y + dy, ll);
        this.spherical = false;
        if (!--n) break;
        this.forward(ll.lng, ll.lat, xy);
        dx += x - xy.x;
        dy += y - xy.y;
      }
    }
  };
  opts = utils.extend({}, opts); // make a copy, don't modify original param
  if (params) {
    // check for required decimal degree parameters and convert to radians
    params.forEach(function(param) {
      if (param in opts === false) {
        throw new Error('[' + name + '] Missing required parameter:', param);
      }
      opts[param] = opts[param] * DEG2RAD;
    });
  }
  utils.extend(proj, base, opts);
  proj.name = name;
  if (opts.units) {
    proj.to_meter = initProjUnits(opts.units);
  }
}

// Return multiplier for converting to meters
function initProjUnits(units) {
  units = units.toLowerCase().replace(/-_/g, '');
  var k = {
      meters: 1,
      feet: 0.3048,
      usfeet: 0.304800609601219 }[units];
  if (!k) {
    throw new Error("[proj] Unsupported units, use to_meter param:", units);
  }
  return 1 / k;
}

function WebMercator() {
  return new Mercator({spherical: true});
}

// Optional param: lng0 (in decimal degrees)
function Mercator(opts) {
  opts = utils.extend({lng0: 0}, opts);
  initProj(this, 'mercator', opts, ['lng0']);
  this.forward = function(lng, lat, xy) {
    xy.x = lng - this.lng0;
    if (!this.spherical) {
      xy.y = Math.log(Math.tan(Math.PI * 0.25 + lat * 0.5) *
        Math.pow((1 - this.E * Math.sin(lat)) / (1 + this.E * Math.sin(lat)), this.E * 0.5));
    } else {
      xy.y = Math.log(Math.tan(Math.PI * 0.25 + lat * 0.5));
    }
  };
  this.inverse = function(x, y, ll) {
    if (!this.spherical) {
      this.inverseEllApprox(x, y, ll);
    } else {
      ll.lng = x + this.lng0;
      ll.lat = Math.PI * 0.5 - 2 * Math.atan(Math.exp(-y));
    }
  };
}

function UTM(opts) {
  var m = /^([\d]+)([NS])$/.exec(opts.zone || "");
  if (!m) {
    throw new Error("[UTM] Expected a UTM zone parameter of the form: 17N");
  }
  var z = parseFloat(m[1]);
  var proj = new TransverseMercator({
    k0: 0.9996,
    lng0: z * 6 - 183,
    lat0: 0,
    x0: 500000,
    y0: m[2] == 'S' ? 1e7 : 0
  });
  return proj;
}

function TransverseMercator(opts) {
  initProj(this, 'transverse_mercator', opts, ['lat0', 'lng0']);
  var _m0 = calcTransMercM(this.lat0, this.E);
  this.forward = function(lng, lat, xy) {
    if (this.spherical) {
      var B = Math.cos(lat) * Math.sin(lng - this.lng0);
      xy.x = 0.5 * this.k0 * Math.log((1 + B) / (1 - B));
      xy.y = this.k0 * (Math.atan(Math.tan(lat) / Math.cos(lng - this.lng0)) - this.lat0);
    } else {
      var e2 = this.E * this.E,
          ep2 = e2 / (1 - e2),
          sinLat = Math.sin(lat),
          cosLat = Math.cos(lat),
          tanLat = Math.tan(lat),
          n = 1 / Math.sqrt(1 - e2 * sinLat * sinLat),
          t = tanLat * tanLat,
          c = ep2 * cosLat * cosLat,
          a = cosLat * (lng - this.lng0),
          a2 = a * a,
          m = calcTransMercM(lat, this.E);
      xy.x = this.k0 * n * (a + a * a2 / 6 * (1 - t + c) +
        a2 * a2 * a / 120 * (5 - 18 * t + t * t + 72 * c - 58 * ep2));
      xy.y = this.k0 * (m - _m0 + n * tanLat *
        (a2 / 2 + a2 * a2 / 24 * (5 - t + 9 * c + 4 * c * c)));
    }
  };
  this.inverse = function(x, y, ll) {
    if (this.spherical) {
      var D = y / this.k0 + this.lat0;
      ll.lat = Math.asin(Math.sin(D) / cosh(x / this.k0));
      ll.lng = this.lng0 + Math.atan(sinh(x / this.k0) / Math.cos(D));
    } else {
      this.inverseEllApprox(x, y, ll);
    }
  };
}

// Authalic sin
function sinh(x) {
  return (Math.exp(x) - Math.exp(-x)) * 0.5;
}

// Authalic cosine
function cosh(x) {
  return (Math.exp(x) + Math.exp(-x)) * 0.5;
}

function calcTransMercM(lat, e) {
  var e2 = e * e,
      e4 = e2 * e2,
      e6 = e4 * e2;
  return (lat * (1 - e2 / 4.0 - 3 * e4 / 64 - 5 * e6 / 256) -
    Math.sin(2 * lat) * (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) +
    Math.sin(4 * lat) * (15 * e4 / 256 + 45 * e6 / 1024) -
    Math.sin(6 * lat) * (35 * e6 / 3072));
}

function AlbersNYT(opts) {
  var lambert = new LambertConformalConic({lng0:-96, lat1:33, lat2:45, lat0:39, spherical: true});
  return new MixedProjection(new AlbersUSA(opts))
    .addFrame(lambert, {lat:63, lng:-152}, {lat:27, lng:-115}, 6e6, 3e6, 0.31, 29.2)  // AK
    .addFrame(lambert, {lat:20.9, lng:-157}, {lat:28.2, lng:-106.6}, 3e6, 5e6, 0.9, 40); // HI
}

function AlbersUSA(opts) {
  return new AlbersEqualAreaConic(utils.extend({lng0:-96, lat1:29.5, lat2:45.5, lat0:37.5}, opts));
}

/*
function LambertUSA() {
  return new LambertConformalConic({lng0:-96, lat1:33, lat2:45, lat0:39});
}
*/

// Parameters (in decimal degrees):
//   lng0  Reference longitude
//   lat0  Reference latitude
//   lat1  First standard parallel
//   lat2  Second standard parallel
function AlbersEqualAreaConic(opts) {
  initProj(this, 'albers', opts, ['lat0', 'lat1', 'lat2', 'lng0']);
  var E = this.E;
  var cosLat1 = Math.cos(this.lat1),
      sinLat1 = Math.sin(this.lat1),
      _sphN = 0.5 * (sinLat1 + Math.sin(this.lat2)),
      _sphC = cosLat1 * cosLat1 + 2.0 * _sphN * sinLat1,
      _sphRho0 = Math.sqrt(_sphC - 2.0 * _sphN * Math.sin(this.lat0)) / _sphN;

  var m1 = calcAlbersMell(E, this.lat1),
      m2 = calcAlbersMell(E, this.lat2),
      q0 = calcAlbersQell(E, this.lat0),
      q1 = calcAlbersQell(E, this.lat1),
      q2 = calcAlbersQell(E, this.lat2),
      _ellN = (m1 * m1 - m2 * m2) / (q2 - q1),
      _ellC = m1 * m1 + _ellN * q1,
      _ellRho0 = Math.sqrt(_ellC - _ellN * q0) / _ellN,
      _ellAuthConst = 1 - (1 - E * E) / (2 * E) * Math.log((1 - E) / (1 + E));

  this.forward = function(lng, lat, xy) {
    var rho, theta, q;
    if (!this.spherical) {
      q = calcAlbersQell(E, lat);
      rho = Math.sqrt(_ellC - _ellN * q) / _ellN;
      theta = _ellN * (lng - this.lng0);
      xy.x = rho * Math.sin(theta);
      xy.y = _ellRho0 - rho * Math.cos(theta);
    } else {
      rho = Math.sqrt(_sphC - 2 * _sphN * Math.sin(lat)) / _sphN;
      theta = _sphN * (lng - this.lng0);
      xy.x = rho * Math.sin(theta);
      xy.y = _sphRho0 - rho * Math.cos(theta);
    }
  };

  this.inverse = function(x, y, ll) {
    var rho, theta, e2, e4, q, beta;
    if (!this.spherical) {
      theta = Math.atan(x / (_ellRho0 - y));
      ll.lng = this.lng0 + theta / _ellN;
      e2 = E * E;
      e4 = e2 * e2;
      rho = Math.sqrt(x * x + (_ellRho0 - y) * (_ellRho0 - y));
      q = (_ellC - rho * rho * _ellN * _ellN) / _ellN;
      beta = Math.asin(q / _ellAuthConst);
      ll.lat = beta + Math.sin(2 * beta) *
        (e2 / 3 + 31 * e4 / 180 + 517 * e4 * e2 / 5040) +
        Math.sin(4 * beta) * (23 * e4 / 360 + 251 * e4 * e2 / 3780) +
        Math.sin(6 * beta) * 761 * e4 * e2 / 45360;
    } else {
      rho = Math.sqrt(x * x + (_sphRho0 - y) * (_sphRho0 - y));
      theta = Math.atan(x / (_sphRho0 - y));
      ll.lat = Math.asin((_sphC - rho * rho * _sphN * _sphN) * 0.5 / _sphN);
      ll.lng = theta / _sphN + this.lng0;
    }
  };
}

function calcAlbersQell(e, lat) {
  var sinLat = Math.sin(lat);
  return (1 - e * e) * (sinLat / (1 - e * e * sinLat * sinLat) -
    0.5 / e * Math.log((1 - e * sinLat) / (1 + e * sinLat)));
}

function calcAlbersMell(e, lat) {
  var sinLat = Math.sin(lat);
  return Math.cos(lat) / Math.sqrt(1 - e * e * sinLat * sinLat);
}

// Parameters (in decimal degrees):
//   lng0  Reference longitude
//   lat0  Reference latitude
//   lat1  First standard parallel
//   lat2  Second standard parallel
function LambertConformalConic(opts) {
  initProj(this, 'lambertcc', opts, ['lat0', 'lat1', 'lat2', 'lng0']);
  var E = this.E;
  var _sphN = Math.log(Math.cos(this.lat1) / Math.cos(this.lat2)) /
    Math.log(Math.tan(Math.PI / 4.0 + this.lat2 / 2.0) /
    Math.tan(Math.PI / 4.0 + this.lat1 / 2.0));
  var _sphF = Math.cos(this.lat1) *
    Math.pow(Math.tan(Math.PI / 4.0 + this.lat1 / 2.0), _sphN) / _sphN;
  var _sphRho0 = _sphF /
    Math.pow(Math.tan(Math.PI / 4.0 + this.lat0 / 2.0), _sphN);
  var _ellN = (Math.log(calcLambertM(this.lat1, E)) -
    Math.log(calcLambertM(this.lat2, E))) /
    (Math.log(calcLambertT(this.lat1, E)) -
    Math.log(calcLambertT(this.lat2, E)));
  var _ellF = calcLambertM(this.lat1, E) / (_ellN *
    Math.pow(calcLambertT(this.lat1, E), _ellN));
  var _ellRho0 = _ellF *
    Math.pow(calcLambertT(this.lat0, E), _ellN);

  this.forward = function(lng, lat, xy) {
    var rho, theta;
    if (!this.spherical) {
      var t = calcLambertT(lat, E);
      rho = _ellF * Math.pow(t, _ellN);
      theta = _ellN * (lng - this.lng0);
      xy.x = rho * Math.sin(theta);
      xy.y = _ellRho0 - rho * Math.cos(theta);
    } else {
      rho = _sphF /
        Math.pow(Math.tan(Math.PI / 4 + lat / 2.0), _sphN);
      theta = _sphN * (lng - this.lng0);
      xy.x = rho * Math.sin(theta);
      xy.y = _sphRho0 - rho * Math.cos(theta);
    }
  };

  this.inverse = function(x, y, ll) {
    if (!this.spherical) {
      this.inverseEllApprox(x, y, ll);
    } else {
      var rho0 = _sphRho0;
      var rho = Math.sqrt(x * x + (rho0 - y) * (rho0 - y));
      if (_sphN < 0) {
        rho = -rho;
      }
      var theta = Math.atan(x / (rho0 - y));
      ll.lat = 2 * Math.atan(Math.pow(_sphF /
        rho, 1 / _sphN)) - 0.5 * Math.PI;
      ll.lng = theta / _sphN + this.lng0;
    }
  };
}

function calcLambertT(lat, e) {
  var sinLat = Math.sin(lat);
  return Math.tan(Math.PI / 4 - lat / 2) /
    Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2);
}

function calcLambertM(lat, e) {
  var sinLat = Math.sin(lat);
  return Math.cos(lat) / Math.sqrt(1 - e * e * sinLat * sinLat);
}

function WinkelTripel() {
  initProj(this, 'winkel_tripel');
  this.forward = function(lng, lat, xy) {
    var lat0 = 50.4670 * DEG2RAD;
    var a = Math.acos( Math.cos(lat) * Math.cos(lng * 0.5));
    var sincAlpha = a === 0 ? 1 : Math.sin( a ) / a;
    xy.x = 0.5 * (lng * Math.cos(lat0) + 2 * Math.cos(lat) * Math.sin(0.5 * lng) / sincAlpha);
    xy.y = 0.5 * (lat + Math.sin(lat) / sincAlpha);
  };
}

function Robinson() {
  initProj(this, 'robinson');
  var FXC = 0.8487;
  var FYC = 1.3523;
  var xx = [
    1, -5.67239e-12, -7.15511e-05, 3.11028e-06,
    0.9986, -0.000482241, -2.4897e-05, -1.33094e-06,
    0.9954, -0.000831031, -4.4861e-05, -9.86588e-07,
    0.99, -0.00135363, -5.96598e-05, 3.67749e-06,
    0.9822, -0.00167442, -4.4975e-06, -5.72394e-06,
    0.973, -0.00214869, -9.03565e-05, 1.88767e-08,
    0.96, -0.00305084, -9.00732e-05, 1.64869e-06,
    0.9427, -0.00382792, -6.53428e-05, -2.61493e-06,
    0.9216, -0.00467747, -0.000104566, 4.8122e-06,
    0.8962, -0.00536222, -3.23834e-05, -5.43445e-06,
    0.8679, -0.00609364, -0.0001139, 3.32521e-06,
    0.835, -0.00698325, -6.40219e-05, 9.34582e-07,
    0.7986, -0.00755337, -5.00038e-05, 9.35532e-07,
    0.7597, -0.00798325, -3.59716e-05, -2.27604e-06,
    0.7186, -0.00851366, -7.0112e-05, -8.63072e-06,
    0.6732, -0.00986209, -0.000199572, 1.91978e-05,
    0.6213, -0.010418, 8.83948e-05, 6.24031e-06,
    0.5722, -0.00906601, 0.000181999, 6.24033e-06,
    0.5322, 0,0,0
  ];
  var yy = [
    0, 0.0124, 3.72529e-10, 1.15484e-09,
    0.062, 0.0124001, 1.76951e-08, -5.92321e-09,
    0.124, 0.0123998, -7.09668e-08, 2.25753e-08,
    0.186, 0.0124008, 2.66917e-07, -8.44523e-08,
    0.248, 0.0123971, -9.99682e-07, 3.15569e-07,
    0.31, 0.0124108, 3.73349e-06, -1.1779e-06,
    0.372, 0.0123598, -1.3935e-05, 4.39588e-06,
    0.434, 0.0125501, 5.20034e-05, -1.00051e-05,
    0.4968, 0.0123198, -9.80735e-05, 9.22397e-06,
    0.5571, 0.0120308, 4.02857e-05, -5.2901e-06,
    0.6176, 0.0120369, -3.90662e-05, 7.36117e-07,
    0.6769, 0.0117015, -2.80246e-05, -8.54283e-07,
    0.7346, 0.0113572, -4.08389e-05, -5.18524e-07,
    0.7903, 0.0109099, -4.86169e-05, -1.0718e-06,
    0.8435, 0.0103433, -6.46934e-05, 5.36384e-09,
    0.8936, 0.00969679, -6.46129e-05, -8.54894e-06,
    0.9394, 0.00840949, -0.000192847, -4.21023e-06,
    0.9761, 0.00616525, -0.000256001, -4.21021e-06,
    1,0,0,0
  ];
  this.forward = function(lng, lat, xy) {
    var absLat = Math.abs(lat),
        j = Math.min(Math.floor(absLat * 11.45915590261646417544), 17),
        dphi = (absLat - 0.08726646259971647884 * j) / DEG2RAD,
        sign = lat < 0 ? -1 : 1,
        i = j * 4;
    xy.x = (((dphi * xx[i+3] + xx[i+2]) * dphi + xx[i+1]) * dphi + xx[i]) * lng * FXC;
    xy.y = (((dphi * yy[i+3] + yy[i+2]) * dphi + yy[i+1]) * dphi + yy[i]) * FYC * sign;
  };
}

// A compound projection, consisting of a default projection and one or more rectangular frames
// that are reprojected and/or affine transformed.
// @proj Default projection.
function MixedProjection(proj) {
  var frames = [];
  // @proj2 projection to use.
  // @ctr1 {lat, lng} center of the frame contents.
  // @ctr2 {lat, lng} geo location to move the frame center
  // @frameWidth Width of the frame in base projection units
  // @frameHeight Height of the frame in base projection units
  // @scale Scale factor; 1 = no scaling.
  // @rotation Rotation in degrees; 0 = no rotation.
  this.addFrame = function(proj2, ctr1, ctr2, frameWidth, frameHeight, scale, rotation) {
    var xy1 = proj.projectLatLng(ctr1.lat, ctr1.lng);
    var xy2 = proj.projectLatLng(ctr2.lat, ctr2.lng);
    var bbox = [xy1.x - frameWidth * 0.5, xy1.y - frameHeight * 0.5, xy1.x + frameWidth * 0.5, xy1.y + frameHeight * 0.5];
    var m = new Matrix2D();
    m.rotate(rotation * DEG2RAD, xy1.x, xy1.y );
    m.scale(scale, scale);
    m.transformXY(xy1.x, xy1.y, xy1);
    m.translate(xy2.x - xy1.x, xy2.y - xy1.y);
    frames.push({
      bbox: bbox,
      matrix: m,
      projection: proj2
    });
    return this;
  };

  this.projectLatLng = function(lat, lng, xy) {
    var frame, bbox;
    xy = proj.projectLatLng(lat, lng, xy);
    for (var i=0, n=frames.length; i<n; i++) {
      frame = frames[i];
      bbox = frame.bbox;
      if (xy.x >= bbox[0] && xy.x <= bbox[2] && xy.y >= bbox[1] && xy.y <= bbox[3]) {
        frame.projection.projectLatLng(lat, lng, xy);
        frame.matrix.transformXY(xy.x, xy.y, xy);
        break;
      }
    }
    return xy;
  };

  // TODO: implement inverse projection for frames
  this.unprojectXY = function(x, y, ll) {
    return proj.unprojectXY.call(proj, x, y, ll);
  };
}

// A matrix class that supports affine transformations (scaling, translation, rotation).
// Elements:
//   a  c  tx
//   b  d  ty
//   0  0  1  (u v w are not used)
//
function Matrix2D() {
  this.a = 1;
  this.c = 0;
  this.tx = 0;
  this.b = 0;
  this.d = 1;
  this.ty = 0;
}

Matrix2D.prototype.transformXY = function(x, y, p) {
  p = p || {};
  p.x = x * this.a + y * this.c + this.tx;
  p.y = x * this.b + y * this.d + this.ty;
  return p;
};

Matrix2D.prototype.translate = function(dx, dy) {
  this.tx += dx;
  this.ty += dy;
};

Matrix2D.prototype.rotate = function(q, x, y) {
  var cos = Math.cos(q);
  var sin = Math.sin(q);
  x = x || 0;
  y = y || 0;
  this.a = cos;
  this.c = -sin;
  this.b = sin;
  this.d = cos;
  this.tx += x - x * cos + y * sin;
  this.ty += y - x * sin - y * cos;
};

Matrix2D.prototype.scale = function(sx, sy) {
  this.a *= sx;
  this.c *= sx;
  this.b *= sy;
  this.d *= sy;
};
