import { stop, message } from '../utils/mapshaper-logging';
import { isLatLngCRS , getDatasetCRS } from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getBoundsPrecisionForDisplay } from '../geom/mapshaper-rounding';

// Converts a Proj.4 projection name (e.g. lcc, tmerc) to a Proj.4 string
// by picking parameters that are appropriate to the extent of the dataset
// being projected (e.g. standard parallels, longitude of origin)
// Works for lcc, aea, tmerc, etc.
// TODO: add more projections
//
export function expandProjDefn(str, dataset) {
  var mproj = require('mproj');
  var proj4, params, bbox, isConic2SP, isCentered, decimals;
  if (str in mproj.internal.pj_list === false) {
    // not a bare projection code -- assume valid projection string in other format
    return str;
  }
  isConic2SP = ['lcc', 'aea'].includes(str);
  isCentered = ['tmerc', 'etmerc'].includes(str);
  proj4 = '+proj=' + str;
  if (isConic2SP || isCentered) {
    bbox = getBBox(dataset);
    decimals = getBoundsPrecisionForDisplay(bbox);
    params = isCentered ? getCenterParams(bbox, decimals) : getConicParams(bbox, decimals);
    proj4 += ' ' + params;
    message(`Converted "${str}" to "${proj4}"`);
  }
  return proj4;
}

function getBBox(dataset) {
  if (!isLatLngCRS(getDatasetCRS(dataset))) {
    stop('Expected unprojected data');
  }
  return getDatasetBounds(dataset).toArray();
}

export function getConicParams(bbox, decimals) {
  var cx = (bbox[0] + bbox[2]) / 2;
  var h = bbox[3] - bbox[1];
  var sp1 = bbox[1] + 0.25 * h;
  var sp2 = bbox[1] + 0.75 * h;
  return `+lon_0=${ cx.toFixed(decimals) } +lat_1=${ sp1.toFixed(decimals) } +lat_2=${ sp2.toFixed(decimals) }`;
}

export function getCenterParams(bbox, decimals) {
  var cx = (bbox[0] + bbox[2]) / 2;
  var cy = (bbox[1] + bbox[3]) / 2;
  return `+lon_0=${ cx.toFixed(decimals) } +lat_0=${ cy.toFixed(decimals) }`;
}
