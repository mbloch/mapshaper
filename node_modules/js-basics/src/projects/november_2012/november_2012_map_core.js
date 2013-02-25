/* @requires election-2012, albersusa-special, mercator, loading.script, map-opts, map-core-notiles, map-core-flash, html-popup, format, state-names, county-names, state-fips, ordinal, elements, phantom-capture */
/* @requires state_labels, textutils */
/* @requires hybrid-labels, notiles-labels, hsv */

if (!A.gotStyle) {
  A.gotStyle = true;
  Browser.loadStylesheet("http://graphics8.nytimes.com/packages/css/newsgraphics/projects/election_2012/nov6_maps/election-map.css");
}

var flashHome = "http://graphics8.nytimes.com/packages/flash/newsgraphics/projects/election_2012/primary_maps/";
// Map.init({flashUrl:flashHome + "hybrid_map_01.swf", preferFlash:false});
//Map.init({flashUrl:"http://localhost.nytimes.com/~199000/swf/hybrid_map_03.swf", preferFlash:true});
Map.init({flashUrl:flashHome + "hybrid_map_03.swf", preferFlash:false});


Opts.copyAllParams(Election2012, {

  ZOOM_ENABLED: !Browser.touchEnabled,
  BIG_MAP_WIDTH: 840,
  BIG_MAP_HEIGHT: 540,
  BIG_MAP_PROJECTION: new AlbersUSASpecial(),
  STATE_MAP_WIDTH: 400,
  STATE_MAP_HEIGHT: 400,
  STATE_MAP_PROJECTION: new Mercator(),
  NO_LABEL_STATES: 'DC,HI,VT,NH,MA,RI,CT,DE,MD,PR,NJ',
  NATIONAL_MAP_BAKED_WIDTHS: [1004, 940, 780, 620, 580, 460, 300, 220, 156, 108],
  NATIONAL_MAP_BAKED_VIEWS: [Election2012.STATE_WINNER_VIEW],
  NATIONAL_MAP_WH_RATIO: 1.7,

  loadShapeFiles: function(index, callback) {
    var w = new Waiter();
    Utils.forEach(index, function(url, key) {
      // TODO: validate when ready
      var loader = new ScriptLoader(url, 'utf-16be');
      w.waitFor(loader)
    });
    w.startWaiting();
    w.on('ready', callback);
  },

  getBigMapOpts: function(electionType) {
    var obj = {
      national_map: true,
      width: this.BIG_MAP_WIDTH,
      height: this.BIG_MAP_HEIGHT,
      crs: new MapCRS(this.BIG_MAP_PROJECTION),
      center: MapOpts.ALBERS_US_CENTER.clone(),
      spacing: 10,
      widthKm: MapOpts.ALBERS_US_WIDTH_KM,
      heightKm: MapOpts.ALBERS_US_HEIGHT_KM,

      limitPanning : true,
      scrollWheelZoom : false,
      // disable_zooming : true, // for Erin's mobile map
      doubleClickZoom : false,
      dragging : false,
      zooming: false,
      pinchZoom : false,
      show_gains: true,
      enable_pinch: true
      //show_legend:false
    };

    obj.enable_zooming = true;

    if (electionType == 'house') {
      //obj.center.lng -= 0.5;
      //obj.center.lat -= 0.8;
      //obj.crs = new MapCRS(new SphericalMercator());
      obj.initial_view = Election2012.DISTRICT_WINNER_VIEW;
      obj.views = [obj.initial_view];
    }
    else {
      obj.views = [Election2012.STATE_WINNER_VIEW, Election2012.COUNTY_MARGIN_VIEW, Election2012.COUNTY_MARGIN_BUBBLE_VIEW /*, Election2012.COUNTY_VOTES_BUBBLE_VIEW,Election2012.COUNTY_HOLLOW_BUBBLE_VIEW */ ];
      obj.initial_view = Election2012.STATE_WINNER_VIEW;
    }

    return obj;
  },

  getSyndicationMapOpts: function(electionType) {
    var obj = {
      //force_state_labels: true, // show state labels at any width
      //width: 600,
      //height: 400,
      crs: new MapCRS(this.BIG_MAP_PROJECTION),
      center: MapOpts.ALBERS_US_CENTER.clone(),
      widthKm: MapOpts.ALBERS_US_WIDTH_KM
    };

    //obj.views = [Election2012.STATE_WINNER_VIEW];
    //obj.initial_view = Election2012.STATE_WINNER_VIEW;

    return obj;
  },

  getStateMapOpts: function(electionType) {
    var obj = {
      spacing: 2,
      width: this.STATE_MAP_WIDTH,
      crs: new MapCRS(this.STATE_MAP_PROJECTION),
      height: this.STATE_MAP_HEIGHT,
      dragging:false,
      doubleClickZoom:false,
      scrollWheelZoom:false,
      //center: MapOpts.ALBERS_US_CENTER.clone(),
      // widthKm: MapOpts.MERCATOR_US_WIDTH_KM
      //views: [Election2012.COUNTY_MARGIN_VIEW, Election2012.COUNTY_MARGIN_BUBBLE_VIEW, Election2012.COUNTY_MARGIN_CHANGE_VIEW, Election2012.DISTRICT_WINNER_VIEW]
      views: [Election2012.COUNTY_MARGIN_VIEW, Election2012.COUNTY_MARGIN_BUBBLE_VIEW, Election2012.COUNTY_COXA_CHANGE_VIEW, Election2012.DISTRICT_WINNER_VIEW]
    };

    if (electionType == 'house') {
      obj.initial_view = Election2012.DISTRICT_WINNER_VIEW;
    }
    else {
      obj.initial_view = Election2012.COUNTY_MARGIN_VIEW;
    }

    return obj;
  }

});

