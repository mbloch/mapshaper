/* @require events, arrayutils, browser */

function Elements(sel) {/* */
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


var classSelectorRE = /^\.([\w-]+)$/,
    idSelectorRE = /^#([\w-]+)$/,
    tagSelectorRE = /^[\w-]+$/,
    tagOrIdSelectorRE = /^#?[\w-]+$/;

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
    els = root.querySelectorAll(selector)
  }
  else if (Browser.ieVersion() < 8) {
    els = Elements.__ie7QSA(selector, root);
  }
  else {
    error("This browser doesn't support CSS query selectors");
  }
  return Array.prototype.slice.call(els);
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

/**
 * Converts dash-separated names (e.g. background-color) to camelCase (e.g. backgroundColor)
 * Doesn't change names that are already camelCase
 */
Element.toCamelCase = function(str) {
  var cc = str.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase() });
  return cc;
};

Element.fromCamelCase = function(str) {
  var dashed = str.replace(/([A-Z])/g, "-$1").toLowerCase();
  return dashed;
};



Element.setStyle = function(el, name, val) {
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

function Element(ref) {
  // ref = ref || "div";
  this.el = Browser.getElement(ref) || Browser.createElement(ref); // TODO: detect type of argument
}

Opts.inherit(Element, EventDispatcher); // 

Element.prototype.node = function() {
  return this.el;
};


/**
 * Apply inline css styles to this Element, either as string or hash.
 */
Element.prototype.css = function(css, val) {
  if (val != null) {
    Element.setStyle(this.el, css, val);
  }
  else if (Utils.isString(css)) {
    Browser.addCSS(this.el, css);
  }
  else if (Utils.isObject(css)) {
    Utils.forEach(css, function(val, key) {
      Element.setStyle(this.el, key, val);
    })
  }
  return this;
}

/**
 * Set a property of this Element.
 */
Element.prototype.attr = function(obj, value) {
  if (Utils.isString(obj)) {
    this.el[obj] = value;
  }
  else if (!value) {
    Opts.copyAllParams(this.el, obj);
  }
  return this;
};

Element.prototype.appendChild = function(el) {
  this.el.appendChild(el.el || el);
  return this;
}

Element.prototype.addClass = function(className) {
  Browser.addClass(this.el, className);
  return this;
}

Element.prototype.removeClass = function(className) {
  Browser.removeClass(this.el, className);
  return this;
}

Element.prototype.hasClass = function(className) {
  return Browser.hasClass(this.el, className);
}

Element.prototype.hide = function() {
  this.css("display:none;");
  return this;
};

Element.prototype.show = function(type) {
  // this.css("display:block;"); // TODO: fix this assumption
  this.css('display', type || 'block');
  return this;
};


Element.prototype.html = function(html) {
  this.el.innerHTML = html;
  return this;
};

Element.prototype.text = function(obj) {
  if (Utils.isArray(obj)) {
    for (var i=0, el = this; i<obj.length && el; el=el.sibling(), i++) {
      el.text(obj[i]);
    }
  } 
  else {
    this.html(obj);
  }
  return this;
};


/**
 * Get/set element id
 * Shorthand for attr('id', <name>)
 */
Element.prototype.id = function(id) {
  if (id) {
    this.el.id = id;
    return this;
  }
  
  return this.el.id;
};

/**
 * Register a DOM event handler on this element.
 */
Element.prototype.on = function(type, func, ctx) {
  Browser.addEventListener(this.el, type, func, ctx);
  return this;
};


function El(ref) {
  if (ref instanceof El || ref instanceof Element) {
    return new El(ref.node());
  }
  else if (!(this instanceof El)) {
    return new El(ref);
  }

  // use Elements selector on classes or complex selectors
  //
  if (Utils.isString(ref) && !tagOrIdSelectorRE.test(ref)) {
    var node = Elements.__super__(ref)[0];
    assert(!!node, "Unmatched selector:", ref);
    ref = node;
  }

  ref && this.__super__(ref);
}

Opts.inherit(El, Element);

El.prototype.find = function(sel) {
  var node = Elements.__select(sel, this.el)[0];
  assert(!!node, "Unmatched selector:", sel);
  return new El(node);
};


Element.prototype.appendTo = function(ref) {
  var parent = ref instanceof Element ? ref.el : Browser.getElement(ref);
  if (this._siblings) {
    for (var i=0, len=this._siblings.length; i<len; i++) {
      parent.appendChild(this._siblings[i]);
    }
  }
  parent.appendChild(this.el);
  return this;
};

/*
El.prototype.find = function(ref) {
  var el = Browser.getElement(ref);
  if (!el) {
    return null;
  }
  return new El(el);
};

El.find = function(ref) {
  return new El(ref);
};*/

/**
 * Called with tagName: create new El as sibling of this El
 * No argument: traverse to next sibling
 */


El.prototype.sibling = function(tagName) {
  var el = this.el;
  if (!tagName) {
    return new El(el.nextSibling);
  }

  var sib = Browser.createElement(tagName),
    e = new El(sib),
    par = el.parentNode;
  if (par) {
    //trace("El.sibling() tag:", tagName, "have parent; parent has children?", el.nextSibling);
    el.nextSibling ? par.insertBefore(sib, el.nextSibling) : par.appendChild(sib);
  }
  else {
    trace("&&& El.sibling() warning: no parent");

    var sibs = this._siblings || [];
    sibs.push(el);
    e._siblings = sibs;
  }
  //this.el = sib;
  return e;
};

/**
 * Called with tagName: Create new El, append as child to current El
 * Called with no arg: Traverse to first child.
 */
El.prototype.child = function(tagName) {
  var ch, el = this.el;
  if (!tagName) {
    ch = el.firstChild;
    while (ch && ch.nodeType != 1) { // skip text nodes
      ch = ch.nextSibling;
    }
  }
  else {
    if (!el.parentNode) {
      //trace("[El.child()] Warning: unattached to DOM... risk of losing elements.");
      //this._siblings = null;
    }
    ch = Browser.createElement(tagName);
    el.appendChild(ch);
  }
  return new El(ch);
  //this.el = ch;
  //return this;
};

/**
 * Called with tagName: traverse to first parent w/ named tag
 * Called with no arg: traverse to parent
 */
El.prototype.parent = function(tagName) {
  var p = this.el && this.el.parentNode;
  if (tagName) {
    tagName = tagName.toUpperCase();
    while (p && p.tagName != tagName) {
      p = p.parentNode;
    }
  }
  //this.el = this.el.parentNode;
  //return this.el ? this : null;
  return p ? new El(p) : null;
};

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

/**
 * Remove all children of this El.
 */
El.prototype.empty = function() {
  this.el.innerHTML = '';
  return this;
};