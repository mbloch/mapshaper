/* @requires element-position, events, mapshaper-maplayer, bounds, arrayutils, mapshaper-mouse */

//
//
function MshpMap(el, opts_) {
  var defaults = {
    bounds: null,
    padding: 0 // can be [xmin, ymin, xmax, ymax] array
  };
  var opts = Utils.extend(defaults, opts_);
  var missing = Utils.nullKeys(opts);
  if (missing) {
    error("[MshpMap()] missing required param/s:", missing.join(', '));
  }

  var _root = El(el);
  var _slider,
      _groups = [];

  var _ext = new MapExtent(_root, opts.bounds).setContentPadding(opts.padding);
  var _mouse = new MshpMouse(_ext);
  initHomeButton();

  this.getExtent = function() {
    return _ext;
  }

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
    })

  }

  /*
  function editLayer(lyr) {
    if (_activeLyr == lyr) return;
    if (_activeLyr) error("MshpMap#editLayer() multiple layers not supported");
    _activeLyr = lyr;
  }
  */
}

Opts.inherit(MshpMap, EventDispatcher);

function MapExtent(el, initialBounds) {
  var _position = new ElementPosition(el),
      _padPix = 0,
      _self = this,
      _fullBounds,
      _cx,
      _cy,
      _scale = 1;

  if (!initialBounds || !initialBounds.hasBounds() || _position.width() > 0 == false || _position.height() > 0 == false) {
    error("[MapExtent] Usage: new MapExtent(div, bbox:Bounds)");
  }

  _position.on('resize', function() {
    _fullBounds = getFullBounds();
    this.dispatchEvent('change');
    this.dispatchEvent('resize');
  }, this);

  this.resize = function(w, h) { _position.resize(w, h)};

  this.reset = function() {
    _fullBounds = getFullBounds();
    this.recenter(_fullBounds.centerX(), _fullBounds.centerY(), 1);
  }

  this.recenter = function(cx, cy, scale) {
    if (!scale) scale = _scale;
    if (!(cx == _cx && cy == _cy && scale == _scale)) {
      _cx = cx, _cy = cy, _scale = scale;
      _self.dispatchEvent('change');
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
      xpct = 0.5, ypct = 0.5;
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
  }

  this.width = _position.width;
  this.height = _position.height;
  this.position = _position.position;
  this.scale = function() { return _scale };

  function getFullBounds() {
    return centerAlign(initialBounds);
  }

  // Receive: Geographic bounds of content to be centered in the map with padding
  // Return: Geographic bounds of map window centered on @contentBounds
  //
  function centerAlign(contentBounds) {
    var bounds = contentBounds.clone(),
        wpix = _self.width() - 2 * _padPix,
        hpix = _self.height() - 2 * _padPix,
        padGeo = _padPix * bounds.width() / wpix; // per-pixel scale

    // expand bounds to match padded map aspect ratio
    bounds.fillOut(wpix / hpix);

    bounds.padBounds(padGeo, padGeo, padGeo, padGeo);
    return bounds;
  }

  this.setContentPadding = function(pix) {
    _padPix = pix;
    this.reset();
    return this;
  };

  function getBounds() {
    return calcBounds(_cx, _cy, _scale);
  }

  function calcBounds(cx, cy, scale) {
    var w = _fullBounds.width() / scale,
        h = _fullBounds.height() / scale;
    return new Bounds(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
  }

  this.getBounds = function() {
    return getBounds();
  };

  // Get params for converting map to pixel coords
  //
  this.getTransform = function() {
    // get transform (y-flipped);
    return getBounds().getTransform(new Bounds(0, 0, _position.width(), _position.height()), true);
  };

  this.reset();
}

Opts.inherit(MapExtent, EventDispatcher);
