/* @requires core.geo, browser, map-core-notiles, albersusa-special, loading.script, html-popup, ordinal */


/*
  ALBERS_US_WIDTH_KM : 4650,
  ALBERS_US_HEIGHT_KM : 2940,
  //ALBERS_US_CENTER : new GeoPoint(38.5, -96.6),
  ALBERS_US_CENTER : new GeoPoint(38.5, -96.6),
*/


function CongressMap(div, opts) {

  var mapOpts = {
    center:{lat:38.5, lng:-96.6},
    //width: 750,
    //height: 450,
    widthKm: 4650,
    heightKm: 2940,
    projection: new AlbersUSASpecial()
  };

  this._div = div;

  opts.height = opts.height || opts.width / 1.6;
  Opts.copyAllParams(mapOpts, opts);

  this._opts = mapOpts;

  this.initMap();
}


CongressMap.prototype.initLayers = function(map) {


};

CongressMap.prototype.show = function() {
  this._map.div.style.visibility = "visible";

};

CongressMap.prototype.hide = function() {
  this._map.div.style.visibility = "hidden";
  this._popup && this._popup.hide();
  this._map.zoomToInitialExtent();
  var lyr = (this._stateLyr || this._districtLyr);
  trace(">>>lyr:", lyr)
  lyr && lyr.showHoverSymbolById(-1);
};


CongressMap.prototype.initMap = function() {

  var map = this._map = new Map(this._div, this._opts);

};