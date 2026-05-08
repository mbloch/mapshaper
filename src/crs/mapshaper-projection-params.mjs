import { stop, message } from '../utils/mapshaper-logging';
import { isLatLngCRS , getDatasetCRS } from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getBoundsPrecisionForDisplay } from '../geom/mapshaper-rounding';
import { forEachArcId } from '../paths/mapshaper-path-utils';
import require from '../mapshaper-require';

// Converts a Proj.4 projection name (e.g. lcc, tmerc, utm) to a Proj.4 string
// by picking parameters that are appropriate to the extent of the dataset
// being projected (e.g. standard parallels, longitude of origin)
// Works for lcc, aea, tmerc, utm, etc.
// TODO: add more projections
//
export function expandProjDefn(str, dataset, targetLayers) {
  var mproj = require('mproj');
  var proj4, params, bbox, isConic2SP, isCentered, isUtm, decimals;
  if (str in mproj.internal.pj_list === false) {
    // not a bare projection code -- assume valid projection string in other format
    return str;
  }
  isConic2SP = ['lcc', 'aea'].includes(str);
  isCentered = ['tmerc', 'etmerc'].includes(str);
  isUtm = str == 'utm';
  proj4 = '+proj=' + str;
  if (isConic2SP || isCentered || isUtm) {
    bbox = getBBox(dataset, targetLayers); // TODO: support projected datasets
    decimals = getBoundsPrecisionForDisplay(bbox);
    if (isUtm) {
      params = getUtmParams(bbox);
    } else {
      params = isCentered ? getCenterParams(bbox, decimals) : getConicParams(bbox, decimals);
    }
    proj4 += ' ' + params;
    message(`Converted "${str}" to "${proj4}"`);
  }
  return proj4;
}

function getBBox(dataset, targetLayers) {
  var source = targetLayers && targetLayers.length > 0 ? {
    arcs: dataset.arcs,
    layers: targetLayers,
    info: dataset.info
  } : dataset;
  if (!isLatLngCRS(getDatasetCRS(dataset))) {
    stop('Expected unprojected data');
  }
  return getAutoFitBBox(source);
}

export function getAutoFitBBox(dataset) {
  var bbox = getDatasetBounds(dataset).toArray();
  if (bbox[2] - bbox[0] > 180) {
    bbox = getWrappedBBox(dataset, bbox) || bbox;
  }
  return bbox;
}

function getWrappedBBox(dataset, bbox) {
  var xminW = Infinity, xmaxW = -Infinity,
      xminE = Infinity, xmaxE = -Infinity,
      ymin = bbox[1], ymax = bbox[3],
      gap;

  // Detect dateline clustering with a streaming east/west split. The gap
  // between the two boxes can only shrink as more coordinates are scanned.
  forEachDatasetCoord(dataset, function(x) {
    if (x < 0) {
      if (x < xminW) xminW = x;
      if (x > xmaxW) xmaxW = x;
    } else {
      if (x < xminE) xminE = x;
      if (x > xmaxE) xmaxE = x;
    }
    if (xmaxW > -Infinity && xmaxE > -Infinity) {
      gap = xminE - xmaxW;
      return gap > 180;
    }
  });

  if (xmaxW == -Infinity || xmaxE == -Infinity) return null;
  if (xminE - xmaxW <= 180) return null;
  return [xminE, ymin, xmaxW + 360, ymax];
}

function forEachDatasetCoord(dataset, cb) {
  var arcs = dataset.arcs;
  var usedArcs = arcs ? new Uint8Array(arcs.size()) : null;
  var keepGoing = true;
  dataset.layers.forEach(function(lyr) {
    if (!keepGoing) return;
    if (lyr.geometry_type == 'point') {
      keepGoing = scanPointCoords(lyr.shapes, cb);
    } else if (arcs && (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline')) {
      forEachArcId(lyr.shapes, function(id) {
        var absId, iter;
        if (!keepGoing) return;
        absId = id < 0 ? ~id : id;
        if (usedArcs[absId]) return;
        usedArcs[absId] = 1;
        iter = arcs.getArcIter(absId);
        while (keepGoing && iter.hasNext()) {
          keepGoing = cb(iter.x, iter.y) !== false;
        }
      });
    }
  });
}

function scanPointCoords(shapes, cb) {
  var shp, p;
  for (var i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
      p = shp[j];
      if (cb(p[0], p[1]) === false) return false;
    }
  }
  return true;
}

// See: Savric & Jenny, "Automating the selection of standard parallels for conic map projections"
// Using one-sixth rule, not the more complicated formula proposed by the authors
export function getConicParams(bbox, decimals) {
  var cx = (bbox[0] + bbox[2]) / 2;
  var h = bbox[3] - bbox[1];
  var sp1 = bbox[1] + 1/6 * h;
  var sp2 = bbox[1] + 5/6 * h;
  return `+lon_0=${ cx.toFixed(decimals) } +lat_1=${ sp1.toFixed(decimals) } +lat_2=${ sp2.toFixed(decimals) }`;
}

export function getCenterParams(bbox, decimals) {
  var cx = (bbox[0] + bbox[2]) / 2;
  var cy = (bbox[1] + bbox[3]) / 2;
  return `+lon_0=${ cx.toFixed(decimals) } +lat_0=${ cy.toFixed(decimals) }`;
}

export function getUtmParams(bbox) {
  var cx = (bbox[0] + bbox[2]) / 2;
  var cy = (bbox[1] + bbox[3]) / 2;
  var zone = Math.floor((cx + 180) / 6) + 1;
  zone = Math.max(1, Math.min(60, zone));
  return `+zone=${ zone }` + (cy < 0 ? ' +south' : '');
}