Election2012.BigMapStateStyle = {
  strokeWeight: 1,
  strokeAlpha: 1,
  strokeColor: 0,
  fillColor: 0,
  fillAlpha: 0

};

Election2012.BigMapCountyStyle = {


};

function VoteMap(div, opts) {

  if (opts.disable_zooming) {
    opts.doubleClickZoom = false;
    opts.scrollWheelZoom = false;
    opts.pinchZoom = false;
  }

  if (opts.enable_pinch && Browser.touchEnabled) {
    opts.pinchZoom = true;
    opts.limitPanning = true;
    opts.dragging = true;
  }

  opts.combineLayers = false; // disable layer combining

  // Validate opts
  if (!opts.initial_view || !Utils.contains(opts.views, opts.initial_view)) {
    trace("*** [VoteMap()] Missing initial_view or initial_view not in views; initial_view:", opts.initial_view, "views:", opts.views);
  }

  if (!opts.width) {
    trace("*** [VoteMap()] Missing map width");
  }

  this._selectOnHover = Browser.touchEnabled;

  this._opts = opts;
  this._div = div;
  this.initMap();
}

Opts.inherit(VoteMap, Waiter);

/*
VoteMap.prototype.setView = function(view) {
  if (!this._map) {
    trace("[VoteMap.setView()] Map not yet initialized.");
    return;
  }

  this._map.views.setView(view);
};*/

VoteMap.prototype.setMapView = function(view) {
  if (!this._map) {  // map has not been initialized yet
    opts.initial_view = view;
  }
  else {
    this._map.views.setView(view);
  }
};


VoteMap.prototype.updateSpacingByWidth = function(w) {
  var values = [1, 2, 3, 4];
  var breaks = [200, 300, 500];
  var spacing = values[Utils.getClassId(w, breaks)];
  var opts = this._opts;
  if (this._map) {
    this._map._spacing = null;
    opts = this._map._opts;
  }
  opts.spacing = spacing;
}


VoteMap.prototype.initMap = function() {
  var mapOpts = this._opts;
  var map = this._map = new Map(this._div, mapOpts);
  this.waitFor(map);
  this.startWaiting();

  if (!this._opts.disable_popup) {
    this._popup = new HTMLPopup(null, {map:this._map, offset: E.USE_FLASH ? 24 : 18}); 
  }

  var w = this._loader = new Waiter();
  w.on('ready', function() {
    // TODO: init all layers that the map will require... (need to request these)
    this.initLayers();

    // trace("[VoteMap.initMap()] setView():", mapOpts.initial_view, "&& map.display()")
    map.views.setView(mapOpts.initial_view);
    map.display();

  }, this);
};


