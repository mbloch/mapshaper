/* @requires core.geo */

/**
 * Parent function for geographic projection functions (like Mercator)
 * Projection functions must inherit this function, assign a "name" property
 * and implement two functions:
 *   projectLatLngFast(<latitude:number>, <longitude:number>) : <:Point>
 *   unprojectLatLngFast(<x_meters:number>, <y_meters:number>) : <:GeoPoint>
 *
 * @constructor
 */
function ProjectionBase() {

  // This property toggles between spherical and ellipsoidal formulas
  this.useEllipsoid = true;

  this._DEG2RAD = Math.PI / 180.0;
  this._RAD2DEG = 180.0 / Math.PI;

  // _f: 1/298.257223563, // GRS80

  this._R = 6378137;
  this._E = 0.0818191908426214943348;
  this._A = 6378137.0;

  // These projection properties are not consistently implemented.
  // Used by UTM and State Plane projections
  this._x0 = 0;   // false easting
  this._y0 = 0;   // false northing
  this._k0 = 1.0; // scale factor

  this._tmpLatLng = new GeoPoint;
  this._tmpXY = new Point();

  // bound projection function for projecting
  // x, y (lng, lat)
  var self = this;
  this.projectXY = function(x, y, arr) {
    arr = arr || [];
    self.projectLatLng(y, x, arr);
    return arr;
  };
}


function NullProjection() {
  this.__super__();
  this.useEllipsoid = false;
}

Opts.inherit(NullProjection, ProjectionBase);


ProjectionBase.prototype.projectLatLng = function(lat, lng, xy) {
  xy = xy || new Point();
  xy.y = lat;
  xy.x = lng;
  return xy;
};

/**
 * Convert lat-lng bounding box to projected bounding box
 * Caveat: only works well with rectangular projections, e.g. Mercator
 * @params left, top, right, bottom or left, bottom, right, top
 */
ProjectionBase.prototype.projectLatLngBoundingBox = function(lngMin, latMax, lngMax, latMin) {
  if (latMax < latMin) {
    var tmp = latMin;
    latMin = latMax;
    latMax = tmp;
  }
  var tl = this.projectLatLng(latMax, lngMin);
  var br = this.projectLatLng(latMin, lngMax);
  var bb = new BoundingBox();
  bb.setBounds(tl.x, tl.y, br.x, br.y);
  return bb;
}


ProjectionBase.prototype.transformXY = function(x, y, xy) {
  xy = xy || new Point();
  this.projectLatLng(y, x, xy);
  return xy;
};


ProjectionBase.prototype.unprojectXY = function(x, y, ll) {
  ll = ll || new GeoPoint();
  ll.lat = y;
  ll.lng = x;
  return ll;
};

ProjectionBase.prototype.getProjectionTransform = function() {
  /*
  // problem: this causes infinite recursion with MixedProjection() class
  var obj = {};
  Opts.copyAllParams(obj, this);
  this.transformXY = function(x, y, xy) {
    return this.projectLatLng(y, x, xy);
  };
  */
  var self = this;
  var obj = {
    transformXY: function(x, y, xy) {
      return self.projectLatLng(y, x, xy);
    }
  }
  return obj;
};


/**
 * Set false easing northing parameters, in meters (not implemented).
 * @param {number} x0 Easting.
 * @param {number} y0 Northing.
 */
ProjectionBase.prototype.setFalseEastingNorthing = function(x0, y0) {
  this._x0 = x0;
  this._y0 = y0;
};


/**
 * Set scale factor "k" (default is 1).
 * @param {number} k0 Scale factor.
 */
ProjectionBase.prototype.setScaleFactor = function(k0) {
  this._k0 = k0;
};


/**
 * Return string for debugging and identity testing.
 * @return {string} String.
 */
ProjectionBase.prototype.toString = function() {
  if (this.name) {
    return this.name + (this.useEllipsoid ? '_ell' : '_sph');
  }
  return '';
};

/**
 * Test a projection for identity.
 * @param {*} p2 Second projection.
 * @return {boolean} True or false.
 */
ProjectionBase.prototype.isSame = function(p2) {
  return p2 && this.toString() == p2.toString();
};


/**
 * Approximate the inverse ellipsoidal projection function when
 * the forward ellipsoidal formula and both spheroidal formulas are known.
 * (Many ellipsoidal inverse projections lack closed formulas and/or are a hassle to implement).
 * Generally accurate to within 0.000001 degree.
 * Rather slow, because it calls 5 projection functions instead of 1.
 *
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {GeoPoint} ll Lat lon coordinate.
 */
ProjectionBase.prototype.findApproxEllLatLong = function(x, y, ll) {
  ll = ll || new GeoPoint();

  var ell0 = this.useEllipsoid; // Expect this to be true.
  this.useEllipsoid = false;
  this.unprojectXY(x, y, ll);
  this.useEllipsoid = true;
  var xy = new Point();
  this.projectLatLng(ll.lat, ll.lng, xy);

  this.useEllipsoid = false;
  var x3 = 2 * x - xy.x;
  var y3 = 2 * y - xy.y;
  this.unprojectXY(x3, y3, ll); // Accurate to +/- 0.0001 degrees

  // Enhance precision
  this.useEllipsoid = true;
  this.projectLatLng(ll.lat, ll.lng, xy);
  var xd = xy.x - x;
  var yd = xy.y - y;
  this.useEllipsoid = false;
  this.unprojectXY(x3 - xd, y3 - yd, ll);  // Accurate to +/- 0.000001 degrees

  this.useEllipsoid = ell0;
};

