// How an aspect ratio is read, written and held to, in one place. The Add map
// frame dialog takes one typed into a field, the Frame properties panel shows
// the one a frame ended up with, so a ratio entered as 3:2 reads back as 3:2,
// and the box drawn on the map is kept to it while it is dragged.

// Ratios common enough to be worth naming when one is shown.
var namedRatios = [
  [1, '1:1'],
  [4 / 3, '4:3'],
  [3 / 2, '3:2'],
  [16 / 9, '16:9']
];

// Accepts "5:4" or a bare number. Returns NaN for anything else, including a
// ratio with a zero or negative term.
export function parseFrameAspectRatio(value) {
  var parts = String(value).trim().split(':').map(Number);
  if (parts.length == 2) {
    return parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : NaN;
  }
  return parts.length == 1 ? parts[0] : NaN;
}

// "3:2" for a ratio that has a name, "1.62" for one that does not.
export function formatFrameAspectRatio(aspect) {
  var match = namedRatios.find(function(item) {
    return Math.abs(item[0] - aspect) < 1e-10;
  });
  return match ? match[1] : String(Math.round(aspect * 100) / 100);
}

// Move the pointer-side corner of a box being dragged out from (x1, y1) so the
// box has the given width/height ratio. Grows the short side rather than
// trimming the long one, so the box always reaches the pointer on one axis and
// never shrinks away from the drag. Works in screen pixels, where y runs
// downwards; only the magnitudes matter, so the sign of each axis is kept.
export function getCornerForRatio(x1, y1, x2, y2, ratio) {
  var sx = x2 < x1 ? -1 : 1,
      sy = y2 < y1 ? -1 : 1,
      w = Math.abs(x2 - x1),
      h = Math.abs(y2 - y1);
  if (w / h > ratio) { // also catches h == 0
    h = w / ratio;
  } else if (w > 0 || h > 0) {
    w = h * ratio;
  }
  return [x1 + sx * w, y1 + sy * h];
}

// Reshape a [minx, miny, maxx, maxy] box that a handle drag has pulled off
// ratio. A corner handle grows whichever side is short, anchored on the corner
// opposite the handle; an edge handle drives the axis it moves along and the
// other axis grows from the centre, so the box widens in place instead of
// walking sideways. Mutates bbox.
export function applyAspectRatio(bbox, handle, ratio) {
  var w = bbox[2] - bbox[0],
      h = bbox[3] - bbox[1],
      cx, cy;
  // Leave an inverted or empty box alone; the drag has flipped it past an edge
  // and the caller puts the corners back in order when the drag ends.
  if (!(w > 0) || !(h > 0) || handle.type == 'center') return;
  if (handle.type == 'corner') {
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
  } else if (handle.col == 'left' || handle.col == 'right') {
    h = w / ratio;
  } else {
    w = h * ratio;
  }
  if (handle.col == 'left') {
    bbox[0] = bbox[2] - w;
  } else if (handle.col == 'right') {
    bbox[2] = bbox[0] + w;
  } else {
    cx = (bbox[0] + bbox[2]) / 2;
    bbox[0] = cx - w / 2;
    bbox[2] = cx + w / 2;
  }
  if (handle.row == 'top') {
    bbox[3] = bbox[1] + h;
  } else if (handle.row == 'bottom') {
    bbox[1] = bbox[3] - h;
  } else {
    cy = (bbox[1] + bbox[3]) / 2;
    bbox[1] = cy - h / 2;
    bbox[3] = cy + h / 2;
  }
}