VoteMap.prototype.initView = function(name) {
  var view = this._map.views.getView(name);
  var styler;

  trace("** [VoteMap.initView()]", name);

  if (name == Election2012.STATE_WINNER_VIEW) {

    // county layer for zoomed-in view
    //
    if (this._opts.enable_zooming && this._countyData && !this._opts.no_counties) {
      var countyLyr = this.getCountyLayer(); 
      styler = this.getCountyZoomStyler();
      view.setLayerStyler(countyLyr, styler);
      view.setLayerInteraction(countyLyr, true);
    }

    var stateLyr = this.getStateLayer();
    styler = this.getStateWinStyler(this._stateRawData, this._stateData);
    view.setLayerStyler(stateLyr, styler);
    view.setLayerInteraction(stateLyr, true);

    var labelLyr = this.getStateLabelLayer(this._stateData);
    view.showLayer(labelLyr);

    view.on('enter', function(evt) {
      this.updateStateGainStyler(styler);
    }, this);

    view.on('leave', function(evt) {
      stateLyr.hide();
      labelLyr.hide();
    }, this);

  }
  else if (name == Election2012.COUNTY_MARGIN_VIEW) {
    var countyLyr = this.getCountyLayer();
    styler = this.getWinPctStyler(this._countyRawData, this._countyData);

    this.initStylerStroke(styler);

    view.setLayerStyler(countyLyr, styler);
    view.setLayerInteraction(countyLyr, true);

    view.on('leave', function(evt) {
      countyLyr.hide();
    }, this);


  }
  /*
  else if (name == Election2012.COUNTY_MARGIN_CHANGE_VIEW) {
    var countyLyr = this.getCountyLayer();
    styler = this.getMarginChangeStyler(this._countyData);
    view.setLayerStyler(countyLyr, styler);
    view.setLayerInteraction(countyLyr, true);

    view.on('leave', function(evt) {
      countyLyr.hide();
    }, this);
  }
  */

  else if (name == E.COUNTY_COXA_CHANGE_VIEW) {

    var countyLyr = this.getCountyLayer();
    var styler = new DataStyler(this._countyData);
    styler.setDefaultStyle({fillColor: 0xe2e2e2, fillAlpha:1, hoverStrokeWeight:1, hoverStrokeAlpha: 1, hoverStrokeColor: 0, strokeColor: 0xffffff, strokeAlpha: 0.3, strokeWeight: 1});
    view.setLayerStyler(countyLyr, styler);
    view.setLayerInteraction(countyLyr, true);


    var changeLyr = this.getChangeLayer(this._countyRawData, this._countyData);
    view.showLayer(changeLyr);
    view.on('leave', function(evt) {
      countyLyr.hide();
      changeLyr.hide();
    }, this);

  }
  else if (name == Election2012.COUNTY_MARGIN_BUBBLE_VIEW) {
    var countyLyr = this.getCountyLayer();
    view.setLayerStyle(countyLyr, {fillColor: 0xe2e2e2, fillAlpha:1, strokeColor: 0xffffff, strokeAlpha: 0.2, strokeWeight: 1});


    var countyCircleLayer = this.getCountyCircleLayer();
    styler = this.getMarginBubbleStyler(this._countyRawData, this._countyData);
    view.setLayerStyler(countyCircleLayer, styler);
    view.setLayerInteraction(countyCircleLayer, true);

    view.on('leave', function(evt) {
      countyCircleLayer.hide();
      countyLyr.hide();
    }, this);

  }
  else if (name == Election2012.DISTRICT_WINNER_VIEW) {
    /* */
    if (this._opts.national_map) {
      var stateLayer = this.getStateLayer(); // this forces state shapes to be created (needed for zoom-to-state)
      stateLayer.hide();
    }
    var houseLayer = this.getHouseLayer();
    styler = this.getWinStyler(this._houseRawData, this._houseData);
    //styler = new DataStyler(this._houseData);
    //styler.setDefaultStyle({strokeWeight:1, strokeColor:0xff9999, strokeAlpha:1});
    view.setLayerStyler(houseLayer, styler);
    view.setLayerInteraction(houseLayer, true);

    view.on('leave', function(evt) {
      houseLayer.hide();
    });

  }
  else if (name == Election2012.STATE_FORECAST_VIEW) {

    stateLyr = this.getStateLayer();
    styler = this.getForecastStyler(this._stateRawData, this._stateData);
    view.setLayerStyler(stateLyr, styler);
    view.setLayerInteraction(stateLyr, false);

    var labelLyr = this.getStateLabelLayer(this._stateData);

  }
  else if (name == Election2012.COUNTY_VOTES_BUBBLE_VIEW) {
    var countyLyr = this.getCountyLayer();
    view.setLayerStyle(countyLyr, {fillColor: 0xe2e2e2, fillAlpha:1});

    var countyCircleLayer = this.getCountyCircleLayer();
    styler = this.getVotesBubbleStyler(this._countyRawData, this._countyData);
    view.setLayerStyler(countyCircleLayer, styler);
    view.setLayerInteraction(countyCircleLayer, true);

    view.on('leave', function(evt) {
      countyCircleLayer.hide();
      countyLyr.hide();
    }, this);

  }
  else if (name == Election2012.COUNTY_HOLLOW_BUBBLE_VIEW) {
    var countyLyr = this.getCountyLayer();
    view.setLayerStyle(countyLyr, {fillColor: 0xe2e2e2, fillAlpha:1});

    var countyCircleLayer = this.getCountyCircleLayer();
    styler = this.getHollowBubbleStyler(this._countyRawData, this._countyData);
    view.setLayerStyler(countyCircleLayer, styler);
    view.setLayerInteraction(countyCircleLayer, true);

    view.on('leave', function(evt) {
      countyCircleLayer.hide();
      countyLyr.hide();
    }, this);
  }
  else if (name == E.SIDE_BY_SIDE_VIEW) {

    // TODO: show/hide regular map... 
    var sbsPanel = new SideBySidePanel(this);

    view.on('enter', function() {
      sbsPanel.show();
    });

    view.on('leave', function() {
      sbsPanel.hide();
    })

  }

  this._opts.national_map && this.getStateLineLayer();

  // init city labels (assume relevant)
  if (!this._map._opts.no_counties) {
    var cityLabelLyr = this.getCityLabelLayer();
  }

};



