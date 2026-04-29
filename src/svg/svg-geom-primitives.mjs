// Pure geometry-to-SVG-path primitives. Extracted from geojson-to-svg.mjs
// so that svg-symbols.mjs can use them without going through geojson-to-svg
// (which would otherwise form an import cycle, because geojson-to-svg's
// point importer calls back into svg-symbols for renderPoint).

export function importLineString(coords) {
  var d = stringifyLineStringCoords(coords);
  return {
    tag: 'path',
    properties: {d: d}
  };
}

export function importMultiLineString(coords) {
  var d = coords.map(stringifyLineStringCoords).join(' ');
  return {
    tag: 'path',
    properties: {d: d}
  };
}

export function importMultiPolygon(coords) {
 return importPolygon(flattenMultiPolygonCoords(coords));
}

export function flattenMultiPolygonCoords(coords) {
  return coords.reduce(function(memo, poly) {
    return memo.concat(poly);
  }, []);
}

export function importPolygon(coords) {
  if (coords.length === 0) return null;
  var o = {
    tag: 'path',
    properties: {
      d: stringifyPolygonCoords(coords)
    }
  };
  if (coords.length > 1) {
    o.properties['fill-rule'] = 'evenodd'; // support polygons with holes
  }
  return o;
}

function stringifyPolygonCoords(coords) {
  var parts = [];
  for (var i=0; i<coords.length; i++) {
    parts.push(stringifyLineStringCoords(coords[i]) + ' Z');
  }
  return parts.length > 0 ? parts.join(' ') : '';
}

function stringifyLineStringCoords(coords) {
  if (coords.length === 0) return '';
  var d = 'M';
  for (var i=0, n=coords.length; i<n; i++) {
    d += ' ' + coords[i][0] + ' ' + coords[i][1];
  }
  return d;
}
