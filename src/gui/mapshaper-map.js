/* @requires mapshaper-common, mapshaper-maplayer, mapshaper-mouse */

//
//
function MshpMap(el, opts_) {
  var defaults = {
    bounds: null,
    padding: 0 // margin around content at full extent, in pixels
  };
  var opts = Utils.extend(defaults, opts_);
  if (opts.bounds instanceof Bounds === false) {
    error("[MshpMap()] missing required bounds option");
  }

  var _root = El(el);
  var _slider,
      _groups = [];

  var _ext = new MapExtent(_root, opts.bounds).setContentPadding(opts.padding);
  var _mouse = new MshpMouse(_ext);
  initHomeButton();

  this.getExtent = function() {
    return _ext;
  };

  this.addLayerGroup = function(group) {
    group.setMap(this);
    _groups.push(group);
    this.dispatchEvent('refresh');
  };

  this.getElement = function() {
    return _root;
  };

  function initHomeButton() {
    var _full = null;
    var btn = El('div').addClass('g-home-btn').appendTo(_root)
      .on('click', function(e) {
        _ext.reset();
      })
      .newChild('img').attr('src', "images/home.png").parent();

    _ext.on('change', function() {
      var isFull = _ext.scale() === 1;
      if (isFull !== _full) {
        _full = isFull;
        if (!isFull) btn.addClass('active');
        else btn.removeClass('active');
      }
    });
  }
}

Opts.inherit(MshpMap, EventDispatcher);

function MapExtent(el, initialBounds) {
  var _position = new ElementPosition(el),
      _padPix = 0,
      _cx,
      _cy,
      _scale = 1;

  if (!initialBounds || !initialBounds.hasBounds()) {
    error("[MapExtent] Invalid bounds:", initialBounds);
  }

  _position.on('resize', function() {
    this.dispatchEvent('change');
    this.dispatchEvent('resize');
  }, this);

  this.reset = function() {
    this.recenter(initialBounds.centerX(), initialBounds.centerY(), 1);
  };

  this.recenter = function(cx, cy, scale) {
    if (!scale) scale = _scale;
    if (!(cx == _cx && cy == _cy && scale == _scale)) {
      _cx = cx;
      _cy = cy;
      _scale = scale;
      this.dispatchEvent('change');
    }
  };

  this.pan = function(xpix, ypix) {
    var t = this.getTransform();
    this.recenter(_cx - xpix / t.mx, _cy - ypix / t.my);
  };

  // Zoom to @scale (a multiple of the map's full scale)
  // @xpct, @ypct: optional focus, [0-1]...
  //
  this.rescale = function(scale, xpct, ypct) {
    if (arguments.length < 3) {
      xpct = 0.5;
      ypct = 0.5;
    }
    var b = this.getBounds(),
        fx = b.xmin + xpct * b.width(),
        fy = b.ymax - ypct * b.height(),
        dx = b.centerX() - fx,
        dy = b.centerY() - fy,
        ds = _scale / scale,
        dx2 = dx * ds,
        dy2 = dy * ds,
        cx = fx + dx2,
        cy = fy + dy2;
    this.recenter(cx, cy, scale);
  };

  this.resize = _position.resize;
  this.width = _position.width;
  this.height = _position.height;
  this.position = _position.position;

  this.scale = function() {
    return _scale;
  };

  this.setContentPadding = function(pix) {
    _padPix = pix;
    this.reset();
    return this;
  };

  // Get params for converting geographic coords to pixel coords
  this.getTransform = function() {
    // get transform (y-flipped);
    var viewBounds = new Bounds(0, 0, _position.width(), _position.height());
    return this.getBounds().getTransform(viewBounds, true);
  };

  this.getBounds = function() {
    return centerAlign(calcBounds(_cx, _cy, _scale));
  };

  function calcBounds(cx, cy, scale) {
    var w = initialBounds.width() / scale,
        h = initialBounds.height() / scale;
    return new Bounds(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
  }

  // Receive: Geographic bounds of content to be centered in the map
  // Return: Geographic bounds of map window centered on @contentBounds,
  //    with padding applied
  function centerAlign(contentBounds) {
    var bounds = contentBounds.clone(),
        wpix = _position.width() - 2 * _padPix,
        hpix = _position.height() - 2 * _padPix,
        padGeo;
    if (wpix <= 0 || hpix <= 0) {
      return new Bounds(0, 0, 0, 0);
    }
    bounds.fillOut(wpix / hpix);
    padGeo = _padPix * bounds.width() / wpix; // per-pixel scale
    bounds.padBounds(padGeo, padGeo, padGeo, padGeo);
    return bounds;
  }

  this.reset(); // initialize map extent
}

Opts.inherit(MapExtent, EventDispatcher);
