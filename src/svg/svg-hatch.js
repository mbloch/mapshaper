import utils from '../utils/mapshaper-utils';

export function parseHatch(str) {
  // examples
  // black 1px red 1px
  // -45deg #eee 3 rgb(0,0,0) 1
  var splitRxp = /[, ]+(?![^(]*\))/; // don't split rgb(...) colors
  var parts = String(str).trim().split(splitRxp),
      rot = parts.length == 5 ? parseInt(parts.shift()) : 45,
      col1 = parts[0],
      col2 = parts[2],
      w1 = parseInt(parts[1]),
      w2 = parseInt(parts[3]);
  if (!w1 || !w2) return null;
  return {
    colors: [col1, col2],
    widths: [w1, w2],
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
  var w1 = hatch.widths[0],
      w2 = hatch.widths[1],
      size = Math.round(w1 + w2),
      svg = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${ size }" height="${ size }" patternTransform="rotate(${ hatch.rotation } ${ size/2 } ${ size/2 })">
      <rect x="0" y="0" width="${ w1 }" height="${ size }" fill="${ hatch.colors[0] }"></rect>
      <rect x="${ w1 }" y="0" width="${ w2 }" height="${ size }" fill="${ hatch.colors[1] }"></rect>
      </pattern>`;
  return {
    svg: svg,
    id: id,
    href: `url(#${ id })`
  };
}