/**
 *  Set up layers and views; assume all data has been loaded...
 *
 */
VoteMap.prototype.initLayers = function() {
  var views = this._opts.views;
  var index = Utils.arrayToIndex(views);

  // TODO: validate county data
  /*
  var needHouseLyr = Election2012.DISTRICT_WINNER_VIEW in index;
  var needStateLyr = Election2012.STATE_WINNER_VIEW in index;
  var needCountyLyr = Election2012.COUNTY_MARGIN_VIEW in index;
  var needCountyCircleLyr = Election2012.COUNTY_MARGIN_BUBBLE_VIEW in index;

  var stateLyr = needStateLyr && this.initStateLayer();
  var countyLyr = needCountyLyr && this.initCountyLayer();
  var houseLyr = needHouseLyr && this.initHouseLayer();
  var countyCircleLyr = needCountyCircleLyr && this.initCountyCircleLyr();
  */

  for (var i=0; i<views.length; i++) {
    var viewName = views[i];
    var view = this.initView(viewName); 
  }

};


VoteMap.prototype.displayMap = function() {
  this._loader.startWaiting();

  //this._loader.on('ready', function() {trace('loader LOADED')});
  // this._map.display();
};


VoteMap.prototype.loadShapeFile = function(obj) {
  if (obj.shape_url && obj.shape_name) {
    //trace("[VoteMap.loadShapeFile()]; url:", obj.shape_url);
    var types = obj.shape_types || obj.shape_type || C.POLYGONS;
    var data = new ShapeData(types);
    var loader = new ScriptLoader(obj.shape_url, "utf-16be", {no_bust:true});
    loader.on('ready', function() {
      //var shapeStr = Opts.getNamespace(obj.shape_name);
      data.importFromString(nytg.data[obj.shape_name], {transform: obj.shape_transform})
      //data.importFromString(shapeStr, {transform: obj.shape_transform})
    }, this);
  }
  else {
    trace("[VoteMap.loadShapeFile()] Expecting shape_url and shape_name properties; found:", Utils.getKeys(obj));
  }
  return data;
};


VoteMap.prototype.update = function(obj) {
  var countyData = obj.county_data;
  var stateData = obj.state_data;
  var houseData = obj.house_data;

  if (!(countyData || stateData || houseData)) {
    trace("[VoteMap.update()] missing one or more expected data properties: county_data, state_data, house_data");
    return;
  }

  countyData && this.updateCountyData(countyData);
  stateData && this.updateStateData(stateData);
  houseData && this.updateHouseData(houseData);
  this.refreshAfterUpdate();
};

VoteMap.prototype.refreshAfterUpdate = function() {
  // kludge
  var lyr = this._stateLyr;
  lyr && lyr.styler && lyr.styler.invalidate();
  lyr = this._countyLyr;
  lyr && lyr.styler && lyr.styler.invalidate();

  var map = this._map;
  // TODO: make sure map gets refreshed....
  map && map.isReady() && map.refreshLayers();

  // retrigger selection handler
  if (this._haveSelection) {
    this.triggerSelect(this._selectedRecord, this._selectedGeoType, false);
  }  
}

VoteMap.prototype.selectEvent = function(callback) {
  this.on('select', function(evt) {callback(evt.data);})
};

VoteMap.prototype.deselectEvent = function(callback) {
  this.on('deselect', function(evt) {callback()})
};

