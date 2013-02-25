/** @requires crs.base, core */

/*
TODO: eliminate dependence on google-maps.js
*/

function GoogleCRS() {
  var proj = new SphericalMercator();
  var crs = new TileCRS(proj, new GeoPoint(0, 0), 40075017);
  crs.setPixelSize(256, 256);
  return crs;
}



/**
 * Converts Google Map level to base scale in meters per pixel. (This scale is only accurate at the equator; it increases to infinity at the poles). 
 * @param  level
 * @return
 */
GoogleCRS.prototype.convZoomToScale = function( level ) {
  var mpp = 40075017 / Math.pow( 2, level + 8 );
  return mpp;
};

/**
 * Convert base scale in meters to pixels to Google Map level. 
 * @param  mpp
 * @param  snap  Rounds level to nearest integer when true. 
 * @return
 */
 GoogleCRS.convScaleToZoom = function( mpp, snap ) {
  
  var level = Math.log( 40075017 / 256 / mpp ) / Math.log( 2 );
  var roundedLevel = Math.round( level );
  var diff = Math.abs( level - roundedLevel );
  if ( snap || snap === undefined || diff < 0.000001 ) { // compensate for rounding errors
    level = roundedLevel;
  }
  return level;
};


/** 
 * Return a BoundingBox with Spherical Mercator coords for a tile
 */
GoogleCRS.prototype.getTileBounds = function( x, y, z ) {
  var size = 256;
  //var mpp = GoogleMaps.levelToPixelScale( z );
  var mpp = this.convZoomToScale( z );
  var metersPerTile = mpp * size;
  var x0 = x * metersPerTile;
  var y0 = y * metersPerTile;

  var bb = new BoundingBox();

  if (true ) {
    var tilesPerLevel = 1 << z;
    //var halfPixels = size * 0.5 * Math.pow( 2, z );  // half the pixel size of the entire zoom level
    var halfMeters = tilesPerLevel * 0.5 * metersPerTile;
    // meters from traditional origin at Latitude 0.0, Longitude 0.0
    x0 = x0 - halfMeters;
    y0 = halfMeters - y0;
    bb.setBounds( x0, y0, x0 + metersPerTile, y0 - metersPerTile );
  }
  else {
    bb.setBounds( x0, y0, x0 + metersPerTile, y0 + metersPerTile );
  }

  return bb;
};