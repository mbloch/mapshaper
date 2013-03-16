/* @requires county-names, state-fips, hybrid, html-popup, textutils, data, albersusa-special, full-zoom-button, core.dev, dateutils, toggle-buttons, us-primary-2012-lib */

var voteDataUrl = ""; // "http://int-stg.ec2.nytimes.com/election_results/api/primary-map/"; // append state code for data url
var voteDataCallback = "";

var toggleButtons;

var currGeography = 'counties';
var candidateListSize = 4;

noDataCol = 0xe9e9e9;
var USE_HATCHING = true;
var LOAD_VOTES = true;
var SHOW_URBAN_AREAS = false; // Browser.touchEnabled; //true;
A.SHOW_OUTLINE = true;
var SHOW_LABELS = true;

var ENABLE_FILTERING = false;

var stIndex;
var stateCallback;

function create(opts) {
  return new StateMap(opts);
}

function StateMap(opts) {

  // list of candidates that should be displayed, ordered by 
  // default sort order (i.e. if vote tallies are 0)
  //var requiredCandidates = opts.requiredCandidates || [];
  
  var startupData = opts.voteData || null;

  if (!startupData) {
    trace("[StateMap] Missing vote data; bailing.");
    return;
  }


  ENABLE_FILTERING = !!opts.enableFiltering;


  var jsonLoader;

  var countyGeoTable;
  var countyCensusDataSource;
  var countyVoteDataSource;

  var defaultCircleStyle = {
    'fillAlpha':1, 'fill_color':0xffffff, 'strokeWeight':1, 'strokeColor':0x0, 'scaling':1, 'strokeAlpha':0.35,
    'hoverStrokeWeight':2, 'hoverStrokeColor':0x0, 'hoverStrokeAlpha':1
  };

  var currView = opts.view || "shapes";

  var heightPix = opts['height'] || 0;
  var widthPix = opts['width'] || 0;
  var spacing = opts.spacing || 0;

  var containerId = opts['id'];
  var containerDiv = opts['div'] || document.getElementById(containerId);
  
  if (!containerDiv) {
    trace("[StateMap.initMap()]  Missing container div; opts:", opts);
    return;
  }

  if (widthPix && !heightPix) {
    trace("[StateMap] warning: missing heightPix");
  }

  if (widthPix && heightPix) {

    var imageUrl = "http://graphics8.nytimes.com/packages/images/newsgraphics/projects/election_2012/";
    var key = new SwappingKey(containerDiv);
    var legendHeight = 28;
    var countyKey = imageUrl + "key-511-county.gif";
    var stateKey = imageUrl + "key-511-state.gif";
    key.addView('national', stateKey);
    key.addView('state', countyKey);
 
    containerDiv.style.width = widthPix + "px";
    containerDiv.style.height = heightPix + "px";

    heightPix -= legendHeight;
  }
  
  var css = cssHome + "primary-map.css";
  Hybrid.preferFlash(false);
  Hybrid.loadIfNoFlash(webHome + "us-primary-2012-canvas-bundle.js", css);
  Hybrid.loadIfFlash(webHome + "us-primary-2012-flash-bundle.js", css, flashHome + "hybrid_map_01.swf");
  Hybrid.addEventListener('ready', init, this);

  function init() {
    $ns = nytg.map; // created by loaded js bundle

    var w = new $ns.Waiter();


    calendarTable = new $ns.DataTable;
    calendarTable.importData(new $ns.JsonPLoader(webHome + "primary_calendar.js", "__receive_primary_calendar"), new $ns.TabDataParser());
    w.waitFor(calendarTable);

    //debugger;
    stateGeoTable = new $ns.DataTable(nytg.data.states_albers);
    initVoteData(opts.voteData);

    w.addEventListener('ready', initStateMap, this);
    w.startWaiting();
  }


  function initStateMap() {
    stateCallback = opts.stateCallback || null;
    var proj = new AlbersUSASpecial();
    var ctr = new $ns.GeoPoint(38.7, -96.6);
    var crs = new $ns.MapCRS(proj);

    var zoom = 6;
    var minZoom = zoom - 1;
    var mapLabelSizeBoost = widthPix && widthPix > 337 ? 2 : 0;
    var mapOpts = {
      combineLayers : true,
      center : ctr,
      zoom : zoom,
      // backgroundColor : 0xffcccc,
      spacing : opts.spacing || 0,
      spacingLeft : opts.spacingLeft,
      spacingTop : opts.spacingTop,
      spacingRight : opts.spacingRight,
      spacingBottom : opts.spacingBottom,
      minZoom : minZoom,
      maxZoom : zoom + 3,
      width : widthPix,
      height : heightPix,
      heightKm : heightKm,
      width_km : widthKm,
      widthKm : widthKm,
      crs : crs,
      //zooming : true,
      limitPanning : opts.limitPanning || true,
      scrollWheelZoom : false,
      doubleClickZoom : false,
      dragging : false,
      pinchZoom : false
    };

    //trace("[] map opts:", mapOpts);

    map = new $ns.Map(containerDiv, mapOpts);
    map.div.style.position = "relative"; // help layout out buttons

    var shapes = nytg.data.states_albers_mshp_utf16;
    //trace("[] shapes:", nytg.data);
    //var lyrOpts = {shapes:shapes, shape_type:'mshp', transformer:new AlbersUSASpecial()};
    //var stateData = new $ns.ShapeData().importFromString(shapes, new AlbersUSASpecial());
    var stateData = new $ns.ShapeData(C.POLYGONS, C.OUTERLINES).importFromString(shapes, {transform:new AlbersUSASpecial()})
    stateShapeLyr = new $ns.ShapeLayer(stateData, {shapeType:C.POLYGONS});

    if (false) {
      stateVoteDataSource = new $ns.LinkedDataSource(stateGeoTable, 'FIPS', stateVotesTable, 'location_fips');    
    }
    else {
      stateVoteDataSource = new $ns.JoinedTable(stateGeoTable).joinTable('FIPS', stateVotesTable, 'location_fips'); 
    }

    stateShapeStyler = new $ns.DataStyler(stateVoteDataSource);
    stateShapeStyler.setDefaultStyle({'fillAlpha':1, 'fillColor':0xe0e0e0, 'strokeColor':0xffffff, 'strokeWeight':1, 'strokeAlpha':0.7, 'hoverStrokeColor':0, 'hoverStrokeWeight':2/*, 'hoverFillColor':0xffcccc, 'hoverFillAlpha':0.8*/});
    stateShapeStyler.setAttributeStyler('fillColor', getStateShapeColor);
    stateShapeStyler.setAttributeStyler('hatchColor', getStateHatchColor);

    stateShapeLyr.setInteraction(true);
    stateShapeLyr.setStyler(stateShapeStyler);

    map.addLayer(stateShapeLyr);

    var counties = nytg.data.counties_albers_mshp_utf16;
    //var lyrOpts = {shapes:counties, shape_type:'mshp', transformer:new AlbersUSASpecial()};
    var countyData = new $ns.ShapeData().importFromString(counties, {transform:new AlbersUSASpecial()});
    countyShapeLyr = new $ns.ShapeLayer(countyData);
    
    countyGeoTable = new $ns.DataTable(nytg.data.counties_albers);
    if (false) {
      countyVoteDataSource = new $ns.LinkedDataSource(countyGeoTable, 'FIPS', countyVotesTable, 'location_fips');
    }
    else {
      T.start();
      countyVoteDataSource = new $ns.JoinedTable(countyGeoTable).joinTable( 'FIPS', countyVotesTable, 'location_fips'); 
      T.stop()
    }

    countyShapeStyler = new $ns.DataStyler(countyVoteDataSource);
    countyShapeStyler.setDefaultStyle({'fillAlpha':1, 'fillColor':0xe0e0e0, 'strokeColor':0xffffff, 'strokeWeight':1, 'strokeAlpha':0.4, 'hoverStrokeColor':0, 'hoverStrokeWeight':2/*, 'hoverFillColor':0xffcccc, 'hoverFillAlpha':0.8*/});

    countyShapeStyler.setAttributeStyler('fillColor', getShapeColor);
    countyShapeStyler.setAttributeStyler('hatchColor', getHatchColor);
    countyShapeStyler.setAttributeStyler('hidden', function(rec) { var fips = rec.getString('STATE_FIPS'); return fips != selectedStateFips || stateVotesIndex[fips] === undefined || noCountyFipsIndex[fips] === true});




    // 51 ms in ff -- a bit slow for ie8-

    map.views.getView("national")
      //.setLayerInteraction(stateShapeLyr, true)f
      //.setLayerStyler(stateShapeLyr, stateShapeStyler);
      .hideLayer(countyShapeLyr)
      .setLayerInteraction(countyShapeLyr, false);
      //.hideLayer(countyShapeLyr);

    map.views.getView("state")
      //.setLayerInteraction(stateShapeLyr, true)
      //.setLayerStyler(stateShapeLyr, stateShapeStyler);
      .setLayerInteraction(countyShapeLyr, true);
      //.setLayerInteraction(countyShapeLyr, true);

    countyShapeLyr.setStyler(countyShapeStyler);

    map.addLayer(countyShapeLyr);


    var usOutlineLyr = new $ns.ShapeLayer(stateData, {shapeType:C.OUTERLINES});
    usOutlineLyr.setStyle({fillAlpha:0, strokeWeight:1, strokeColor:countryOutlineCol});
    map.addLayer(usOutlineLyr);

    map.views.setView("national");
    key.setView('national');

    map.addEventListener('click', handleMapClick, this);

    if (SHOW_LABELS) {
      var labelTable = new $ns.DataTable();
      //labelTable.importData(new $ns.JsonPLoader(webHome + 'city_labels.js', '__receive_city_labels'), new $ns.TabDataParser(), new $ns.MatchFilter('st', st.toUpperCase()));
      labelTable.importData(new $ns.JsonPLoader(webHome + 'city_labels.js', '__receive_city_labels'), new $ns.TabDataParser());
      var labelData = new $ns.LabelData();
      labelData.importFromDataTable(labelTable, 'lat', 'lng', proj);

      labelLyr = new $ns.LabelLayer({symbols:labelData});
      labelStyler = new $ns.DataStyler(labelTable);
      labelStyler.setDefaultStyle({'placement':'e', 'size':13, 'dotSize':4, 'useHalo':true});
      labelStyler.setAttributeStyler('text', 'name');
      labelStyler.setAttributeStyler('placement', 'pos3');

      var detailZoom = zoom + 0.5;


      var getHidden = function(rec, zoom) {
        var hidden = zoom < detailZoom;
        var st = rec.getString('st');
        hidden = hidden || st != selectedState;
        hidden = hidden || rec.getString('statelevel') > 1;
        return hidden;
      };

      labelStyler.setAttributeStyler('hidden', getHidden, false );
      
      labelLyr.setStyler(labelStyler);
      map.addLayer(labelLyr);
    }

    
    map.display();

    if (opts.state) {
      this.showState(opts.state, {delay: 900, time: 1200});

      //map.addEventListener('ready', function() {
      //  debugger;
    }

    //var btn = new FullZoomButton('http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/zoom-to-us.gif', map, {top:5, left:5, tween:true})
    var btn = new FullZoomButton(new ImageButton('http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/zoom-to-us.gif'), map, {css:"top:5px; left:5px", top:5, left:5, tween:true})
    //var btn = new FullZoomButton(new LabelButton('Zoom to U.S.'), map, {top:5, left:5, tween:true})
    btn.addEventListener('click', function() { selectedState = ""; selectedStateFips = ""; map.views.setView('national'); key.setView('national'); });

    var popup = new HTMLPopup(popupCallback, {map:map, fixed:false});

    stateShapeLyr.addEventListener('rollover', popup.displayHandler, popup);
    stateShapeLyr.addEventListener('rollout', popup.hideHandler, popup);
    countyShapeLyr.addEventListener('rollover', popup.displayHandler, popup);
    countyShapeLyr.addEventListener('rollout', popup.hideHandler, popup);
    map.mouse.addEventListener('mousemove', popup.moveHandler, popup);

    if (false) {
      stateShapeLyr.addEventListener('rollover', function(evt) {debugMouse(evt, "[st] over");}, this);
      stateShapeLyr.addEventListener('rollout', function(evt) {debugMouse(evt, "[st] out");}, this);
      countyShapeLyr.addEventListener('rollover', function(evt) {debugMouse(evt, "[co] over");}, this);
      countyShapeLyr.addEventListener('rollout', function(evt) {debugMouse(evt, "[co] out");}, this);
    }

    /*
    // view buttons
    toggleButtons = new ToggleButtons("top:5px; right:5px; position:absolute;");
    var upStyle = ButtonCSS.getStyle('up'); // "background-color:black;";
    var downStyle = ButtonCSS.getStyle('down'); // "background-color:grey'";
    trace(">>>> upStyle:", upStyle, "downStyle:", downStyle);
    //var defaultStyle = "color:white; font-style:bold; font-size:13;";
    var shapesBtn = new UpDownButton(LabelButton.create("County Leaders", "float:left; margin-right:1px;"), upStyle, downStyle);
    var bubblesBtn = new UpDownButton(LabelButton.create("Size of Lead", "float:right;"), upStyle, downStyle);
    toggleButtons.addButton('shapes', shapesBtn, true);
    toggleButtons.addButton('bubbles', bubblesBtn);
    map.addOverlay(toggleButtons.div);
    toggleButtons.addEventListener('change', handleMapToggle);
    */
  }

  function handleMapToggle(evt) {
    //var toggle = evt.target;
  };



  function handleMapClick(evt) {

    var hitLyr = evt.hitLayer;
    var hitId = evt.hitId;
    ///debugger;
    if (!hitLyr || hitId == -1) {
      return;
    }
    var rec = hitLyr.getRecordById(hitId);
    var stateFips = rec.getString('FIPS').substr(0, 2);
    var st = StateFips.getState(stateFips);

    if (stateCallback && st != selectedState) {
      stateCallback(st);
    }

    zoomToState(st);

  }

  function zoomToState(st, opts) {
    st = st.toUpperCase();
    if (st == selectedState) {
      return;
    }

    var stateRec = stateGeoTable.getMatchingRecord('STATE', st);
    //trace("[zoomToState()] stateRec", stateRec);

    var stateId = stateRec.id;
    if (stateId == -1) {
      return;
    }

    selectedState = st;
    selectedStateFips = StateFips.getFips(st);

    var sym = stateShapeLyr.getSymbolById(stateId);
    //debugger;
    countyShapeStyler.getAttributeStyler('hidden').invalidate();
    if (map.views.getCurrentView().name == 'state') {
      countyShapeLyr.refresh(); // make sure flash gets updated style
    }
    else {
      map.views.setView('state');
    }

    if (stateIsUpcoming(st) || noCountyStates.indexOf(st) != -1) {
      key.setView('national');
    }
    else {
      key.setView('state');
    }

    var zoomOpts = {bounds:sym, spacing:50, tween:true};
    Opts.copyAllParams(zoomOpts, opts);

    map.zoom(zoomOpts);
  }

  function handleSelect(evt) {
    if (evt.rec) {
      var obj = getPopupData(evt.rec, candidatesTable);
      opts.select && opts.select(obj);
    }
  }

  function handleDeselect(evt) {
    opts.deselect && opts.deselect();
  }


  this['setMapView'] = function(view) {
    currView = view;
    map && map.views.setView(view);
  };

  this['showState'] = function(st, showOpts) {
    if (!map) {
      opts.state = st;
    }
    else {
      map.addEventListener('ready', function() {
          //debugger;
          zoomToState(st, showOpts);
        }, this);
    }
  };

  this.selectMarchSix = function(bool) {
    SELECT_MARCH_SIX = !!bool;
    map && map.refreshLayers();
  };

  this['updateVoteData'] = function(data) {
    initVoteData(data);
    
    countyVoteDataSource.joinTable('FIPS', countyVotesTable, 'location_fips');
    stateVoteDataSource.joinTable('FIPS', stateVotesTable, 'location_fips');

    if (map) {
      map.refreshLayers();
    }
  };

  function getActiveLayer() {
    var lyr = null;
    var viewName = map.views.getCurrentView().name;
    if (viewName == 'shapes') {
      lyr = countyShapeLyr;
    }
    else if (viewName == 'bubbles') {
      lyr = countyCircleLyr;
    }
    else {
      trace("[StateMap.highlightCounty()] unknown view:", viewName);
    }
    return lyr;
  }


  function getVoteDataLoader(st) {
    var voteUrl = voteDataUrl; //  + st.toLowerCase();
    var callback = voteDataCallback;
    if (!voteUrl || !callback) {
      trace("[StateData.getVoteDataLoader()] Missing vote url or jsonp callback; can't load data, giving up.");
      return null;
    }
    voteUrl = $ns.Browser.cacheBustUrl(voteUrl, 0.5); // 30 sec. cache bust
    //return new $ns.JsonPLoader(voteUrl, "__receive_votes", 'utf-8')
   
    return new $ns.JsonPLoader(voteUrl, callback, 'utf-8')
  }

  function getDataSourceByFilterName(name, geography) {
    var src;
    if (name.indexOf('reporting') != -1) {
      src = geography == 'counties' ? countyVoteDataSource : townVoteDataSource;
    }
    else {
      src = geography == 'counties' ? countyCensusDataSource : townCensusDataSource;
    }

    if (!src) {
      trace("[StateMap.getDataSourceByFilterName()] Missing source for filter:", name, "geo", geography);
    }
    return src;
  };




}


