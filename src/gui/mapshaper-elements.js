/* @requires elements, events, browser, mapshaper-common */

function draggable(ref) {
  var xdown, ydown;
  var el = El(ref),
      obj = new EventDispatcher();
  Browser.undraggable(el.node());
  el.on('mousedown', function(e) {
    xdown = e.pageX;
    ydown = e.pageY;
    obj.dispatchEvent('dragstart');
    Browser.on(window, 'mousemove', onmove);
    Browser.on(window, 'mouseup', onrelease);
  });

  function onrelease(e) {
    Browser.removeEventListener(window, 'mousemove', onmove);
    Browser.removeEventListener(window, 'mouseup', onrelease);
    obj.dispatchEvent('dragend');
  }

  function onmove(e) {
    obj.dispatchEvent('drag', {dx: e.pageX - xdown, dy: e.pageY - ydown});
  }
  return obj;
}

function Slider(ref, opts) {
  var _el = El(ref);
  var _self = this;
  var defaults = {
    space: 7
  };
  opts = Opts.copyAllParams(defaults, opts);

  var _pct = 0;
  var _track,
      _handle,
      _handleLeft = opts.space;

  function size() {
    return _track ? _track.width() - opts.space * 2 : 0;
  }

  this.track = function(ref) {
    if (ref && !_track) {
      _track = El(ref);
      _handleLeft = _track.el.offsetLeft + opts.space;
      updateHandlePos();
    }
    return _track;
  };

  this.handle = function(ref) {
    var startX;
    if (ref && !_handle) {
      _handle = El(ref);
      draggable(_handle)
        .on('drag', function(e) {
          setHandlePos(startX + e.dx, true);
        })
        .on('dragstart', function(e) {
          startX = position();
        });
      updateHandlePos();
    }
    return _handle;
  };

  function position() {
    return Math.round(_pct * size());
  }

  this.pct = function(pct) {
    if (pct >= 0 && pct <= 1) {
      _pct = pct;
      updateHandlePos();
    }
    return _pct;
  };

  function setHandlePos(x, fire) {
    x = Utils.clamp(x, 0, size());
    var pct = x / size();
    if (pct != _pct) {
      _pct = pct;
      _handle.css('left', _handleLeft + x);
      _self.dispatchEvent('change', {pct: _pct});
    }
  }

  function updateHandlePos() {
    var x = _handleLeft + Math.round(position());
    _handle && _handle.css('left', x);
  }
}

Opts.inherit(Slider, EventDispatcher);


function ClickText(ref) {
  var _el = El(ref);
  var _max = Infinity,
      _min = -Infinity,
      _formatter = function(v) {return String(v)},
      _validator = function(v) {return !isNaN(v)},
      _parser = function(s) {return parseFloat(s)},
      _value = 0;

  _el.on('blur', onblur, this);
  _el.on('keydown', onpress, this);

  function onpress(e) {
    if (e.keyCode == 27) { // esc
      this.value(_value); // reset input field to current value
      _el.el.blur();
    } else if (e.keyCode == 13) { // enter
      _el.el.blur();
    }
  }

  // Validate input contents.
  // Update internal value and fire 'change' if valid
  //
  function onblur() {
    var val = _parser(_el.el.value);
    if (val === _value) {
      return;
    }
    if (_validator(val)) {
      this.value(val);
      this.dispatchEvent('change', {value:this.value()});
    } else {
      this.value(_value);
      this.dispatchEvent('error'); // TODO: improve
    }
  }

  this.bounds = function(min, max) {
    _min = min;
    _max = max;
    return this;
  };

  this.validator = function(f) {
    _validator = f;
    return this;
  };

  this.formatter = function(f) {
    _formatter = f;
    return this;
  };

  this.parser = function(f) {
    _parser = f;
    return this;
  }

  this.value = function(arg) {
    if (arg == void 0) {
      // var valStr = this.el.value;
      // return _parser ? _parser(valStr) : parseFloat(valStr);
      return _value;
    }
    var val = Utils.clamp(arg, _min, _max);
    if (!_validator(val)) {
      error("ClickText#value() invalid value:", arg);
    } else {
      _value = val;
    }
    _el.el.value = _formatter(val);
    return this;
  };
}

Opts.inherit(ClickText, EventDispatcher);


function Checkbox(ref) {
  var _el = El(ref);
}

Opts.inherit(Checkbox, EventDispatcher);

function SimpleButton(ref) {
  var _el = El(ref),
      _active = _el.hasClass('active');

  _el.on('click', function(e) {
    if (_active) this.dispatchEvent('click');
    return false;
  }, this);

  this.active = function(a) {
    if (a === void 0) return _active;
    if (a !== _active) {
      _active = a;
      _el.toggleClass('active');
    }
    return this;
  };
}

Opts.inherit(SimpleButton, EventDispatcher);

function FileChooser(el) {

  var input = El('form').addClass('g-file-control').appendTo('body')
    .newChild('input').attr('type', 'file').on('change', onchange, this);
  /* input element properties:
    disabled
    name
    value  (path to the file)
    multiple  ('multiple' or '')
  */

  var btn = El(el).on('click', function() {
    input.el.click();
  });

  function onchange(e) {
    var files = e.target.files;
    if (files) { // files may be undefined (e.g. if user presses 'cancel' after a file has been selected...)
      input.attr('disabled', true); // button is disabled after first successful selection
      btn.addClass('selected');
      this.dispatchEvent('select', {files:files});
    }
  }
}

Opts.inherit(FileChooser, EventDispatcher);
