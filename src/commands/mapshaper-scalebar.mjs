import { getMapFrameMetersPerPixel, findFrameDataset } from '../furniture/mapshaper-frame-data';
import { addFurnitureLayer } from '../furniture/mapshaper-furniture-cmd';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop, message } from '../utils/mapshaper-logging';
import { symbolRenderers } from '../svg/svg-symbols';
import { importLineString, importMultiLineString } from '../svg/geojson-to-svg';

cmd.scalebar = function(catalog, opts) {
  var lyr = getScalebarLayer(opts);
  if (opts.label && !parseScalebarUnits(opts.label)) {
    stop(`Expected units of km or miles in scalebar label (received ${opts.label})`);
  }
  addFurnitureLayer(lyr, catalog);
};

export function getScalebarLayer(opts) {
  var obj = utils.defaults({type: 'scalebar'}, opts);
  return {
    name: opts.name || 'scalebar',
    data: new DataTable([obj])
  };
}

export function renderScalebar(d, frame) {
  if (!frame.crs) {
    message('Unable to render scalebar: unknown CRS.');
    return [];
  }
  if (frame.width > 0 === false) {
    return [];
  }

  var opts = getScalebarOpts(d);
  var metersPerPx = getMapFrameMetersPerPixel(frame);
  var frameWidthPx = frame.width;
  var labels = d.label ? d.label.split(',') : null;
  var label1 = labels && labels[0] || null;
  var props1 = parseScalebarLabel(label1 || getAutoScalebarLabel(frameWidthPx, metersPerPx, 'mile'));
  var label2 = opts.style == 'b' && labels && labels[1] || null;
  var props2, length2;

  if (props1.km > 0 === false) {
    message('Unusable scalebar label:', label1);
    return [];
  }

  var length1 = Math.round(props1.km / metersPerPx * 1000);
  if (length1 > 0 === false) {
    stop("Null scalebar length");
  }

  if (label2) {
    props2 = parseScalebarLabel(label2);
    length2 = Math.round(props2.km / metersPerPx * 1000);
    if (length2 > length1) {
      stop("First part of a dual-unit scalebar must be longer than the second part.");
    }
  }

  var barPos = getScalebarPosition(opts);
  var labelPos = getLabelPosition(opts);
  var dx = barPos.xpos == 'right' ? frameWidthPx - length1 - opts.margin : opts.margin;
  var dy = barPos.ypos == 'bottom' ? frame.height - opts.margin : opts.margin;

  // vshift to adjust for height above or below the baseline
  var labelHeight = Math.round(opts.label_offset + opts.tic_length + opts.font_size * 0.8 + opts.bar_width / 2);
  var bareHeight = Math.round(opts.bar_width / 2);
  var topHeight = labelPos.ypos == 'top' || label2 ? labelHeight : bareHeight;
  var bottomHeight = labelPos.ypos == 'bottom' || label2 ? labelHeight : bareHeight;
  if (barPos.ypos == 'top') {
    dy += topHeight;
  } else {
    dy -= bottomHeight;
  }

  var g = renderAsSvg(length1, label1, length2, label2, opts);
  g.properties = {
    transform: 'translate(' + dx + ' ' + dy + ')'
  };

  return [g];
}

var styleOpts = {
  a: {
    bar_width: 3,
    tic_length: 0
  },
  b: {
    bar_width: 1,
    tic_length: 5
  }
};

var defaultOpts = {
  position: 'top-left',
  label_position: 'top',
  label_offset: 4,
  font_size: 12,
  margin: 12
};

function getScalebarOpts(d) {
  var style = d.style == 'b' || d.style == 'B' ? 'b' : 'a';
  return Object.assign({}, defaultOpts, styleOpts[style], d, {style: style});
}

function renderAsSvg(length, text, length2, text2, opts) {
  var labelPart = renderLabel(text, length, opts);
  var zeroLabelPart = renderLabel('0', length, Object.assign({flipx: true}, opts));
  var barPart = renderBar(length, length2, opts);
  var parts = opts.style == 'b' ? [zeroLabelPart, labelPart, barPart] : [labelPart, barPart];
  if (text2) {
    parts.push(renderLabel(text2, length2, Object.assign({flipy: true}, opts)));
    parts.push(renderLabel('0', length2, Object.assign({flipx: true, flipy: true}, opts)));
  }
  return {
    tag: 'g',
    children: parts
  };
}

// TODO: generalize to other kinds of furniture as they are developed
function getScalebarPosition(opts) {
  var pos = opts.position || 'top-left';
  return {
    ypos: pos.includes('top') ? 'top' : 'bottom',
    xpos: pos.includes('left') ? 'left' : 'right'
  };
}

// approximate pixel height of the scalebar
function getScalebarHeight(opts) {
  return Math.round(opts.bar_width + opts.label_offset +
      opts.tic_length + opts.font_size * 0.8);
}

