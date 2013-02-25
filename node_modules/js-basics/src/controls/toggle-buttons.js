/* @requires basic-button */



function UpDownButton(div, upCss, downCss, overCss) {
  this.__super__(div);
  this._down = false;

  this.isDown = function() {
    return this._down;
  };

  this.down = function() {
    downCss && Browser.addCSS(div, downCss);
    Browser.removeClass(div, "hover");
    Browser.addClass(div, "selected");
    this._isTab && Browser.addClass(div, "nytg-selectedTab");
    this._down = true;
    
  };

  this.over = function() {
    if (this._down) { // no hover if selected...
      return;
    }
    overCss && Browser.addCSS(div, overCss);
    Browser.addClass(div, 'hover');
    this.dispatchEvent('rollover');
  };

  this.out = function() {
    if (this._down) {
      return;
    }
    Browser.removeClass(div, 'hover');
    upCss && Browser.addCSS(div, upCss);
    this.dispatchEvent('rollout');
  };

  this.up = function() {
    upCss && Browser.addCSS(div, upCss);
    //Browser.removeClass(div, "nytg-button-down");
    //Browser.addClass(div, "nytg-button-up");
    Browser.removeClass(div, 'selected');
    this._isTab && Browser.removeClass(div, 'nytg-selectedTab');
    this._down = false;
  };

  this.setDownCSS = function(css) {
    //downCss += css;
    downCss = css;
    this.isDown() && this.down();
  };

  this.setUpCSS = function(css) {
    //upCss += css;
    upCss = css;
    this.isDown() || this.up();
  };

  if (!Browser.touchEnabled) {
    Browser.addEventListener(this.div, 'mouseover', this.over, this);
    Browser.addEventListener(this.div, 'mouseout', this.out, this);
  }

  //trace("UpDownButton; div:", this.div.__evtid__);
}

Opts.inherit(UpDownButton, BasicButton);


/**
 * Option: {int} limit Max buttons that can selected
 * Option: {bool} unselectable Does clicking on a selected button deselect it?
 */
function ToggleButtons(css, opts) {
  this._limit = Opts.readParam(opts && opts.limit, 1);
  this._unselectable = Opts.readParam(opts && opts.unselectable, false);

  this.__super__(css);

  //Browser.addEventListener(this.div, 'mouseout', this.handleDivOut, this);
  this.div.className = "nytg-toggle-buttons";
  this._buttons = [];
  this._keys = [];
  this._selectedKeys = [];
  this._lastKey = '';
}

Opts.inherit(ToggleButtons, ButtonPanel);
//Opts.inherit(ToggleButtons, BasicButton);

ToggleButtons.prototype.handleDivOut = function(evt) {
  if (this._lastKey == '') {
    this.dispatchEvent('mouseout');
  }
};

ToggleButtons.prototype.destroy = function() {
  Utils.forEach(this._buttons, function(btn) { Browser.removeEventListeners(btn.div); });
  this.removeEventListeners();
  this._buttons = [];
};

ToggleButtons.prototype.show = function() {
  if (!this._hidden) {
    return;
  }
  this.div.style.display = 'block';
  this._hidden = false;
};

ToggleButtons.prototype.hide = function() {
  if (this._hidden) {
    return;
  }
  this.div.style.display = "none";
  this._hidden = true;
};

ToggleButtons.prototype.isHidden = function() {
  return this._hidden;
};

ToggleButtons.prototype.addButton = function(key, btn, selected) {
  if (Utils.contains(this._keys, key)) {
    trace("[ToggleButtons.addButton()] Duplicate key:", key);
    return this;
  }

  this.appendChild(btn.div);


  if (!btn.up) { // kludge
    return;
  }

  btn.addEventListener('click', this.handleClick, this);
  btn.addEventListener('rollover', this.handleOver, this);
  btn.addEventListener('rollout', this.handleOut, this);


  //trace("ToggleButtons.addButton; div:", btn.div.__evtid__);

  this._keys.push(key);
  var btns = this._buttons;
  btns.push(btn);


  if (selected) {
    this.selectByKey(key);
  }
  else {
    btn.up();
  }
  return this; // for chaining
};


ToggleButtons.prototype.selectByKey = function(key) {
  var idx = Utils.indexOf(this._keys, key);
  if (idx == -1) {
    trace("[ToggleButtons.selectByKey()] missing key:", key);
    return;
  }

  var key = this._keys[idx];
  if (this.testKey(key)) { // key is already selected; 
    if (this._unselectable) {
      this.deselectByKey(key);
      this.dispatchEvent('change');
      this.dispatchEvent('deselect', {key:key});
    }
    return;
  }

  this.limitSelectionSize(this._limit - 1);
  this._selectedKeys.push(key);
  this.getButtonByKey(key).down();
  this.dispatchEvent('change');
  this.dispatchEvent('select', {key:key});
};


ToggleButtons.prototype.deselectByKey = function(key) {
  if (this.testKey(key)) {
    var idx = Utils.indexOf(this._selectedKeys, key);
    this.getButtonByKey(key).up();
    this._selectedKeys.splice(idx, 1);
  }
};

ToggleButtons.prototype.getButtonByKey = function(key) {
  var idx = Utils.indexOf(this._keys, key);
  return idx != -1 ? this._buttons[idx] : null;
};

ToggleButtons.prototype.getSelectedKey = function() {
  var len = this._selectedKeys.length;
  return len == 0 ? "" : this._selectedKeys[len-1];
};

ToggleButtons.prototype.getLastSelectedKey = function() {
  return this.getSelectedKey();
};


ToggleButtons.prototype.testKey = function(key) {
  return Utils.indexOf(this._selectedKeys, key) != -1;
};

ToggleButtons.prototype.getSelectedKeys = function() {
  return this._selectedKeys.concat();
};

ToggleButtons.prototype.limitSelectionSize = function(size) {
  var selected = this._selectedKeys;
  while (size >= 0 && selected.length > size) {
    this.deselectByKey(selected[0]);
  }
};


ToggleButtons.prototype.handleClick = function(evt) {
  var btnId = Utils.indexOf(this._buttons, evt.target);
  this.selectByKey(this._keys[btnId]);
};

ToggleButtons.prototype.handleOver = function(evt) {
  var btnId = Utils.indexOf(this._buttons, evt.target);
  var key = this._keys[btnId];
  this._lastKey = key;
  this.dispatchEvent('rollover', {key:key});
};

ToggleButtons.prototype.handleOut = function(evt) {
  var btnId = Utils.indexOf(this._buttons, evt.target);
  // TODO: only fire when ...
  var key = this._keys[btnId];
  this.dispatchEvent('rollout', {key:key});
  this._lastKey = '';
  //trace(">> ToggleButtons.handleButtonOut()");
};


