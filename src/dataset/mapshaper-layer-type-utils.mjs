// Pure geometry-type predicates for layers. Extracted from layer-utils.mjs
// so that point-utils -- which only needs `layerHasPoints` -- can avoid
// importing from layer-utils (which in turn imports point-utils for its
// path/bound helpers, forming a cycle).

import utils from '../utils/mapshaper-utils';

export function layerHasGeometry(lyr) {
  return layerHasPaths(lyr) || layerHasPoints(lyr);
}

export function layerIsGeometric(lyr) {
  return !!lyr.geometry_type; // only checks type, includes empty layers
}

export function layerHasPaths(lyr) {
  return (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') &&
    layerHasNonNullShapes(lyr);
}

export function layerHasPoints(lyr) {
  return lyr.geometry_type == 'point' && layerHasNonNullShapes(lyr);
}

export function layerHasNonNullShapes(lyr) {
  return utils.some(lyr.shapes || [], function(shp) {
    return !!shp;
  });
}