VoteMap.prototype.initHouseData = function(obj) {

  if (obj.geo_data) {
    this._houseShapeData =  obj.shape_data || this.loadShapeFile(obj);
    this._houseData =new DataTable(obj.geo_data);
    // trace("[initHouseData()] fields:", this._houseData, "keys:", Utils.getKeys(obj.geo_data));
  }

  obj.importer && this.updateHouseData(obj.raw_data, obj.importer);
}



/**
 *
 */
VoteMap.prototype.updateHouseData = function(raw, importer) {
  this._houseImporter = importer || this._houseImporter;

  if (!this._houseData) {
    trace("[VoteMap.updateHouseData()] Missing this._houseData");
    return;
  }

  raw = raw.races || raw;
  this._houseRawData = raw;
  this._houseImporter(raw, this._houseData, 'KEY');
  var styler = this._houseLyr && this._houseLyr.styler;
  styler && styler.invalidate();
};


VoteMap.prototype.initStateData = function(obj) {
  if (obj.geo_data) {
    obj.shape_types = [C.POLYGONS, C.INNERLINES];
    this._stateShapeData = this.loadShapeFile(obj);
    this._stateData = new DataTable(obj.geo_data);
  }


  if (obj.importer && obj.raw_data) {
    this.updateStateData(obj.raw_data, obj.importer);
  }
};


VoteMap.prototype.updateStateData = function(raw, importer) {
  this._stateImporter = importer || this._stateImporter;

  if (!this._stateData) {
    trace("[VoteMap.updateStateData()] Missing this._stateData()");
    return;
  }
  raw = raw.races || raw;

  this._stateRawData = raw;
  this._stateImporter(raw, this._stateData, 'STATE');

  // Warning: this might not work on map with multiple switchable views
  var styler = this._stateLyr && this._stateLyr.styler;
  styler && styler.invalidate();

};

VoteMap.prototype.initCountyData = function(obj) {

  if (obj.geo_data) {
    this._countyShapeData = obj.shape_data || this.loadShapeFile(obj);
    this._countyData = new DataTable(obj.geo_data);
  }

  obj.importer && this.updateCountyData(obj.raw_data, obj.importer);

};

// receive: raw data
//
VoteMap.prototype.updateCountyData = function(raw, importer) {
  this._countyImporter = importer || this._countyImporter;

  // case: county data hasn't been initialized yet
  if (!raw) {

  }
  else if (!this._countyData) {
    this._opts.county_data = raw;
  }
  else {
    this._countyRawData = raw;
    var retn = this._countyImporter(raw, this._countyData, 'FIPS');
    var styler = this._countyLyr && this._countyLyr.styler;
    styler && styler.invalidate();

    this._countyImportData = retn;
    // trace(">>>> [VoteMap.updateCountyData()] import data:", retn);
  }
};


VoteMap.prototype.triggerSelect = function(rec, geoType, zoom, tween) {
  var data = this.getLocationData(rec, geoType);
  this._haveSelection = true;
  this._selectedRecord = rec.clone();
  this._selectedGeoType = geoType;
  this._selectedState = data.state_id;

  if (zoom !== false && this._opts.national_map) {
    this.zoomToState(data.state_id, tween);
  }
  this.dispatchEvent("select", data);
};





VoteMap.prototype.handleClick = function(evt) {
  this.triggerSelect(evt.rec, evt.target._opts.geography_type);
};



var zoomLocations = {
  nyc: {
    lat: 40.741014,
    lng: -74.042358,
    zoom: 5
  }
};

VoteMap.prototype.selectState = function(st, zoom, tween) {
  if (!this._stateData) {
    trace("[VoteMap.selectState()] Missing state data; returning");
    return;
  }
  var rec = this._stateData.getMatchingRecord('STATE', st);
  //this.selectLocation(rec, 'state', zoom, tween);
  this.triggerSelect(rec, 'state', zoom, tween);
};

VoteMap.prototype.selectLocation = function(rec, geotype, zoom, tween) {


};

