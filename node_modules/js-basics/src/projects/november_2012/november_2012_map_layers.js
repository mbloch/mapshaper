/* @requires november_2012_map_core */


VoteMap.prototype.initInteractiveLayer = function(lyr) {
  // lyr.setInteraction(true);
  lyr.on('rollover', this.handleRollOver, this);
  lyr.on('rollout', this.handleRollOut, this);
  lyr.on('click', this.handleClick, this);
};



VoteMap.prototype.getCityLabelLayer = function() {
  if (!nytg.data.election2012_city_labels) {
    trace("[VoteMap.getCityLabelLayer()] Missing label data (nytg.data.election2012_city_labels)");
    return null;
  }

  if (!this._cityLabelLyr) {
    var labelTable = new DataTable(nytg.data.election2012_city_labels);

    var labelData = new LabelData();
    var proj = this._map.getCRS().projection;
    labelData.importFromDataTable(labelTable, 'lat', 'lng', proj);

    var lyr = this._cityLabelLyr = new LabelLayer({symbols:labelData});
    lyr.hide();

    // TODO: improve this
    this._opts.national_map && lyr.hide();

    var labelStyler = new DataStyler(labelTable);
    labelStyler.setDefaultStyle({'placement':'e', 'size':13, 'dotSize':4, 'useHalo':true});
    labelStyler.setAttributeStyler('text', 'name');
    labelStyler.setAttributeStyler('placement', 'pos3');


    labelStyler.setAttributeStyler('hidden', function(rec) {
      if (!A.selectedState) {
        return false;
      }

      var st = rec.get('st');
      return A.selectedState != st;
    }, this);


    lyr.setStyler(labelStyler);
    this._map.addLayer(lyr);

    this.on('select_state', function() {
      labelStyler.getAttributeStyler('hidden').invalidate();
    });

    this.on('zoomed_in', function() {
      labelStyler.getAttributeStyler('hidden').invalidate();
      lyr.show();
    });

    this.on('zoomed_out', function() {
      lyr.hide();
    });

  }

  return this._cityLabelLyr;

}


VoteMap.prototype.getStateLabelLayer = function(states) {
  var opts = this._opts;
  if (false && opts.width < 350) {
    return null;
  }

  if (!nytg.data.state_labels) {
    trace("[VoteMap.getStateLabelLayer()] Missing label data (nytg.data.state_labels)");
    return null;
  }

  if (!this._stateLabelLyr) {
    var labelTable = new DataTable(nytg.data.state_labels);
    states.joinTableByKey('STATE', labelTable, 'STATE');

    var labelData = new LabelData();
    var proj = this._map.getCRS().projection;
    labelData.importFromDataTable(states, 'LABEL_LAT', 'LABEL_LNG', proj);

    var lyr = this._stateLabelLyr = new LabelLayer({symbols:labelData});
    var styler = this.getStateLabelStyler(states);
    lyr.setStyler(styler);
    this._map.addLayer(lyr);

    this.on('zoomed_in', function() {
      lyr.hide();
    });

    this.on('zoomed_out', function() {
      var currView = this._map.views.getCurrentView().name;
      // trace(">>> zoomout; view:", currView);
      if (currView == "state_winner_view" || currView == "district_winner_view") {
        lyr.show();
      }
    }, this);

    this._map.views.addEventListener('change', function(evt) {
      mapView = evt.next_view;
      var hidden = mapView == E.COUNTY_COXA_CHANGE_VIEW || mapView == E.COUNTY_MARGIN_BUBBLE_VIEW;  //  || mapView == E.COUNTY_MARGIN_VIEW;
      if (hidden) {
        lyr.hide();
      }
      else {
        lyr.show();
      }
    });

  }

  return this._stateLabelLyr;
};

/*
  if (!opts.noLabels) {

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
    

    labelLyr.setStyler(labelStyler);
    map.addLayer(labelLyr);
  }
*/


VoteMap.prototype.getStateLayer = function(opts) {
  if (!this._stateLyr) {
    var lyr = this._stateLyr = new ShapeLayer(this._stateShapeData, {geography_type:'state'});
    //var styler = this._stateStyler = this.getWinStyler(this._stateRawData, this._stateData);
    //lyr.setStyler(styler)
    //lyr.hide();
    this._map.addLayer(lyr);
    this.initInteractiveLayer(lyr);
  }
  return this._stateLyr;
};

