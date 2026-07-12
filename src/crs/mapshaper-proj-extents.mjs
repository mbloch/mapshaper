import { bboxToPolygon } from '../commands/mapshaper-rectangle';
import { getGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { inList, getCrsSlug, isAxisAligned, isMeridianBounded } from '../crs/mapshaper-proj-info';
import {
  getSemiMinorAxis, getCircleRadiusFromAngle
} from '../crs/mapshaper-proj-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { getCircleGeoJSON } from '../buffer/mapshaper-point-buffer';
import { importGeoJSON } from '../geojson/geojson-import';
import { verbose, error, message } from '../utils/mapshaper-logging';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { rotateDataset } from '../commands/mapshaper-rotate';
import { projectDataset } from '../commands/mapshaper-proj';
import { polygonsToLines } from '../commands/mapshaper-lines';
import { isInterruptedProjection } from './mapshaper-projection-topology';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import geom from '../geom/mapshaper-geom';

export function getClippingDataset(src, dest, opts) {
  return getUnprojectedBoundingPolygon(src, dest, opts);
}

export function getUnprojectedBoundingPolygon(src, dest, opts) {
  var dataset;
  if (isCircleClippedProjection(dest) || opts.clip_angle || dest.clip_angle) {
    dataset = getBoundingCircle(src, dest, opts);
  } else if (isRectangleClippedProjection(dest) || opts.clip_bbox) {
    dataset = getBoundingRectangle(dest, opts);
  }
  return dataset || null;
}

// If possible, return a lat-long bbox that can be used to
// test whether data exceeds the projection bounds ands needs to be clipped
// export function getInnerBoundingBBox(P, opts) {
//   var bbox = null;
//   if (opts.clip_bbox) {
//     bbox = opts.clip_bbox;
//   } else if (isRectangleClippedProjection(dest)) {
//     bbox
//   }
//   return bbox;
// }

// Return projected polygon extent of both clipped and unclipped projections
export function getPolygonDataset(src, dest, opts) {
  if (dest.__projected_outline) {
    return getCustomProjectedOutline(dest, 'polygon');
  }
  // use clipping area if projection is clipped
  var dataset = getUnprojectedBoundingPolygon(src, dest, opts);
  if (!dataset) {
    // use entire world if projection is not clipped
    dataset = getBoundingRectangle(dest, {clip_bbox: [-180,-90,180,90]});
  }
  projectDataset(dataset, src, dest, {no_clip: false, quiet: true});
  if (isInterruptedProjection(dest)) {
    removeTinyFootprintRings(dataset);
  }
  return dataset;
}

// Return projected outline of clipped projections
export function getOutlineDataset(src, dest, opts) {
  if (dest.__projected_outline) {
    return getCustomProjectedOutline(dest, 'polyline');
  }
  var dataset = getUnprojectedBoundingPolygon(src, dest, opts);
  if (!dataset && isInterruptedProjection(dest)) {
    dataset = getBoundingRectangle(dest, {clip_bbox: [-180, -90, 180, 90]});
  }
  if (dataset) {
    // project, with cutting & cleanup
    projectDataset(dataset, src, dest, {no_clip: false, quiet: true});
    if (isInterruptedProjection(dest)) {
      removeTinyFootprintRings(dataset);
    }
    dataset.layers[0].geometry_type = 'polyline';
    if (dest.__remove_outline_extreme_connectors) {
      dataset = removeOutlineExtremeConnectors(dataset);
    }
  }
  return dataset || null;
}

function getCustomProjectedOutline(P, geometryType) {
  var rings = P.__projected_outline.map(function(ring) {
    return ring.map(function(p) {
      return [
        P.fr_meter * (P.a * p[0] + P.x0),
        P.fr_meter * (P.a * p[1] + P.y0)
      ];
    });
  });
  var dataset = importGeoJSON({
    type: rings.length == 1 ? 'Polygon' : 'MultiPolygon',
    coordinates: rings.length == 1 ? rings : rings.map(function(ring) {
      return [ring];
    })
  });
  dataset.layers[0].geometry_type = geometryType;
  dataset.info.crs = P;
  return dataset;
}

// Narrow pre-projection gutters can leave zero-area rings after a rotated
// world boundary is cleaned. Remove only rings that are negligible relative
// to the main footprint; legitimate disconnected lobes are retained.
function removeTinyFootprintRings(dataset) {
  var lyr = dataset.layers[0];
  var arcs = dataset.arcs;
  var maxArea = 0;
  lyr.shapes.forEach(function(shp) {
    (shp || []).forEach(function(path) {
      maxArea = Math.max(maxArea, Math.abs(geom.getPathArea(path, arcs)));
    });
  });
  if (maxArea === 0) return;
  editShapes(lyr.shapes, function(path) {
    if (Math.abs(geom.getPathArea(path, arcs)) <= maxArea * 1e-12) {
      return null;
    }
  });
  dissolveArcs(dataset);
}

// Polygon clipping closes open interrupted-projection boundaries to form valid
// rings. In Cahill-Keyes, some closures connect unrelated polar facet images.
// Remove only long, nearly horizontal segments at the map's vertical extent.
function removeOutlineExtremeConnectors(dataset) {
  var bounds = getDatasetBounds(dataset);
  var width = bounds.width();
  var height = bounds.height();
  var edgeTolerance = height * 1e-3;
  var flatTolerance = height * 1e-4;
  var arcs = dataset.arcs;
  var lyr = dataset.layers[0];
  var paths = [];
  var removed = 0;
  lyr.shapes.forEach(function(shp) {
    (shp || []).forEach(function(path) {
      var points = [];
      var iter = arcs.getShapeIter(path);
      while (iter.hasNext()) {
        points.push([iter.x, iter.y]);
      }
      var part = [points[0]];
      for (var i = 1; i < points.length; i++) {
        var a = points[i - 1];
        var b = points[i];
        var atTop = Math.min(a[1], b[1]) >= bounds.ymax - edgeTolerance;
        var atBottom = Math.max(a[1], b[1]) <= bounds.ymin + edgeTolerance;
        var isFlat = Math.abs(a[1] - b[1]) <= flatTolerance;
        var isWide = Math.abs(a[0] - b[0]) >= width * 0.02;
        if ((atTop || atBottom) && isFlat && isWide) {
          if (part.length > 1) paths.push(part);
          part = [b];
          removed++;
        } else {
          part.push(b);
        }
      }
      if (part.length > 1) paths.push(part);
    });
  });
  if (removed === 0) return dataset;
  var cleaned = importGeoJSON({
    type: paths.length == 1 ? 'LineString' : 'MultiLineString',
    coordinates: paths.length == 1 ? paths[0] : paths
  });
  cleaned.info = dataset.info;
  return cleaned;
}

function getBoundingRectangle(dest, opts) {
  var bbox = opts.clip_bbox || getDefaultClipBBox(dest);
  var rotation = getRotationParams(dest);
  if (!bbox) error('Missing expected clip bbox.');
  opts = Object.assign({interval: 0.5}, opts); // make sure edges can curve
  var dataset = importGeoJSON(bboxToPolygon(bbox, opts));
  if (rotation) {
    rotateDataset(dataset, {rotation: rotation, invert: true});
  }
  return dataset;
}

function getBoundingCircle(src, dest, opts) {
  var angle = opts.clip_angle || dest.clip_angle || getDefaultClipAngle(dest);
  if (!angle) return null;
  verbose(`Using clip angle of ${ +angle.toFixed(2) } degrees`);
  var dist = getClippingRadius(src, angle);
  var cp = getProjCenter(dest);
  // kludge: attach the clipping angle to the CRS, so subsequent commands
  // (e.g. -graticule) can create an outline
  dest.clip_angle = angle;
  var geojson = getCircleGeoJSON(cp, dist, null, opts);
  return importGeoJSON(geojson);
}

export function isRectangleClippedProjection(P) {
  // TODO: add tmerc, etmerc, ...
  // return inList(P, 'tmerc,utm,etmerc,merc,bertin1953');
  return inList(P, 'merc,bertin1953');
}

export function getDefaultClipBBox(P) {
  var e = 1e-3;
  var slug = getCrsSlug(P);
  var tmerc = [-179,-90,179,90];
  var bbox = {
    // longlat: [-180, -90, 180, 90],
    tmerc: tmerc,
    utm: tmerc,
    etmerc: tmerc,
    merc: [-180, -89, 180, 89],
    lcc: [-180, -89, 180, 89],
    bertin1953: [-180 + e, -90 + e, 180 - e, 90 - e]
  }[slug];
  return bbox;
}

export function getClampBBox(P) {
  var bbox;
  if (inList(P, 'merc,lcc')) {
    bbox = getDefaultClipBBox(P);
  }
  return bbox;
}

export function isCircleClippedProjection(P) {
  return inList(P, 'stere,sterea,ups,ortho,gnom,laea,nsper,tpers,geos,nicol');
}

function getPerspectiveClipAngle(P) {
  var h = parseFloat(P.params.h.param);
  if (!h || h < 0) {
    return 0;
  }
  var theta = Math.acos(P.a / (P.a + h)) * 180 / Math.PI;
  theta *= 0.995; // reducing a bit to avoid out-of-range errors
  return theta;
}

export function getDefaultClipAngle(P) {
  var slug = getCrsSlug(P);
  if (slug == 'nsper' || slug == 'geos') return getPerspectiveClipAngle(P);
  if (slug == 'tpers') {
    message('Automatic clipping is not supported for the Tilted Perspective projection');
    return 0;
  }
  return {
    gnom: 60,
    laea: 179,
    //ortho: 89.9, // projection errors betwen lat +/-35 to 55
    ortho: 89.85, // TODO: investigate
    nicol: 89.85,
    stere: 142,
    sterea: 142,
    ups: 10.5 // TODO: should be 6.5 deg at north pole
  }[slug] || 0;
}

export function getRotationParams(P) {
  var slug = getCrsSlug(P);
  if (slug == 'bertin1953') return [-16.5,-42];
  if (slug == 'tmerc' || slug == 'utm' || slug == 'etmerc') {
    if (P.lam0 !== 0) return [P.lam0 * 180 / Math.PI];
  }
  return null;
}


function getProjCenter(P) {
  var rtod = 180 / Math.PI;
  return [P.lam0 * rtod, P.phi0 * rtod];
}

// Convert a clip angle to a distance in meters
function getClippingRadius(P, angle) {
  return getCircleRadiusFromAngle(P, angle);
}

