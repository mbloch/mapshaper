/* @requires november_2012_map_core, hybrid-bubbles, canvas-bubbles */

VoteMap.prototype.initChangeDataByYear = function(geo, src, years) {

  var changeTable = src;
  // trace("**** [initChangeData()] table:", changeTable);
  // var years = [1996, 2000, 2004, 2008];
  for (var i=0; i<years.length; i++) {
    var yr = years[i];
    var dems = changeTable.getFieldData("d" + yr);
    var reps = changeTable.getFieldData("r" + yr);
    var tots = changeTable.getFieldData("tv" + yr);
    var diffs = [];
    for (var y=0, len=dems.length; y<len; y++) {
      var tot = tots[y];
      if (tot == 0) {
        var diff = 0;
      }
      else {
        diff = (dems[y] / tot - reps[y] / tot) * 100;
      }
      diffs.push(diff);
    }

    var fname = "margin" + yr;
    geo.insertFieldData(fname, 'double', diffs);
    // trace(">>>> diffs:", diffs);
  }

  // augment change data
  // 
  var schema = changeTable.schema;
  Utils.forEach(schema, function(v, k) {
    var arr = changeTable.getFieldData(k);
    var type = changeTable.getFieldType(k);
    geo.insertFieldData(k, type, arr);
  })
};

var arrowheadScale = 1;
var stemScale = 1;
//var changeMapYear1 = 2008;
// var changeMapYear0 = 2004;

VoteMap.prototype.getChangeStyler = function(rawData, geoTable, opts) {
  var style = {
    scaling: 0.5,
    bubbleSize: 10,
    strokeAlpha: 1,
    strokeWeight: A.canvasPixelRatio == 2 ? 2 : 1,
    fillAlpha: 0,
    hoverStrokeWeight: 1,
    hoverStrokeAlpha: 1,
    hoverStrokeColor: 0
  }

  opts = opts || {};

  var _self = this;

  var styler = new DataStyler(geoTable);
 
  styler.setDefaultStyle(style);
  var toDem = 0;
  var toRep = 0;

  styler.setAttributeStyler('strokeColor', function(rec) {
    var marg = getMarginDiff(rec, _self.changeMapYear1, _self.changeMapYear0);
    if (marg > 0) {
      toDem ++;
    }
    else if (marg < 0) {
      toRep ++;
    }
    return marg > 0 ? E.DEM_WIN_COL : E.REP_WIN_COL;

  });

  styler.on('post', function() {
    trace( "$$$$ dem:", toDem, "rep:", toRep)
  });

  var k = 0;
  styler.on('pre', function() {
    toDem = 0;
    toRep = 0;
    var map = this._map;
    // stemScale = map._opts.national_map ? 1 : 4;

    if (!map._opts.national_map) {

      var numShapes = geoTable.length;
      var w = map.getWidthInPixels();
      var h = map.getHeightInPixels();
      var avgShapeWidth = h * w / numShapes / w;
      stemScale = 0.4 * avgShapeWidth / 2 + 3;
    }


    arrowheadScale = 1 + _self._map.getZoom() * 0.2;
    if (w < 200) {
      arrowheadScale = 0.1;
    }
    // trace("ascale:", arrowheadScale, "zoom:", _self._map.getZoom());
  }, this);


  this._map.on('resize', updateBubbleSizes, this, 3000);

  function updateBubbleSizes() {
    styler.getAttributeStyler('bubbleSizes').invalidate();

    var w = _self._map.getWidthInPixels();
    k = w / 250;
  }

  function getMarginDiff(rec, ynow, ypast) {
    var t1 = ynow == 2012 ? rec.get('total_votes') : rec.get('tv' + ynow);
    var t0 = rec.get('tv' + ypast);

    if (t1 == 0 || t0 == 0) {
      return 0;
    }
    var m0 = rec.get("margin" + ypast);
    var mnow = rec.get("margin" + ynow);
    return mnow - m0;
  }


  styler.setAttributeStyler('bubbleSizes', function(rec) {
    var marg = getMarginDiff(rec, _self.changeMapYear1, _self.changeMapYear0);
    var size = marg * k;
    if (size < 0) {
      size = -size;
    }
    return size;

  });

  updateBubbleSizes();

  return styler;
};