VoteMap.prototype.getStateLineLayer = function() {
  if (!this._stateLineLyr) {
    var lyr = this._stateLineLyr = new ShapeLayer(this._stateShapeData, {geography_type:'state', shapeType: C.INNERLINES, zIndex: 8});
    var styler = new SymbolStyler({strokeWeight: 1, strokeColor: 0xffffff, strokeAlpha: 1, fillAlpha:0});
    lyr.setStyler(styler);
    var map = this._map;

    function updateStroke() {
      var w = map.getWidthInPixels();
      var stroke = w > 620 ? 2 : 1;
      var alpha = w < 320 ? 0.5 : 1;
      styler.setAttributeStyle('strokeWeight', stroke);
      styler.setAttributeStyle('strokeAlpha', alpha);
      styler.invalidate();
    }

    updateStroke();
    this._map.on('resize', updateStroke, this, 3000);


    //lyr.hide();
    this._map.addLayer(lyr);
  }
  return this._stateLineLyr;
};


VoteMap.prototype.getHouseLayer = function(opts) {
  if (!this._houseLyr) {
    var lyr = this._houseLyr = new ShapeLayer(this._houseShapeData, {geography_type:'house_district'});
    //var styler = this._houseStyler = this.getWinStyler(this._houseRawData, this._houseData);
    //lyr.setStyler(styler);
    this._map.addLayer(lyr);
    this.initInteractiveLayer(lyr);
  }
  return this._houseLyr;
};


VoteMap.prototype.getCountyLayer = function(opts) {
  if (!this._countyLyr) {
    var lyr = this._countyLyr = new ShapeLayer(this._countyShapeData, {geography_type:'county', shapeType:C.POLYGONS});
    //var styler = this._countyStyler = this.getWinPctStyler(this._countyRawData, this._countyData);
    //lyr.setStyler(styler);
    this._map.addLayer(lyr);
    this.initInteractiveLayer(lyr);

  }
  // trace("initCountyLayer()");

  return this._countyLyr;
};

VoteMap.prototype.getCountyCircleLayer = function(opts) {
  if (!this._countyCircleLyr) {

    var proj = this._opts.crs.projection;
    //trace("[initCountyCircleLayer()] proj:", proj);
    var circleData = new CircleData().importFromDataTable(this._countyData, 'LAT', 'LNG', proj);
    
    var lopts = {geography_type:'county', zIndex: 15};
    if (this._countyLyr) {
      // lopts.helperLayer = this._countyLyr; // need to enable interaction on countyLyr... 
    }
    var lyr = this._countyCircleLyr = new CircleLayer(circleData, lopts);
    lyr.hide();
    this.initInteractiveLayer(lyr);
    this._map.addLayer(lyr);
    // var styler = this._countyCircleStyler =     
  }

  return this._countyCircleLyr;
};




/**
 * LAYER STYLERS 
 **/





