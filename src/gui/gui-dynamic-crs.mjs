import { internal, utils } from './gui-core';

var R = 6378137;
var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;

// Assumes projections are available

export function needReprojectionForDisplay(sourceCRS, displayCRS) {
  if (!sourceCRS || !displayCRS) {
    return false;
  }
  if (internal.crsAreEqual(sourceCRS, displayCRS)) {
    return false;
  }
  return true;
}

export function projectArcsForDisplay(arcs, src, dest) {
  var copy = arcs.getCopy(); // need to flatten first?
  var destIsWebMerc = internal.isWebMercator(dest);
  if (destIsWebMerc && internal.isWebMercator(src)) {
    return copy;
  }

  var wgs84 = internal.parseCrsString('wgs84');
  var toWGS84 = internal.getProjTransform2(src, wgs84);
  var fromWGS84 = internal.getProjTransform2(wgs84, dest);

  try {
    // first try projectArcs() -- it's fast and preserves arc ids
    // (so vertex editing doesn't break)
    if (!internal.isWGS84(src)) {
      // use wgs84 as a pivot CRS, so we can handle polar coordinates
      // that can't be projected to Mercator
      internal.projectArcs(copy, toWGS84);
    }
    if (destIsWebMerc) {
      // handle polar points by clamping them to they will project
      // (downside: may cause unexpected behavior when editing vertices interactively)
      clampY(copy);
    }
    internal.projectArcs(copy, fromWGS84);
  } catch(e) {
    console.error(e);
    // use the more robust projectArcs2 if projectArcs throws an error
    // downside: projectArcs2 discards Z values and changes arc indexing,
    // which will break vertex editing.
    var reproject = internal.getProjTransform2(src, dest);
    copy = arcs.getCopy();
    internal.projectArcs2(copy, reproject);
  }
  return copy;
}

function clampY(arcs) {
  var max = 89.9,
      min = -89.9,
      bbox = arcs.getBounds().toArray();
  if (bbox[1] >= min && bbox[3] <= max) return;
  arcs.transformPoints(function(x, y) {
    if (y > max) return [x, max];
    if (y < min) return [x, min];
  });
}

export function projectPointsForDisplay(lyr, src, dest) {
  var copy = utils.extend({}, lyr);
  var proj = internal.getProjTransform2(src, dest);
  copy.shapes = internal.cloneShapes(lyr.shapes);
  internal.projectPointLayer(copy, proj);
  return copy;
}


export function toWebMercator(lng, lat) {
  var k = Math.cos(lat * D2R);
  var x = R * lng * D2R;
  var y = R * Math.log(Math.tan(Math.PI * 0.25 + lat * D2R * 0.5));
  return [x, y];
}

export function fromWebMercator(x, y) {
  var lon = x / R * R2D;
  var lat = R2D * (Math.PI * 0.5 - 2 * Math.atan(Math.exp(-y / R)));
  return [lon, lat];
}

export function scaleToZoom(metersPerPix) {
  return Math.log(40075017 / 512 / metersPerPix) / Math.log(2);
}

export function getMapboxBounds() {
  var ymax = toWebMercator(0, 84)[1];
  var ymin = toWebMercator(0, -84)[1];
  return [-Infinity, ymin, Infinity, ymax];
}


// Update map extent and trigger redraw, after a new display CRS has been applied
export function projectMapExtent(ext, src, dest, newBounds) {
  var oldBounds = ext.getBounds();
  var oldScale = ext.scale();
  var newCP, proj, strictBounds;

  if (dest && internal.isWebMercator(dest)) {
    // clampToMapboxBounds(newBounds);
    strictBounds = getMapboxBounds();
  }

  // if source or destination CRS is unknown, show full extent
  // if map is at full extent, show full extent
  // TODO: handle case that scale is 1 and map is panned away from center
  if (ext.scale() == 1 || !dest) {
    ext.setFullBounds(newBounds, strictBounds);
    ext.home(); // sets full extent and triggers redraw
  } else {
    // if map is zoomed, stay centered on the same geographic location, at the same relative scale
    proj = internal.getProjTransform2(src, dest);
    newCP = proj(oldBounds.centerX(), oldBounds.centerY());
    ext.setFullBounds(newBounds, strictBounds);
    if (!newCP) {
      // projection of center point failed; use center of bounds
      // (also consider just resetting the view using ext.home())
      newCP = [newBounds.centerX(), newBounds.centerY()];
    }
    ext.recenter(newCP[0], newCP[1], oldScale);
  }
}

// Called from console; for testing dynamic crs
export function setDisplayProjection(gui, cmd) {
  var arg = cmd.replace(/^projd[ ]*/, '');
  if (arg) {
    gui.map.setDisplayCRS(internal.parseCrsString(arg));
  } else {
    gui.map.setDisplayCRS(null);
  }
}

