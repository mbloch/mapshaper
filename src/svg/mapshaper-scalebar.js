/* @require svg-common mapshaper-frame */

api.scalebar = function(catalog, opts) {
  var frame = internal.findFrameDataset(catalog);
  var obj, lyr;
  if (!frame) {
    stop('Missing a map frame');
  }
  obj = utils.defaults({type: 'scalebar'}, opts);
  lyr = {
    name: opts.name || 'scalebar',
    data: new DataTable([obj])
  };
  frame.layers.push(lyr);
};

SVG.furnitureRenderers.scalebar = function(d, frame) {
  var metersPerPx = internal.getMapFrameMetersPerPixel(frame);
  var label = d.label && d.label != 'auto' ? d.label : internal.getAutoScalebarLabel(frame.width, metersPerPx);
  var scalebarKm = internal.parseScalebarLabelToKm(label);
  var scalebarPx = Math.round(scalebarKm / metersPerPx * 1000);
  var barHeight = 3;
  var labelOffs = 4;
  var fontSize = 13;
  var height = barHeight + labelOffs + fontSize;
  var valign = 'bottom';
  var halign = 'left';
  var voffs = 8;
  var hoffs = 8;
  var anchorX = halign == 'left' ? 0 : scalebarPx;
  var anchorY = barHeight + labelOffs; // TODO: support label-above

  if (!scalebarPx || scalebarPx < 10 || scalebarPx > frame.width  * 0.7) {
    stop("Invalid scalebar length:", scalebarPx);
  }
  var barObj = {
    tag: 'rect',
    properties: {
      fill: 'black',
      x: 0,
      y: 0,
      width: scalebarPx,
      height: barHeight
    }
  };
  var labelOpts = {
    'label-text': label,
    'font-size': fontSize,
    'font-family': 'sans-serif',
    'text-anchor': halign == 'left' ? 'start': 'end',
    'alignment-baseline': 'hanging'
  };
  var labelObj = SVG.symbolRenderers.label(labelOpts, anchorX, anchorY)[0]; // TODO: don't align to font baseline
  var g = {
    tag: 'g',
    children: [barObj, labelObj],
    properties: {
      transform: 'translate(' + hoffs + ' ' + voffs + ')'
    }
  };
  return [g];
};

internal.getAutoScalebarLabel = function(mapWidth, metersPerPx) {
  var minWidth = 100; // TODO: vary min size based on map width
  var minKm = metersPerPx * minWidth / 1000;
  var options = ('1/8 1/5 1/4 1/2 1 1.5 2 3 4 5 8 10 12 15 20 25 30 40 50 60 ' +
    '70 80 100 120 150 180 200 250 300 350 400 500 750 1,000 1,200 1,500 2,000 ' +
    '2,500 3,000 4,000 5,000').split(' ');
  return options.reduce(function(memo, str) {
    if (memo) return memo;
    var label = str + (Number(str) > 1 ? ' MILES' : ' MILE');
    if (internal.parseScalebarLabelToKm(label) > minKm) {
       return label;
    }
  }, null) || '';
};


// See test/mapshaper-scalebar.js for examples of supported formats
internal.parseScalebarLabelToKm = function(str) {
  var units = internal.parseScalebarUnits(str);
  var value = internal.parseScalebarNumber(str);
  if (!units || !value) return NaN;
  return units == 'mile' ? value * 1.60934 : value;
};

internal.parseScalebarUnits = function(str) {
  var isMiles = /miles?$/.test(str.toLowerCase());
  var isKm = /(km|kilometers?|kilometres?)$/.test(str.toLowerCase());
  return isMiles && 'mile' || isKm && 'km' || '';
};

internal.parseScalebarNumber = function(str) {
  var fractionRxp = /^([0-9]+) ?\/ ?([0-9]+)/;
  var match, value;
  str = str.replace(/[\s]/g, '').replace(/,/g, '');
  if (fractionRxp.test(str)) {
    match = fractionRxp.exec(str);
    value = +match[1] / +match[2];
  } else {
    value = parseFloat(str);
  }
  return value > 0 && value < Infinity ? value : NaN;
};