VoteMap.prototype.getStateLabelStyler = function(states) {
  var labelStyler = new DataStyler(states);
  var mapView;



  labelStyler.setDefaultStyle({'text':'label', 'placement':'c', 'fillColor':0x000000, 'size': 10});

  labelStyler.setAttributeStyler('text', function(rec) {
    var st = rec.get('ABBR');
    return st;
  });

  var map = this._map;
  var updateSize = function() {
    var w = map.getWidthInPixels();
    //var forceLabels = !!this._opts.force_state_labels;

    var sizes = [9, 10, 11, 12, 13, 15];
    var breaks = [380, 450, 550, 750, 850];
    var idx = Utils.getClassId(w, breaks);
    var textSize = sizes[idx];
    labelStyler.setAttributeStyle('size', textSize)
  };

  updateSize();
  this._map.on('resize', updateSize, this, 200);

  this._map.views.addEventListener('change', function(evt) {
    mapView = evt.next_view;
    if (evt.prev_view) {
      labelStyler.getAttributeStyler('fillColor').invalidate();
      var useHalo = mapView != 'state_winner_view';
      labelStyler.setAttributeStyle('useHalo', useHalo);
    }
  }, this);

  labelStyler.on('pre', function(evt) {
    // trace(">>>> labelStyler  PRE")
    

    w = this._map.getWidthInPixels();
  }, this);

  labelStyler.setAttributeStyler('hidden', function(rec) {
    var st = rec.get('STATE');
    if (w < 300) {
      return true;
    }
    return Election2012.NoLabelStates.indexOf(st) != -1;
  });

  var stateStyle;
  labelStyler.setPreFunction(function(style) {
    if (this._stateLyr) {
      stateStyle = this._stateLyr.getStyle();
    }
  }, this);


  labelStyler.setAttributeStyler('fillColor', function(rec) {
    var col = 0x0;
    if (mapView == 'state_winner_view' && stateStyle && stateStyle.fillColor) {
      var fillCol = stateStyle.fillColor[rec.id];
      var lum = Utils.getLuminance(fillCol);
      col = lum > 0.4 ? 0 : 0xffffff;
    }
    return col;
  });

  return labelStyler;
};



var defaultStyle = {
  hoverStrokeWeight: 2,
  hoverStrokeColor: 0,
  hoverStrokeAlpha: 1,
  fillColor: 0xeeeeee,
  fillAlpha: 1,
  strokeWeight: 1,
  strokeAlpha: 0.4,
  strokeColor: 0xaaaaaa
};

var defaultBubbleScaling = 0.3;

VoteMap.prototype.getHollowBubbleStyler = function(rawData, geoTable) {
  var styler = new DataStyler(geoTable);
  var style = {
    scaling: defaultBubbleScaling,
    fillColor: 0,
    strokeColor: 0xffffff,
    strokeAlpha: 1,
    strokeWeight: 1,
    fillAlpha: 0,
    hoverStrokeWeight: 2,
    hoverStrokeAlpha: 1,
    hoverStrokeColor: 0
  };

  styler.setDefaultStyle(style);

  styler.setAttributeStyler('hidden', function(rec) {
    return !rec.get('vote_margin');
  })

  styler.setAttributeStyler('bubbleSizes', function(rec) {
    var margin = rec.get('total_votes') || 0;
    var k = 1 / 600;
    var size = margin ? Math.sqrt(margin * k) : 0;
    return size;
  });

  styler.setAttributeStyler('strokeColor', function(rec) {
    var col = rec.get('win_lead_color');
    return col;
  });

  return styler;

}

VoteMap.prototype.getVotesBubbleStyler = function(rawData, geoTable) {
  var styler = new DataStyler(geoTable);

  var style = {
    scaling: defaultBubbleScaling,
    fillColor: 0,
    bubbleSize: 10,
    //circleSize: 10,
    strokeColor: 0xffffff,
    strokeAlpha: 0.2,
    strokeWeight: 1,
    fillAlpha: 1,
    hoverStrokeWeight: 1,
    hoverStrokeAlpha: 1,
    hoverStrokeColor: 0
  };

  styler.setDefaultStyle(style);

  var breaks = [4, 12, 20];
  var demCols = [0xDBB5EA, 0xa7c0db, 0x819bc6, 0x445e96];
  var repCols = [0xDBB5EA, 0xeaa9a8, 0xe27474, 0xba3a33];
  var indCols = [0xf2eabb, 0x9fce9f, 0x76b276, 0x418741];

  styler.setAttributeStyler('fillColor', function(rec) {
    var party = rec.get('leading_party');
    var margin = rec.get('vote_margin');
    var total = rec.get('total_votes');
    var col = 0xffcccc;
    if (margin > 0) {
      var pct = margin / total * 100;
      var idx = Utils.getClassId(pct, breaks);
      if (party == 'REP') {
        col = repCols[idx];
      }
      else if (party == 'DEM') {
        col = demCols[idx];
      }
      else {
        col = indCols[idx];
      }
    }
    //return rec.get('win_lead_color') || 0xffcccc;
    return col;
  });


  styler.setAttributeStyler('hidden', function(rec) {
    return !rec.get('vote_margin');
  });

  styler.setAttributeStyler('bubbleSizes', function(rec) {
    var margin = rec.get('total_votes') || 0;
    var k = 1 / 600;
    var size = margin ? Math.sqrt(margin * k) : 0;
    return size;
  });

  return styler;
};


