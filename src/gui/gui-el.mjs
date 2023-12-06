import { error, utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { addCSS, getElement, addClass, removeClass, hasClass, getElementStyle } from './dom-utils';
var tagOrIdSelectorRE = /^#?[\w-]+$/;

El.__select = function(selector, root) {
  root = root || document;
  var els;
  if (document.querySelectorAll) {
    try {
      els = root.querySelectorAll(selector);
    } catch (e) {
      error("Invalid selector:", selector);
    }
  } else {
    error("This browser doesn't support CSS query selectors");
  }
  return utils.toArray(els);
};

// Converts dash-separated names (e.g. background-color) to camelCase (e.g. backgroundColor)
// Doesn't change names that are already camelCase
//
El.toCamelCase = function(str) {
  var cc = str.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
  return cc;
};

El.fromCamelCase = function(str) {
  var dashed = str.replace(/([A-Z])/g, "-$1").toLowerCase();
  return dashed;
};

El.setStyle = function(el, name, val) {
  var jsName = El.toCamelCase(name);
  if (el.style[jsName] == void 0) {
    return;
  }
  var cssVal = val;
  if (isFinite(val) && val !== null) {
    cssVal = String(val); // problem if converted to scientific notation
    if (jsName != 'opacity' && jsName != 'zIndex') {
      cssVal += "px";
    }
  }
  el.style[jsName] = cssVal;
};

El.findAll = function(sel, root) {
  return El.__select(sel, root);
};

export function El(ref) {
  if (!ref) error("Element() needs a reference");
  if (ref instanceof El) {
    return ref;
  }
  else if (this instanceof El === false) {
    return new El(ref);
  }

  var node;
  if (utils.isString(ref)) {
    if (ref[0] == '<') {
      var parent = El('div').html(ref).node();
      node = parent.childNodes.length  == 1 ? parent.childNodes[0] : parent;
    } else if (tagOrIdSelectorRE.test(ref)) {
      node = getElement(ref) || document.createElement(ref); // TODO: detect type of argument
    } else {
      node = El.__select(ref)[0];
    }
  } else if (ref.tagName) {
    node = ref;
  }
  if (!node) error("Unmatched element selector:", ref);
  this.el = node;
}

utils.inherit(El, EventDispatcher);

utils.extend(El.prototype, {

  clone: function() {
    var el = this.el.cloneNode(true);
    if (el.nodeName == 'SCRIPT') {
      // Assume scripts are templates and convert to divs, so children
      //    can ...
      el = El('div').addClass(el.className).html(el.innerHTML).node();
    }
    el.id = utils.getUniqueName();
    this.el = el;
    return this;
  },

  node: function() {
    return this.el;
  },

  width: function() {
   return this.el.offsetWidth;
  },

  height: function() {
    return this.el.offsetHeight;
  },

  top: function() {
    return this.el.offsetTop;
  },

  left: function() {
    return this.el.offsetLeft;
  },

  // Apply inline css styles to this Element, either as string or object.
  css: function(css, val) {
    if (utils.isObject(css)) {
      utils.forEachProperty(css, function(val, key) {
        El.setStyle(this.el, key, val);
      }, this);
    } else if (val === void 0) {
      addCSS(this.el, css);
    } else {
      El.setStyle(this.el, css, val);
    }
    return this;
  },

  attr: function(obj, value) {
    if (utils.isString(obj)) {
      if (arguments.length == 1) {
        return this.el.getAttribute(obj);
      }
      if (value === null) {
        this.el.removeAttribute(obj);
      } else {
        this.el.setAttribute(obj, value);
      }
    }
    return this;
  },


  remove: function(sel) {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    return this;
  },

  addClass: function(className) {
    addClass(this.el, className);
    return this;
  },

  removeClass: function(className) {
    removeClass(this.el, className);
    return this;
  },

  classed: function(className, b) {
    this[b ? 'addClass' : 'removeClass'](className);
    return this;
  },

  hasClass: function(className) {
    return hasClass(this.el, className);
  },

  toggleClass: function(cname) {
    if (this.hasClass(cname)) {
      this.removeClass(cname);
    } else {
      this.addClass(cname);
    }
  },

  computedStyle: function() {
    return getElementStyle(this.el);
  },

  visible: function() {
    if (this._hidden !== undefined) {
      return !this._hidden;
    }
    var style = this.computedStyle();
    return style.display != 'none' && style.visibility != 'hidden';
  },

  hide: function(css) {
    if (this.visible()) {
      this.css('display:none;');
      this._hidden = true;
    }
    return this;
  },

  show: function(css) {
    var tag = this.el && this.el.tagName;
    if (!this.visible()) {
      this.css('display', tag == 'SPAN' ? 'inline-block' : 'block');
      this._hidden = false;
    }
    return this;
  },

  html: function(html) {
    if (arguments.length == 0) {
      return this.el.innerHTML;
    } else {
      this.el.innerHTML = html;
      return this;
    }
  },

  text: function(str) {
    this.html(utils.htmlEscape(str));
    return this;
  },

  // Shorthand for attr('id', <name>)
  id: function(id) {
    if (id) {
      this.el.id = id;
      return this;
    }
    return this.el.id;
  },

  findChild: function(sel) {
    var node = El.__select(sel, this.el)[0];
    return node ? new El(node) : null;
  },

  findChildren: function(sel) {
    return El.__select(sel, this.el).map(El);
  },

  appendTo: function(ref) {
    var parent = ref instanceof El ? ref.el : getElement(ref);
    if (this._sibs) {
      for (var i=0, len=this._sibs.length; i<len; i++) {
        parent.appendChild(this._sibs[i]);
      }
    }
    parent.appendChild(this.el);
    return this;
  },

  nextSibling: function() {
    return this.el.nextSibling ? new El(this.el.nextSibling) : null;
  },

  firstChild: function() {
    var ch = this.el.firstChild;
    while (ch.nodeType != 1) { // skip text nodes
      ch = ch.nextSibling;
    }
    return new El(ch);
  },

  appendChild: function(ref) {
    var el = El(ref);
    this.el.appendChild(el.el);
    return this;
  },

  newChild: function(tagName) {
    var ch = document.createElement(tagName);
    this.el.appendChild(ch);
    return new El(ch);
  },

  // Traverse to parent node
  parent: function() {
    var p = this.el && this.el.parentNode;
    return p ? new El(p) : null;
  },

  findParent: function(tagName) {
    var p = this.el && this.el.parentNode;
    if (tagName) {
      tagName = tagName.toUpperCase();
      while (p && p.tagName != tagName) {
        p = p.parentNode;
      }
    }
    return p ? new El(p) : null;
  },

  // Remove all children of this element
  empty: function() {
    this.el.innerHTML = '';
    return this;
  }

});

// use DOM handler for certain events
// TODO: find a better way distinguising DOM events and other events registered on El
// e.g. different methods
//
//El.prototype.__domevents = utils.arrayToIndex("click,mousedown,mousemove,mouseup".split(','));
El.prototype.__on = El.prototype.on;
El.prototype.on = function(type, func, ctx) {
  if (ctx) {
    error("[El#on()] Third argument no longer supported.");
  }
  if (this.constructor == El) {
    this.el.addEventListener(type, func);
  } else {
    this.__on.apply(this, arguments);
  }
  return this;
};

El.prototype.__removeEventListener = El.prototype.removeEventListener;
El.prototype.removeEventListener = function(type, func) {
  if (this.constructor == El) {
    this.el.removeEventListener(type, func);
  } else {
    this.__removeEventListener.apply(this, arguments);
  }
  return this;
};
