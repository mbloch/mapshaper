import utils from '../utils/mapshaper-utils';
import { message } from '../utils/mapshaper-logging';

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
    obj = parseDots(parts);
  } else if (first.startsWith('square')) {
    parts[0] = 'squares';
    obj = parseDots(parts);
  } else if (first.startsWith('hatch')) {
    parts[0] = 'hatches';
    obj = parseHatches(parts);
  } else if (first.startsWith('dash')) {
    obj = parseDashes(parts);
  } else if (!isNaN(parseFloat(first))) {
    parts.unshift('hatches');
    obj = parseHatches(parts); // hatches is the default, name can be omitted
  }
  // Silent: this is also how a value is tested for being a pattern at all
  // (-style tries every value as a literal before trying it as an
  // expression), so a failure here is not necessarily a mistake. The SVG
  // exporter reports the patterns it has to drop.
  return obj;
}

export function parseDashes(parts) {
  // format:
  // "dashes" dash-len dash-space width color1 [color2...] space bg-color
  // examples:
  // dashes 4px 3px 1px black 4px white
  var type = parts.shift();
  var colors = [];
  var background = parts.pop();
  var spacing = parseNum(parts.pop());
  var tmp;
  while (parts.length > 0) {
    tmp = parts.pop();
    if (isSize(tmp)) {
      parts.push(tmp);
      break;
    } else {
      colors.push(tmp);
    }
  }
  var width = parseNum(parts.pop());
  var dashes = [parseNum(parts.pop()), parseNum(parts.pop())].reverse();
  var rotation = 45;
  if (parts.length > 0) {
    rotation = parseNum(parts.pop());
  }
  if (parts.length > 0) {
    return null;
  }
  if (width > 0 === false) return null;
  return {
    type: 'dashes',
    tileSize: [colors.length * (width + spacing), utils.sum(dashes)],
    colors: colors,
    width: width,
    dashes: dashes,
    spacing: spacing,
    background: background,
    rotation: rotation
  };
}

export function parseHatches(parts) {
  // format:
  // [hatches] [rotation] width1 color1 [width2 color2 ...]
  // examples:
  // 1px red 1px white 1px black
  // -45deg 3 #eee 3 rgb(0,0,0)
  var type = parts.shift();
  var rot = parts.length % 2 == 1 ? parseNum(parts.shift()) : 45, // default is 45
      colors = [], widths = [], a, b;
  for (var i=0; i<parts.length; i+=2) {
    widths.push(parseNum(parts[i]));
    colors.push(parts[i+1]);
  }
  if (Math.min.apply(null, widths) > 0 === false) return null;
  return {
    tileSize: [utils.sum(widths), 10],
    type: 'hatches',
    colors: colors,
    widths: widths,
    rotation: rot
  };
}

function isSize(str) {
  return parseNum(str) > 0;
}

export function parseDots(parts) {
  // format:
  // "dots"|"squares" [rotation] size color1 [color2 ...] spacing bg-color
  // examples:
  // dots 45deg 2px red blue 5px white
  // squares 3px black 1px white
  var colors = [];
  var type = parts.shift();
  var rot = 0;
  if (isSize(parts[1])) { // if rotation is present, there are two numbers
    rot = parseNum(parts.shift());
  }
  var size = parseNum(parts.shift());
  var bg = parts.pop();
  var spacing = parseNum(parts.pop());
  while (parts.length > 0) {
    colors.push(parts.shift());
  }
  if (size > 0 === false || spacing >= 0 === false) return null;
  if (colors.length === 0) return null;
  var side = colors.length * (size + spacing);
  return {
    type: type,
    tileSize: [side, side],
    colors: colors,
    size: size,
    spacing: spacing,
    background: bg,
    rotation: rot
  };
}

function parseNum(str) {
  // return parseNum(str);
  // support sub-pixel sizes
  return parseFloat(str) || 0;
}

function splitPattern(str) {
  // split apart space and comma-delimited tokens
  // ... but don't split rgb(...) colors
  var splitRxp = /[, ]+(?![^(]*\))/;
  return String(str).trim().split(splitRxp);
}

