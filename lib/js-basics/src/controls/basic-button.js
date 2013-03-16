/** @requires map-core, browser, arrayutils */

function ButtonPanel(css) {
  css = css || ""; //  "position:absolute;";
  if (Browser.touchEnabled) {
    css += "-webkit-tap-highlight-color: rgba(0,0,0,0);";
  }
  this.div = Browser.createElement('div', css);

  this.appendChild = function(div) {
    this.div.appendChild(div);
  };
}


Opts.inherit(ButtonPanel, EventDispatcher);


var ButtonCSS = {
  'default': "font-family:Arial, Helvetica, sans-serif; font-size:12px; padding:2px 7px 3px 7px; -moz-border-radius: 3px; border-radius: 3px; background-color:#00558a; color:white;",
  up: "background-color:#00558a;",
  down: "background-color:#69A9C9;"
};


ButtonCSS.updateStyle = function(type, update) {
  var types = this._types;
  var currStyle = types[type] || "";
  //trace("[ButtonCSS.updateStyle] new style:", newStyle);
  types[type] = Browser.mergeCSS(currStyle, update);
  return this;
};


ButtonCSS.getStyle = function(type) {
  var defStyle = ButtonCSS['default'];
  if (type == 'default') {
    return defStyle;
  }

  var mergedStyle = Browser.mergeCSS(defStyle, ButtonCSS[type] || "");
  return mergedStyle;
};


function BasicButton(div, opts) {
  this._opts = {};
  Opts.copyAllParams(this._opts, opts);
  this.div = div;
  //div.style.cursor = "pointer";
  var css = "cursor:pointer;";
  if (Browser.touchEnabled) {
    //css += "-webkit-tap-highlight-color: rgba(0,0,0,0);";
  }
  Browser.addCSS(div, css); 
  Browser.addClass(div, 'nytg-button');
  //div.className = 'nytg-button';

  this._hidden = false;
  
  if (Browser.touchEnabled) {
    Browser.addEventListener(div, 'touchend', this.handleClick, this);
  }
  else {
    Browser.addEventListener(div, 'click', this.handleClick, this);
  }
}

Opts.inherit(BasicButton, EventDispatcher);

BasicButton.prototype.handleClick = function(evt) {
  this.dispatchEvent('click');
};

BasicButton.prototype.isHidden = function() {
  return this._hidden;
};

/**
 * TODO: Add tweening option
 */
BasicButton.prototype.show = function() {
  if (!this._hidden) {
    return;
  }
  this.div.style.display = 'block';
  this._hidden = false;
};

BasicButton.prototype.hide = function() {
  if (this._hidden) {
    return;
  }
  this.div.style.display = "none";
  this._hidden = true;
};


function ImageButton(url, opts) {
  var img = Browser.createElement('img');
  img.src = url;
  var div = Browser.createElement('div');
  div.appendChild(img);
  this.__super__(div, opts);
  //BasicButton.call(this, div, opts);
}

Opts.inherit(ImageButton, BasicButton);


function LabelButton(text, css) {
  var style = ButtonCSS.getStyle('default');
  if (css) {
    style = Browser.mergeCSS(style, css);
  }
  var div = LabelButton.create(text, style);
  this.__super__(div);
};

Opts.inherit(LabelButton, BasicButton);

LabelButton.create = function(text, css, opts) {
  var div = Browser.createElement('div', css);
  div.innerHTML = text;
  return div;
};

