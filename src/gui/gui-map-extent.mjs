import { Bounds, utils } from './gui-core';
import { EventDispatcher } from './gui-events';

export function MapExtent(_position) {
  var _scale = 1,
      _cx, _cy, // center in geographic units
      _contentBounds,
      _strictBounds, // full extent must fit inside, if set
      _self = this,
      _frame;

  _position.on('resize', function(e) {
    if (ready()) {
      onChange({resize: true});
    }
  });

  function ready() { return !!_contentBounds; }

  this.reset = function() {
    if (!ready()) return;
    recenter(_contentBounds.centerX(), _contentBounds.centerY(), 1, {reset: true});
  };

  this.home = function() {
    if (!ready()) return;
    recenter(_contentBounds.centerX(), _contentBounds.centerY(), 1);
  };

  this.pan = function(xpix, ypix) {
    if (!ready()) return;
    var t = this.getTransform();
    recenter(_cx - xpix / t.mx, _cy - ypix / t.my);
  };

  // Zoom to @w (width of the map viewport in coordinates)
  // @xpct, @ypct: optional focus, [0-1]...
  this.zoomToExtent = function(w, xpct, ypct) {
    if (!ready()) return;
    if (arguments.length < 3) {
      xpct = 0.5;
      ypct = 0.5;
    }
    var b = this.getBounds(),
        scale = limitScale(b.width() / w * _scale),
        fx = b.xmin + xpct * b.width(),
        fy = b.ymax - ypct * b.height(),
        dx = b.centerX() - fx,
        dy = b.centerY() - fy,
        ds = _scale / scale,
        dx2 = dx * ds,
        dy2 = dy * ds,
        cx = fx + dx2,
        cy = fy + dy2;
    recenter(cx, cy, scale);
  };

  this.zoomByPct = function(pct, xpct, ypct) {
    if (!ready()) return;
    this.zoomToExtent(this.getBounds().width() / pct, xpct, ypct);
  };

  this.resize = _position.resize;
  this.width = _position.width;
  this.height = _position.height;
  this.position = _position.position;
  this.recenter = recenter;

  // get zoom factor (1 == full extent, 2 == 2x zoom, etc.)
  this.scale = function() {
    return _scale;
  };

  this.maxScale = maxScale;

  // Display scale, e.g. meters per pixel or degrees per pixel
  this.getPixelSize = function() {
    return 1 / this.getTransform().mx;
  };

  // Get params for converting geographic coords to pixel coords
  this.getTransform = function(pixScale) {
    // get transform (y-flipped);
    var viewBounds = new Bounds(0, 0, _position.width(), _position.height());
    if (pixScale) {
      viewBounds.xmax *= pixScale;
      viewBounds.ymax *= pixScale;
    }
    return this.getBounds().getTransform(viewBounds, true);
  };

  // k scales the size of the bbox (used by gui to control fp error when zoomed very far)
  this.getBounds = function(k) {
    if (!_contentBounds) return new Bounds();
    return calcBounds(_cx, _cy, _scale / (k || 1));
  };

  // Update the extent of 'full' zoom without navigating the current view
  //
  this.setBounds = function(contentBounds, strictBounds) {
    var b = contentBounds;
    var prev = _contentBounds;
    if (!b.hasBounds()) return; // kludge
    if (strictBounds) {
      _strictBounds = Array.isArray(strictBounds) ? new Bounds(strictBounds) : strictBounds;
    } else {
      _strictBounds = null;
    }
    _contentBounds = _frame ? b : padBounds(b, 4); // padding if not in frame mode
    if (_strictBounds) {
      _contentBounds = fitIn(_contentBounds, _strictBounds);
    }
    if (prev) {
      _scale = _scale * fillOut(_contentBounds).width() / fillOut(prev).width();
    } else {
      _cx = _contentBounds.centerX();
      _cy = _contentBounds.centerY();
    }
  };

  this.translateCoords = function(x, y) {
    return this.getTransform().transform(x, y);
  };

  this.setFrame = function(frame) {
    _frame = frame || null;
  };

  this.getFrame = function() {
    return _frame || null;
  };

  this.getSymbolScale = function() {
    if (!_frame) return 0;
    var bounds = new Bounds(_frame.bbox);
    var bounds2 = bounds.clone().transform(this.getTransform());
    return bounds2.width() / _frame.width;
  };

  this.translatePixelCoords = function(x, y) {
    return this.getTransform().invert().transform(x, y);
  };

  function recenter(cx, cy, scale, data) {
    scale = scale ? limitScale(scale) : _scale;
    if (cx == _cx && cy == _cy && scale == _scale) return;
    navigate(cx, cy, scale);
    onChange(data);
  }

  function navigate(cx, cy, scale) {
    if (_strictBounds) {
      var full = fillOut(_contentBounds);
      var minScale = full.height() / _strictBounds.height();
      if (scale < minScale) {
        var dx = cx - _cx;
        cx = _cx + dx * (minScale - _scale) / (scale - _scale);
        scale = minScale;
      }
      var dist = full.height() / 2 / scale;
      var ymax = _strictBounds.ymax - dist;
      var ymin = _strictBounds.ymin + dist;
      if (cy > ymax ) {
        cy = ymax;
      }
      if (cy < ymin) {
        cy = ymin;
      }
    }
    _cx = cx;
    _cy = cy;
    _scale = scale;
  }

  function onChange(data) {
    data = data || {};
    _self.dispatchEvent('change', data);
  }

  // stop zooming before rounding errors become too obvious
  function maxScale() {
    var minPixelScale = 1e-16;
    var xmax = maxAbs(_contentBounds.xmin, _contentBounds.xmax, _contentBounds.centerX());
    var ymax = maxAbs(_contentBounds.ymin, _contentBounds.ymax, _contentBounds.centerY());
    var xscale = _contentBounds.width() / _position.width() / xmax / minPixelScale;
    var yscale = _contentBounds.height() / _position.height() / ymax / minPixelScale;
    return Math.min(xscale, yscale);
  }

  function maxAbs() {
    return Math.max.apply(null, utils.toArray(arguments).map(Math.abs));
  }

  function limitScale(scale) {
    return Math.min(scale, maxScale());
  }

  function calcBounds(cx, cy, scale) {
    var full, bounds, w, h;
    if (_frame) {
      full = fillOutFrameBounds(_frame);
    } else {
      full = fillOut(_contentBounds);
    }
    if (_strictBounds) {
      full = fitIn(full, _strictBounds);
    }
    w = full.width() / scale;
    h = full.height() / scale;
    bounds = new Bounds(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
    return bounds;
  }

  // Calculate viewport bounds from frame data
  function fillOutFrameBounds(frame) {
    var bounds = new Bounds(frame.bbox);
    var kx = _position.width() / frame.width;
    var ky = _position.height() / frame.height;
    bounds.scale(kx, ky);
    return bounds;
  }

  function padBounds(b, margin) {
    var wpix = _position.width() - 2 * margin,
        hpix = _position.height() - 2 * margin,
        xpad, ypad, b2;
    if (wpix <= 0 || hpix <= 0) {
      return new Bounds(0, 0, 0, 0);
    }
    b = b.clone();
    b2 = b.clone();
    b2.fillOut(wpix / hpix);
    xpad = b2.width() / wpix * margin;
    ypad = b2.height() / hpix * margin;
    b.padBounds(xpad, ypad, xpad, ypad);
    return b;
  }

  function fitIn(b, b2) {
    // only fitting vertical extent
    // (currently only used in basemap view to enforce Mapbox's vertical limits)
    if (b.height() > b2.height()) {
      b.scale(b2.height() / b.height());
    }
    if (b.ymin < b2.ymin) {
      b.shift(0, b2.ymin - b.ymin);
    }
    if (b.ymax > b2.ymax) {
      b.shift(0, b2.ymax - b.ymax);
    }
    return b;
  }

  // Pad bounds vertically or horizontally to match viewport aspect ratio
  function fillOut(b) {
    var wpix = _position.width(),
        hpix = _position.height();
    b = b.clone();
    b.fillOut(wpix / hpix);
    return b;
  }
}

utils.inherit(MapExtent, EventDispatcher);