VoteMap.prototype.getMarginBubbleStyler = function(rawData, geoTable, opts) {
  var style = {
    scaling: defaultBubbleScaling,
    fillColor: 0,
    bubbleSize: 10,
    //circleSize: 10,
    strokeColor: 0xffffff,
    strokeAlpha: 0.2,
    strokeWeight: 1,
    fillAlpha: 1,
    hoverStrokeWeight: 1,
    hoverStrokeAlpha: 1,
    hoverStrokeColor: 0
  }

  opts = opts || {};

  var _self = this;

  var styler = new DataStyler(geoTable);

  if (opts.hollow) {
    var colorAttr = "strokeColor";
    style.fillAlpha = 0;
    style.strokeAlpha = 1;
  }
  else {
    colorAttr = "fillColor";
  }

  styler.setDefaultStyle(style);

  styler.setAttributeStyler(colorAttr, function(rec) {
    return rec.get('win_lead_color') || 0xffcccc;
  });

  styler.setAttributeStyler('hidden', function(rec) {
    return !rec.get('vote_margin');
  })

  var k = 0;
  styler.on('pre', function() {
     updateBubbleSizes();
  }, this);

  this._map.on('resize', updateBubbleSizes, this, 3000);

  function updateBubbleSizes() {
    styler.getAttributeStyler('bubbleSizes').invalidate();

    var importData = _self._countyImportData;
    if (!importData) {
      trace("[updateBubbleSizes()] Missing import data for counties.");
      return;
    }

    var len = geoTable.size();
    var w = _self._map.getWidthInPixels();
    var h = _self._map.getHeightInPixels();
    var avgShapeArea = w * h / len;
    var avgShapeRadius = Math.sqrt(avgShapeArea) / 1.7;
    var refBubbleRadius = avgShapeRadius * 1;
    var maxMargin = importData.maxMargin;
    var midMargin = importData.referenceMargin;
    var reporting = importData.maxMarginReporting;

    var refMargin = true || midMargin  > 0 ? (maxMargin + midMargin) * 0.5 : maxMargin;

    // refBubbleRadius *= reporting * 0.01;

    // calculate k for refMargin to hit refBubbleRadius
    // refMargin = maxMargin / 4;
    k = refBubbleRadius * refBubbleRadius / refMargin / 1.2;

    // trace(">>>> k:", k, "refBubbleRadius:", refBubbleRadius, "refMargin:", refMargin, "maxMargin:", maxMargin);
    // trace(">>>> w, h:", w, h, "shapes:", geoTable.size());

    if (_self._opts.national_map) {
      k *= 20; // on national map, bubbles can be larger in relation to county size
    }
  }

  styler.setAttributeStyler('bubbleSizes', function(rec) {

    var margin = rec.get('vote_margin') || 0;
    //var k = 1 / 100;
    // trace(">>> margin:", margin, "k:", k)
    var size = margin ? Math.sqrt(margin * k) : 0;
    return size;

  });

  updateBubbleSizes();

  return styler;
};

VoteMap.prototype.getMarginChangeStyler = function(geoTable) {
  var demCols = Election2012.DEM_COLORS;
  var repCols = Election2012.REP_COLORS;
  var breaks = [5, 10, 15, 20];
  var styler = new DataStyler(geoTable);
  styler.setDefaultStyle(defaultStyle);
  styler.setAttributeStyler('fillColor', function(rec) {
    var marg08 = rec.get('MARGIN_08');
    var marg12 = 0;
    var tot12 = rec.get('total_votes');
    if (tot12 > 0) {
      var leadingParty = rec.get('leading_party');
      var mul = leadingParty == 'DEM' && 100 || leadingParty == 'REP' && -100 || 0;
      marg12 = rec.get('vote_margin') / tot12 * mul;
    }

    var shift = 0;
    if (marg12 && marg08) {
      shift = marg12 - marg08;
    }

    var col = Election2012.NO_ELECTION_COL;
    var idx = -1;
    var cols;
    if (shift == 0) {
      // 
    }
    else if (shift > 0) {
      idx = Utils.getClassId(shift, breaks);
      cols = demCols;
    }
    else {
      cols = repCols;
      idx = Utils.getClassId(-shift, breaks)
    }

    if (idx > -1) {
      col = cols[idx];
    }
    
    return col;
  });
  return styler;
};


