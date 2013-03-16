/* @requires basic_congress_map, house113_albers */


var districtShapes;
var districtTable = new DataTable(nytg.data.house113_albers);

var stateShapes;

function HouseMap(div, opts) {
  opts = Opts.copyAllParams({dragging:true, limitPanning:true, doubleClickZoom:true}, opts)
  this.__super__(div, opts);
  var districtsUrl = opts.districts_url || "http://graphics8.nytimes.com/newsgraphics/projects/congressional-votes/nytg_cd113_shapes.js";
  var districtsName = opts.districts_name || "nytg_cd113_shapes";
  // load shapes
  // var districtLoader = new ScriptLoader(districtsUrl, "utf-16be");
  var districtLoader = new ScriptLoader(districtsUrl);
  // var stateLoader = new ScriptLoader("http://graphics8.nytimes.com//packages/js/newsgraphics/projects/election_2012/nov6_maps/data/states_albers.utf16be.js", "utf-16be");
  var stateLoader = new ScriptLoader("http://graphics8.nytimes.com/newsgraphics/projects/congressional-votes/nytg_state_shapes.js");

  var w = new Waiter().waitFor(districtLoader).waitFor(stateLoader).startWaiting().on('ready', function() {

    districtShapes = new ShapeData(C.POLYGONS);
    // districtShapes.importFromString(nytg.data[districtsName], {transform: new AlbersUSASpecial()});
     //districtShapes.importFromString(nytg.data[districtsName], {transform: new AlbersUSASpecial()});
    trace("******* importing: ", Utils.getKeys(window[districtsName]))
    districtShapes.importFromObject(window[districtsName]);
    stateShapes = new ShapeData(C.INNERLINES);
    stateShapes.importFromObject(nytg_state_shapes);
    // stateShapes.importFromString(nytg.data.states_albers_utf16be);

    this.initLayers(this._map);

  }, this);
}

Opts.inherit(HouseMap, CongressMap);



HouseMap.prototype.initLayers = function(map) {

  var houseLyr = this._districtLyr = new ShapeLayer(districtShapes, {});
  var styler = this.getDistrictStyle();
  houseLyr.setStyler(styler);
  map.addLayer(houseLyr);
  houseLyr.setInteraction(true);

  var popup = this._popup = new HTMLPopup(null, {map:map});

  houseLyr.on('rollover', function(evt) { 
    this.showPopup(popup, evt.rec);
  }, this)


  houseLyr.on('rollout', function(evt) { 
    popup.hide();
  }, this)

  var stateLyr = new ShapeLayer(stateShapes, {});
  stateLyr.setStyle({
    strokeWeight:this._opts.width > 500 ? 2 : 1, 
    strokeColor:0xffffff, 
    strokeAlpha:1
  });
  map.addLayer(stateLyr);

  map.display();
};



Opts.exportObject("nytg.HouseMap", HouseMap);