import utils from '../utils/mapshaper-utils';
import { stop, message } from '../utils/mapshaper-logging';

/* example patterns
hatches 1px black 1px red 1px white
1px black 1px red 1px white // same as above (hatches is default)
45deg 2px black 2px red     // hatch direction
dots 2px black 5px white    // 2px black dots with 5px spacing on white
dots 2px blue 2px red 5px white  // blue and red alternating dots
*/
export function parsePattern(str) {
  if (!str) return null;
  var parts = splitPattern(str);
  var first = parts[0] || '';
  var obj = null;
  // accept variations on type names (dot, dots, square, squares, hatch, hatches, hatched)
  if (first.startsWith('dot')) {
    parts[0] = 'dots';
    obj = parseDots(parts, str);
  } else if (first.startsWith('square')) {
    parts[0] = 'squares';
    obj = parseDots(parts, str);
  } else if (first.startsWith('hatch')) {
    parts[0] = 'hatches';
    obj = parseHatches(parts, str);
  } else if (!isNaN(parseFloat(first))) {
    parts.unshift('hatches');
    obj = parseHatches(parts, str); // hatches is the default, name can be omitted
  }
  if (!obj) {
    // consider
    message('Invalid pattern, ignoring:', str);
  }
  return obj;
}

export function parseHatches(parts, str) {
  // examples
  // 1px red 1px white 1px black
  // -45deg 3 #eee 3 rgb(0,0,0)
  var type = parts.shift();
  var rot = parts.length % 2 == 1 ? parseInt(parts.shift()) : 45, // default is 45
      colors = [], widths = [], a, b;
  for (var i=0; i<parts.length; i+=2) {
    widths.push(parseInt(parts[i]));
    colors.push(parts[i+1]);
  }
  if (Math.min.apply(null, widths) > 0 === false) return null;
  return {
    type: 'hatches',
    colors: colors,
    widths: widths,
    rotation: rot
  };
}

export function parseDots(parts, str) {
  var colors = [];
  var type = parts.shift();
  var rot = 0;
  if (parseInt(parts[1]) > 0) { // if rotation is present, there are two numbers
    rot = parseInt(parts.shift());
  }
  var size = parseInt(parts.shift());
  var bg = parts.pop();
  var spacing = parseInt(parts.pop());
  while (parts.length > 0) {
    colors.push(parts.shift());
  }
  if (size > 0 === false || spacing >= 0 === false) return null;
  if (colors.length === 0) return null;
  return {
    type: type,
    colors: colors, // last color is background
    size: size,
    spacing: spacing,
    background: bg,
    rotation: rot
  };
}

function splitPattern(str) {
  var splitRxp = /[, ]+(?![^(]*\))/; // don't split rgb(...) colors
  return String(str).trim().split(splitRxp);
}

function getHashId(str) {
  return ('hash_' + str).replace(/[()# ,_]+/g, '_'); // replace some chars that occur in colors
}

// properties: properties object of a path data object (prior to conversion to SVG)
// symbols: array of definition objects
//
export function convertFillPattern(properties, symbols) {
  var hatchStr = properties['fill-pattern'];
  var hashId = getHashId(hatchStr);
  var hash = utils.find(symbols, function(o) { return o.id == hashId; });
  delete properties['fill-pattern'];
  if (!hash) {
    hash = makeSVGPatternFill(hatchStr, hashId);
    if (!hash) return;
    symbols.push(hash);
  }
  properties.fill = hash.href;
}

function makeSVGPatternFill(str, id) {
  var data = parsePattern(str);
  if (!data) return null;
  if (data.type == 'hatches') {
    return makeSVGHatchFill(data, id);
  } else if (data.type == 'dots' || data.type == 'squares') {
    return makeSVGDotFill(data, id);
  }
}

function makeSVGHatchFill(hatch, id) {
  var size = utils.sum(hatch.widths);
  var svg = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${ size }" height="10" patternTransform="rotate(${ hatch.rotation })">`;
  for (var i=0, x=0; i<hatch.widths.length; i++) {
    svg += `<rect x="${ x }" y="0" width="${ hatch.widths[i] }" height="10" fill="${ hatch.colors[i] }"></rect>`;
    x += hatch.widths[i];
  }
  svg += '</pattern>';
  return {
    svg: svg,
    id: id,
    href: `url(#${ id })`
  };
}

function makeCircle(x, y, size, fill) {
  const r = size / 2;
  return `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${ fill }"></circle>`;
}

function makeSquare(x, y, size, fill) {
  return `<rect x="${x}" y="${y}" width="${ size }" height="${ size }" fill="${ fill }"></rect>`;
}

function makeSVGDotFill(obj, id) {
  var dotSize = obj.size;
  var colorCount = obj.colors.length;
  var dotDist = dotSize + obj.spacing;
  var sideLen = dotDist * colorCount;
  var dotsPerTile = colorCount * colorCount;
  var x = 0, y = 0;
  var makeSymbol = obj.type == 'squares' ? makeSquare : makeCircle;
  var transform = obj.rotation ? `patternTransform="rotate(${ obj.rotation })"` : '';
  var svg = `<pattern id="${id}" patternUnits="userSpaceOnUse" ${transform} width="${ sideLen }" height="${ sideLen }">`;
  svg += `<rect x="0" y="0" width="${ sideLen }" height="${ sideLen }" fill="${ obj.background }"></rect>`;
  for (var i=0; i<dotsPerTile; i++) {
    svg += makeSymbol(x, y, dotSize, obj.colors[(i + Math.floor(i / colorCount)) % colorCount]);
    x = ((i + 1) % colorCount) * dotDist;
    if (x == 0) y += dotDist;
  }
  svg += '</pattern>';
  return {
    svg: svg,
    id: id,
    href: `url(#${ id })`
  };
}