VoteMap.prototype.initStylerStroke = function(styler) {
  var map = this;
  function updateStroke() {
    var w = map._map.getWidthInPixels();
    trace(">>> initStylerStroke(); w:", w);
    var s = w < 330 ? 0 : 1;
    var a = w < 600 ? 0.2 : 0.3;
    styler.setAttributeStyle('strokeWeight', s);
    styler.setAttributeStyle('strokeAlpha', a);
    styler.invalidate();
  }

  updateStroke();
  map._map.on('resize', updateStroke, this, 3000);
}

VoteMap.prototype.getWinPctStyler = function(rawData, geoTable) {
  var styler = new DataStyler(geoTable);
  styler.setDefaultStyle(defaultStyle);

  styler.setAttributeStyler('fillColor', function(rec) {
    return rec.get('margin_pct_color') || Election2012.NO_ELECTION_COL;
  });

  return styler;
};


VoteMap.prototype.getCountyZoomStyler = function() {
  var geoTable = this._countyData;


  var styler = this.getWinPctStyler(this._countyRawData, this._countyData);
  //trace(">>> getCountyZoomStyler() schema:", this._countyData.schema);

  var hiddenStyler = styler.setAttributeStyler('hidden', function(rec) {
    var st = StateFips.getState(rec.get('STATE_FIPS'));
    //trace("hidden; st:", st);
    return A.selectedState != st;
  });

  // hidden
  //
  this.on('select_state', function() {
    hiddenStyler.invalidate();
  }, this);

  this.on('zoomed_out', function() {
    hiddenStyler.invalidate();
  }, this);
  return styler;
}


/*
  Updates when view changes...
*/
VoteMap.prototype.updateStateGainStyler = function(styler) {
  var opts = this._opts;

  //styler.setAttributeStyle('fillAlpha', 0.3);

  var etype = opts.election_type;
  var showGains = opts.show_gains && (etype == 'senate' || etype == 'president');
  trace(">>>> [VoteMap.updateStateGainStyler()]; show?", showGains)

  if (showGains) {
    styler.setAttributeStyler('hatchColor', function(rec) {
      var party = rec.get('switch_party');
      if (!party) {
        return 0;
      }
      else if (party == 'DEM') {
        return E.DEM_SWITCH_COL;
      }
      else if (party == 'REP') {
        return E.REP_SWITCH_COL;
      }

      return E.IND_SWITCH_COL;

    });

  }
  else {
    //styler.clearAttributeStyle('hatchColor');
    styler.setAttributeStyle('hatchColor', 0);
  }

};


VoteMap.prototype.getStateWinStyler = function(rawData, geoTable) {
  var styler = this.getWinStyler(rawData, geoTable);
  var opts = this._opts;

  if (!opts.syndication_map) {
    styler.setAttributeStyle('strokeWeight', 0);
  }

  if (!this._opts.no_counties) {
    var hiddenStyler = styler.setAttributeStyler('hidden', function(rec) {
      var st = rec.get('STATE');
      // trace("hidden; st:", st);
      return A.selectedState == st;
    });

    // hidden
    //
    this.on('select_state', function() {
      hiddenStyler.invalidate();
    }, this);

    this.on('zoomed_out', function() {
      hiddenStyler.invalidate();
    }, this);    
  }

  return styler;
}

VoteMap.prototype.getWinStyler = function(rawData, geoTable) {
  //trace("[getWinStyler()] data schema:", geoTable.schema);

  var styler = new DataStyler(geoTable);
  styler.setDefaultStyle(defaultStyle);

  styler.setAttributeStyler('fillColor', function(rec) {
    return rec.get('win_lead_color') || Election2012.NO_ELECTION_COL;
  });

  return styler;
}

