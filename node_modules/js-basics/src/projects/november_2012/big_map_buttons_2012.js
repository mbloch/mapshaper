/* @requires elements, arrayutils, events, election-2012, format */

function BigMapButtons(div, voteMap, opts) {

  var el = El(div);
  var _self = this;

  var electionType = opts.election_type || "president";

  var views = opts.tab_views || opts.views || [];
  var initialView = opts.initial_tab_view || opts.initial_view || views[0];
  var selectedId = -1;

  var initialIdx = Utils.indexOf(views, initialView)
  // trace("[BigMapButtons()] initial:", initialView, "views:", views);

  var mapIconViewIndex = {
    state_winner_view: "",
    county_margin_view: "_counties",
    county_margin_bubble_view: "_bubbles",
    county_hollow_bubble_view: "_circles",
    county_margin_change_view: "_shifts",
    district_winner_view: ""
  };


  function getIconUrl(eType, mapView) {

    var server = E.USE_STAGING ? "static.stg.nytimes.com" : "graphics8.nytimes.com";
    var template = "http://%s/packages/images/1min/election_2012/national_maps/nyt_US_80px_%s%s_map.png";
    var url = Utils.format(template, server, eType, mapIconViewIndex[mapView] || "");
    url = Browser.cacheBustUrl(url, 4);
    return url;
  }


  var buttons = Utils.map(views, function(view, i) {

    var btn = el.child('div').addClass("nytg-map-view-button");
    if (i == 0) {
      btn.addClass('nytg-first-button');
    }

    if (i == views.length - 1) {
      btn.addClass('nytg-last-button');
    }

    if (i == initialIdx) {
      selectedId = i;
      btn.addClass('nytg-selected-button');
    }

    var label = Election2012.ViewLabels[view] || "Special view";
    var imgUrl = getIconUrl(electionType, view);
    var icon = btn.child('div').addClass('nytg-icon').child('img').attr('src', imgUrl);
    var txt = btn.child('div').addClass('nytg-label').text(label);

    btn.on('click', function() {
      _self.handleButtonClick(i);
    }, this);

    return btn;

  }, this);


  this.handleButtonClick = function(i) {
    if (i == selectedId) {
      return;
    }

    if (selectedId > -1) {
      var prevBtn = buttons[selectedId];
      prevBtn.removeClass('nytg-selected-button');
    }

    selectedId = i;

    var btn = buttons[i];
    btn.addClass('nytg-selected-button');

    var view = views[i];
    if (voteMap) {
      voteMap.setMapView(view);
    }

    //trace(">>> dispatching event; this:", this);
    _self.dispatchEvent('change', {view: view});
  }

  this.currentView = function() {
    return views[selectedId] || "";
  }
}

Opts.inherit(BigMapButtons, EventDispatcher);

Opts.exportObject("nytg.BigMapButtons", BigMapButtons);

