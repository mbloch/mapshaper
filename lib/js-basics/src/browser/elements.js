/*
@requires
events
arrayutils
browser
*/

var classSelectorRE = /^\.([\w-]+)$/,
    idSelectorRE = /^#([\w-]+)$/,
    tagSelectorRE = /^[\w-]+$/,
    tagOrIdSelectorRE = /^#?[\w-]+$/;

function Elements(sel) {
  if ((this instanceof Elements) == false) {
    return new Elements(sel);
  }
  this.elements = [];
  this.select(sel);
  this.tmp = new El();
}

Elements.prototype = {
  size: function() {
    return this.elements.length;
  },

  select: function(sel) {
    this.elements = Elements.__select(sel);
    return this;
  },

  addClass: function(className) {
    this.forEach(function(el) { el.addClass(className); });
    return this;
  },

  removeClass: function(className) {
    this.forEach(function(el) { el.removeClass(className); })
    return this;
  },

  forEach: function(callback, ctx) {
    var tmp = this.tmp;
    for (var i=0, len=this.elements.length; i<len; i++) {
      tmp.el = this.elements[i];
      callback.call(ctx, tmp, i);
    }
    return this;
  }
};

Elements.__select = function(selector, root) {
  root = root || document;
  var els;
  if (classSelectorRE.test(selector)) {
    els = Elements.__getElementsByClassName(RegExp.$1, root);
  }
  else if (tagSelectorRE.test(selector)) {
    els = root.getElementsByTagName(selector);
  }
  else if (document.querySelectorAll) {
    try {
      els = root.querySelectorAll(selector)
    } catch (e) {
      error("Invalid selector:", selector);
    }
  }
  else if (Browser.ieVersion() < 8) {
    els = Elements.__ie7QSA(selector, root);
  } else {
    error("This browser doesn't support CSS query selectors");
  }
  //return Array.prototype.slice.call(els);
  return Utils.toArray(els);
}

Elements.__getElementsByClassName = function(cname, node) {
  if (node.getElementsByClassName) {
    return node.getElementsByClassName(cname);
  }
  var a = [];
  var re = new RegExp('(^| )'+cname+'( |$)');
  var els = node.getElementsByTagName("*");
  for (var i=0, j=els.length; i<j; i++)
    if (re.test(els[i].className)) a.push(els[i]);
  return a;
};

Elements.__ie7QSA = function(selector, root) {
  var styleTag = Browser.createElement('STYLE');
  Browser.appendToHead(styleTag);
  document.__qsaels = [];
  styleTag.styleSheet.cssText = selector + "{x:expression(document.__qsaels.push(this))}";
  window.scrollBy(0, 0);
  var els = document.__qsaels;
  Browser.removeElement(styleTag);

  if (root != document) {
    els = Utils.filter(els, function(node) {
      while (node && node != root) {
        node = node.parentNode;
      }
      return !!node;
    });
  }
  return els;
};

// Converts dash-separated names (e.g. background-color) to camelCase (e.g. backgroundColor)
// Doesn't change names that are already camelCase
//
El.toCamelCase = function(str) {
  var cc = str.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase() });
  return cc;
};

El.fromCamelCase = function(str) {
  var dashed = str.replace(/([A-Z])/g, "-$1").toLowerCase();
  return dashed;
};

El.setStyle = function(el, name, val) {
  var jsName = Element.toCamelCase(name);
  if (el.style[jsName] == void 0) {
    trace("[Element.setStyle()] css property:", jsName);
    return;
  }
  var cssVal = val;
  if (isFinite(val)) {
    cssVal = String(val); // problem if converted to scientific notation
    if (jsName != 'opacity' && jsName != 'zIndex') {
      cssVal += "px";
    }
  }
  el.style[jsName] = cssVal;
}

El.findAll = function(sel, root) {
  return Elements.__select(sel, root);
};

function El(ref) {
  if (!ref) error("Element() needs a reference");
  if (ref instanceof El) {
    return ref;
  }
  else if (!(this instanceof El)) {
    return new El(ref);
  }

  // use Elements selector on classes or complex selectors
  //
  if (Utils.isString(ref) && !tagOrIdSelectorRE.test(ref)) {
    //var node = Elements.__super__(ref)[0];
    var node = Elements.__select(ref)[0];
    if (!node) error("Unmatched selector:", ref);
    ref = node;
  }

  this.el = Browser.getElement(ref) || Browser.createElement(ref); // TODO: detect type of argument
}

Opts.inherit(El, EventDispatcher); //

El.removeAll = function(sel) {
  var arr = Elements.__select(sel);
  Utils.forEach(arr, function(el) {
    El(el).remove();
  });
};

