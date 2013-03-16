/* @requires forecasts-2012-lib, map-opts */

var ratingPopupCallback;

var NYT_JS_HOME = "http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/primary_maps/";
var NYT_CSS_HOME = "http://graphics8.nytimes.com/packages/css/newsgraphics/projects/election_2012/primary_maps/";
var NYT_SWF_HOME = "http://graphics8.nytimes.com/packages/flash/newsgraphics/projects/election_2012/primary_maps/";

//var webHome = NYT_JS_HOME;
//var cssHome = NYT_CSS_HOME;
var flashHome = NYT_SWF_HOME;
var noLabelStates = 'DC,HI,VT,NH,MA,RI,CT,DE,MD,PR,NJ';

var stateShapeLyr;
var stateShapeStyler;
var stateGeoData;
var ratingData;
var map;

var $ns = nytg.map;

var proj = new AlbersUSASpecial();
var popupCallback;

var electoralTable = new $ns.DataTable({"data": {"ELECTORAL_VOTES": [9, 3, 11, 6, 55, 9, 7, 3, 3, 29, 16, 4, 4, 20, 11, 6, 6, 8, 8, 4, 10, 11, 16, 10, 6, 10, 3, 5, 6, 4, 14, 5, 29, 15, 3, 18, 7, 7, 20, 0, 4, 9, 3, 11, 38, 6, 3, 13, 12, 5, 10, 3], "STATE": ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"]}, "schema": {"ELECTORAL_VOTES": "INT", "STATE": "STRING"}});

function stateRolloverCallback(rec) {
  var html = "";
  var votes = rec.get('ELECTORAL_VOTES');
  var subtitle = votes + " Electoral Vote" + (votes != 1 ? "s" : "");
  html += HTMLPopup.getTitle(StateNames.getName(rec.get('STATE')));
  html += HTMLPopup.getSubtitle(subtitle);
  html += HTMLPopup.getText(getRatingLabel(rec.get('rating')));
  return html;
}

/**
 * Params: weight, height, ratingData, ratingPopupCallback
 *
 *
 */
function ForecastMap(div, opts) {

  if (!opts.ratingData) {
    trace("[ForecastMap()] Missing rating data.");
    return;
  }

  if (opts.noLabelStates) {
    noLabelStates = opts.noLabelStates;
  }

  popupCallback = opts.popupCallback || stateRolloverCallback;

  Map.init({flashUrl:flashHome + "hybrid_map_01.swf", preferFlash:false});

  var mapOpts = {
    width : Opts.readParam(opts.width, 700),
    height : Opts.readParam(opts.height, 500),
    center : MapOpts.ALBERS_US_CENTER,
    widthKm : MapOpts.ALBERS_US_WIDTH_KM,
    heightKm : MapOpts.ALBERS_US_HEIGHT_KM,
    crs : new MapCRS(proj),
    limitPanning : true,
    scrollWheelZoom : false,
    doubleClickZoom : false,
    dragging : false,
    pinchZoom : false
  };

  Opts.copyNewParams(mapOpts, opts); // import params like spacing, spacingLeft, etc.
  map = new Map(div, mapOpts);
  opts.noLabels = opts.noLabels || (mapOpts.width <= 300);

  // get shapes
  stateGeoData = new $ns.DataTable(nytg.data.states_albers);
  
  var ratingSchema = {
    state_id : C.STRING,
    rating : C.STRING,
    rating_date : C.STRING,
    rating_blurb : C.STRING
  };

  ratingData = new DataTable().populate(opts.ratingData, ratingSchema);
  stateGeoData.joinTableByKey('STATE', ratingData, 'state_id');
  stateGeoData.joinTableByKey('STATE', electoralTable, 'STATE');

  var stateShapeData = new $ns.ShapeData(C.POLYGONS, C.OUTERLINES, C.INNERLINES).importFromString(nytg.data.states_albers_mshp_utf16, {transform:proj});
  stateShapeLyr = new $ns.ShapeLayer(stateShapeData, {shapeType:C.POLYGONS});

  stateShapeLyr.setInteraction(true);

  var stateShapeStyle = {
    //strokeWeight : 1,
    //strokeColor : 0xffffff,
    fillColor : 0xe2e2e2,
    fillAlpha : 1,
    hoverStrokeWeight : 2,
    hoverStrokeColor : 0,
    hoverStrokeAlpha : 1
  };

  stateShapeStyler = new $ns.DataStyler(stateGeoData);
  stateShapeStyler.setDefaultStyle(stateShapeStyle);
  stateShapeStyler.setAttributeStyler('fillColor', calcFillColor);
  stateShapeStyler.setAttributeStyler('hatchColor', calcHatchColor);
  stateShapeLyr.setStyler(stateShapeStyler);

  map.addLayer(stateShapeLyr);

  /* */
  var innerLineLyr = new $ns.ShapeLayer(stateShapeData, {shapeType:C.INNERLINES});
  var strokeAlpha = mapOpts.width <= 300 ? 0.45 : 1;
  innerLineLyr.setStyle({fillAlpha:0, strokeWeight:1, strokeColor:0xffffff, strokeAlpha: strokeAlpha});
  map.addLayer(innerLineLyr);

  /*
  var outerLyr = new $ns.ShapeLayer(stateShapeData, {shapeType:C.OUTERLINES});
  outerLyr.setStyle({fillColor: 0, fillAlpha:0, strokeWeight:1, strokeColor:0x999999, strokeAlpha:1});
  map.addLayer(outerLyr);
  */

  if (!opts.noLabels) {
    var labelData = new LabelData();
    labelData.importFromDataTable(stateGeoData, 'LAT', 'LONG', proj);

    var labelLyr = new $ns.LabelLayer({symbols:labelData});
    var labelStyler = new $ns.DataStyler(stateGeoData);
    labelStyler.setDefaultStyle({'text':'label', 'placement':'c', 'fillColor':0x000000});
    labelStyler.setAttributeStyler('text', function(rec) {
      var st = rec.get('STATE');
      var abbr = StateNames.getAbbrev(st);
      return abbr;
    });

    labelStyler.setAttributeStyler('hidden', function(rec) {
      var st = rec.get('STATE');
      return noLabelStates.indexOf(st) != -1;
    });

    labelStyler.setAttributeStyler('fillColor', function(rec) {
      var rating = rec.get('rating');
      var col = rating == 'Tossup' ? 0 : 0xffffff;
      return col;
    });
    
      /*labelStyler.setAttributeStyler('fillColor', 0xffff00);*/

    labelLyr.setStyler(labelStyler);
    map.addLayer(labelLyr);
  }

  var pop = new HTMLPopup(popupCallback);
  pop.setLayer(stateShapeLyr);

  if (opts.stateClickCallback) {
    stateShapeLyr.addEventListener('click', function(evt) {
      var st = evt.rec.get('STATE');
      st && opts.stateClickCallback(st);
    });
  }

  map.display();
}

function create(opts) {
  return new ForecastMap(opts.id, opts);
}

Opts.exportObject("nytg.map.create", create);