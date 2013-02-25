/* @requires projections */

/**
 * Alberse Equal Area Conic projection function.
 * @constructor
 * @param {number} lng0D Longitude origin.
 * @param {number} lat1D Latitude first parallel.
 * @param {number} lat2D Latitude second parallel.
 * @param {number} lat0D Latitude origin.
 */
function AlbersEqualAreaConic(lng0D, lat1D, lat2D, lat0D) {
  //Opts.inherit(this, ProjectionBase);
  //ProjectionBase.call(this);
  this.__super__();
  this.name = "AlbersEqualAreaConic";

  var lat0 = this._lat0 = lat0D === undefined ? 0 : lat0D * this._DEG2RAD;
  var lat1 = this._lat1 = lat1D === undefined ? 0 : lat1D * this._DEG2RAD;
  var lat2 = this._lat2 = lat2D === undefined ? 0 : lat2D * this._DEG2RAD;
  this._lng0 = lng0D === undefined ? 0 : lng0D * this._DEG2RAD;

  // Calculate spherical parameters.
  var cosLat1 = Math.cos(lat1);
  var sinLat1 = Math.sin(lat1);
  this._sphN = 0.5 * (sinLat1 + Math.sin(lat2));
  this._sphC = cosLat1 * cosLat1 + 2.0 * this._sphN * sinLat1;
  this._sphRho0 =
    Math.sqrt(this._sphC - 2.0 * this._sphN * Math.sin(lat0)) / this._sphN;

  // Calculate ellipsoidal parameters.
  var E = this._E;
  var m1 = this.calcAlbersMell(E, lat1);
  var m2 = this.calcAlbersMell(E, lat2);
  var q0 = this.calcAlbersQell(E, lat0);
  var q1 = this.calcAlbersQell(E, lat1);
  var q2 = this.calcAlbersQell(E, lat2);
  this._ellN = (m1 * m1 - m2 * m2) / (q2 - q1);
  this._ellC = m1 * m1 + this._ellN * q1;
  this._ellRho0 = this._A * Math.sqrt(this._ellC - this._ellN * q0) /
    this._ellN;
  this._ellAuthConst = 1 - (1 - E * E) / (2 * E) * Math.log((1 - E) / (1 + E));

}

Opts.inherit(AlbersEqualAreaConic, ProjectionBase);


/**
 * Forward projection formula.
 * @param {number} lat Latitude in decimal degrees.
 * @param {number} lng Longitude in decimal degrees.
 * @return {Point} Projected x, y coords (in meters).
 */
AlbersEqualAreaConic.prototype.projectLatLng = function(lat, lng, xy) {
  lat *= this._DEG2RAD;
  lng *= this._DEG2RAD;
  var rho, theta;
  xy = xy || new Point();
  if (this.useEllipsoid) {
    var q = this.calcAlbersQell(this._E, lat);
    rho = this._A * Math.sqrt(this._ellC - this._ellN * q) / this._ellN;
    theta = this._ellN * (lng - this._lng0);
    xy.x = rho * Math.sin(theta);
    xy.y = this._ellRho0 - rho * Math.cos(theta);
  }
  else {
    rho = Math.sqrt(this._sphC - 2 * this._sphN * Math.sin(lat)) /
      this._sphN;
    theta = this._sphN * (lng - this._lng0);
    var xEarth = rho * Math.sin(theta);
    var yEarth = this._sphRho0 - rho * Math.cos(theta);
    xy.x = xEarth * this._R;
    xy.y = yEarth * this._R;
  }

  return xy;
};

/**
 * Inverse projection formula.
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {GeoPoint} Lat lon coords.
 */
AlbersEqualAreaConic.prototype.unprojectXY = function(x, y, ll) {

  x -= this._x0;
  y -= this._y0;
  var rho, theta, lat, lng;
  if (this.useEllipsoid) {
    //return this.findApproxEllLatLong(x, y);

    theta = Math.atan(x / (this._ellRho0 - y));
    lng = this._lng0 + theta / this._ellN;
    var e2 = this._E * this._E;
    var e4 = e2 * e2;
    var e6 = e4 * e2;
    rho = Math.sqrt(x * x + (this._ellRho0 - y) * (this._ellRho0 - y));
    var q = (this._ellC - rho * rho * this._ellN * this._ellN /
      (this._A * this._A)) / this._ellN;
    var beta = Math.asin(q / this._ellAuthConst);
    lat = beta + Math.sin(2 * beta) *
      (e2 / 3 + 31 * e4 / 180 + 517 * e6 / 5040) +
      Math.sin(4 * beta) * (23 * e4 / 360 + 251 * e6 / 3780) +
      Math.sin(6 * beta) * 761 * e6 / 45360;
  }
  else {
    x /= this._R; // convert from meters to terrestrial units
    y /= this._R;
    rho = Math.sqrt(x * x + (this._sphRho0 - y) * (this._sphRho0 - y));
    theta = Math.atan(x / (this._sphRho0 - y));
    lat = Math.asin((this._sphC - rho * rho * this._sphN * this._sphN) *
      0.5 / this._sphN);
    lng = theta / this._sphN + this._lng0;
  }

  ll = ll || new GeoPoint();
  ll.lat = lat * this._RAD2DEG;
  ll.lng = lng * this._RAD2DEG;
  return ll;
};

/**
 * Calculate the ellipsoidal parameter "Q".
 * @param {number} e Projection constant.
 * @param {number} lat Latitude, in radians.
 * @return {number} The parameter.
 */
AlbersEqualAreaConic.prototype.calcAlbersQell = function(e, lat) {
  var sinLat = Math.sin(lat);
  var q = (1 - e * e) * (sinLat / (1 - e * e * sinLat * sinLat) -
    0.5 / e * Math.log((1 - e * sinLat) / (1 + e * sinLat)));
  return q;
};


/**
 * Calculate the ellipsoidal parameter "M".
 * @param {number} e Projection constant.
 * @param {number} lat Latitude, in radians.
 * @return {number} The parameter.
 */
AlbersEqualAreaConic.prototype.calcAlbersMell = function(e, lat) {
  var sinLat = Math.sin(lat);
  var m = Math.cos(lat) / Math.sqrt(1 - e * e * sinLat * sinLat);
  return m;
};



/**
 * Albers Equal Area Conic for the continental U.S.
 * @constructor
 */
function AlbersUSA() {
  var proj = new AlbersEqualAreaConic(-96, 29.5, 45.5, 37.5);
  proj.name = "AlbersUSA";
  return proj;
}
