/* @requires big_map_common, nov2012_change */


Opts.copyAllParams(E, {

  PRES_2012_VIEW:"pres_2012_view",
  PRES_2008_VIEW:"pres_2008_view",
  PRES_2004_VIEW:"pres_2004_view",
  PRES_2000_VIEW:"pres_2000_view", 
  PRES_1996_VIEW:"pres_1996_view", 
  SENATE_2000_VIEW:"senate_2000_view", 
  SENATE_2012_VIEW:"senate_2012_view",
  INCOME_VIEW:"income_view",
  WHITE_VIEW:"white_view",
  BLACK_VIEW:"black_view",
  HISPANIC_VIEW:'hispanic_view'  
}
);


function SideBySidePanel(mainMap) {

  var mainOpts = mainMap._opts;
  var map = mainMap._map;

  // receive opts: state_data, county_data, side (left|right)
  var w = mainOpts.width;
  var h = mainOpts.height;

  var cont = El(map.div).child('div').addClass('nytg-double-map-wrapper');
  var leftEl = cont.child('div').addClass('nytg-side-map');
  var rightEl = cont.child('div').addClass('nytg-side-map');

  cont.hide();

  var halfWidth = w / 2;

  var sideOpts = {
    width: halfWidth,
    county_shapes: mainMap._countyShapeData,
    county_data: mainMap._countyData,
    state_shapes: mainMap._stateShapeData,
    state_data: mainMap._stateData
  };

  sideOpts.views = [
    E.PRES_2012_VIEW

  ];

  Opts.copyNewParams(sideOpts, mainOpts);



  leftEl.css("background-color:#ffcccc").css('width', halfWidth).css('height', h);
  rightEl.css("background-color:#ffffcc").css('width', halfWidth).css('height', h);

  var leftOpts = Opts.copyNewParams(sideOpts, mainOpts);
  var rightOpts = Opts.copyAllParams({}, leftOpts);

  // var leftMap = new SideBySideMap(leftEl.node(), leftOpts);
  // var rightMap = new SideBySideMap(rightEl.node(), rightOpts);


  this.show = function() {
    cont.show();
  };

  this.hide = function() {
    cont.hide();
  };
}


function SideBySideMap(div, opts) {

  this._countyShapeData = opts.county_shapes;
  this._countyData = opts._countyData;
  this._stateShapeData = opts.state_shapes;
  this._stateData = opts.state_data;

  // triggers initMap(), creates Waiter named _loader
  this.__super__(div, opts);

  this._loader.startWaiting();

}

Opts.inherit(SideBySideMap, BigMap);



// SideBySideMap.prototype.initView = function(name)


SideBySideMap.prototype.initView = function(name) {
  var map = this._map;
  var view = map.views.getView(name);




};
