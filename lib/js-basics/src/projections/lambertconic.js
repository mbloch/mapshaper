/* @requires projections */

/**
 * Lambert Conformal Conic projection.
 *
 * @param {number} lng0D Central meridian, in decimal degrees.
 * @param {number} lat1D First parallel, in decimal degrees.
 * @param {number} lat2D Second parallel, in decimal degrees.
 * @param {number} lat0D Latitude of origin, in decimal degrees.
 * @constructor
 */
function LambertConformalConic(lng0D, lat1D, lat2D, lat0D) {
  //ProjectionBase.call(this);
  //Opts.inherit(this, ProjectionBase);
  this.__super__();
  this.useEllipsoid = true;
  this.name = "LambertConformalConic";

  var lat0 = this._lat0 = lat0D === undefined ? 0 : lat0D * this._DEG2RAD;
  var lat1 = this._lat1 = lat1D === undefined ? 0 : lat1D * this._DEG2RAD;
  var lat2 = this._lat2 = lat2D === undefined ? 0 : lat2D * this._DEG2RAD;
  this._lng0 = lng0D === undefined ? 0 : lng0D * this._DEG2RAD;

  // spherical params
  this._lambertSphN = Math.log(Math.cos(lat1) / Math.cos(lat2)) /
    Math.log(Math.tan(Math.PI / 4.0 + lat2 / 2.0) /
    Math.tan(Math.PI / 4.0 + lat1 / 2.0));
  this._lambertSphF = Math.cos(lat1) *
    Math.pow(Math.tan(Math.PI / 4.0 + lat1 / 2.0), this._lambertSphN) /
    this._lambertSphN;
  this._lambertSphRho0 = this._R * this._lambertSphF /
    Math.pow(Math.tan(Math.PI / 4.0 + lat0 / 2.0), this._lambertSphN);

  // ellipsoidal params
  var E = this._E;
  this._lambertEllN = (Math.log(this.calcLambertM(lat1, E)) -
    Math.log(this.calcLambertM(lat2, E))) /
    (Math.log(this.calcLambertT(lat1, E)) -
    Math.log(this.calcLambertT(lat2, E)));
  this._lambertEllF = this.calcLambertM(lat1, E) / (this._lambertEllN *
    Math.pow(this.calcLambertT(lat1, E), this._lambertEllN));
  this._lambertEllRho0 = this._A * this._lambertEllF *
    Math.pow(this.calcLambertT(lat0, E), this._lambertEllN);

}

Opts.inherit(LambertConformalConic, ProjectionBase);


/**
 * Forward projection formula.
 * @param {number} lat Latitude in decimal degrees.
 * @param {number} lng Longitude in decimal degrees.
 * @return {Point} Projected x, y coords (in meters).
 */
LambertConformalConic.prototype.projectLatLng = function(lat, lng, xy) {
  lat *= this._DEG2RAD;
  lng *= this._DEG2RAD;
  var rho, theta;
  xy = xy || new Point();

  if (this.useEllipsoid) {
    var t = this.calcLambertT(lat, this._E);
    rho = this._A * this._lambertEllF * Math.pow(t, this._lambertEllN);
    theta = this._lambertEllN * (lng - this._lng0);

    xy.x = rho * Math.sin(theta);
    xy.y = this._lambertEllRho0 - rho * Math.cos(theta);
  }
  else {
    rho = this._R * this._lambertSphF /
      Math.pow(Math.tan(Math.PI / 4 + lat / 2.0), this._lambertSphN);
    theta = this._lambertSphN * (lng - this._lng0);
    xy.x = rho * Math.sin(theta);
    xy.y = this._lambertSphRho0 - rho * Math.cos(theta);
  }

  xy.x += this._x0;
  xy.y += this._y0;
  return xy;
};


/**
 * Inverse projection formula.
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {GeoPoint} Lat lon coords.
 */
LambertConformalConic.prototype.unprojectXY = function(x, y, ll) {
  ll = ll || new GeoPoint();

  if (this.useEllipsoid) {
    this.findApproxEllLatLong(x, y, ll);
    return ll;
  }

  x -= this._x0;
  y -= this._y0;

  var rho0 = this._lambertSphRho0;
  var rho = Math.sqrt(x * x + (rho0 - y) * (rho0 - y));
  if (this._lambertSphN < 0) {
    rho = -rho;
  }
  var theta = Math.atan(x / (rho0 - y));
  var lat = 2 * Math.atan(Math.pow(this._R * this._lambertSphF /
    rho, 1 / this._lambertSphN)) - 0.5 * Math.PI;
  var lon = theta / this._lambertSphN + this._lng0;

  ll.lat = lat * this._RAD2DEG;
  ll.lng = lon * this._RAD2DEG;
  return ll;
};


LambertConformalConic.prototype.calcLambertT = function(lat, e) {
  var sinLat = Math.sin(lat);
  var t = Math.tan(Math.PI / 4 - lat / 2) /
    Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2);
  return t;
};

LambertConformalConic.prototype.calcLambertM = function(lat, e) {
  var sinLat = Math.sin(lat);
  var m = Math.cos(lat) / Math.sqrt(1 - e * e * sinLat * sinLat);
  return m;
};


/**
 * Lambert Conformal Conic for the continental U.S.
 * @constructor
 */
 function LambertUSA() {
   var proj = new LambertConformalConic(-96, 33, 45, 39);
   proj.name = "LambertUSA";
   return proj;
  //LambertConformalConic.call( this, -96, 33, 45, 39);
 }
