import { internal, utils } from './gui-core';

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

function projectArcsForDisplay_v1(arcs, src, dest) {
  var copy = arcs.getCopy(); // need to flatten first?
  var proj = internal.getProjTransform(src, dest);
  internal.projectArcs(copy, proj); // need to densify arcs?
  return copy;
}

export function projectArcsForDisplay(arcs, src, dest) {
  var copy = arcs.getCopy(); // need to flatten first?
  var proj = internal.getProjTransform2(src, dest);
  internal.projectArcs2(copy, proj); // need to densify arcs?
  return copy;
}

export function projectPointsForDisplay(lyr, src, dest) {
  var copy = utils.extend({}, lyr);
  var proj = internal.getProjTransform2(src, dest);
  copy.shapes = internal.cloneShapes(lyr.shapes);
  internal.projectPointLayer(copy, proj);
  return copy;
}


// Update map extent and trigger redraw, after a new display CRS has been applied
export function projectMapExtent(ext, src, dest, newBounds) {
  var oldBounds = ext.getBounds();
  var oldScale = ext.scale();
  var newCP, proj;

  // if source or destination CRS is unknown, show full extent
  // if map is at full extent, show full extent
  // TODO: handle case that scale is 1 and map is panned away from center
  if (ext.scale() == 1 || !dest) {
    ext.setBounds(newBounds);
    ext.home(); // sets full extent and triggers redraw
  } else {
    // if map is zoomed, stay centered on the same geographic location, at the same relative scale
    proj = internal.getProjTransform2(src, dest);
    newCP = proj(oldBounds.centerX(), oldBounds.centerY());
    ext.setBounds(newBounds);
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
    gui.map.setDisplayCRS(internal.getCRS(arg));
  } else {
    gui.map.setDisplayCRS(null);
  }
}

