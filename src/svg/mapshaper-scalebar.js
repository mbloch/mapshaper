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

// TODO: generalize to other kinds of furniture as they are developed
internal.getScalebarPosition = function(d) {
  var opts = { // defaults
    valign: 'top',
    halign: 'left',
    voffs: 10,
    hoffs: 10
  };
  if (+d.left > 0) {
    opts.hoffs = +d.left;
  }
  if (+d.top > 0) {
    opts.voffs = +d.top;
  }
  if (+d.right > 0) {
    opts.hoffs = +d.right;
    opts.halign = 'right';
  }
  if (+d.bottom > 0) {
    opts.voffs = +d.bottom;
    opts.valign = 'bottom';
  }
  return opts;
};

SVG.furnitureRenderers.scalebar = function(d, frame) {
  var pos = internal.getScalebarPosition(d);
  var metersPerPx = internal.getMapFrameMetersPerPixel(frame);
  var label = d.label_text || internal.getAutoScalebarLabel(frame.width, metersPerPx);
  var scalebarKm = internal.parseScalebarLabelToKm(label);
  var barHeight = 3;
  var labelOffs = 1;
  var fontSize = +d.font_size || 13;
  var width = Math.round(scalebarKm / metersPerPx * 1000);
  var height = barHeight + labelOffs + fontSize;
  var labelPos = d.label_position == 'top' ? 'top' : 'bottom';
  var anchorX = pos.halign == 'left' ? 0 : width;
  var anchorY = barHeight + labelOffs;
  var dx = pos.halign == 'right' ? frame.width - width - pos.hoffs : pos.hoffs;
  var dy = pos.valign == 'bottom' ? frame.height - height - pos.voffs : pos.voffs;

  if (labelPos == 'top') {
    anchorY = -labelOffs;
    dy += labelOffs + fontSize;
  }

  if (width > 0 === false) {
    stop("Null scalebar length");
  }
  var barObj = {
    tag: 'rect',
    properties: {
      fill: 'black',
      x: 0,
      y: 0,
      width: width,
      height: barHeight
    }
  };
  var labelOpts = {
      'label-text': label,
      'font-size': fontSize,
      'text-anchor': pos.halign == 'left' ? 'start': 'end',
      'dominant-baseline': labelPos == 'top' ? 'text-after-edge' : 'text-before-edge' // NOT alignment-baseline
    };
  var labelObj = SVG.symbolRenderers.label(labelOpts, anchorX, anchorY)[0]; // TODO: don't align to font baseline
  var g = {
    tag: 'g',
    children: [barObj, labelObj],
    properties: {
      transform: 'translate(' + dx + ' ' + dy + ')'
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
