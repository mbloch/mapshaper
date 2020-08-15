import utils from '../utils/mapshaper-utils';

export function parseHatch(str) {
  // examples
  // black 1px red 1px white 1px
  // -45deg #eee 3 rgb(0,0,0) 1
  var splitRxp = /[, ]+(?![^(]*\))/, // don't split rgb(...) colors
      parts = String(str).trim().split(splitRxp),
      rot = parts.length % 2 == 1 ? parseInt(parts.shift()) : 45, // default is 45
      colors = [], widths = [];
  for (var i=0; i<parts.length; i+=2) {
    colors.push(parts[i]);
    widths.push(parseInt(parts[i+1]));
  }
  if (Math.min.apply(null, widths) < 1) return null;
  return {
    colors: colors,
    widths: widths,
    rotation: rot
  };
}

function getHashId(str) {
  return ('hash_' + str).replace(/[()# ,_]+/g, '_'); // replace some chars that occur in colors
}

// properties: properties object of a path data object (prior to conversion to SVG)
// symbols: array of definition objects
//
export function convertFillHatch(properties, symbols) {
  var hatchStr = properties['fill-hatch'];
  var hashId = getHashId(hatchStr);
  var hash = utils.find(symbols, function(o) { return o.id == hashId; });
  delete properties['fill-hatch'];
  if (!hash) {
    hash = makeSVGHatchFill(hatchStr, hashId);
    if (!hash) return;
    symbols.push(hash);
  }
  properties.fill = hash.href;
}

function makeSVGHatchFill(hatchStr, id) {
  var hatch = parseHatch(hatchStr);
  if (!hatch) return null;
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