function renderLabel(text, length, opts) {
  var labelPos = getLabelPosition(opts);
  var anchorX = length * labelPos.kx + labelPos.dx;
  var bottomLabelY = opts.bar_width + opts.tic_length + opts.label_offset;
  var topLabelY = -opts.label_offset - opts.tic_length;
  var anchorY = labelPos.ypos == 'top' ? topLabelY : bottomLabelY;
  var labelOpts = {
      'label-text': text,
      'font-size': opts.font_size,
      'text-anchor': labelPos.anchor,
      'dominant-baseline': labelPos.ypos == 'top' ? 'auto' : 'hanging'
      //// 'dominant-baseline': labelPos == 'top' ? 'text-after-edge' : 'text-before-edge'
      // 'text-after-edge' is buggy in Safari and unsupported by Illustrator,
      // so I'm using 'hanging' and 'auto', which seem to be well supported.
      // downside: requires a kludgy multiplier to calculate scalebar height (see above)
    };
  return symbolRenderers.label(labelOpts, anchorX, anchorY);
}

function getLabelPosition(opts) {
  var pos = opts.label_position;
  var ypos = pos.includes('bottom') && 'bottom' || 'top';
  var dx = 0;
  var xpos;
  if (opts.style == 'a') {
    xpos = pos.includes('center') && 'center' || pos.includes('right') && 'right' || 'left';
  } else {
    xpos = 'right'; // style b
  }
  if (opts.flipx) {
    xpos = xpos == 'left' && 'right' || xpos == 'right' && 'left' || xpos;
  }
  if (opts.flipy) {
    ypos = ypos == 'top' && 'bottom' || ypos == 'bottom' && 'top' || ypos;
  }
  if (opts.style == 'b') {
    dx = xpos == 'left' && -opts.font_size / 4 || xpos == 'right' && opts.font_size / 4 || 0;
  }
  return {
    xpos,
    ypos,
    dx,
    kx: xpos == 'right' && 1 || xpos == 'center' && 0.5 || 0,
    anchor: xpos == 'center' && 'middle' || xpos == 'left' && 'start' || 'end'
  };
}

// length1: length of main bar
// length2: length of optional second distance (assumes that length2 <= length1)
function getStyleBCoords(length1, length2, opts) {
  var coords = [];
  var labelPos = getLabelPosition(opts);
  var y = opts.tic_length + opts.bar_width / 2;
  if (labelPos.ypos == "top") {
    y = -y;
  }
  coords.push([[0, y], [0, 0], [length1, 0], [length1, y]]);
  if (length2 > 0) {
    coords.push([[0, 0], [0, -y]]);
    coords.push([[length2, 0], [length2, -y]]);
  }
  return coords;
}

// length: length of scale bar in px
// length2: length of optional dual-units portion of the scalebar
function renderBar(length, length2, opts) {
  var coords;
  if (opts.style == 'b') {
    coords = getStyleBCoords(length, length2, opts);
  } else {
    coords = [[[0, 0], [length, 0]]];
  }
  var bar = importMultiLineString(coords);
  Object.assign(bar.properties, {
    stroke: 'black',
    fill: 'none',
    'stroke-width': opts.bar_width,
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter'
  });
  return bar;
}

function labelPosFlipX(pos) {
  // left is default xpos
  if (/left|right/.test(pos) === false) {
    pos += '-left';
  }
  if (pos.includes('right')) {
    return pos.replace('right', 'left');
  } else {
    return pos.replace('left', 'right');
  }
}

function labelPosFlipY(pos) {
  // top is default ypos
  if (/top|bottom/.test(pos) === false) {
    pos = 'top-' + pos;
  }
  if (pos.includes('top')) {
    return pos.replace('top', 'bottom');
  } else {
    return pos.replace('bottom', 'top');
  }
}

// unit: 'km' || 'mile'
function getAutoScalebarLabel(mapWidth, metersPerPx, unit) {
  var minWidth = 70; // 100; // TODO: vary min size based on map width
  var minKm = metersPerPx * minWidth / 1000;
  // note: removed 1.5 12 and 1,200
  var options = ('1/8 1/5 1/4 1/2 1 2 3 4 5 8 10 15 20 25 30 40 50 75 ' +
    '100 150 200 250 300 350 400 500 750 1,000 1,500 2,000 ' +
    '2,500 3,000 4,000 5,000').split(' ');
  return options.reduce(function(memo, str) {
    if (memo) return memo;
    var label = formatDistanceLabel(str, unit);
    if (parseScalebarLabelToKm(label) > minKm) {
       return label;
    }
  }, null) || '';
}

export function formatDistanceLabel(numStr, unit) {
  var num = parseScalebarNumber(numStr);
  var unitStr = unit == 'km' && 'KM' || num > 1 && 'MILES' || 'MILE';
  return numStr + ' ' + unitStr;
}

// See test/mapshaper-scalebar.js for examples of supported formats
export function parseScalebarLabelToKm(str) {
  var units = parseScalebarUnits(str);
  var value = parseScalebarNumber(str);
  if (!units || !value) return NaN;
  return units == 'mile' ? value * 1.60934 : value;
}

function parseScalebarLabel(label) {
  var num = label ? parseScalebarNumber(label) : null;
  var units = label ? parseScalebarUnits(label) : 'mile';
  var km = NaN;
  if (units && num) {
    km =  units == 'mile' ? num * 1.60934 : num;
  }
  return {
    number: num,
    units: units,
    km: km
  };
}

function parseScalebarUnits(str) {
  var isMiles = /(miles?|mi[.]?|英里)$/.test(str.toLowerCase());
  var isKm = /(k\.m\.|km|kilometers?|kilom.tres?|公里)$/.test(str.toLowerCase());
  var units = isMiles && 'mile' || isKm && 'km' || '';
  return units;
}

function parseScalebarNumber(str) {
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
}
