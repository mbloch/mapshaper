/* @requires elements, tweening, core.geo, toggle-buttons */


function BigMapPanel(div, map, opts) {

  var small = !!opts.small_panel;

  var _isOpen = false;
  var width = opts.panelWidth; // small ? 170 : 230;
  var height = 500;
  var openTime = 500;
  var closeTime = 500;
  var self = this;
  var leftPadding = 8;
  //var panMargins = opts.panMargins || []
  //var panMargins = [0, 50, width, 0];
  var panMargins = opts.panMargins;

  this.map = map;
  map._panel = this;
  this.width = width;
  
  var parent = El(div); // .css('width', width).css('right', width).css('height', height);
  // var slider = parent.child('div').addClass('nytg-map-slider');
  var slider = parent.addClass('nytg-map-slider');
  if (small) {
    slider.addClass('nytg-small-panel');
  }
  var content = slider.child('div').addClass('nytg-panel-content').css('paddingLeft', leftPadding); // .css('width', width - leftPadding)
  slider.css('height', opts.height);

  map.selectEvent(select);
  map.deselectEvent(deselect);
  map._opts.panMargins = panMargins;

  this.refresh = function() {
    // if (this._isOpen()) {

    // }
  }

  this.isOpen = function() {
    return _isOpen;
  }

  function select(obj) {
    displayPanelContent(obj);
    open();
  }

  function deselect() {
    close();
  }

  function open() {
    if (_isOpen) {
      return;
    }
    _isOpen = true;
    slider.css('width', width);
    // slider.css('left', -width);
    slider.css('right', 0)

  }  

  function close() {
    if (!_isOpen) {
      return;
    }
    _isOpen = false;
    slider.css('width', 0);
    //slider.css('left', 0);
    slider.css('right', 0)
  }


  var winnerClasses = {
    DEM: " nytg-panel-dem-winner",
    REP: ' nytg-panel-rep-winner'
  };

  function getPanelTable(obj) {

    var partyHead = small ? "" : '<th class="nytg-panel-party">Party</th>'

    var tableHead = Utils.format('<tr><th class="nytg-panel-candidate">Candidate</th>%s<th class="nytg-panel-vote">Votes</th><th class="nytg-panel-votepct">Pct.</th>', partyHead);
    var tableBody = "";
    if (obj.candidates) {
      for (var i=0; i<obj.candidates.length; i++) {
        var cand = obj.candidates[i];
        var tdClass = i > 0 ? " nytg-panel-lower-row" : "";
        var pctStr = cand.pct_str + "%";
        var winner = cand.winner;
        var winnerClass = "";
        if (winner) {
          winnerClass = (winnerClasses[cand.party] || " nytg-panel-other-winner");
        }

        var partyBody = small ? "" : Utils.format('<td class="nytg-panel-party">%s</td>', cand.party_abbr);

        var row = '<tr><td class="nytg-panel-candidate%s%s">%s%s</td>%s<td class="nytg-panel-vote%s">%s</td><td class="nytg-panel-votepct%s">%s</td></tr>'
        tableBody += Utils.format(row, winnerClass, tdClass, cand.cand_shortname, cand.incumbent && obj.show_incumbent ? "*" : "", partyBody, tdClass, cand.votes_str, tdClass, pctStr);
      }
    }

    var tableClass = obj.called ? "nytg-panel-winner" : "";
    var table = Utils.format('<table cellpadding="0" cellspacing="0" class="%s">', tableClass) + tableHead + tableBody + '</table>';
    return table;
  }

  function displayPanelContent(obj) {

    var subStr = obj.noElection ? "No election" : obj.pollClosingStr || obj.reportingStr;
    if (obj.no_county_data) {
      subStr = "County data not available";
    }
    var html = Utils.format('<div class="nytg-panel-title">%s</div><div class="nytg-panel-note">%s</div>', obj.titleStr, subStr);

    if (!obj.noElection) {
      var mapView = map._map.views.getCurrentView().name;

      var table = mapView == E.COUNTY_MARGIN_CHANGE_VIEW ? map.getChangeTable(obj.candidates, obj, true) : getPanelTable(obj);

      var body = table || "";
      var tail = "";
      if (obj.show_incumbent) {
        tail = '<div class="nytg-panel-note">* Incumbent</div>';
      }

      html +=  body + tail;

      // links under panel:
      if (!opts.no_links) {
        var stateCode = StateNames.getName(obj.state_id).toLowerCase().replace(' ', '-');
        var stateName = small ? StateNames.getName(obj.state_id) : StateNames.getAbbrev(obj.state_id);
        var stateLink = Utils.format('http://%s/2012/results/states/%s', E.USE_STAGING ? 'static.elex.east.stg.newsdev.net': 'elections.nytimes.com', stateCode);

        if ('AZ,CA,CO,CT,FL,IN,IA,MA,MO,NV,NH,NJ,NY,NC,OH,PA,VA,WI'.indexOf(obj.state_id) != -1) {
          var pollLink = "http://elections.nytimes.com/2012/results/president/exit-polls"
        }

        var pollHTML = pollLink ? Utils.format('<a href="%s">%s Exit Polls &raquo;</a>', pollLink, stateName) : "";
        var fullHTML = Utils.format('<a href="%s">Full %s Results &raquo;</a>', stateLink, stateName);
        var linkClass = "nytg-panel-link";
        var linkStr = small || !pollHTML ? '<div class="%s"><div>%s</div><div>%s</div></div>' : '<div class="%s">%s<div class="nytg-pipe"> | </div>%s</div>';
        html += Utils.format(linkStr, linkClass, fullHTML, pollHTML);

      }
    }

    content.html(html);
    /*    */

    trace(">>> panel buttons; enabled?", E.EXPERIMENTAL_FEATURES)
    if (E.EXPERIMENTAL_FEATURES && opts.hp_map) {

      var legend = El(content).child('div');
      var buttons = El('div');
      var downCss = "background-color:#ddd;";
      var upCss = "background-color:#fff;";
      var leadBtn = new UpDownButton(buttons.child('div').addClass('nytg-toggle-button').text('Lead').node(), upCss, downCss);
      var margBtn = new UpDownButton(buttons.child('div').addClass('nytg-toggle-button nytg-middle-button').text('Margin').node(), upCss, downCss);
      var shiftBtn = new UpDownButton(buttons.child('div').addClass('nytg-toggle-button').text('Shifts').node(), upCss, downCss);
      var icon = legend.child('div');

      var toggle = new ToggleButtons(buttons.node());
      legend.node().appendChild(toggle.div)

      toggle.addButton('lead', leadBtn, true);
      toggle.addButton('margin', margBtn);
      toggle.addButton('shift', shiftBtn);

      toggle.on('select', function(evt) {

        trace("change; evt:", evt.key);
      }, this);


    }

  }
  
}