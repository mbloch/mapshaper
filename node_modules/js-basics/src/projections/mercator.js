/** @requires projections */

/**
 * Mercator projection.
 * @param {number} latD Latitude of origin in decimal degrees.
 * @param {number} lngD Longitude of origin in decimal degrees.
 * @constructor
 */
function Mercator(latD, lngD) {
  //ProjectionBase.call(this);
  //Opts.inherit(this, ProjectionBase);
  this.__super__();

  this.name = 'Mercator';

  this._lat0 = (latD || 0) * this._DEG2RAD;
  this._lng0 = (lngD || 0) * this._DEG2RAD;
}

Opts.inherit(Mercator, ProjectionBase);

function SphericalMercator() {
  var merc = new Mercator();
  merc.useEllipsoid = false;
  merc.name = "SphericalMercator";
  return merc;
}


/**
 * Forward projection formula.
 * @param {number} lat Latitude in decimal degrees.
 * @param {number} lng Longitude in decimal degrees.
 * @return {Point} Projected x, y coords (in meters).
 */
Mercator.prototype.projectLatLng = function(lat, lng, xy) {
  lat *= this._DEG2RAD;
  lng *= this._DEG2RAD;
  xy = xy || new Point();

  if (this.useEllipsoid) {
    var E = this._E;
    xy.x = this._A * (lng - this._lng0);
    xy.y = this._A * Math.log(Math.tan(Math.PI * 0.25 + lat * 0.5) *
      Math.pow((1 - E * Math.sin(lat)) / (1 + E * Math.sin(lat)), E * 0.5));
  }
  else {
    xy.x = this._R * (lng - this._lng0);
    xy.y = this._R * Math.log(Math.tan(Math.PI * 0.25 + lat * 0.5));
  }

  return xy;
};

/**
 * Inverse projection formula.
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {GeoPoint} Lat lon coords.
 */
Mercator.prototype.unprojectXY = function(x, y, ll) {
  x -= this._x0;
  y -= this._y0;
  ll = ll || new GeoPoint();


  if (this.useEllipsoid) {
    //return this.findApproxEllLatLong(x, y);

    var E = this._E;
    var lng = x / this._A + this._lng0;
    var HALF_PI = 1.5707963267948966;
    var TOL = 1.0e-8; // 1.0e-10; // tolerance
    var MAX_ITER = 10;  // tests show 3-5 iterations typical in U.S.

    var eccnth = 0.5 * E;
    var ts = Math.exp(- (y / this._A) / this._k0);

    var lat = HALF_PI - 2 * Math.atan(ts);
    var i = MAX_ITER;
    var dLat, con;
    do {
      con = E * Math.sin(lat);
      dLat = HALF_PI - 2 *
        Math.atan(ts * Math.pow((1 - con) / (1 + con), eccnth)) - lat;
      lat += dLat;

    }
    while (Math.abs(dLat) > TOL && --i > 0);

    ll.lng = lng;
    ll.lat = lat;
  }
  else {
    ll.lng = x / this._R + this._lng0;
    ll.lat = Math.PI * 0.5 - 2 * Math.atan(Math.exp(-y / this._R));

  }

  ll.lat *= this._RAD2DEG;
  ll.lng *= this._RAD2DEG;

  return ll;
};



