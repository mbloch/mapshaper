/** @requires projections, matrix, core.geo */

/**
 * A compound projection, consisting of a default projection and zero or more rectangular frames 
 * that are reprojected and/or affine tranformed.
 * 
 * @param {*} mainProj Default projection.
 * @constructor
 */
function MixedProjection(mainProj) {
  // inherit data and functions from the default projection.
  /*
  Opts.copyNewParams(this, mainProj);
  
  this._proj = mainProj;
  this._boxes = [];
  this._transforms = [];
  this._projections = [];
  */
  /*
  Opts.copyAllParams(mainProj, {
    _proj: mainProj,
    _boxes: [],
    _transforms: [],
    _projections: []
  });

  Opts.copyAllParams(mainProj, MixedProjection.prototype);

  return mainProj;
  */
  function f() {
    this._proj = mainProj;
    this._boxes = [];
    this._transforms = [];
    this._projections = [];
  };
  
  f.prototype = mainProj;
  var proj = new f();
  Opts.copyAllParams(proj, MixedProjection.prototype);
  return proj;
}


/**
 * Define a rectangular area to be transformed.
 *
 * @param {*} destProj Optional projection to use.
 * @param {GeoPoint} geoOrigin Lat, lng center of the frame.
 * @param {GeoPoint} geoDest Lat, lng coorditate where the origin will be moved.
 * @param {number} widthMeters Width of the frame, in meters, relative to the initial projection.
 * @param {number} heightMeters Height of the frame in meters, relative to the initial projection.
 * @param {number} scalePct Amount of scaling; 1 = no scaling.
 * @param {number} rotationDegrees Amount of rotation in degrees; 0 = no rotation.
 */
MixedProjection.prototype.addFrame = function(destProj, geoOrigin, geoDest, widthMeters, heightMeters, scalePct, rotationDegrees) {
  
  var destProj = destProj || null;
  var origProj = this._proj;
  var xyOrigin = origProj.projectLatLng(geoOrigin.lat, geoOrigin.lng).clone();
  var xyDest = origProj.projectLatLng(geoDest.lat, geoDest.lng).clone();
  var bb = new BoundingBox();
  bb.setBounds(xyOrigin.x - widthMeters * 0.5, xyOrigin.y + heightMeters * 0.5, xyOrigin.x + widthMeters * 0.5, xyOrigin.y - heightMeters * 0.5);
  this._boxes.push(bb);

  var m = new Matrix2D();
  rotationDegrees && m.rotate(Math.PI * rotationDegrees / 180, xyOrigin.x, xyOrigin.y );
  scalePct && m.scale(scalePct, scalePct);

  var ctr = m.transformXY(xyOrigin.x, xyOrigin.y);
  var dx = xyDest.x - ctr.x;
  var dy = xyDest.y - ctr.y;
  m.translate(dx, dy);

  this._transforms.push(m);
  this._projections.push(destProj);
};

MixedProjection.prototype.projectLatLng = function(lat, lng, xy) {
  xy = this._proj.projectLatLng(lat, lng, xy);
  return this.transformXY(xy.x, xy.y, xy);
};

MixedProjection.prototype.transformXY = function(x, y, xy) {
  xy = xy || new Point();
  var boxes = this._boxes;
  var len = boxes.length;

  for (var i=0; i<len; i++) {
    var box = boxes[i];
    //if (box.containsPoint(x, y)) { // inlined this test
    if (x >= box.left && x <= box.right && y <= box.top && y >= box.bottom) {
      var t = this._transforms[i];
      var proj = this._projections[i];
      if (proj) {
        var ll = this._proj.unprojectXY(x, y);
        xy = proj.projectLatLng(ll.lat, ll.lng, xy);
        x = xy.x;
        y = xy.y;
      }
      xy = t.transformXY(x, y, xy);
      return xy;
    }
  }

  xy.x = x;
  xy.y = y;
  return xy;
};