VoteMap.prototype.zoomToState = function(st, allowTween) {

  if (this._opts.enable_zooming === false) {
    return;
  }

  var stateRec = this._stateData.getMatchingRecord('STATE', st);
  if (stateRec.isNull()) {
    trace("[VoteMap.handleClick()] State not found:", st);
    return;
  }

  trace("[zoomToState()] st:", st);

  // WARNING: if dragging is enabled, this causes problems
  if (A.selectedState == st) {
    // return;
  }

  A.selectedState = st;

  var evt = {
    rec: stateRec.clone(),
    state: st
  };

  //A.selectedFips = StateFips.getFips(st);
  ///trace(">>> selectefips:", A.selectedFips);

  this.dispatchEvent("select_state", evt);


  if (!this._opts.disable_zooming) {

    // zoom
    var sym = this._stateLyr.getSymbolById(stateRec.id);
    // trace(">>> click; sym:", sym, stateRec);

    var zoomOpts = {bounds:sym, spacing:25};
    zoomOpts.tween = allowTween !== false && Browser.touchEnabled == false;

    if (this._panel) {

      var spacing = [4, 4, 4 + this._panel.width, 4];
      zoomOpts.spacing = spacing;
    }

    this._map.zoom(zoomOpts);    
  }



};


VoteMap.prototype.zoomOut = function() {
  A.selectedState = null;
  A.selectedFips = null;
  this.dispatchEvent("deselect_state");

  var zoomOpts = {
    bounds: this._map.getInitialBounds()
  };
  this._map.zoom(zoomOpts);
};


VoteMap.prototype.formatPct = function(pct, nan) {
  return nan ? "-" : Utils.formatNumber(pct, 1) + '%';
};

VoteMap.prototype.formatVotes = function(votes, nan) {
  return nan ? '-' : Utils.formatNumber(votes);
};

VoteMap.prototype.formatChange = function(margin, nan) {
  return nan ? '-' : Utils.formatNumber(margin, 1, '-', true) + "%";
};

VoteMap.prototype.getChangeObj = function(party, nan, votes2012, pct2012, votesPast, pctPast) {
  var obj = {
    party : (party == 'DEM') && 'Dem.' || (party == 'REP') && 'Rep.' || 'Others',
    pctNow : this.formatPct(pct2012, nan),
    votesNow : this.formatVotes(votes2012, nan),
    change : this.formatChange(pct2012 - pctPast, nan),
    pctPast : this.formatPct(pctPast),
    votesPast : this.formatVotes(votesPast)
  }

  return obj;
};

VoteMap.prototype.getChangeTable = function(cands, obj, panel) {
  var html = "";

  if (obj.noElection) {
    return html;
  }

  var year = this.changeMapYear0;

  // a. get rep / dem data for this election
  var data = [];
  var dem = 0;
  var rep = 0;
  var tot = obj.total_votes;

  for (var i=0; i<cands.length; i++) {
    var cand = cands[i];
    if (cand.party == 'DEM') {
      dem = cand.votes;
    }
    else if (cand.party == 'REP') {
      rep = cand.votes;
    }
  }

  var demPct = tot > 0 ? dem / tot * 100 : 0;
  var repPct = tot > 0 ? rep / tot * 100 : 0;
  var oth = tot - dem - rep;
  var othPct = tot > 0 ? oth / tot * 100 : 0;

  var dem0 = obj['d' + year];
  var rep0 = obj['r' + year];
  var tot0 = obj['tv' + year];

  var dem0Pct = tot0 > 0 ? dem0 / tot0 * 100 : 0;
  var rep0Pct = tot0 > 0 ? rep0 / tot0 * 100 : 0;
  var oth0 = tot0 - dem0 - rep0;
  var oth0Pct = tot0 > 0 ? oth0 / tot0 * 100 : 0;

  var nan = tot == 0;

  var demObj = this.getChangeObj('DEM', nan, dem, demPct, dem0, dem0Pct);
  var repObj = this.getChangeObj('REP', nan, rep, repPct, rep0, rep0Pct);
  var othObj = this.getChangeObj('OTH', nan, oth, othPct, oth0, oth0Pct);

  var arr = rep > dem ? [repObj, demObj, othObj] : [demObj, repObj, othObj];


  // trace("[VoteMap.getChangeTable] now:", demPct, repPct, othPct, "then:", dem0Pct, rep0Pct, oth0Pct);
  var head = panel ? 
    Utils.format('<tr><th class="nytg-change-party">Party</th><th class="nytg-change-pct">2012</th><th class="nytg-change-pct">%s</th><th class="nytg-change-points">Change</th></tr>', year) :
    Utils.format('<tr><th class="nytg-change-party"></th><th class="nytg-change-th2" colspan="2">Vote in 2012</th><th class="nytg-change-th2" colspan="2">Vote in %s</th></tr>', year);

  // head = "";
  var body = "";

  for (var i=0; i<arr.length; i++) {
    var obj = arr[i];
    var tdClass = i > 0 ? " nytg-popup-lower-row" : "";
    body += !panel ? 
      Utils.format('<tr><td class="nytg-change-party%s">%s</td><td class="nytg-change-votes%s">%s</td><td class="nytg-change-pct%s">%s</td><td class="nytg-change-votes%s">%s</td><td class="nytg-change-pct%s">%s</td></tr>', tdClass, obj.party, tdClass, obj.votesNow, tdClass, obj.pctNow, tdClass, obj.votesPast, tdClass, obj.pctPast) :
      Utils.format('<tr><td class="nytg-change-party">%s</td><td class="nytg-change-pct">%s</td><td class="nytg-change-pct">%s</td><td class="nytg-change-points">%s</td></td>', obj.party, obj.pctNow, obj.pctPast, obj.change);
  }


  html = '<table cellpadding=\"0\" cellspacing=\"0\">' + head + body + '</table>';

  return html;
}

