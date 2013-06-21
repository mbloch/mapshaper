/** @requires events, core, page-events */


var Browser = {

  getIEVersion: function() {
    return this.ieVersion;
  },

  traceEnabled: function() {
    var debug = Browser.getQueryVar('debug');
    if (Env.inBrowser && (debug == null || debug == "false")) {
      return false;
    }
    return true;
  },

  /*getPageWidth : function() {
   return document.documentElement.clientWidth || document.body.clientWidth;
  },*/

  getViewportWidth : function() {
    return document.documentElement.clientWidth;
  },

  getViewportHeight : function() {
    return document.documentElement.clientHeight;
  },

  createElement : function(type, css, classes) {
    try {
      var el = document.createElement(type);
    }
    catch (err) {
      trace("[Browser.createElement()] Error creating element of type:", type);
      return null;
    }

    if (type.toLowerCase() == 'canvas' && window.CanvasSwf) {
      CanvasSwf.initElement(el);
    }

    if (css) {
      el.style.cssText = css;
    }

    if (classes) {
      el.className = classes;
    }
    return el;
  },

  /**
   * Return: HTML node reference or null
   * Receive: node reference or id or "#" + id
   */
  getElement : function(ref) {
    var el;
    if (typeof ref == 'string') {
      if (ref.charAt(0) == '#') {
        ref = ref.substr(1);
      }
      if (ref == 'body') {
        el = document.getElementsByTagName('body')[0];
      }
      else {
        el = document.getElementById(ref);
      }
    }
    else if (ref && ref.nodeType !== void 0) {
      el = ref;
    }
    return el || null;
  },

  removeElement : function(el) {
    el && el.parentNode && el.parentNode.removeChild(el);
  },

  getElementStyle: function(el) {
    return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
  },

  elementIsFixed : function(el) {
    // get top-level offsetParent that isn't body (cf. Firefox)
    var body = document.body;
    while (el && el != body) {
      var parent = el;
      el = el.offsetParent;
    }

    // Look for position:fixed in the computed style of the top offsetParent.
    // var styleObj = parent && (parent.currentStyle || window.getComputedStyle && window.getComputedStyle(parent, '')) || {};
    var styleObj = parent && Browser.getElementStyle(parent) || {};
    return styleObj['position'] == 'fixed';
  },

  getElementFromPageXY : function(x, y) {
    var viewX = this.pageXToViewportX(x);
    var viewY = this.pageYToViewportY(y);
    return document.elementFromPoint(viewX, viewY);
  },

  getPageXY : function(el) {
    var x = 0, y = 0;
    if (el.getBoundingClientRect) {
      var box = el.getBoundingClientRect();
      x = box.left - Browser.pageXToViewportX(0);
      y = box.top - Browser.pageYToViewportY(0);
      //trace("[] box.left:", box.left, "box.top:", box.top);
    }
    else {
      var fixed = Browser.elementIsFixed(el);

      while (el) {
        x += el.offsetLeft || 0;
        y += el.offsetTop || 0;
        //Utils.trace("[el] id:", el.id, "class:", el.className, "el:", el, "offsLeft:", el.offsetLeft, "offsTop:", el.offsetTop);
        el = el.offsetParent;
      }

      if (fixed) {
        var offsX = -Browser.pageXToViewportX(0);
        var offsY = -Browser.pageYToViewportY(0);
        //Utils.trace("[fixed]; offsX:", offsX, "offsY:", offsY, "x:", x, "y:", y);
        x += offsX;
        y += offsY;
      }
    }

    var obj = {x:x, y:y};
    return obj;
  },

  // reference: http://stackoverflow.com/questions/871399/cross-browser-method-for-detecting-the-scrolltop-of-the-browser-window
  __getIEPageElement : function() {
    var d = document.documentElement;
    return d.clientHeight ? d : document.body;
  },

  pageXToViewportX : function(x) {
    var xOffs = window.pageXOffset;
    if (xOffs === undefined) {
      xOffs = Browser.__getIEPageElement().scrollLeft;
    }
    return x - xOffs;
  },

  pageYToViewportY : function(y) {
    var yOffs = window.pageYOffset;
    if (yOffs === undefined) {
      yOffs = Browser.__getIEPageElement().scrollTop;
    }
    return y - yOffs;
  },

  /**
   *  Add a DOM event handler.
   */
  addEventListener: pageEvents.addEventListener,
  on: pageEvents.addEventListener,

  /**
   *  Remove a DOM event handler.
   */
  removeEventListener: pageEvents.removeEventListener,

  getPageUrl : function() {
    return Browser.inNode ? "" : window.location.href.toString();
  },

  getQueryString : function(url) {
    var match = /^[^?]+\?([^#]*)/.exec(url);
    return match && match[1] || "";
  },

  /**
   *  Add a query variable to circumvent browser caching.
   *  Value is calculated from UTC minutes, so the server does not see a large
   *  number of different values.
   */
  cacheBustUrl : function(url, minutes) {
    minutes = minutes || 1; // default: 60 seconds
    var minPerWeek = 60*24*7;
    var utcMinutes = (+new Date) / 60000;
    var code = Math.round((utcMinutes % minPerWeek) / minutes);
    url = Browser.extendUrl(url, "c=" + code);
    return url;
  },

  extendUrl : function(url, obj) {
    var extended = url + (url.indexOf("?") == -1 ? "?" : "&");
    if (Utils.isString(obj)) {
      extended += obj;
    } else if (Utils.isObject(obj)) {
      var parts = [];
      Utils.forEach(obj, function(val, key) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
      });
      extended += parts.join('&');
    } else {
      error("Argument must be string or object");
    }
    return extended;
  },

  parseUrl : Utils.parseUrl,
  /**
   * Return query-string (GET) data as an object.
   */
  getQueryVars : function() {
    var matches, rxp = /([^=&]+)=?([^&]*)/g,
      q = this.getQueryString(this.getPageUrl()),
      vars = {};
    while (matches = rxp.exec(q)) {
      //vars[matches[1]] = unescape(matches[2]);
      // TODO: decode keys?
      vars[matches[1]] = decodeURIComponent(matches[2]);
    }
    return vars;
  },

  getQueryVar : function(name) {
    return Browser.getQueryVars()[name];
  },


  /**
   * TODO: memoize?
   */
  getClassNameRxp : function(cname) {
    return new RegExp("(^|\\s)" + cname + "(\\s|$)");
  },

  hasClass : function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    return el && rxp.test(el.className);
  },

  addClass : function(el, cname) {
    var classes = el.className;
    if (!classes) {
      classes = cname;
    }
    else if (!this.hasClass(el, cname)) {
      classes = classes + ' ' + cname;
    }
    el.className = classes;
  },

  removeClass : function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    el.className = el.className.replace(rxp, "$2");
  },

  replaceClass : function(el, c1, c2) {
    var r1 = this.getClassNameRxp(c1);
    el.className = el.className.replace(r1, '$1' + c2 + '$2');
  },

  mergeCSS : function(s1, s2) {
    var div = this._cssdiv;
    if (!div) {
      div = this._cssdiv = Browser.createElement('div');
    }
    div.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
    return div.style.cssText;
  },

  addCSS : function(el, css) {
    el.style.cssText = Browser.mergeCSS(el.style.cssText, css);
  },

  unselectable : function(el) {
    var noSel = "-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-moz-user-focus:ignore;-o-user-select:none;user-select: none;";
    noSel += "-webkit-tap-highlight-color: rgba(0,0,0,0);"
    //div.style.cssText = Browser.mergeCSS(div.style.cssText, noSel);
    Browser.addCSS(el, noSel);
    el.onselectstart = function(e){
      e && e.preventDefault();
      return false;
    };
  },

  undraggable : function(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  },

  /**
   *  Loads a css file and applies it to the current page.
   */
  loadStylesheet : function(cssUrl) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = cssUrl;
    Browser.appendToHead(link);
  },

  appendToHead : function(el) {
    var head = document.getElementsByTagName("head")[0];
    head.appendChild(el);
  },

  /**
   * TODO: Option to supply a "target" attribute for opening in another window.
   */
  //navigateToURL : function(url) {
  navigateTo : function(url) {
    window.location.href = url;
  }

};

Browser.onload = function(handler, ctx) {
  Browser.on(window, 'load', handler, ctx); // handles case when page is already loaded.
};

// Add environment information to Browser
//
Opts.copyAllParams(Browser, Env);
