/* @requires county-names, state-fips, hybrid, html-popup, textutils, data, albersusa-special, full-zoom-button, core.dev, dateutils, toggle-buttons, us-primary-2012-lib  */

linkToStatePage = true;

var voteDataUrl = ""; // "http://int-stg.ec2.nytimes.com/election_results/api/primary-map/"; // append state code for data url
var voteDataCallback = "";
var toggleButtons;
var candidateListSize = 4;

var selectedState = "";
var selectedStateFips = "";

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

  var startupData = opts.voteData || null;

  if (!startupData) {
    trace("[StateMap] Missing vote data; bailing.");
    return;
  }

  ENABLE_FILTERING = !!opts.enableFiltering;

  var jsonLoader;
  var currView = opts.view || "shapes";


  var heightPix = 210;
  var widthPix = 336;
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
    containerDiv.style.width = widthPix + "px";
    containerDiv.style.height = "230px";
    //containerDiv.style.height = (heightPix + 36) + "px";
  }
  
  var css = cssHome + "primary-map.css";
  // Hybrid.preferFlash = false; // moved to primary-map-local.js
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
      //backgroundColor : 0xffcccc,
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

    map = new $ns.Map(containerDiv, mapOpts);
    map.div.style.position = "relative"; // help layout out buttons

    var shapes = nytg.data.states_albers_mshp_utf16;
    stateShapeLyr = new $ns.ShapeLayer(new $ns.ShapeData().importFromString(shapes, new AlbersUSASpecial()));

    if (false) {
      stateVoteDataSource = new $ns.LinkedDataSource(stateGeoTable, 'FIPS', stateVotesTable, 'location_fips');    
    }
    else {
      stateVoteDataSource = new $ns.JoinedTable(stateGeoTable).joinTable('FIPS', stateVotesTable, 'location_fips'); 
    }

    stateShapeStyler = new $ns.DataStyler(stateVoteDataSource);
    stateShapeStyler.setDefaultStyle({'fillAlpha':1, 'fillColor':0xe0e0e0, 'strokeColor':0xffffff, 'strokeWeight':1, 'strokeAlpha':0.55, 'hoverStrokeColor':0, 'hoverStrokeWeight':1/*, 'hoverFillColor':0xffcccc, 'hoverFillAlpha':0.8*/});
    stateShapeStyler.setAttributeStyler('fillColor', getStateShapeColor);
    stateShapeStyler.setAttributeStyler('hatchColor', getStateHatchColor);

    stateShapeLyr.setInteraction(true);
    stateShapeLyr.setStyler(stateShapeStyler);


    map.addLayer(stateShapeLyr);
    stateShapeLyr.addEventListener('ready', function() { trace("*** stateShapeLyr is READY ***"); });

    map.addEventListener('ready', function() { trace("*** Map is READY ***"); });

    map.display();

    map.addEventListener('click', handleMapClick, this);

    var popup = new HTMLPopup(popupCallback, {map:map, fixed:false});

    stateShapeLyr.addEventListener('rollover', popup.displayHandler, popup);
    stateShapeLyr.addEventListener('rollout', popup.hideHandler, popup);
    map.mouse.addEventListener('mousemove', popup.moveHandler, popup);

    // legend
    var showLegend = true;
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
  

  function handleMapClick(evt) {
    var hitLyr = evt.hitLayer;
    var hitId = evt.hitId;

    if (!hitLyr || hitId == -1) {
      return;
    }
    var rec = hitLyr.getRecordById(hitId);
    var stateFips = rec.getString('FIPS').substr(0, 2);
    var st = StateFips.getState(stateFips);

    var url = getStatePageURL(st);

    if (stateIsUpcoming(st) || !url) {
      trace('[] problem with url for state:', st);
      return;
    }

    Browser.navigateToURL(url);    
  }

  this['updateVoteData'] = function(data) {
    initVoteData(data);
 
    stateVoteDataSource.joinTable('FIPS', stateVotesTable, 'location_fips');

    if (map) {
      map.refreshLayers();
    }
  };


}

Opts.exportObject("nytg.Utils", Utils);
Opts.exportObject("nytg.map.JsonPLoader", JsonPLoader);
