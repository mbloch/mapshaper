/* @requires big_map_buttons_2012, big_map_panel_2012, november_2012_map */
/* @requires election2012_city_labels, full-zoom-button */


BigMap.prototype.initBigMap = function(div, opts) {

  // TODO: move this onto html pages
  //Browser.loadStylesheet("http://graphics8.nytimes.com/packages/css/newsgraphics/projects/election_2012/nov6_maps/election-map.css");

  var views = opts.views;


  var queryView = Browser.getQueryVar("view");
  if (queryView && Utils.contains(views, queryView)) {
    opts.initial_view = queryView;
    // error("initialView:", queryView);
  }
  else if (!opts.initial_view) {
    opts.initial_view = views[0];
  }
  else if (Utils.contains(views, opts.initial_view)) {
    trace("[BigMap.initBigMap()] opts.initial_view not found in views:", opts.initial_view, views);
    views.unshift(opts.initial_view);
  }

  // make button & map div, etc...
  //
  var useButtons = E.ADVANCED_FEATURES && !!opts.enable_buttons;
  var usePanel = opts.enable_buttons || opts.show_panel;

  if (opts.width > 700 && opts.show_legend === undefined && ! Browser.inPhantom) {
    if (Browser.getPageUrl().indexOf('nytimes') != -1) {
      // trace(">>> opts.width:", opts.width);
      opts.show_legend = true;
    }
  }

  var showLegend = this._showLegend = opts.show_legend;

  if (showLegend) {
      opts.spacingBottom = 20;
  }

  if (usePanel) {
    var panelWidth = opts.small_panel ? 170 : 230;
    opts.panelWidth = panelWidth;
    opts.panMargins = [0, 50, panelWidth, 0]
  }


  var el = El(div);

  if (useButtons) {
    var buttonDiv = el.child('div').addClass('nytg-map-view-buttons').node();
  }
  var mapDiv = el.child('div').addClass('nytg-map-container').node();
  if (usePanel) {
     //var panelDiv = el.child('div').addClass('nytg-map-panel').node();
     var panelDiv = El(mapDiv).child('div').addClass('nytg-map-panel').node();
  }


  this.__super__(mapDiv, opts);

  if (showLegend) {
    var legendHeight = 30;
    // opts.height -= legendHeight;
    var lm = 0; // useButtons ? 96 : 0;
    var bottom = this._map.getWidthInPixels() > 800 ? -30 : -10;
    var legendImg = El(mapDiv).child('div').css('bottom', bottom).addClass('nytg-big-map-legend').css('margin-left', lm).css('z-index: 45; padding: 1px 5px 1px 1px; background-color:white; position:absolute').child('img'); // .css('height', legendHeight);

    this._legendImg = legendImg;
    // this.showLegend(opts.election_type);
  }


  initBigMap(this);

  if (useButtons) {
    initBigMapButtons(buttonDiv, this);
  }

  if (usePanel) {
    initBigMapPanel(panelDiv, this); 
  }

  if (opts.election_type && showLegend) {
    this.showLegend(opts.election_type, opts.initial_view);
  }


  function initBigMapButtons(div, map) {

    // make button & map div, etc...
    //
    var opts = map._opts;
    var buttons = new BigMapButtons(div, map, opts);
    buttons.on('change', function(evt) {
      var view = map._map.views.getCurrentView().name;
      trace(">>> change; mapView:", view )
      if (opts.show_legend) {
        map.showLegend(opts.election_type, view)
      }
    }, this, -1);  
  }

};

BigMap.prototype.showLegend = function(etype, view) {
  var mapSize = this._opts.width;

  trace("[showLegend] etype:", etype, "view:", view, "size:", mapSize);
  if (!view) {
    view = 'state_winner_view';
  }
  // etype = etype || 'president';
  // http://graphics8.nytimes.com/newsgraphics/2012/elections/map-keys/change-511-key.png

  var key = etype;

  if (key == 'governor') {
    key = 'house'; // gov. legend same as for house
  }

  if (this._showLegend) {
    var legendSize = 0;
    if (mapSize < 511) {
      if (etype == 'president' && mapSize >= 500) {
        legendSize = 484;
        key = 'president';
      }
      else if (etype == 'president' && mapSize >= 337) {
        key = 'president';
        legendSize = 337;
      }
    }
    else {
      legendSize = 511;
      // key = 'president';

      if (view == 'county_margin_view') {
        key = 'counties';
      }
      else if (view == 'county_margin_change_view') {
        key = 'change';
        // http://graphics8.nytimes.com/newsgraphics/2012/elections/map-keys/change-511-key.png
      }
      else if (view == 'county_margin_bubble_view') {
        key = 'margin-of-victory';
      }
    }

      // http://graphics8.nytimes.com/newsgraphics/2012/elections/map-keys/counties-511-key.png
      // http://graphics8.nytimes.com/newsgraphics/2012/elections/map-keys/president-337-key.png
    var el = this._legendImg;
    if (key && legendSize)  {
      var url = Utils.format('http://graphics8.nytimes.com/newsgraphics/2012/elections/map-keys/%s-%s-key.png', key, legendSize);
      el.attr('src', url).show();
    }
    else {
      el.hide();
    }

  }

// 
};



function initBigMap(voteMap) {

  var map = voteMap._map;

  map.div.style.position = "relative"; // so map controls can use abs. positioning


  //var zoomedOut = true;
  A.zoomedOut = true;  // TODO: fix this; could screw up multiple maps on a page

  map.on('navigate', function(evt) {
    var scale = map.getScale();
    var initScale = map.getInitialScale();

    var wasZoomedOut = !!A.zoomedOut;
    var isZoomedOut = A.zoomedOut = scale > initScale * 0.5;

    if (wasZoomedOut && !isZoomedOut) {

      voteMap.dispatchEvent("zoomed_in");
    }
    else if (isZoomedOut && !wasZoomedOut) {
      A.selectedState = null; trace(" >>> selectedState = null (initBigMap())")
      voteMap.dispatchEvent("zoomed_out");
      voteMap.triggerDeselect();
    }
  }, this, 20); // high priority, so style updates occur before refresh


  // init full zoom buttons
  var fullEl = El('div').addClass("nytg-map-button").css("position:absolute; top:4px; left:4px; ").text("Zoom to U.S.");
  var fullBtn = new FullZoomButton(fullEl, map, {tween: Election2012.ZOOM_ENABLED});
  map.addOverlay(fullEl.node());
  // handle state selection
}


/*
    var scale = map.getScale();
      var initScale = map.getInitialScale();
      if (scale > initScale * 0.95 || isNaN(scale)) {  // KLUDGE: NaN when no flash / fallback image mode
        toggleButtons.isHidden() || toggleButtons.hide();
      }
      else {
        toggleButtons.isHidden() && toggleButtons.show();
      }
    }, this);
*/





function initBigMapPanel(div, map) {

  var panel = new BigMapPanel(div, map, map._opts);
}