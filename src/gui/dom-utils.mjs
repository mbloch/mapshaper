

export function getPageXY(el) {
  var x = 0, y = 0;
  if (el.getBoundingClientRect) {
    var box = el.getBoundingClientRect();
    x = box.left - pageXToViewportX(0);
    y = box.top - pageYToViewportY(0);
  }
  else {
    var fixed = elementIsFixed(el);

    while (el) {
      x += el.offsetLeft || 0;
      y += el.offsetTop || 0;
      el = el.offsetParent;
    }

    if (fixed) {
      var offsX = -pageXToViewportX(0);
      var offsY = -pageYToViewportY(0);
      x += offsX;
      y += offsY;
    }
  }

  var obj = {x:x, y:y};
  return obj;
}

export function elementIsFixed(el) {
  // get top-level offsetParent that isn't body (cf. Firefox)
  var body = document.body;
  var parent;
  while (el && el != body) {
    parent = el;
    el = el.offsetParent;
  }

  // Look for position:fixed in the computed style of the top offsetParent.
  // var styleObj = parent && (parent.currentStyle || window.getComputedStyle && window.getComputedStyle(parent, '')) || {};
  var styleObj = parent && getElementStyle(parent) || {};
  return styleObj.position == 'fixed';
}

export function pageXToViewportX(x) {
  return x - window.pageXOffset;
}

export function pageYToViewportY(y) {
  return y - window.pageYOffset;
}

export function getElementStyle(el) {
  return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
}

export function getClassNameRxp(cname) {
  return new RegExp("(^|\\s)" + cname + "(\\s|$)");
}

export function hasClass(el, cname) {
  var rxp = getClassNameRxp(cname);
  return el && rxp.test(el.className);
}

export function addClass(el, cname) {
  var classes = el.className;
  if (!classes) {
    classes = cname;
  }
  else if (!hasClass(el, cname)) {
    classes = classes + ' ' + cname;
  }
  el.className = classes;
}

export function removeClass(el, cname) {
  var rxp = getClassNameRxp(cname);
  el.className = el.className.replace(rxp, "$2");
}

export function replaceClass(el, c1, c2) {
  var r1 = getClassNameRxp(c1);
  el.className = el.className.replace(r1, '$1' + c2 + '$2');
}

var cssDiv = document.createElement('div');
export function mergeCSS(s1, s2) {
  cssDiv.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
  return cssDiv.style.cssText;
}

export function addCSS(el, css) {
  // console.error(css);
  el.style.cssText = mergeCSS(el.style.cssText, css);
}

// Return: HTML node reference or null
// Receive: node reference or id or "#" + id
export function getElement(ref) {
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
}

export function undraggable(el) {
  el.ondragstart = function(){return false;};
  el.draggable = false;
}

export function onload(handler) {
  if (document.readyState == 'complete') {
    handler();
  } else {
    window.addEventListener('load', handler);
  }
}