// The id of the <pattern> element a fill-pattern code is exported as. It is
// also how the code is recovered when an exported SVG is imported again (see
// decodePatternId()), so a change here has to keep decoding the ids of files
// that are already out there.
export function getHashId(str) {
  return ('hash_' + str).replace(/[()# ,_]+/g, '_'); // replace some chars that occur in colors
}

// The fill-pattern code a <pattern> id was made from, or null if the id is not
// one of ours. The id keeps the tokens of the code but drops the # of a hex
// colour and the parentheses and commas of rgb() and hsl(), so those are put
// back by where the colours fall in each pattern type's syntax. A hex colour
// has to have its # back even where the parser would not need it: without it,
// a colour of digits reads as a number.
export function decodePatternId(id) {
  var tokens, code;
  if (!/^hash_./.test(id || '')) return null;
  tokens = mergeColorFunctions(id.substr(5).split('_').filter(Boolean));
  tokens = restoreHexColors(tokens);
  if (!tokens) return null;
  code = tokens.join(' ');
  return parsePattern(code) ? code : null;
}

function mergeColorFunctions(tokens) {
  var out = [];
  var tok, argc, args;
  for (var i=0; i<tokens.length; i++) {
    tok = tokens[i];
    if (/^(rgb|hsl)a?$/i.test(tok)) {
      argc = /a$/i.test(tok) ? 4 : 3;
      args = tokens.slice(i + 1, i + 1 + argc);
      i += args.length;
      if (tokens[i + 1] == '/' && i + 2 < tokens.length) {
        // space-separated form with an alpha: rgb(0 0 0 / 50%)
        out.push(tok + '(' + args.join(' ') + ' / ' + tokens[i + 2] + ')');
        i += 2;
      } else {
        out.push(tok + '(' + args.join(',') + ')');
      }
    } else {
      out.push(tok);
    }
  }
  return out;
}

// Marks each token as a colour or not, by pattern type, and gives the colours
// that look like hex values their # back. Returns null for an unknown type.
function restoreHexColors(tokens) {
  var type = tokens[0] || '';
  var colorAt;
  if (type.startsWith('dot') || type.startsWith('square')) {
    colorAt = getDotColorPositions(tokens);
  } else if (type.startsWith('dash')) {
    colorAt = getDashColorPositions(tokens);
  } else if (type.startsWith('hatch') || isNumberToken(type)) {
    colorAt = getHatchColorPositions(tokens);
  } else {
    return null;
  }
  return tokens.map(function(tok, i) {
    return colorAt[i] && /^[0-9a-f]+$/i.test(tok) && [3, 4, 6, 8].includes(tok.length) ?
      '#' + tok : tok;
  });
}

// [hatches] [rotation] width1 color1 [width2 color2 ...]
function getHatchColorPositions(tokens) {
  var start = isNumberToken(tokens[0]) ? 0 : 1;
  var rest = tokens.length - start;
  var first = start + (rest % 2 == 1 ? 1 : 0); // odd count: a rotation first
  return tokens.map(function(tok, i) {
    return i >= first && (i - first) % 2 == 1;
  });
}

// dots|squares [rotation] size color1 [color2 ...] spacing background
function getDotColorPositions(tokens) {
  var last = tokens.length - 1;
  // A rotation is there if the second number is also a size -- but a colour
  // of digits looks like a number too, so a bare one counts as a colour
  // unless a unit or a decimal point says otherwise.
  var rotated = /deg$/.test(tokens[1] || '') ||
    last >= 5 && isNumberToken(tokens[2]) && !mightBeHexDigits(tokens[2]);
  var firstColor = rotated ? 3 : 2;
  return tokens.map(function(tok, i) {
    return i == last || i >= firstColor && i < last - 1;
  });
}

// dashes [rotation] dash-length space-length width color1 [color2 ...] spacing background
function getDashColorPositions(tokens) {
  var last = tokens.length - 1;
  var rotated = /deg$/.test(tokens[1] || '') ||
    last >= 7 && isNumberToken(tokens[4]) && !mightBeHexDigits(tokens[4]);
  var firstColor = rotated ? 5 : 4;
  return tokens.map(function(tok, i) {
    return i == last || i >= firstColor && i < last - 1;
  });
}

function isNumberToken(tok) {
  return /^-?(\d+\.?\d*|\.\d+)(px|deg)?$/.test(tok || '');
}

function mightBeHexDigits(tok) {
  return /^\d+$/.test(tok) && [3, 4, 6, 8].includes(tok.length);
}

// properties: properties object of a path data object (prior to conversion to SVG)
// defs: array of definition objects
//
export function convertFillPattern(properties, defs) {
  var hatchStr = properties['fill-pattern'];
  var hashId = getHashId(hatchStr);
  var hash = utils.find(defs, function(o) { return o.id == hashId; });
  delete properties['fill-pattern'];
  if (!hash) {
    hash = makeSVGPatternFill(hatchStr, hashId);
    if (!hash) return;
    defs.push(hash);
  }
  // The feature's own fill is kept as the paint's fallback colour, which SVG
  // draws only if the pattern cannot be. It is also how the fill survives
  // being exported and imported again.
  properties.fill = properties.fill ? hash.href + ' ' + properties.fill : hash.href;
}

function makeSVGPatternFill(str, id) {
  var o = parsePattern(str);
  var svg;
  if (!o) {
    message('Invalid pattern, ignoring:', str);
    return null;
  }
  if (o.type == 'hatches') {
    svg = makeHatchPatternSVG(o);
  } else if (o.type == 'dots' || o.type == 'squares') {
    svg = makeDotPatternSVG(o);
  } else if (o.type == 'dashes') {
    svg = makeDashPatternSVG(o);
  }
  return {
    svg: wrapSVGPattern(o, id, svg),
    id: id,
    href: `url(#${ id })`
  };
}

function wrapSVGPattern(o, id, str) {
  var w = o.tileSize[0];
  var h = o.tileSize[1];
  var svg = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${ w }" height="${ h }" patternTransform="rotate(${ o.rotation })">`;
  if (o.background) {
    svg += `<rect x="0" y="0" width="${ w }" height="${ h }" fill="${ o.background }"></rect>`;
  }
  return svg + str + '</pattern>';
}

function makeDashPatternSVG(o) {
  var svg = '';
  for (var i=0, x=0; i<o.colors.length; i++) {
    svg += `<rect x="${ x }" y="0" width="${ o.width }" height="${ o.dashes[0] }" fill="${ o.colors[i] }"></rect>`;
    x += o.width + o.spacing;
  }
  return svg;
}

function makeHatchPatternSVG(o) {
  var h = o.tileSize[1];
  var svg = '';
  for (var i=0, x=0; i<o.widths.length; i++) {
    svg += `<rect x="${ x }" y="0" width="${ o.widths[i] }" height="${ h }" fill="${ o.colors[i] }"></rect>`;
    x += o.widths[i];
  }
  return svg;
}

function makeDotPatternSVG(o) {
  var dotSize = o.size;
  var colorCount = o.colors.length;
  var dotDist = dotSize + o.spacing;
  var dotsPerTile = colorCount * colorCount;
  var makeSymbol = o.type == 'squares' ? makeSquare : makeCircle;
  var svg = '';
  for (var i=0, x=0, y=0; i<dotsPerTile; i++) {
    svg += makeSymbol(x, y, dotSize, o.colors[(i + Math.floor(i / colorCount)) % colorCount]);
    x = ((i + 1) % colorCount) * dotDist;
    if (x === 0) y += dotDist;
  }
  return svg;
}

function makeCircle(x, y, size, fill) {
  const r = size / 2;
  return `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${ fill }"></circle>`;
}

function makeSquare(x, y, size, fill) {
  return `<rect x="${x}" y="${y}" width="${ size }" height="${ size }" fill="${ fill }"></rect>`;
}
