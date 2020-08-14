import utils from '../utils/mapshaper-utils';

export function parseHatch(str) {
  // example
  // black 1px red 1px
  var parts = String(str).trim().split(/[, ]+/),
      col1 = parts[0],
      col2 = parts[2],
      w1 = parseInt(parts[1]),
      w2 = parseInt(parts[3]);
  if (!w1 || !w2) return null;
  return {
    colors: [col1, col2],
    widths: [w1, w2]
  };
}

function getHashId(str) {
  return 'hash_' + str.replace(/[()# ,]/g, ''); // remove some chars that occur in colors
}

// properties: properties object of a path data object (prior to conversion to SVG)
// symbols: array of definition objects
//
export function convertFillHatch(properties, symbols) {
  var hashStr = properties['fill-hatch'];
  var hashId = getHashId(hashStr);
  var hash = utils.find(symbols, function(o) { return o.id == hashId; });
  delete properties['fill-hatch'];
  if (!hash) {
    hash = makeSVGHatchFill(hashStr, hashId);
    if (!hash) return;
    symbols.push(hash);
  }
  properties.fill = hash.href;
}

function makeSVGHatchFill(hashStr, id) {
  var hash = parseHatch(hashStr);
  if (!hash) return null;
  var tileWidth = Math.round(hash.widths[0] + hash.widths[1]),
      halfWidth = tileWidth / 2,
      strokeWidth = Math.round(hash.widths[1]),
      y = strokeWidth - (strokeWidth % 2 == 0 ? 0 : 0.5),
      d = 'M ' + (-halfWidth) + ',' + y + ' l ' + (2 * tileWidth) + ',0',
      svg = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${ tileWidth }" height="${ tileWidth }" patternTransform="rotate(-45 ${ halfWidth } ${ halfWidth })">
      <rect x="0" y="0" width="${ tileWidth }" height="${ tileWidth }" fill="${ hash.colors[0] }"></rect>
      <path stroke="${ hash.colors[1] }" stroke-width="${ strokeWidth }" d="${ d }"></path></pattern>`;
  return {
    svg: svg,
    id: id,
    href: `url(#${ id })`
  };
}
