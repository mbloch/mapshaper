/* @requires projections */
/**
 * Transverse mercator projection
 * @constructor
 * @param {number} lng0D Longitude of origin, decimal degrees.
 * @param {number} lat0D Latitude of origin, decimal degrees.
 */
function TransverseMercator(lng0D, lat0D) {
  this.__super__();
  this._lat0 = lat0D * this._DEG2RAD;
  this._lng0 = lng0D * this._DEG2RAD;
  this.useEllipsoid = true;
  this._tmM0 = this.calcTransMercM(this._lat0, this._A, this._E);
}

Opts.inherit(TransverseMercator, ProjectionBase);


/**
 * Forward projection formula.
 * @param {number} lat Latitude in decimal degrees.
 * @param {number} lng Longitude in decimal degrees.
 * @return {Point} Projected x, y coords (in meters).
 */
TransverseMercator.prototype.projectLatLng = function(lat, lng, xy) {
  lat *= this._DEG2RAD;
  lng *= this._DEG2RAD;

  var x, y;
  if (this.useEllipsoid) {

    var _e = this._E;
    var _a = this._A;
    var e2 = _e * _e;
    var ep2 = e2 / (1 - e2);

    var sinLat = Math.sin(lat);
    var cosLat = Math.cos(lat);
    var tanLat = Math.tan(lat);

    var N = _a / Math.sqrt(1 - e2 * sinLat * sinLat);
    var T = tanLat * tanLat;
    var C = ep2 * cosLat * cosLat;
    var A = cosLat * (lng - this._lng0);
    var M = this.calcTransMercM(lat, _a, _e);
    x = this._k0 * N * (A + A * A * A / 6 * (1 - T + C) +
      A * A * A * A * A / 120 * (5 - 18 * T + T * T + 72 * C - 58 * ep2));

    y = this._k0 * (M - this._tmM0 + N * tanLat *
      (A * A / 2 + A * A * A * A / 24 * (5 - T + 9 * C + 4 * C * C)));
  }
  else {
    var B = Math.cos(lat) * Math.sin(lng - this._lng0);
    x = 0.5 * this._R * this._k0 * Math.log((1 + B) / (1 - B));
    y = this._R * this._k0 *
      (Math.atan(Math.tan(lat) / Math.cos(lng - this._lng0)) - this._lat0);

  }

  xy = xy || new Point();
  xy.x = x + this._x0;
  xy.y = y + this._y0;
  return xy;
};


/**
 * Inverse projection formula.
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {GeoPoint} Lat lon coords.
 */
TransverseMercator.prototype.unprojectXY = function(x, y, ll) {
  ll = ll || new GeoPoint();

  if (this.useEllipsoid) {
    this.findApproxEllLatLong(x, y, ll);
  }
  else {
    x -= this._x0;
    y -= this._y0;

    var D = y / (this._R * this._k0) + this._lat0;
    var lat = Math.asin(Math.sin(D) / this.cosh(x / (this._R * this._k0)));
    var lon = this._lng0 +
      Math.atan(this.sinh(x / (this._R * this._k0)) / Math.cos(D));
    ll.lat = lat * this._RAD2DEG;
    ll.lng = lon * this._RAD2DEG;
  }

  return ll;
};


/**
 * Calculate a parameter of the ellipsoidal formula:
 * "M is the distance along the central meridian from the equator to [lat]."
 * @param {number} lat Latitude in radians.
 * @param {number} a Ellipsoidal constant.
 * @param {number} e Ellipsoidal constant.
 * @return {number} The parameter "M".
 */
TransverseMercator.prototype.calcTransMercM = function(lat, a, e) {
  var e2 = e * e;
  var e4 = e2 * e2;
  var e6 = e4 * e2;

  var m = a * (lat * (1 - e2 / 4.0 - 3 * e4 / 64 - 5 * e6 / 256) -
    Math.sin(2 * lat) * (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) +
    Math.sin(4 * lat) * (15 * e4 / 256 + 45 * e6 / 1024) -
    Math.sin(6 * lat) * (35 * e6 / 3072));

  return m;
};


/**
 * Authalic sine.
 * @param {number} x Input.
 * @return {number} Output.
 */
TransverseMercator.prototype.sinh = function(x) {
  return (Math.exp(x) - Math.exp(-x)) * 0.5;
};

/**
 * Authalic cosine.
 * @param {number} x Input.
 * @return {number} Output.
 */
TransverseMercator.prototype.cosh = function(x) {
  return (Math.exp(x) + Math.exp(-x)) * 0.5;
};


/**
 * UTM projection (Universal Transverse Mercator).
 * @param {number} zone UTM zone.
 * @param {boolean=} isSouthern True if southern zone.
 * @constructor
 */
function UTM(zone, isSouthern) {
  if (isSouthern) {
    trace('[UTM] Southern zones not implemented.');
    return;
  }

  var lon0D = (zone * 6.0) - 183.0;
  var lat0D = 0;
  var proj = new TransverseMercator(lon0D, lat0D);

  //proj.setScaleFactor(0.9996);
 //proj.setFalseEastingNorthing(500000, 0);

  return proj;
}
