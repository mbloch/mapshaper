/* @requires county-names, state-fips, html-popup, textutils, calc, albersusa-special, full-zoom-button, core.dev, dateutils, toggle-buttons, us-primary-2012-lib, map-core-flash, nytg-map-api-01, map-core-notiles, canvas-bubble-optimizations, shapes.mshp, notiles-labels  */

linkToStatePage = false;

var voteDataUrl = ""; // "http://int-stg.ec2.nytimes.com/election_results/api/primary-map/"; // append state code for data url
var voteDataCallback = "";

var toggleButtons;
var candidateListSize = 4;
var selectedState = "";
var selectedStateFips = "";

var SHOW_CIRCLES = true;
var USE_HATCHING = true;
var LOAD_VOTES = true;
var SHOW_URBAN_AREAS = false; // Browser.touchEnabled; //true;
A.SHOW_OUTLINE = true;
var SHOW_LABELS = true;

var ENABLE_FILTERING = false;
SELECT_MARCH_SIX = true; // making this default for this map


var stIndex;
var stateCallback;

// DataTables for county-level vote data, indexed by lowercase state code (e.g. "ca", "wy");
var stateVoteTables = {};

function create(opts) {
  return new StateMap(opts);
}


function StateMap(opts) {
  //trace("[StateMap] opts:", opts);
  var startupData = opts.voteData || null;

  if (!startupData) {
    trace("[StateMap] Missing vote data; bailing.");
    return;
  }

  ENABLE_FILTERING = !!opts.enableFiltering;


  //SELECT_MARCH_SIX = opts.selectMarchSix !== false && opts.selectMarchSix;
  if (opts.selectMarchSix === false) {
    SELECT_MARCH_SIZE = false;
  }

  var jsonLoader;

  var currView = opts.view || "shapes";
  var stateShapeStyler;
  var countyShapeBgStyler;
  var stateBackgroundStyler;
  var heightPix = opts.height;
  var widthPix = opts.width;
  var spacing = opts.spacing || 0;

  var containerId = opts['id'];
  var containerDiv = opts['div'] || document.getElementById(containerId);


  
  if (!containerDiv) {
    trace("[StateMap.initMap()]  Missing container div; opts:", opts);
    return;
  }


  if (!widthPix || !heightPix) {
    Browser.log("[StateMap] warning: missing heightPix");
  }

  var fallbackUrl = "";
  if (widthPix && heightPix) {
    var imageUrl = "http://graphics8.nytimes.com/packages/images/newsgraphics/projects/election_2012/";
    var key = new SwappingKey(containerDiv);
    if (widthPix > 500) {
      var legendHeight = 27;
      var countyKey = imageUrl + "key-511-county.gif";
      var stateKey = imageUrl + "key-511-state.gif";
      key.addView('national', stateKey);
      key.addView('state', countyKey);
      fallbackUrl = "http://graphics8.nytimes.com/packages/images/1min/elections/2012/primaries/maps/national_map_511px.png"
    }
    else {
      legendHeight = 0; // 36;
      fallbackUrl = "http://graphics8.nytimes.com/packages/images/1min/elections/2012/primaries/maps/national_map_337px.png"
      //countyKey = imageUrl + "key-336-county.gif";
      //stateKey = imageUrl + "key-336-state.gif";
    }


    containerDiv.style.height = heightPix + "px";
    heightPix -= legendHeight;
    //containerDiv.style.height = (heightPix + 36) + "px";
  }
  
  var css = cssHome + "primary-map.css";
  // Hybrid.preferFlash = false; // moved to primary-map-local.js
  /*
  Hybrid.loadIfNoFlash(webHome + "us-primary-2012-canvas-bundle.js", css);
  Hybrid.loadIfFlash(webHome + "us-primary-2012-flash-bundle.js", css, flashHome + "hybrid_map_01.swf");
  Hybrid.addEventListener('ready', init, this);
  */
  Browser.loadStylesheet(css);
  Map.init({flashUrl:flashHome + "hybrid_map_01.swf", preferFlash:false});
  init();

  function init() {
    $ns = nytg.map; // created by loaded js bundle
    var w = new $ns.Waiter();
    calendarTable = new $ns.DataTable;
    calendarTable.importData(new $ns.JsonPLoader(webHome + "primary_calendar.js", "__receive_primary_calendar"), new $ns.TabDataParser());

    calendarTable.addEventListener('ready', function() {
      // init calendar data
      calendarTable.indexOnField('state');
      calendarTable.insertMappedValues('mar6', C.INTEGER, function(rec) {
        return rec.get('date') == '2012-03-06' ? 1 : 0;
      });

      //trace(calendarTable.getFieldData('mar6'));

    }, 10);

  
    w.waitFor(calendarTable);
    stateGeoTable = new $ns.DataTable(nytg.data.states_albers);
    initVoteData(opts.voteData);


    w.addEventListener('ready', initStateMap, this);
    w.startWaiting();
    return w;
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
      backgroundColor : opts.backgroundColor || undefined,
      spacing : opts.spacing || 0,
      spacingLeft : opts.spacingLeft,
      spacingTop : opts.spacingTop,
      spacingRight : opts.spacingRight,
      spacingBottom : opts.spacingBottom,
      minZoom : minZoom,
      maxZoom : zoom + 3,
      width : widthPix,
      height : heightPix,
      //height_km : heightKm,
      //width_km : widthKm,
      widthKm : widthKm,
      heightKm : heightKm,
      crs : crs,
      //zooming : true,
      limitPanning : opts.limitPanning || true,
      scrollWheelZoom : false,
      doubleClickZoom : false,
      dragging : false,
      pinchZoom : false
    };

    map = new $ns.Map(containerDiv, mapOpts);
    map.div.style.position = "relative"; // help layout out buttons

    //var shapes = nytg.data.states_albers_mshp_utf16;
    var shapes = nytg.data.states_albers_mar6_s1_mshp_utf16;
    var stateShapeData = new $ns.ShapeData(C.POLYGONS, C.OUTERLINES).importFromString(shapes, {transform:new AlbersUSASpecial()})
    stateShapeLyr = new $ns.ShapeLayer(stateShapeData, {shapeType:C.POLYGONS});

    stateVoteDataSource = stateGeoTable;
    stateVoteDataSource.joinTableByKey('FIPS', stateVotesTable, 'location_fips');
    

    stateShapeStyler = new $ns.DataStyler(stateVoteDataSource);
    var defStateStyle = {'fillAlpha':1, 'fillColor':noDataCol, 'strokeColor':0xffffff, 'strokeWeight':1, 'strokeAlpha':0.65, 'hoverStrokeColor':0, 'hoverStrokeWeight':1/*, 'hoverFillColor':0xffcccc, 'hoverFillAlpha':0.8*/};
    stateShapeStyler.setDefaultStyle(defStateStyle);

    stateShapeStyler.setAttributeStyler('fillColor', getStateShapeColor);
    stateShapeStyler.setAttributeStyler('hatchColor', getStateHatchColor);
    
    if (SELECT_MARCH_SIX) {
      //stateShapeStyler.setAttributeStyler('fillAlpha', getFillAlpha);
      stateShapeStyler.setAttributeStyler('hidden', function(rec) { 
        var st = rec.get('STATE');
        var cal = calendarTable.getIndexedRecord(st);
        var mar6 = cal.get('mar6');
        var retn = !mar6;
        //trace(mar6, "retn:", retn);
        return SELECT_MARCH_SIX && retn; 
        });
    }

    stateShapeLyr.setInteraction(true);
    stateShapeLyr.setStyler(stateShapeStyler);
    stateShapeLyr.addEventListener('click', handleStateClick, this);


    if (SELECT_MARCH_SIX) {
      // bg layer
      var stateBgLyr = new $ns.ShapeLayer(stateShapeData, {shapeType:C.POLYGONS});
      var bgStyle = {strokeAlpha:1};
      Opts.copyNewParams(bgStyle, defStateStyle);
      stateBgLyr.setStyle(bgStyle);
      map.addLayer(stateBgLyr);

    }

    map.addLayer(stateShapeLyr);

    var countyShapes = new ShapeData(C.POLYGONS).importFromString(nytg.data.counties_albers_mar6_s1_mshp_utf16, {transform:new AlbersUSASpecial()});
    countyShapeLyr = new ShapeLayer(countyShapes);

    var countyGeoTable = new DataTable(nytg.data.counties_albers_mar6);
    countyVoteDataSource = new $ns.JoinedTable(countyGeoTable).joinTable( 'FIPS', countyVotesTable, 'location_fips'); 

    countyShapeStyler = new DataStyler(countyVoteDataSource);

    countyShapeStyler.setDefaultStyle({hidden:false, fillColor:0xcccccc, strokeWeight:1, strokeColor:0xffffff, strokeAlpha:0.5, fillAlpha:1, 'hoverStrokeColor':0, 'hoverStrokeWeight':1});

    var countyHidden = function(rec) { var fips = rec.getString('STATE_FIPS'); return fips != selectedStateFips || stateVotesIndex[fips] === undefined || noCountyFipsIndex[fips] === true};

    countyShapeStyler.setAttributeStyler('hatchColor', getHatchColor);
    countyShapeStyler.setAttributeStyler('fillColor', getShapeColor);
    countyShapeStyler.setAttributeStyler('hidden', countyHidden);

    countyShapeBgStyler = new DataStyler(countyGeoTable);
    countyShapeBgStyler.setDefaultStyle({fillAlpha:1, fillColor:0xf2f2f2, strokeWeight:1, strokeColor:0xffffff, strokeAlpha:1, hatchColor:null});
    countyShapeBgStyler.setAttributeStyler('hidden', countyHidden);
    countyShapeBgStyler.setAttributeStyler('hatchColor', function() {return undefined;});

    countyShapeLyr.setStyler(countyShapeStyler);
    
    map.addLayer(countyShapeLyr);


    var usOutlineLyr = new $ns.ShapeLayer(stateShapeData, {shapeType:C.OUTERLINES});
    usOutlineLyr.setStyle({fillAlpha:0, strokeWeight:1, strokeColor:countryOutlineCol});
    map.addLayer(usOutlineLyr);


    if (SHOW_CIRCLES) {
      var defaultCircleStyle = {
        'fillAlpha':1, 'fillColor':0xffeeee, 'strokeWeight':1, 'strokeColor':0, 'scaling':0.3, 'strokeAlpha':0.35,
        'hoverStrokeWeight':2, 'bubbleSize':0, 'hoverStrokeColor':0x0, 'hoverStrokeAlpha':1
      };

      var src = new CircleData();
      src.importFromDataTable(countyGeoTable, 'LAT', 'LNG', proj);
      countyCircleLyr = new CircleLayer(src, {hitHelper:countyShapeLyr});
      countyCircleStyler = new DataStyler(countyVoteDataSource);
      countyCircleStyler.setDefaultStyle(defaultCircleStyle);

      countyCircleStyler.setAttributeStyler('bubbleSizes', getCountyCircleSize);
      countyCircleStyler.setAttributeStyler('hatchColor', getHatchColor);
      countyCircleStyler.setAttributeStyler('fillColor', getShapeColor);

      //countyCircleStyler.setAttributeStyler('bubbleSizes', getCountyCircleSize);
      //countyCircleStyler.setAttributeStyler('fillColor', getShapeColor);
      countyCircleStyler.setAttributeStyler('hidden', function(rec) { var fips = rec.getString('STATE_FIPS'); return fips != selectedStateFips || symbolType != 'circles' || stateVotesIndex[fips] === undefined || noCountyFipsIndex[fips] === true});
      countyCircleLyr.setStyler(countyCircleStyler);
      map.addLayer(countyCircleLyr);
    }


    map.views.getView("national")
      .hideLayer(countyShapeLyr)
      //.hideLayer(countyCircleLyr)
      .setLayerInteraction(countyShapeLyr, false)
      //.setLayerInteraction(countyCircleLyr, false)
      .setFallbackImage(fallbackUrl);

    if (SHOW_CIRCLES) {
      map.views.getView('national').hideLayer(countyCircleLyr);
      map.views.getView('state').setLayerInteraction(countyCircleLyr, false).hideLayer(countyCircleLyr).setLayerStyler(countyShapeLyr, countyShapeStyler); // kludge to add this layer to the view
      map.views.getView('bubbles').setLayerInteraction(countyCircleLyr, true).setLayerInteraction(countyShapeLyr, false).setLayerStyler(countyShapeLyr, countyShapeBgStyler);
    }

    map.views.getView("state")
      .setLayerInteraction(countyShapeLyr, true);

    map.views.setView("national");
    key.setView('national');


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



    map.addEventListener('ready', function() { opts.selectedState && zoomToState(opts.selectedState);}, 10);

    map.display();

    map.addEventListener('click', handleMapClick, this);

    if (SHOW_CIRCLES) {
      var btn = new FullZoomButton(new LabelButton('Zoom to U.S.'), map, {css:"top:4px; left:4px", tween:true})
    }
    else {
      var btn = new FullZoomButton(new ImageButton('http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/zoom-to-us.gif'), map, {css:"top:4px; left:4px", top:5, left:5, tween:true})
    }
      //var btn = new FullZoomButton(new LabelButton('Zoom to U.S.'), map, {top:5, left:5, tween:true})
    btn.addEventListener('click', function() { selectedState = ""; selectedStateFips = ""; map.views.setView('national'); key.setView('national') });


    if (SHOW_CIRCLES) {
      // view buttons
      //toggleButtons = new ToggleButtons("top:4px; right:4px; position:absolute;");
      toggleButtons = new ToggleButtons("top:4px; left:335px; position:absolute;");
      var upStyle = ButtonCSS.getStyle('up'); // "background-color:black;";
      var downStyle = ButtonCSS.getStyle('down'); // "background-color:grey'";

      var shapesBtn = new UpDownButton(LabelButton.create("County Leaders", "float:left; margin-right:1px;"), upStyle, downStyle);
      var bubblesBtn = new UpDownButton(LabelButton.create("Size of Lead", "float:right;"), upStyle, downStyle);
      toggleButtons.addButton('shapes', shapesBtn, true);
      toggleButtons.addButton('bubbles', bubblesBtn);
      map.addOverlay(toggleButtons.div);
      toggleButtons.addEventListener('change', handleMapToggle);
      toggleButtons.hide();

      map.addEventListener('navigate', function() { 
        var scale = map.getScale();
        var initScale = map.getInitialScale();
        if (scale > initScale * 0.95 || isNaN(scale)) {  // KLUDGE: NaN when no flash / fallback image mode
          toggleButtons.isHidden() || toggleButtons.hide();
        }
        else {
          toggleButtons.isHidden() && toggleButtons.show();
        }
      }, this);

    }

    function handleMapToggle(evt) {
      var key = evt.target.getSelectedKey();
      trace(">> key:", key);
      if (key == 'bubbles') {
        SHOWING_CIRCLES = true;
        map.views.setView('bubbles');
      }
      else {
        SHOWING_CIRCLES = false;
        map.views.setView('state');
      }
      //var toggle = evt.target;
    };


    var popup = new HTMLPopup(popupCallback, {map:map, fixed:false});

    stateShapeLyr.addEventListener('rollover', popup.displayHandler, popup);
    stateShapeLyr.addEventListener('rollout', popup.hideHandler, popup);
    countyShapeLyr.addEventListener('rollover', popup.displayHandler, popup);
    countyShapeLyr.addEventListener('rollout', popup.hideHandler, popup);

    if (SHOW_CIRCLES) {
      countyCircleLyr.addEventListener('rollover', popup.displayHandler, popup);
      countyCircleLyr.addEventListener('rollout', popup.hideHandler, popup);

    }


    map.mouse.addEventListener('mousemove', popup.moveHandler, popup);

    // legend
    var showLegend = false;
    if (showLegend) {
      if (true) {
        var table = Browser.createElement("div", 'padding:0; position:absolute; left:10px; top:213px;');
        table.appendChild(getLegendItem('Romney'));
        table.appendChild(getLegendItem('Santorum'));
        table.appendChild(getLegendItem('Gingrich'));
        table.appendChild(getLegendItem('Paul'));
        //table.appendChild(Browser.createElement("div", "clear:both"));
      }       
      map.div.appendChild(table);
      trace("[Appending table]");
    }
  }

  function getLegendItem(name) {
    var color = getCSSColor(colorTable[name]);
    var css = "background-color:" + color + "; height: 7px; width:18px; float:left; margin:4px 4px 0 8px;";
    var colorTile = Browser.createElement('div', css);
    var candTile = Browser.createElement('div', "float:left; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#666; margin:0 5px 0 0");
    candTile.innerHTML = name;
    var td = Browser.createElement('div', "float:left");
    td.appendChild(colorTile);
    td.appendChild(candTile);
    return td;
  };

  function getStatePageURL(st) {
    var name = StateNames.getName(st);
    if (!name) {
      return "";
    }

    var slug = name.toLowerCase().replace(' ', '-');
    return "http://elections.nytimes.com/2012/primaries/states/" + slug;
  }
  
  this.selectMarchSix = function(bool) {
    SELECT_MARCH_SIX = !!bool;
    stateShapeStyler && stateShapeStyler.invalidate();
    map && map.refreshLayers();
  };

  this['updateVoteData'] = function(data) {
    //Utils.trace("[updateVoteData()]; map:", map);
    initVoteData(data);
    
    stateVoteDataSource.joinTableByKey('FIPS', stateVotesTable, 'location_fips');
    countyVoteDataSource.joinTable('FIPS', countyVotesTable, 'location_fips');

    stateShapeStyler.invalidate();
    countyShapeStyler.invalidate();

    if (map) {
      map.refreshLayers();
    }
  };

  this.setSymbolType = function(type) {
    if (symbolType == type) {
      return;
    }

    if (type == 'shapes') {
      countyCircleLyr && countyCircleLyr.hide();
    }
    else {
      countyCircleLyr && countyCircleLyr.show();
    };


  };


  function handleStateClick(evt) {
    //trace('state click; rec:', evt.rec);
    var rec = evt.rec;
    //loadCountyVoteData(rec.getString('STATE'));
  }

  // returns a DataTable that contains county-level data when it loads...
  /*
  function loadCountyVoteData(st) {
    st = st.toLowerCase();
    if (!stateHasCountyResults(st)) {
     trace("[loadCountyVoteData()] no county results for state:", st);
     return null;
    }
    if (stateVoteTables[st]) {
      trace("[loadCountyVoteData()] repeat request for state:", st);
      return stateVoteTables[st];
    }

    trace(">>> [loadCountyVoteData()] loading data for:", st);
    
    var url = 'http://elections.nytimes.com/2012/conmio/map_data/'+st.toUpperCase()+'.js'; // ?show_towns=1';
    var callback = "nytg.receiveVoteData";
    var loader = new nytg.map.JsonPLoader(url, callback, "utf-8");
    loader.addEventListener('ready', function(){
      var candData = new DataTable();
      var stateData = new DataTable();
      var countyData = new DataTable();
      
      initStateVoteData(loader.data, candData, stateData, countyData);
      trace("<<< [loadCountyVoteData()] data loaded for:", st);

    });
  }
  */

  function handleMapClick(evt) {

    var hitLyr = evt.hitLayer;
    var hitId = evt.hitId;

    if (!hitLyr || hitId == -1) {
      return;
    }
    var rec = hitLyr.getRecordById(hitId);
    var stateFips = rec.getString('FIPS').substr(0, 2);
    var st = StateFips.getState(stateFips);

    if (stateCallback && st != selectedState) {
      stateCallback(st);
    }

    zoomToState(st, {tween:true});

  }



  function zoomToState(st, opts) {
    st = st.toUpperCase();

    if (noCountyStates.indexOf(st) != -1) {
      //return;
    }

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

    countyShapeStyler.getAttributeStyler('hidden').invalidate();
    //trace(">>> zoomToState() sel:", st, "fips:", selectedStateFips, "invalidated hidden");

    if (SHOW_CIRCLES) {
      countyShapeBgStyler.getAttributeStyler('hidden').invalidate();
      var stateWidthPct = (sym.width() + sym.height()) * 0.5 / map.getInitialBounds().width();
      //trace(">>> stateWidthPct:", stateWidthPct);
      updateBubbleParams(selectedStateFips, stateWidthPct);
      countyCircleStyler.getAttributeStyler('hidden').invalidate();
      countyCircleStyler.getAttributeStyler('bubbleSizes').invalidate();
      //countyCircleStyler.invalidate();
      //countyShapeStyler.getAttributeStyler('hidden').invalidate();
      //countyCircleLyr.refresh();
    }

    var currView = map.views.getCurrentView().name;
    if (currView == 'state' || currView == 'bubbles') {
      countyShapeLyr.refresh(); // make sure flash gets updated style
      countyCircleLyr && countyCircleLyr.refresh();
    }
    else {
      SHOWING_CIRCLES ? map.views.setView('bubbles') : map.views.setView('state');
    }
    /*  */
    if (noCountyStates.indexOf(st) == -1) {
      key.setView('state');
    }
    else {
      key.setView('national');
    }

    var zoomOpts = {bounds:sym, spacing:30};
    Opts.copyAllParams(zoomOpts, opts);

    map.zoom(zoomOpts);
  }
}




function stateHasCountyResults(st) {
  st = st.toLowerCase();
  var fips = StateFips.getFips(st);
  var noCounties = "me,wy";
  if (noCounties.indexOf(st) != -1) {
    return false;
  }
  else if (stateVotesIndex[fips] == null) {
    return false;
  }
  return true;
}


Opts.exportObject("nytg.Utils", Utils);
Opts.exportObject("nytg.map.JsonPLoader", JsonPLoader);
