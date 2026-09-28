import { getMapFrameMetersPerPixel, getActiveFrame } from '../furniture/mapshaper-frame-utils';
import { addFurnitureLayer, setFrameFurnitureLayer } from '../furniture/mapshaper-furniture-cmd';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop, message } from '../utils/mapshaper-logging';
import { symbolRenderers } from '../svg/svg-symbols';
import { importMultiLineString } from '../svg/svg-geom-primitives';

// Command options that are stored in the scalebar's data record
var scalebarFields = ['label', 'units', 'style', 'font_size', 'font_family',
  'font_style', 'font_weight', 'color', 'tic_length', 'bar_width', 'label_offset',
  'position', 'label_position', 'dual_units', 'margin'];

// With a map frame, the scalebar belongs to the frame, and running the
// command again replaces it. Without a frame, each run adds a standalone
// scalebar layer, which is exported if it is included in the output layers.
cmd.scalebar = function(catalog, opts) {
  var frame = getActiveFrame(catalog);
  if (opts.remove) {
    if (!frame || !setFrameFurnitureLayer(frame.dataset, 'scalebar', null)) {
      stop('The map frame has no scalebar to remove');
    }
    return;
  }
  validateScalebarOpts(opts);
  var lyr = getScalebarLayer(opts);
  if (frame) {
    setFrameFurnitureLayer(frame.dataset, 'scalebar', lyr);
  } else {
    addFurnitureLayer(lyr, catalog);
  }
};

export function getScalebarLayer(opts) {
  var rec = {type: 'scalebar'};
  scalebarFields.forEach(function(k) {
    if (opts[k] !== undefined && opts[k] !== null && opts[k] !== '') {
      rec[k] = opts[k];
    }
  });
  return {
    name: 'scalebar',
    data: new DataTable([rec])
  };
}

function validateScalebarOpts(opts) {
  if (opts.label) {
    splitScalebarLabel(opts.label).forEach(function(str) {
      if (!parseScalebarUnits(str) && !isBareDistance(str)) {
        stop(`Expected a distance or units of km, meters, miles or feet in scalebar label (received ${str})`);
      }
    });
  }
  if (opts.units && !parseLabelUnits(opts.units)) {
    stop('Unsupported scalebar units:', opts.units);
  }
  if (opts.style && !/^[ab]$/i.test(opts.style)) {
    stop('Unsupported scalebar style:', opts.style);
  }
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
  var labels = d.label ? splitScalebarLabel(d.label) : [];
  var units = parseLabelUnits(d.units) || 'mile';
  var label1 = getScalebarLabel(labels[0], frameWidthPx, metersPerPx, units);
  var props1 = parseScalebarLabel(label1);
  var label2 = null;
  var props2, length2;

  if (props1.km > 0 === false) {
    message('Unusable scalebar label:', labels[0] || '');
    return [];
  }

  var length1 = Math.round(props1.km / metersPerPx * 1000);
  if (length1 > 0 === false) {
    stop("Null scalebar length");
  }

  if (opts.style == 'b' && labels[1]) {
    label2 = completeLabel(labels[1], getOtherUnits(props1.units));
  } else if (opts.style == 'b' && opts.dual_units) {
    label2 = getAutoSecondLabel(length1, metersPerPx, getOtherUnits(props1.units));
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
  var style = d.style == 'b' || d.style == 'B' || !d.style && d.dual_units ? 'b' : 'a';
  var opts = Object.assign({}, defaultOpts, styleOpts[style]);
  Object.keys(d).forEach(function(k) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== '') opts[k] = d[k];
  });
  opts.style = style;
  return opts;
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

function getScalebarPosition(opts) {
  var pos = opts.position || 'top-left';
  return {
    ypos: pos.includes('bottom') ? 'bottom' : 'top',
    xpos: pos.includes('right') ? 'right' : 'left'
  };
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
      'dominant-baseline': labelPos.ypos == 'top' ? 'auto' : 'hanging',
      //// 'dominant-baseline': labelPos == 'top' ? 'text-after-edge' : 'text-before-edge'
      // 'text-after-edge' is buggy in Safari and unsupported by Illustrator,
      // so I'm using 'hanging' and 'auto', which seem to be well supported.
      // downside: requires a kludgy multiplier to calculate scalebar height (see above)
    };
  if (opts.color) labelOpts.fill = opts.color;
  if (opts.font_family) labelOpts['font-family'] = opts.font_family;
  if (opts.font_style) labelOpts['font-style'] = opts.font_style;
  if (opts.font_weight) labelOpts['font-weight'] = opts.font_weight;
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
    stroke: opts.color || 'black',
    fill: 'none',
    'stroke-width': opts.bar_width,
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter'
  });
  return bar;
}

// Kilometers per unit
var unitSizes = {
  km: 1,
  m: 0.001,
  mile: 1.60934,
  ft: 0.0003048
};

// Candidate lengths for automatic labels, in ascending order of distance
var autoLengths = {
  imperial: [
    ['ft', '10 20 25 50 100 200 250 500'],
    // note: removed 1.5 12 and 1,200
    ['mile', '1/8 1/5 1/4 1/2 1 2 3 4 5 8 10 15 20 25 30 40 50 75 100 150 200 250 ' +
      '300 350 400 500 750 1,000 1,500 2,000 2,500 3,000 4,000 5,000']
  ],
  metric: [
    ['m', '5 10 20 25 50 100 200 250 500'],
    ['km', '1 2 3 4 5 8 10 15 20 25 30 40 50 75 100 150 200 250 300 350 ' +
      '400 500 750 1,000 1,500 2,000 2,500 3,000 4,000 5,000']
  ]
};