/**
 * @param cands Array of candidate data objs, params: votes, vote_pct, cand_longname, cand_shortname
 */
VoteMap.prototype.getPopupTable = function(cands, obj) {
  var html = "";

  if (this._map.views.getCurrentView().name == E.COUNTY_MARGIN_CHANGE_VIEW) {
    html += this.getChangeTable(cands, obj, false);
  }
  else {
    html += "<table cellpadding=\"0\" cellspacing=\"0\"><tbody>";

    var row = '<tr><td class="nytg-popup-candidate%s">%s%s</td><td class="nytg-panel-party%s">%s</td><td class="nytg-popup-vote%s">%s</td><td class="nytg-popup-votepct%s">%s</td></tr>'
    for (var i=0; i<cands.length; i++) {
      var cand = cands[i];
      var tdClass = i > 0 ? " nytg-popup-lower-row" : "";
      var pctStr = cand.pct_str + "%";
      html += Utils.format(row, tdClass, cand.cand_shortname, cand.incumbent && obj.show_incumbent ? "*" : "", tdClass, cand.party_abbr, tdClass, cand.votes_str, tdClass, pctStr);
    }
    html += "</tbody></table>";
  }

  return html;
};


VoteMap.prototype.getPopupHTML = function(obj) {
  //trace("[VoteMap.getPopupHTML] obj:", obj)
  var titleStr = Utils.format('<div class="nytg-popup-title">%s</div>', obj.titleStr);



  if (obj.noElection || obj.no_county_data) {
    var html = titleStr + Utils.format('<div class="nytg-popup-note">%s</div>', obj.no_county_data ? "County data not available" : "No election");
    return html;
  }


  var tableHTML = obj.candidates ? this.getPopupTable(obj.candidates, obj) : "";

  var template = titleStr + "<div>%s</div>";
  var subStr = obj.pollClosingStr || obj.reportingStr;
  var html = Utils.format(template, subStr);
  html += tableHTML;

  if (obj.show_incumbent) {
    html += '<div class="nytg-popup-note">* Incumbent</div>';
  }

  return html;
};


VoteMap.prototype.getStateWinnerLongName = function(st) {
  var name = null;
  if (!this._stateData) {
    // probably a state map; no winner data
    return null;
  }
  var stateRec = this._stateData.getMatchingRecord('STATE', st);
  var rawIdx = stateRec.get('raw_idx');
  var results = this._stateRawData && this._stateRawData[rawIdx] && this._stateRawData[rawIdx].results;
  if (!results) {
    trace("[VoteMap.getStateWinnerLongName()] missing results data for state:", st, "keys:", Utils.getKeys(this._stateRawData));
    return null;
  }

  for (var i=0; i<results.length; i++) {
    var res = results[i];
    if (res.winner) {
      name = res.name;
      break;
    }
  }

  return name;
}

/**
 * Return data about a location that can be easily used in popups, etc.
 */