VoteMap.prototype.getCanvasChangeLayer = function(raw, geo) {

  this.initChangeData(geo);
  if (!this._countyChangeLyr) {

    var proj = this._opts.crs.projection;
    //trace("[initCountyCircleLayer()] proj:", proj);
    var circleData = new CircleData().importFromDataTable(this._countyData, 'LAT', 'LNG', proj);
    var lyr = this._countyChangeLyr = new ChangeLayer(circleData, {geography_type:'county', zIndex: 15});

    // trace(">>> new styler; geo:", geo)
    var styler = this.getChangeStyler(raw, geo);
    lyr.setStyler(styler);
    lyr.hide();

    //this.initInteractiveLayer(lyr);
    this._map.addLayer(lyr);
    // var styler = this._countyCircleStyler =     
  }

  return this._countyChangeLyr;
};


VoteMap.prototype.getChangeLayer = function(raw, geo) {
  this.changeMapYear0 = 2008;
  this.changeMapYear1 = 2012;
  // trace(">>> getChangeLayer() geo:", geo)
  var lyr = this.getCanvasChangeLayer(raw, geo);
  return lyr;
};


function ChangeLayer(pointData, opts) {
  this.__super__(pointData, opts);
}


Opts.inherit(ChangeLayer, CircleLayer);

ChangeLayer.prototype.initCanvasCircleLayer = function() {
  this.startInteraction();
  this._hitHelper = this._opts.hitHelper;
  this.waitFor(this._symbols);
  this._renderer = new ChangeSymbolRenderer();
};


function ChangeSymbolRenderer() {
  this._style = new HybridShapeStyle();
  this._ext = new TileExtent();

  // arrowhed matrix
  var theta1 = Math.PI * 0.75;
  var theta2 = Math.PI * -0.75;

  this.sin1 = Math.sin(theta1);
  this.sin2 = Math.sin(theta2);
  this.cos1 = Math.cos(theta1);
  this.cos2 = Math.cos(theta2);

}


ChangeSymbolRenderer.prototype.drawArrowhead = function(ctx, x0, y0, x1, y1, size) {
  var xd = x1 - x0;
  var yd = y1 - y0;

  var len = Math.sqrt(xd * xd + yd * yd);
  var maxLen = len * 0.8;
  if (maxLen < size) {
    size = maxLen;
  }

  var xn = xd / len * size;
  var yn = yd / len * size;

  var ax1 = xn * this.cos1 - yn * this.sin1;
  var ay1 = xn * this.sin1 + yn * this.cos1;

  var ax2 = xn * this.cos2 - yn * this.sin2;
  var ay2 = xn * this.sin2 + yn * this.cos2;

  ax1 += x1;
  ay1 += y1;
  ax2 += x1;
  ay2 += y1;

  ctx.moveTo(ax1, ay1);
  ctx.lineTo(x1, y1);
  ctx.lineTo(ax2, ay2);

  // trace("head; xd, yd: ", xd, yd, "xn, yn:", xn, yn, "len:", len)
}

ChangeSymbolRenderer.prototype.drawTile = function drawTile(bubbles, canvas, bb, styleObj) {
  ///trace("[ChangeSymbolRenderer().drawTile()] obj:", styleObj);
  var style = this._style;
  style.updateStyle(styleObj);

  var ext = new TileExtent(canvas.width, canvas.height);
  ext.updateBounds(bb)

  var ctx = canvas.getContext('2d');
  var len = bubbles.length;
  var hasStroke = style.hasStroke();
  var hasFill = style.hasFill();

  for (var i = 0; i < len; i++) {
    var sym = bubbles[i];
    style.setId(sym.id);
    //if (!style.hidden) {
      this.drawSymbol(ctx, ext, sym, style, hasStroke, hasFill);
    //}
  }
};


ChangeSymbolRenderer.prototype.drawSymbol = function(ctx, ext, sym, style, hasStroke, hasFill) {
  var size = sym.size * 2 * stemScale || 0;
  if (size > 0) {
    ctx.beginPath();
    style.beginDrawing(ctx);
    //sym.draw(ctx, ext);
    var x = sym.x * ext.mx + ext.bx;
    var y = sym.y * ext.my + ext.by;

    //trace(style.strokeColor);
    var r = size * 0.1; //  * 0.5;
    ctx.moveTo(x, y);

    var col = style.strokeColor;
    var stroke = style.strokeWeight;
    var isLeft = col == E.DEM_WIN_COL;
    var xShift = isLeft ? -r : r;
    var yShift = -4;
    var x1 = x + xShift;
    var y1 = y + yShift;
    var alen = 4 * arrowheadScale * (A.canvasPixelRatio == 2 ? 2 : 1);
    ctx.lineTo(x1, y1);
    this.drawArrowhead(ctx, x, y, x1, y1, alen);

    if (hasFill) {
      ctx.fill();
    }
    if (hasStroke) {
      ctx.stroke();
    }
  }    


};