function getAutoLabels(system) {
  return autoLengths[system].reduce(function(memo, group) {
    return memo.concat(group[1].split(' ').map(function(str) {
      return formatDistanceLabel(str, group[0]);
    }));
  }, []);
}

function getUnitSystem(units) {
  return units == 'km' || units == 'm' ? 'metric' : 'imperial';
}

function getOtherUnits(units) {
  return getUnitSystem(units) == 'metric' ? 'mile' : 'km';
}

// The unit system of the units= option: returns 'km', 'mile' or ''
export function parseUnitsOption(str) {
  var units = parseLabelUnits(str);
  return units ? (getUnitSystem(units) == 'metric' ? 'km' : 'mile') : '';
}

// Accepts the units= option, which also gives the units of a label that is a
// bare number; returns 'km', 'm', 'mile', 'ft' or ''
export function parseLabelUnits(str) {
  var s = String(str || '').toLowerCase();
  if (/^(km|kilomet(er|re)s?|metric)$/.test(s)) return 'km';
  if (/^(m|meters?|metres?)$/.test(s)) return 'm';
  if (/^(mi|miles?|imperial)$/.test(s)) return 'mile';
  if (/^(ft|feet)$/.test(s)) return 'ft';
  return '';
}

// Splits a dual-unit label like "100 km,50 miles". Only a comma after the units
// separates two distances, so "1,000 km" and a bare "1,500" stay whole.
export function splitScalebarLabel(label) {
  return String(label).split(/(?<=[^\d\s]),\s*/).map(function(str) {
    return str.trim();
  }).filter(Boolean);
}

// A distance with no units, e.g. "150" or "1/2" or "1,000"
function isBareDistance(str) {
  return /^[\d\s.,/]+$/.test(str) && parseScalebarNumber(str) > 0;
}

// Adds units to a label that is a bare number
function completeLabel(label, units) {
  return isBareDistance(label) ? formatDistanceLabel(label.trim(), units) : label;
}

// label: a label from the label= option, or empty for an automatic label
function getScalebarLabel(label, frameWidthPx, metersPerPx, defaultUnits) {
  var units;
  if (label && parseScalebarNumber(label) > 0) return completeLabel(label, defaultUnits);
  // A label with units but no number gets an automatic length in those units
  units = label && parseScalebarUnits(label) || defaultUnits;
  return getAutoScalebarLabel(frameWidthPx, metersPerPx, units);
}

// unit: 'km' || 'mile' (or 'm', 'ft' for the same systems)
// The longest length that fits within 20% of the map's width, or the shortest
// that is at least 70px long if the map is too narrow for that
function getAutoScalebarLabel(mapWidth, metersPerPx, unit) {
  var minKm = metersPerPx * 70 / 1000;
  var maxKm = metersPerPx * mapWidth * 0.2 / 1000;
  var labels = getAutoLabels(getUnitSystem(unit));
  var longest = labels.filter(function(label) {
    var km = parseScalebarLabelToKm(label);
    return km >= minKm && km <= maxKm;
  }).pop();
  return longest || labels.find(function(label) {
    return parseScalebarLabelToKm(label) >= minKm;
  }) || '';
}

// The longest automatic length in the given units that fits within the
// first part of a dual-unit scalebar
function getAutoSecondLabel(maxPx, metersPerPx, unit) {
  var maxKm = maxPx * metersPerPx / 1000;
  var minKm = maxKm / 4;
  var labels = getAutoLabels(getUnitSystem(unit)).filter(function(label) {
    var km = parseScalebarLabelToKm(label);
    return km <= maxKm && km >= minKm;
  });
  return labels.pop() || null;
}

export function formatDistanceLabel(numStr, unit) {
  var num = parseScalebarNumber(numStr);
  var unitStr = unit == 'km' && 'KM' ||
    unit == 'm' && (num > 1 ? 'METERS' : 'METER') ||
    unit == 'ft' && (num > 1 ? 'FEET' : 'FOOT') ||
    num > 1 && 'MILES' || 'MILE';
  return numStr + ' ' + unitStr;
}

// See test/scalebar-test.mjs for examples of supported formats
export function parseScalebarLabelToKm(str) {
  var units = parseScalebarUnits(str);
  var value = parseScalebarNumber(str);
  if (!units || !value) return NaN;
  return value * unitSizes[units];
}

function parseScalebarLabel(label) {
  var num = label ? parseScalebarNumber(label) : null;
  var units = label ? parseScalebarUnits(label) : 'mile';
  var km = NaN;
  if (units && num) {
    km = num * unitSizes[units];
  }
  return {
    number: num,
    units: units,
    km: km
  };
}

// Returns 'km', 'm', 'mile', 'ft' or ''
export function parseScalebarUnits(str) {
  var s = String(str).trim().toLowerCase();
  if (/(miles?|mi[.]?|英里)$/.test(s)) return 'mile';
  if (/(k\.m\.|km|kilomet(er|re)s?|kilom.tres?|公里)$/.test(s)) return 'km';
  if (/(^|[\d\s.])(feet|foot|ft[.]?|英尺)$/.test(s)) return 'ft';
  if (/(^|[\d\s.])(m|m\.|meters?|metres?|mètres?|米)$/.test(s)) return 'm';
  return '';
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
