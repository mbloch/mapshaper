/* @require events, browser, elements */

function SliderTrack(ref) {
  this.__super__(ref || 'div');
  Browser.makeUnselectable(this.el);

  this.css("position:relative;");
  var _padding = 0;
  var _horizontal = true;
  var _length = 500;
  var _width = 3;
  var _size = 1;
  var _tics;
  var _pageXY;
  var _currId = -1;

  Browser.addEventListener(this.el, 'click', function(evt) {
    this.__updatePageXY();
    var px = this.pageXYToPix(evt.pageX, evt.pageY);
    var id = this.pixToId(px);
    this.dispatchEvent('click', {id:id});
  }, this);

  this.initTics = function(data, gen) {
    _size = data.length;
    _tics = [];
    for (var i=0; i<_size; i++) {
      var px = this.idToPix(i);
      var el = gen(data[i], px, i);
      if (!el || !el.nodeType) {
        trace("[SliderTrack.initTics()] Generator function must return a DOM node; found:", el);
        break;
      }
      this.el.appendChild(el);
      _tics.push(el);
    }
  };

  this.validateId = function(id) {
    if (id >= _size) {
      id = _size;
    }
    if (id < 0) {
      id = 0;
    }
    return id;
  };

  
  /**
   *
   */
  this.__setId = function(id) {
    if (id != _currId) {
      if (_tics) {
        _currId >= 0 && Browser.removeClass(_tics[_currId], "selected");
        Browser.addClass(_tics[id], "selected");
      }
      _currId = id;
    }
  };

  this.snapHandleToId = function(el, id) {
    var px = this.idToPix(id);
    var param = (_horizontal ? "left" : "top");
    el.style[param] = px + "px";
  };

  this.setHandleXY = function(el, pageX, pageY, snapped) {
    var minPix = _padding, maxPix = _length - _padding;
    var px = this.pageXYToPix(pageX, pageY);
    px = Utils.clamp(px, minPix, maxPix);
    var id = this.pixToId(px);
    if (snapped) {
      px = this.idToPix(id);
    }
    var param = _horizontal ? "left" : "top";
    el.style[param] = px + "px";
    return id;
  };

  this.__updatePageXY = function() {
    _pageXY = Browser.getPageXY(this.el);
  };

  this.__updateSize = function() {
    var w = _length, h = _width;
    if (!_horizontal) {
      w = _width;
      h = _length;
    }
    this.css("width:" + w + "px;height:" + h + "px;");
  };

  this.padding = function(px) {
    if (px === void 0) {
      return _padding;
    }
    _padding = px;
    return this;
  };

  this.width = function(px) {
    _width = px;
    this.__updateSize();
    return this;
  };

  this.length = function(px) {
    _length = px;
    this.__updateSize();
    return this;
  };


  this.pixToId = function(px) {
    var x = px - _padding;
    var space = (_length - 2 * _padding) / (_size - 1);
    var ticId = Math.round(x / space);
    ticId = this.validateId(ticId);
    return ticId;
  };

  this.pageXYToPix = function(x, y) {
    return  _horizontal ? x - _pageXY.x : y - _pageXY.y;
  };

  this.idToPix = function(i) {
    var x = _padding;
    var space = (_length - 2 * _padding) / (_size - 1);
    x += i * space;
    return Math.round(x);
  };

  this.vertical = function() {
    _horizontal = false;
    this.__updateSize();
    return this;
  };

  this.horizontal = function() {
    _horizontal = true;
    this.__updateSize();
    return this;
  };
}

Opts.inherit(SliderTrack, Element);
Opts.extendPrototype(SliderTrack, EventDispatcher);

/**
 *  Tic
 */
function Tic() {
  this.__super__('div');
  this.css('position:absolute');
  var _length = 4;
  var _horizontal = false;
  var _color = "#bbb";

  this.length = function(px) {
    _length = px;
    this.__update();
    return this;
  };

  this.__update = function() {
    var h = _length, w = 0;
    var positionCSS = "top: " + (-_length - 3) + "px;";
    if (_horizontal) {
      positionCSS = "left:" + (-length - 3) + "px;";
      w = h;
      h = 0;
    }
    var borderCSS = "1px solid " + _color;
    this.css("width:" + w + "px;height:" + h + "px;border-left:" + borderCSS + ";border-top:" + borderCSS + ";" + positionCSS);
  };

  this.horizontal = function() {
    _horizontal = true;
    this.__update();
    return this;
  };

  this.color = function(str) {
    _color = str;
    this.__update();
  };
}

Opts.inherit(Tic, Element);


/**
 * TicLabel
 */
function TicLabel() {
  this.__super__('div');
  this.css('position:absolute');
}

Opts.inherit(TicLabel, Element);


/** 
 * Handle
 * 
 */
function SliderHandle() {
  this.__super__('div');
  this.css("position:absolute; cursor:pointer;");
  Browser.makeUndraggable(this.el);
}

Opts.inherit(SliderHandle, El);


/**
 *  Slider
 */
function Slider(ref, opts) {
  var _downEvent = "mousedown";
  var _moveEvent = "mousemove";
  var _upEvent = "mouseup";
  if (Browser.touchEnabled) {
    _downEvent = "touchstart";
    _moveEvent = "touchmove";
    _upEvent = "touchend";
  }
  var _started = false;
  var _dragging = false;
  var _trackXY;
  var _currId = -1;

  var o = {
    snappy: false
    //trackWidth: 500
  };
  Opts.copyAllParams(o, opts);
  
  this.__super__(ref || 'div');

  var track = this.track = new SliderTrack('div');
  track.css({
    //width: o.trackWidth + "px",
    //height: "4px",
    backgroundColor: "white",
    border: "1px solid #bbb"
  });
  track.appendTo(this);

  var handle = this.handle = new SliderHandle().appendTo(track);
  

  handle.on(_downEvent, startDragging, this)
  track.on('click', function(evt) { 
    this.id(evt.id);
  }, this);

  function startDragging(evt) {
    if (_dragging) {
      return;
    }
    _dragging = true;
    handle.css("cursor:auto;");
    track.__updatePageXY();
    Browser.addEventListener(document, _moveEvent, drag, this);
    Browser.addEventListener(document, _upEvent, stopDragging, this);
    return false;
  }
  

  function drag(e) {
    var id = track.setHandleXY(handle.el, e.pageX, e.pageY, o.snappy);
    this.id(id);
  }

  this.id = function(id) {
    if (id === void 0) {
      return _currId;
    }

    id = track.validateId(id);
    if (id != _currId) {
      _currId = id;
      track.__setId(id);
      //trace('id:', id);
      if (!_dragging) {
        track.snapHandleToId(handle.el, id);
      }
      this.dispatchEvent('change', {id:id});
      !_dragging && this.dispatchEvent('final', {id:id});
    }
    return this;
  };

  function stopDragging() {
    if (!_dragging) {
      return;
    }
    handle.css("cursor:pointer;");
    _dragging = false;
    Browser.removeEventListener(document, _moveEvent, drag, this);
    Browser.removeEventListener(document, _upEvent, stopDragging, this);
    !o.snappy && track.snapHandleToId(handle.el, this.id());
    this.dispatchEvent('final', {id:this.id()});
  }
}

Opts.inherit(Slider, Element);
Opts.extendPrototype(Slider, EventDispatcher);
