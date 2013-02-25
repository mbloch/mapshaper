/* @requires basic_congress_map, states_wgs84, html-zoom-control-v2 */

function SenateMap(div, opts) {
  this.__super__(div, opts);


  this.stateTable = new DataTable(nytg.data.states_wgs84);

  // load shapes
  // var stateLoader = new ScriptLoader("http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/nov6_maps/data/states_albers.utf16be.js", "utf-16be");
  var stateLoader = new ScriptLoader("http://graphics8.nytimes.com/newsgraphics/projects/congressional-votes/nytg_state_shapes.js");
  // http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/nov6_maps/data/states_albers.utf16be.js
  var w = new Waiter().waitFor(stateLoader).startWaiting().on('ready', function() {
    var stateShapes = this._stateShapes = new ShapeData(C.POLYGONS, C.INNERLINES, C.OUTERLINES);
    // stateShapes.importFromString(nytg.data.states_albers_utf16be, {transform: new AlbersUSASpecial()});
    stateShapes.importFromObject(nytg_state_shapes);
    this.initLayers(this._map);

  }, this);
}


Opts.inherit(SenateMap, CongressMap);

SenateMap.prototype.initLayers = function(map) {

  var stateLyr = this._stateLyr = new ShapeLayer(this._stateShapes, {shapeType: C.POLYGONS});
  //stateLyr.setStyle({strokeWeight:2, strokeColor:0xff0000, strokeAlpha:1});
  stateLyr.setStyler(this.getStateStyle());
  map.addLayer(stateLyr);
  stateLyr.setInteraction(true);

  var popup = this._popup = new HTMLPopup(null, {map:map});

  stateLyr.on('rollover', function(evt) {
    this.showPopup(popup, evt.rec);
  }, this)

  stateLyr.on('rollout', function(evt) { 
    popup.hide();
  }, this);

  var stateLineLyr = new ShapeLayer(this._stateShapes, {shapeType: C.INNERLINES});
  stateLineLyr.setStyle({strokeWeight:2, strokeColor:0xffffff, strokeAlpha:1});
  map.addLayer(stateLineLyr);

  map.display();

};