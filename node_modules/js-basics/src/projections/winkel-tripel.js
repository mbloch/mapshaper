/* @require projections, core */

function WinkelTripel() {
  this.__super__();
  this._lat0 = 50.4670 * this._DEG2RAD;
  this.name = "WinkelTripel";
  this.useEllipsoid = false;
}

Opts.inherit(WinkelTripel, ProjectionBase);

WinkelTripel.prototype.projectLatLng = function(lat, lng, xy) {
  var alpha = Math.acos( Math.cos( lat ) * Math.cos( lng * 0.5 ) );
  var sincAlpha = alpha == 0 ? 1 : Math.sin( alpha ) / alpha;
  
  var x = 0.5 * ( lng * Math.cos( this._lat0 ) + 2 * Math.cos( lat ) * Math.sin( 0.5 * lng ) / sincAlpha );
  var y = 0.5 * ( lat + Math.sin( lat ) / sincAlpha );

  x *= this._R;
  y *= this._R;

  xy = xy || new Point();
  xy.y = y;
  xy.x = x;
  return xy;
};
