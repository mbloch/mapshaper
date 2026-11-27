// The part of an image in view, which the hillshade and blend panels redo
// at full resolution while a slider is dragged. Kept free of browser and
// mapshaper dependencies so it can be tested directly.

// The rectangle of pixels of a @width x @height image covering @bbox that is
// in @view ([xmin, ymin, xmax, ymax]), or a box of at most @maxPixels in the
// middle of the view, with the view's shape
// Returns {x0, y0, x1, y1, bbox, framed}, framed if the box doesn't cover the
// view, or null if the image is out of view
export function getRasterWindow(width, height, bbox, view, maxPixels) {
  var dx = (bbox[2] - bbox[0]) / width, dy = (bbox[3] - bbox[1]) / height;
  var vx0 = clampInt(Math.floor((view[0] - bbox[0]) / dx), 0, width);
  var vx1 = clampInt(Math.ceil((view[2] - bbox[0]) / dx), 0, width);
  var vy0 = clampInt(Math.floor((bbox[3] - view[3]) / dy), 0, height);
  var vy1 = clampInt(Math.ceil((bbox[3] - view[1]) / dy), 0, height);
  var vw = vx1 - vx0, vh = vy1 - vy0;
  var aspect, w, h, cx, cy, x0, y0;
  if (vw <= 0 || vh <= 0) return null;
  if (vw * vh <= maxPixels) {
    return makeWindow(vx0, vy0, vx1, vy1, false);
  }
  // the shape of the view, in image pixels
  aspect = (view[2] - view[0]) / dx / ((view[3] - view[1]) / dy);
  w = Math.min(vw, Math.round(Math.sqrt(maxPixels * aspect)));
  h = Math.min(vh, Math.floor(maxPixels / w));
  w = Math.min(vw, Math.floor(maxPixels / h));
  cx = ((view[0] + view[2]) / 2 - bbox[0]) / dx;
  cy = (bbox[3] - (view[1] + view[3]) / 2) / dy;
  x0 = clampInt(Math.round(cx - w / 2), vx0, vx1 - w);
  y0 = clampInt(Math.round(cy - h / 2), vy0, vy1 - h);
  return makeWindow(x0, y0, x0 + w, y0 + h, true);

  function makeWindow(x0, y0, x1, y1, framed) {
    return {
      x0: x0, y0: y0, x1: x1, y1: y1, framed: framed,
      bbox: [bbox[0] + x0 * dx, bbox[3] - y1 * dy, bbox[0] + x1 * dx, bbox[3] - y0 * dy]
    };
  }
}

// Copies the pixels of @win from @arr, an image @width pixels wide with
// @bands values per pixel, into @out (or a new array of @arr's type)
export function cropRasterWindow(arr, width, bands, win, out) {
  var w = (win.x1 - win.x0) * bands;
  var y, i;
  out = out || new arr.constructor(w * (win.y1 - win.y0));
  for (y = win.y0, i = 0; y < win.y1; y++, i += w) {
    out.set(arr.subarray((y * width + win.x0) * bands, (y * width + win.x0) * bands + w), i);
  }
  return out;
}

function clampInt(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