VoteMap.prototype.getLocationData = function(rec, geoType) {
  var electionType = this._opts.election_type;
  var obj = rec.getDataAsObject();

  obj.geography_type = geoType;
  obj.election_type = electionType;

  // TITLE
  //
  var title = "";
  var st = obj.STATE || obj.STATE_FIPS && StateFips.getState(obj.STATE_FIPS) || "";
  var stateName = StateNames.getName(st);

  obj.state_id = st;


  var title = "";
  if (geoType == 'state') {
    title = stateName;
  }
  else if (geoType == 'house_district') {
    if (Election2012.SingleDistrictStates.indexOf(st) != -1) {
      title = stateName;
    }
    else {
      var stateAbbr = StateNames.getAbbrev(st);
      title = stateAbbr + " " + obj.DISTRICT + Utils.getOrdinalSuffix(obj.DISTRICT) + " District";
    }
  }
  else if (geoType == 'county') {
    var countyName = geoType == 'county' ? CountyNames.adjustName(st, obj.NAME) : "";
    title = countyName;
    if (st == 'AK' && geoType == 'county') {
      obj.no_county_data = true;
    }
  }
  obj.titleStr = title;

  if (geoType == 'county' && this._opts.national_map) {
    obj.titleStr += ", " + StateNames.getAbbrev(st);
  }


  // NO ELECTION
  //
  if (obj.total_votes === void 0) {
    obj.noElection = true;
    obj.noElectionNote = "No election"
    return obj;
  }


  // get raw data....
  //
  if (geoType == 'county') {
    var rawData = this._countyRawData;
    var rawCands = Election2012.getCountyCandidateData(st, obj, rawData);

    var winnerName = this.getStateWinnerLongName(st);
    obj.called = !!winnerName;

  }
  else if (geoType == 'house_district') {
    rawData = this._houseRawData;
    rawCands = Election2012.getCandidateData(obj, rawData);
  }
  else if (geoType == 'state') {
    rawData = this._stateRawData;
    rawCands = Election2012.getCandidateData(obj, rawData);
  }

  //if (geoType == 'house_district' || geoType == 'state') {

  //}

  var destCands = [];

  var haveIncumbent = false;

  if (rawCands) {
    Utils.sortOn(rawCands, 'votes', false, 'cand_shortname', true);
    obj.candidates = destCands;

    var otherVotes = 0;

    for (var i=0; i<rawCands.length; i++) {
      var cand = rawCands[i];
      var votes = cand.votes;
      var pct = cand.vote_pct;
      var partyCode = cand.party;
      haveIncumbent |= (cand.incumbent || false);

      if (geoType == 'county') {
        cand.winner = winnerName == cand.cand_longname;
      }

      if (partyCode == 'REP' || partyCode == 'DEM' || votes > 0 && pct > 10 || cand.cand_longname == "Angus King" || cand.cand_longname == "Bernard Sanders") {
        cand.votes_str = Utils.formatNumber(cand.votes);
        cand.party_name = Election2012.getPartyName(cand.party);
        cand.party_abbr = Election2012.getPartyAbbr(cand.party);
        cand.pct_str = Utils.formatNumber(cand.vote_pct, 1);
        destCands.push(cand);
      }
      else {
        otherVotes += votes;
      }
    }

    if (otherVotes > 0) {
      var otherPct = otherVotes / obj.total_votes * 100;
      // trace("[  getLocationData()] otherVotes:", otherVotes, "total_votes:", obj.total_votes);
      var other = {
        cand_shortname: "Others",
        cand_longname:"Other candidates",
        votes_str: Utils.formatNumber(otherVotes),
        votes: otherVotes,
        party: "",
        party_name: "",
        party_abbr: "",
        pct_str: Utils.formatNumber(otherPct, 1),
        vote_pct: otherPct
      }
      destCands.push(other);
    }
  }
  else {
    // obj.candidates = [];
  }

  obj.show_incumbent = haveIncumbent && electionType != 'president' || false;

  // PCT REPORTING
  //
  var reportingStr = "";
  if (obj.total_votes > 0) {
    reportingStr = obj.pct_reporting ? obj.pct_reporting + "% reporting" : "<1% reporting";
  }
  else {
    reportingStr = "0% reporting";
  }

  obj.reportingStr = reportingStr;

  return obj;
};



VoteMap.prototype.handleRollOver = function(evt) {
  var target = evt.target;
  var geoType = target._opts.geography_type;

  


  //if (geoType == 'state' || geoType == 'house_district') {
  if (this._selectOnHover ) {
    this.triggerSelect(evt.rec, geoType)
    //this._selectionUpdate = fetch;
  }

  var data = this.getLocationData(evt.rec, geoType);
  var html = this.getPopupHTML(data);  var popup = this._popup;
  popup && popup.showHTML(html);
}



VoteMap.prototype.triggerDeselect = function() {
  if (this._haveSelection) {
    //this._deselectHandler && this._deselectHandler();
    //this._selectionUpdate = null;
    this._haveSelection = false;
    this.dispatchEvent('deselect');
  }
};

VoteMap.prototype.handleRollOut = function(evt) {
  this._popup && this._popup.hide();
  var targ = evt.target;
  var geoType = targ._opts.geography_type;
  if (this._selectOnHover) {
    this.triggerDeselect();
  }
}



function BigMap(div, opts) {
  this.__super__(div, opts);

}

Opts.inherit(BigMap, VoteMap);
