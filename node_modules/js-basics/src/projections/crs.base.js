/** @requires core, core.geo, mercator */

function GoogleCRS() {
  var proj = new SphericalMercator();
  // proj.useEllipsoid = false;
  return new MapCRS(proj);
}

/**
 *  TODO: adjust scale to fit bounds?
 */
 /*
function ChartCRS(bounds) {
  var proj = new ProjectionBase();
  var crs = new MapCRS(proj);
  //crs.baseScale = 1;
  return crs;
} */

function MapCRS(proj) {
	var R_MINOR = 6356752.3142;
	var R_MAJOR = 6378137;

  this.projection = proj;

  this.tileHeightInPixels = 256;
  this.tileWidthInPixels = 256;

  this.levelOneScale = R_MAJOR / this.tileWidthPixels;

  this.baseZoom = 4;
  this.baseScale = 0;
};

MapCRS.prototype.setBaseZoom = function(z) {
  this.baseZoom = z;
};

MapCRS.prototype.setBaseScale = function(mpp) {
  this.baseScale = mpp;
};

MapCRS.prototype.getTileBounds = function(x, y, z) {
  var mpp = this.convZoomToScale(z);
  var tileHeightInMeters = this.tileHeightInPixels * mpp;
  var tileWidthInMeters = this.tileWidthInPixels * mpp;
  var x0 = x * tileWidthInMeters;
  var y0 = y * tileHeightInMeters;

  var tilesPerLevel = 1 << z;
  //var halfPixels = size * 0.5 * Math.pow( 2, z );  // half the pixel size of the entire zoom level
  //var halfMeters = tilesPerLevel * 0.5 * metersPerTile;
  // meters from traditional origin at Latitude 0.0, Longitude 0.0
  x0 = x0 - (tilesPerLevel * 0.5 * tileWidthInMeters);
  y0 = (tilesPerLevel * 0.5 * tileHeightInMeters) - y0;
  var bb = new BoundingBox().setBounds( x0, y0, x0 + tileWidthInMeters, y0 - tileHeightInMeters );

  //var obj = {};
  //Opts.copyAllParams(obj, bb);
  //return obj;
  return bb;
};


MapCRS.prototype.getLevelOneScale = function() {
  var mpp = 40075017 / 256;  // default scale
  if (this.baseScale) {
    mpp = this.baseScale * (1 << (this.baseZoom));
  }
  return mpp;
};

// TODO: rename this or remove from MapCRS
MapCRS.prototype.getCustomScaleRatio = function() {
  return this.baseScale ? this.getLevelOneScale() * 256 / 40075017 : 1;
};



MapCRS.prototype.convScaleToZoom = function(mpp, snap) {
  var level = Math.log(this.getLevelOneScale() / mpp) / Math.log(2);
  var roundedLevel = Math.round( level );
  var diff = Math.abs( level - roundedLevel );
  if ( snap || snap === undefined || diff < 0.000001 ) { // compensate for rounding errors
    level = roundedLevel;
  }
  return level;
};


MapCRS.prototype.convZoomToScale = function(zoom) {
  var mpp = this.getLevelOneScale() / Math.pow(2, zoom);
  return mpp;
};