Utils.extend(El.prototype, {

  clone: function() {
    var el = this.el.cloneNode(true);
    if (el.nodeName == 'SCRIPT') {
      // Assume scripts are templates and convert to divs, so children
      //    can
      el = El('div').addClass(el.className).html(el.innerHTML).node();
    }
    el.id = Utils.getUniqueName();
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

  // Apply inline css styles to this Element, either as string or object.
  //
  css: function(css, val) {
    if (val != null) {
      El.setStyle(this.el, css, val);
    }
    else if (Utils.isString(css)) {
      Browser.addCSS(this.el, css);
    }
    else if (Utils.isObject(css)) {
      Utils.forEach(css, function(val, key) {
        El.setStyle(this.el, key, val);
      })
    }
    return this;
  },

  attr: function(obj, value) {
    if (Utils.isString(obj)) {
      if (arguments.length == 1) {
        return this.el.getAttribute(obj);
      }
      this.el[obj] = value;
    }
    else if (!value) {
      Opts.copyAllParams(this.el, obj);
    }
    return this;
  },

  appendChild: function(el) {
    this.el.appendChild(el.el || el);
    return this;
  },

  remove: function(sel) {
    this.el.parentNode && this.el.parentNode.removeChild(this.el);
    return this;
  },

  removeRight: function() {
    var right;
    trace(">>> removeRight()")
    while (right = this.nextSibling()) {
      trace("removing a sibling:", right.el);
      right.remove();
    }
    return this;
  },

  // TODO: destroy() // removes from dom, removes event listeners

  addClass: function(className) {
    Browser.addClass(this.el, className);
    return this;
  },

  removeClass: function(className) {
    Browser.removeClass(this.el, className);
    return this;
  },

  hasClass: function(className) {
    return Browser.hasClass(this.el, className);
  },

  toggleClass: function(cname) {
    if (this.hasClass(cname)) {
      this.removeClass(cname);
    } else {
      this.addClass(cname);
    }
  },

  computedStyle: function() {
    return Browser.getElementStyle(this.el);
  },

  visible: function() {
    if (this._hidden != null) {
      return !this._hidden;
    }
    var style = this.computedStyle();
    return style.display != 'none' && style.visibility != 'hidden';
  },

  showCSS: function(css) {
    if (!css) {
      return this._showCSS || "display:block;";
    }
    this._showCSS = css;
    return this;
  },

  hideCSS: function(css) {
    if (!css) {
      return this._hideCSS || "display:none;";
    }
    this._hideCSS = css;
    return this;
  },

  hide: function() {
    if (this.visible()) {
      // var styles = Browser.getElementStyle(this.el);
      // this._display = styles.display;
      this.css(this.hideCSS());
      this._hidden = true;
    }
    return this;
  },

  show: function(display) {
    /*
    this.css("display", display || this._display || 'block');
    */
    if (!this.visible()) {
      this.css(this.showCSS());
      this._hidden = false;
    }
    return this;
  },

  init: function(callback) {
    if (!this.el['data-el-init']) {
      callback(this);
      this.el['data-el-init'] = true;
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

  text: function(obj) {
    if (Utils.isArray(obj)) {
      for (var i=0, el = this; i<obj.length && el; el=el.sibling(), i++) {
        el.text(obj[i]);
      }
    } else {
      this.html(obj);
    }
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
    var node = Elements.__select(sel, this.el)[0];
    if (!node) error("Unmatched selector:", sel);
    return new El(node);
  },

  appendTo: function(ref) {
    var parent = ref instanceof El ? ref.el : Browser.getElement(ref);
    if (this._sibs) {
      for (var i=0, len=this._sibs.length; i<len; i++) {
        parent.appendChild(this._sibs[i]);
      }
    }
    parent.appendChild(this.el);
    return this;
  },

  /**
   * Called with tagName: create new El as sibling of this El
   * No argument: traverse to next sibling
   */
  sibling: function(arg) {
    trace("Use newSibling or nextSibling instead of El.sibling()")
    return arg ? this.newSibling(arg) : this.nextSibling();
  },

  nextSibling: function() {
    return this.el.nextSibling ? new El(this.el.nextSibling) : null;
  },

  newSibling: function(tagName) {
    var el = this.el,
        sib = Browser.createElement(tagName),
        e = new El(sib),
        par = el.parentNode;
    if (par) {
      el.nextSibling ? par.insertBefore(sib, el.nextSibling) : par.appendChild(sib);
    } else {
      e._sibs = this._sibs || [];
      e._sibs.push(el);
    }
    return e;
  },

  /**
   * Called with tagName: Create new El, append as child to current El
   * Called with no arg: Traverse to first child.
   */
  child: function(arg) {
    trace("Use El.newChild or El.firstChild instead of El.child()");
    return arg ? this.newChild(arg) : this.firstChild();
  },

  firstChild: function() {
    var ch = this.el.firstChild;
    while (ch.nodeType != 1) { // skip text nodes
      ch = ch.nextSibling;
    }
    return new El(ch);
  },

  newChild: function(tagName) {
    var ch = Browser.createElement(tagName);
    this.el.appendChild(ch);
    return new El(ch);
  },

  // Traverse to parent node
  //
  parent: function(sel) {
    sel && error("El.parent() no longer takes an argument; see findParent()")
    var p = this.el && this.el.parentNode;
    return p ? new El(p) : null;
  },

  findParent: function(tagName) {
    // error("TODO: use selector instead of tagname")
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
  //
  empty: function() {
    this.el.innerHTML = '';
    return this;
  }

});

// use DOM handler for certain events
// TODO: find a better way distinguising DOM events and other events registered on El
// e.g. different methods
//
//El.prototype.__domevents = Utils.arrayToIndex("click,mousedown,mousemove,mouseup".split(','));
El.prototype.__on = El.prototype.on;
El.prototype.on = function(type, func, ctx) {
  if (this.constructor == El) {
    Browser.on(this.el, type, func, ctx);
  } else {
    this.__on.apply(this, arguments);
  }
  return this;
};

El.prototype.__removeEventListener = El.prototype.removeEventListener;
El.prototype.removeEventListener = function(type, func, ctx) {
  if (this.constructor == El) {
    Browser.removeEventListener(this.el, type, func, ctx);
  } else {
    this.__removeEventListener.apply(this, arguments);
  }
  return this;
};
/*  */

var Element = El;

/**
 * Return ElSet representing children of this El.
 */
/*
El.prototype.children = function() {
  var set = new ElSet();
  set._parentNode = this.el;
  return set;
};
*/

/**
 * Return ElSet representing right-hand siblings of this El.
 */
/*
El.prototype.siblings = function() {
  var set = new ElSet();
  set._parentNode = this.el.parentNode;
  set._siblingNode = this.el;
  return set;
};
*/
