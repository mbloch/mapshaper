(function () {

  var utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    get default () { return utils; },
    get getUniqueName () { return getUniqueName; },
    get isFunction () { return isFunction; },
    get isPromise () { return isPromise; },
    get isObject () { return isObject; },
    get clamp () { return clamp; },
    get isArray () { return isArray; },
    get isNumber () { return isNumber; },
    get isValidNumber () { return isValidNumber; },
    get isFiniteNumber () { return isFiniteNumber; },
    get isNonNegNumber () { return isNonNegNumber; },
    get isInteger () { return isInteger; },
    get isEven () { return isEven; },
    get isOdd () { return isOdd; },
    get isString () { return isString; },
    get isDate () { return isDate; },
    get isBoolean () { return isBoolean; },
    get formatDateISO () { return formatDateISO; },
    get toArray () { return toArray; },
    get isArrayLike () { return isArrayLike; },
    get addslashes () { return addslashes; },
    get regexEscape () { return regexEscape; },
    get htmlEscape () { return htmlEscape; },
    get defaults () { return defaults; },
    get extend () { return extend; },
    get inherit () { return inherit; },
    get promisify () { return promisify; },
    get reduceAsync () { return reduceAsync; },
    get merge () { return merge; },
    get difference () { return difference; },
    get intersection () { return intersection; },
    get indexOf () { return indexOf; },
    get contains () { return contains; },
    get some () { return some; },
    get every () { return every; },
    get find () { return find; },
    get range () { return range; },
    get repeat () { return repeat; },
    get sum () { return sum; },
    get getArrayBounds () { return getArrayBounds; },
    get uniq () { return uniq; },
    get pluck () { return pluck; },
    get countValues () { return countValues; },
    get indexOn () { return indexOn; },
    get groupBy () { return groupBy; },
    get arrayToIndex () { return arrayToIndex; },
    get forEach () { return forEach; },
    get forEachProperty () { return forEachProperty; },
    get initializeArray () { return initializeArray; },
    get replaceArray () { return replaceArray; },
    get repeatString () { return repeatString; },
    get splitLines () { return splitLines; },
    get pluralSuffix () { return pluralSuffix; },
    get endsWith () { return endsWith; },
    get lpad () { return lpad; },
    get rpad () { return rpad; },
    get trim () { return trim; },
    get ltrim () { return ltrim; },
    get rtrim () { return rtrim; },
    get addThousandsSep () { return addThousandsSep; },
    get numToStr () { return numToStr; },
    get formatNumber () { return formatNumber; },
    get formatIntlNumber () { return formatIntlNumber; },
    get formatNumberForDisplay () { return formatNumberForDisplay; },
    get shuffle () { return shuffle; },
    get sortOn () { return sortOn; },
    get genericSort () { return genericSort; },
    get getSortedIds () { return getSortedIds; },
    get sortArrayIndex () { return sortArrayIndex; },
    get reorderArray () { return reorderArray; },
    get getKeyComparator () { return getKeyComparator; },
    get getGenericComparator () { return getGenericComparator; },
    get quicksort () { return quicksort; },
    get quicksortPartition () { return quicksortPartition; },
    get findRankByValue () { return findRankByValue; },
    get findValueByPct () { return findValueByPct; },
    get findValueByRank () { return findValueByRank; },
    get findMedian () { return findMedian; },
    get findQuantile () { return findQuantile; },
    get mean () { return mean; },
    get format () { return format; },
    get formatter () { return formatter; },
    get wildcardToRegExp () { return wildcardToRegExp; },
    get createBuffer () { return createBuffer; },
    get toBuffer () { return toBuffer; },
    get expandoBuffer () { return expandoBuffer; },
    get copyElements () { return copyElements; },
    get extendBuffer () { return extendBuffer; },
    get mergeNames () { return mergeNames; },
    get findStringPrefix () { return findStringPrefix; },
    get parsePercent () { return parsePercent; },
    get formatVersionedName () { return formatVersionedName; },
    get uniqifyNames () { return uniqifyNames; },
    get parseString () { return parseString; },
    get parseNumber () { return parseNumber; },
    get parseIntlNumber () { return parseIntlNumber; },
    get cleanNumericString () { return cleanNumericString; },
    get trimQuotes () { return trimQuotes; }
  });

  var api = window.mapshaper; // assuming mapshaper is in global scope
  var mapshaper = api,
    utils$1 = api.utils,
    cli = api.cli,
    geom = api.geom,
    internal = api.internal,
    Bounds = internal.Bounds,
    UserError$1 = internal.UserError,
    message$1 = internal.message, // stop, error and message are overridden in gui-proxy.js
    stop$1 = internal.stop,
    error$1 = internal.error;

  api.enableLogging();

  function CatalogControl(gui, catalog, onSelect) {
    var self = this,
        container = gui.container.findChild('.file-catalog'),
        cols = catalog.cols,
        enabled = true,
        items = catalog.items,
        n = items.length,
        row = 0,
        html, rows;

    this.reset = function() {
      enabled = true;
      container.removeClass('downloading');
      this.progress(-1);
    };

    this.progress = function() {}; // set by click handler

    if (n > 0 === false) {
      console.error("Catalog is missing array of items");
      return;
    }

    gui.container.addClass('catalog-mode');

    if (!cols) {
      cols = Math.ceil(Math.sqrt(n));
    }
    rows = Math.ceil(n / cols);

    html = '<table>';
    if (catalog.title) {
      html += utils$1.format('<tr><th colspan="%d"><h4>%s</h4></th></tr>', cols, catalog.title);
    }
    while (row < rows) {
      html += renderRow(items.slice(row * cols, row * cols + cols));
      row++;
    }
    html += '</table>';
    container.node().innerHTML = html;
    gui.container.findChildren('.file-catalog td').forEach(function(el, i) {
      el.on('click', function() {
        selectItem(el, i);
      });
    });

    // Generate onprogress callback to show a progress indicator
    function getProgressFunction(el) {
      var visible = false,
          i = 0;
      return function(pct) {
        i++;
        if (i == 2 && pct < 0.5) {
          // only show progress bar if file will take a while to load
          visible = true;
        }
        if (pct == -1) {
          // kludge to reset progress bar
          el.removeClass('downloading');
          pct = 0;
        }
        if (visible) {
          el.css('background-size', (Math.round(pct * 100) + '% 100%'));
        }
      };
    }

    function renderRow(items) {
      var tds = items.map(function(o, col) {
        var i = row * cols + col;
        return renderCell(o, i);
      });
      return '<tr>' + tds.join('') + '</tr>';
    }

    function selectItem(el,i) {
      var pageUrl = window.location.href.toString().replace(/[?#].*/, '').replace(/\/$/, '') + '/';
      var item = items[i];
      var urls = item.files.map(function(file) {
        var url = (item.url || '') + file;
        if (/^http/.test(url) === false) {
          // assume relative url
          url = pageUrl + '/' + url;
        }
        return url;
      });
      if (enabled) { // only respond to first click
        self.progress = getProgressFunction(el);
        el.addClass('downloading');
        container.addClass('downloading');
        enabled = false;
        onSelect(urls);
      }
    }

    function renderCell(item, i) {
      var template = '<td data-id="%d"><h4 class="title">%s</h4><div class="subtitle">%s</div></td>';
      return utils$1.format(template, i, item.title, item.subtitle || '');
    }

  }

  function Handler(type, target, callback, listener, priority) {
    this.type = type;
    this.callback = callback;
    this.listener = listener || null;
    this.priority = priority || 0;
    this.target = target;
  }

  Handler.prototype.trigger = function(evt) {
    if (!evt) {
      evt = new EventData(this.type);
      evt.target = this.target;
    } else if (evt.target != this.target || evt.type != this.type) {
      error$1("[Handler] event target/type have changed.");
    }
    this.callback.call(this.listener, evt);
  };

  function EventData(type, target, data) {
    this.type = type;
    this.target = target;
    if (data) {
      utils$1.defaults(this, data);
      this.data = data;
    }
  }

  EventData.prototype.stopPropagation = function() {
    this.__stop__ = true;
  };

  //  Base class for objects that dispatch events
  function EventDispatcher() {}


  // @obj (optional) data object, gets mixed into event
  // @listener (optional) dispatch event only to this object
  EventDispatcher.prototype.dispatchEvent = function(type, obj, listener) {
    var evt;
    // TODO: check for bugs if handlers are removed elsewhere while firing
    var handlers = this._handlers;
    if (handlers) {
      for (var i = 0, len = handlers.length; i < len; i++) {
        var handler = handlers[i];
        if (handler.type == type && (!listener || listener == handler.listener)) {
          if (!evt) {
            evt = new EventData(type, this, obj);
          }
          else if (evt.__stop__) {
              break;
          }
          handler.trigger(evt);
        }
      }
    }
  };

  EventDispatcher.prototype.addEventListener =
  EventDispatcher.prototype.on = function(type, callback, context, priority) {
    context = context || this;
    priority = priority || 0;
    var handler = new Handler(type, this, callback, context, priority);
    // Insert the new event in the array of handlers according to its priority.
    var handlers = this._handlers || (this._handlers = []);
    var i = handlers.length;
    while (--i >= 0 && handlers[i].priority < handler.priority) {}
    handlers.splice(i+1, 0, handler);
    return this;
  };

  // Remove an event handler.
  // @param {string} type Event type to match.
  // @param {function(BoundEvent)} callback Event handler function to match.
  // @param {*=} context Execution context of the event handler to match.
  // @return {number} Returns number of handlers removed (expect 0 or 1).
  EventDispatcher.prototype.removeEventListener = function(type, callback, context) {
    context = context || this;
    var count = this.removeEventListeners(type, callback, context);
    return count;
  };

  // Remove event handlers; passing arguments can limit which listeners to remove
  // Returns nmber of handlers removed.
  EventDispatcher.prototype.removeEventListeners = function(type, callback, context) {
    var handlers = this._handlers;
    var newArr = [];
    var count = 0;
    for (var i = 0; handlers && i < handlers.length; i++) {
      var evt = handlers[i];
      if ((!type || type == evt.type) &&
        (!callback || callback == evt.callback) &&
        (!context || context == evt.listener)) {
        count += 1;
      }
      else {
        newArr.push(evt);
      }
    }
    this._handlers = newArr;
    return count;
  };

  EventDispatcher.prototype.countEventListeners = function(type) {
    var handlers = this._handlers,
      len = handlers && handlers.length || 0,
      count = 0;
    if (!type) return len;
    for (var i = 0; i < len; i++) {
      if (handlers[i].type === type) count++;
    }
    return count;
  };

  function getPageXY(el) {
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

  function elementIsFixed(el) {
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

  function pageXToViewportX(x) {
    return x - window.pageXOffset;
  }

  function pageYToViewportY(y) {
    return y - window.pageYOffset;
  }

  function getElementStyle(el) {
    return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
  }

  function getClassNameRxp(cname) {
    return new RegExp("(^|\\s)" + cname + "(\\s|$)");
  }

  function hasClass(el, cname) {
    var rxp = getClassNameRxp(cname);
    return el && rxp.test(el.className);
  }

  function addClass(el, cname) {
    var classes = el.className;
    if (!classes) {
      classes = cname;
    }
    else if (!hasClass(el, cname)) {
      classes = classes + ' ' + cname;
    }
    el.className = classes;
  }

  function removeClass(el, cname) {
    var rxp = getClassNameRxp(cname);
    el.className = el.className.replace(rxp, "$2");
  }

  function replaceClass(el, c1, c2) {
    var r1 = getClassNameRxp(c1);
    el.className = el.className.replace(r1, '$1' + c2 + '$2');
  }

  var cssDiv = document.createElement('div');
  function mergeCSS(s1, s2) {
    cssDiv.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
    return cssDiv.style.cssText;
  }

  function addCSS(el, css) {
    // console.error(css);
    el.style.cssText = mergeCSS(el.style.cssText, css);
  }

  // Return: HTML node reference or null
  // Receive: node reference or id or "#" + id
  function getElement(ref) {
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

  function undraggable(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  }

  function onload(handler) {
    if (document.readyState == 'complete') {
      handler();
    } else {
      window.addEventListener('load', handler);
    }
  }

  var tagOrIdSelectorRE = /^#?[\w-]+$/;

  El.__select = function(selector, root) {
    root = root || document;
    var els;
    if (document.querySelectorAll) {
      try {
        els = root.querySelectorAll(selector);
      } catch (e) {
        error$1("Invalid selector:", selector);
      }
    } else {
      error$1("This browser doesn't support CSS query selectors");
    }
    return utils$1.toArray(els);
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

  function El(ref) {
    if (!ref) error$1("Element() needs a reference");
    if (ref instanceof El) {
      return ref;
    }
    else if (this instanceof El === false) {
      return new El(ref);
    }

    var node;
    if (utils$1.isString(ref)) {
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
    if (!node) error$1("Unmatched element selector:", ref);
    this.el = node;
  }

  utils$1.inherit(El, EventDispatcher);

  utils$1.extend(El.prototype, {

    clone: function() {
      var el = this.el.cloneNode(true);
      if (el.nodeName == 'SCRIPT') {
        // Assume scripts are templates and convert to divs, so children
        //    can ...
        el = El('div').addClass(el.className).html(el.innerHTML).node();
      }
      el.id = utils$1.getUniqueName();
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
      if (utils$1.isObject(css)) {
        utils$1.forEachProperty(css, function(val, key) {
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
      if (utils$1.isString(obj)) {
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
      this.html(utils$1.htmlEscape(str));
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
  El.prototype.on = function(type, func) {
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

  var GUI = {};

  GUI.isActiveInstance = function(gui) {
    return gui == GUI.__active;
  };

  GUI.getPixelRatio = function() {
    var deviceRatio = window.devicePixelRatio || window.webkitDevicePixelRatio || 1;
    return deviceRatio > 1 ? 2 : 1;
  };

  GUI.browserIsSupported = function() {
    return typeof ArrayBuffer != 'undefined' &&
        typeof Blob != 'undefined' && typeof File != 'undefined';
  };

  GUI.exportIsSupported = function() {
    return typeof URL != 'undefined' && URL.createObjectURL &&
      typeof document.createElement("a").download != "undefined" ||
      !!window.navigator.msSaveBlob;
  };

  // TODO: make this relative to a single GUI instance
  GUI.canSaveToServer = function() {
    return !!(mapshaper.manifest && mapshaper.manifest.allow_saving) && typeof fetch == 'function';
  };

  GUI.setSavedValue = function(name, val) {
    try {
      window.localStorage.setItem(name, JSON.stringify(val));
    } catch(e) {}
  };

  GUI.getSavedValue = function(name) {
    try {
      return JSON.parse(window.localStorage.getItem(name));
    } catch(e) {}
    return null;
  };

  GUI.getUrlVars = function() {
    var q = window.location.search.substring(1);
    return q.split('&').reduce(function(memo, chunk) {
      var pair = chunk.split('=');
      var key = decodeURIComponent(pair[0]);
      memo[key] = parseVal(pair[1]);
      return memo;
    }, {});

    function parseVal(val) {
      var str = val ? decodeURIComponent(val) : 'true';
      if (str == 'true' || str == 'false') return JSON.parse(str);
      return str;
    }
  };

  // Assumes that URL path ends with a filename
  GUI.getUrlFilename = function(url) {
    var path = /\/\/([^#?]+)/.exec(url);
    var file = path ? path[1].split('/').pop() : '';
    return file;
  };

  GUI.formatMessageArgs = function(args) {
    // .replace(/^\[[^\]]+\] ?/, ''); // remove cli annotation (if present)
    return internal.formatLogArgs(args);
  };

  GUI.handleDirectEvent = function(cb) {
    return function(e) {
      if (e.target == this) cb();
    };
  };

  GUI.getInputElement = function() {
    var el = document.activeElement;
    return (el && (el.tagName == 'INPUT' || el.contentEditable == 'true')) ? el : null;
  };

  GUI.textIsSelected = function() {
    return !!GUI.getInputElement();
  };

  GUI.selectElement = function(el) {
    var range = document.createRange(),
        sel = window.getSelection();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  GUI.blurActiveElement = function() {
    var el = GUI.getInputElement();
    if (el) el.blur();
  };

  // Filter out delayed click events, e.g. so users can highlight and copy text
  // Filter out context menu clicks
  GUI.onClick = function(el, cb) {
    var time;
    el.on('mousedown', function() {
      time = +new Date();
    });
    el.on('mouseup', function(e) {
      if (looksLikeContextClick(e)) {
        return;
      }
      if (+new Date() - time < 300) {
        cb(e);
      }
    });
  };

  GUI.onContextClick = function(el, cb) {
    el.on('mouseup', function(e) {
      if (looksLikeContextClick(e)) {
        e.stopPropagation();
        e.preventDefault();
        cb(e);
      }
    });
  };

  function looksLikeContextClick(e) {
    return e.button > 1 || e.ctrlKey;
  }

  // tests if filename is a type that can be used
  // GUI.isReadableFileType = function(filename) {
  //   return !!internal.guessInputFileType(filename) || internal.couldBeDsvFile(filename) ||
  //     internal.isZipFile(filename);
  // };

  GUI.parseFreeformOptions = function(raw, cmd) {
    var str = raw.trim(),
        parsed;
    if (!str) {
      return {};
    }
    if (!/^-/.test(str)) {
      str = '-' + cmd + ' ' + str;
    }
    parsed =  internal.parseCommands(str);
    if (!parsed.length || parsed[0].name != cmd) {
      stop$1("Unable to parse command line options");
    }
    return parsed[0].options;
  };

  // Convert an options object to a command line options string
  // (used by gui-import-control.js)
  // TODO: handle options with irregular string <-> object conversion
  GUI.formatCommandOptions = function(o) {
    var arr = [];
    Object.keys(o).forEach(function(key) {
      var name = key.replace(/_/g, '-');
      var val = o[key];
      var str;
      // TODO: quote values that contain spaces
      if (Array.isArray(val)) {
        str = name + '=' + val.join(',');
      } else if (val === true) {
        str = name;
      } else if (val === false) {
        return;
      } else {
        str = name + '=' + val;
      }
      arr.push(str);
    });
    return arr.join(' ');
  };

  // TODO: switch all ClickText to ClickText2

  // @ref Reference to an element containing a text node
  function ClickText2(ref) {
    var self = this;
    var selected = false;
    var el = El(ref).on('mousedown', init);

    function init() {
      el.removeEventListener('mousedown', init);
      el.attr('contentEditable', true)
      .attr('spellcheck', false)
      .attr('autocorrect', false)
      .on('focus', function(e) {
        el.addClass('editing');
        selected = false;
      }).on('blur', function(e) {
        el.removeClass('editing');
        self.dispatchEvent('change');
        window.getSelection().removeAllRanges();
      }).on('keydown', function(e) {
        if (e.keyCode == 13) { // enter
          e.stopPropagation();
          e.preventDefault();
          this.blur();
        }
      }).on('click', function(e) {
        if (!selected && window.getSelection().isCollapsed) {
          GUI.selectElement(el.node());
        }
        selected = true;
        e.stopPropagation();
      });
    }

    this.value = function(str) {
      if (utils$1.isString(str)) {
        el.node().textContent = str;
      } else {
        return el.node().textContent;
      }
    };
  }

  utils$1.inherit(ClickText2, EventDispatcher);

  // @ref reference to a text input element
  function ClickText(ref) {
    var _el = El(ref);
    var _self = this;
    var _max = Infinity,
        _min = -Infinity,
        _formatter = function(v) {return String(v);},
        _validator = function(v) {return !isNaN(v);},
        _parser = function(s) {return parseFloat(s);},
        _value = 0;

    _el.on('blur', onblur);
    _el.on('keydown', onpress);

    function onpress(e) {
      if (e.keyCode == 27) { // esc
        _self.value(_value); // reset input field to current value
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
        // return;
      }
      if (_validator(val)) {
        _self.value(val);
        _self.dispatchEvent('change', {value:_self.value()});
      } else {
        _self.value(_value);
        _self.dispatchEvent('error'); // TODO: improve
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
    };

    this.text = function() {return _el.el.value;};

    this.value = function(arg) {
      if (arg == void 0) {
        // var valStr = this.el.value;
        // return _parser ? _parser(valStr) : parseFloat(valStr);
        return _value;
      }
      var val = utils$1.clamp(arg, _min, _max);
      if (!_validator(val)) {
        error$1("ClickText#value() invalid value:", arg);
      } else {
        _value = val;
      }
      _el.el.value = _formatter(val);
      return this;
    };
  }

  utils$1.inherit(ClickText, EventDispatcher);


  function Checkbox(ref) {
    var _el = El(ref);
  }

  utils$1.inherit(Checkbox, EventDispatcher);

  function SimpleButton(ref) {
    var _el = El(ref),
        _active = !_el.hasClass('disabled');

    _el.active = function(a) {
      if (a === void 0) return _active;
      if (a !== _active) {
        _active = a;
        _el.toggleClass('disabled');
      }
      return _el;
    };

    // this.node = function() {return _el.node();};

    function isVisible() {
      var el = _el.node();
      return el.offsetParent !== null;
    }
    return _el;
  }

  function filterLayerByIds(lyr, ids) {
    var shapes;
    if (lyr.shapes) {
      shapes = ids.map(function(id) {
        return lyr.shapes[id];
      });
      return utils$1.defaults({shapes: shapes, data: null}, lyr);
    }
    return lyr;
  }

  function formatLayerNameForDisplay(name) {
    return name || '[unnamed]';
  }

  function cleanLayerName(raw) {
    return raw.replace(/[\n\t/\\]/g, '')
      .replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  }

  function updateLayerStackOrder(layers) {
    // 1. assign ascending ids to unassigned layers above the range of other layers
    layers.forEach(function(o, i) {
      if (!o.layer.menu_order) o.layer.menu_order = 1e6 + i;
    });
    // 2. sort in ascending order
    layers.sort(function(a, b) {
      return a.layer.menu_order - b.layer.menu_order;
    });
    // 3. assign consecutve ids
    layers.forEach(function(o, i) {
      o.layer.menu_order = i + 1;
    });
    return layers;
  }

  function sortLayersForMenuDisplay(layers) {
    layers = updateLayerStackOrder(layers);
    return layers.reverse();
  }

  function setLayerPinning(lyr, pinned) {
    lyr.pinned = !!pinned;
  }


  function adjustPointSymbolSizes(layers, overlayLyr, ext) {
    var bbox = ext.getBounds().scale(1.5).toArray();
    var testInBounds = function(p) {
      return p[0] > bbox[0] && p[0] < bbox[2] && p[1] > bbox[1] && p[1] < bbox[3];
    };
    var topTier = 50000;
    var count = 0;
    layers = layers.filter(function(lyr) {
      return lyr.geometry_type == 'point' && lyr.gui.style.dotSize > 0;
    });
    layers.forEach(function(lyr) {
      // short-circuit point counting above top threshold
      count += countPoints(lyr.gui.displayLayer.shapes, topTier, testInBounds);
    });
    count = Math.min(topTier, count) || 1;
    var k = Math.pow(6 - utils$1.clamp(Math.log10(count), 1, 5), 1.3);

    // zoom adjustments
    var mapScale = ext.scale();
    if (mapScale < 0.5) {
      k *= Math.pow(mapScale + 0.5, 0.35);
    } else if (mapScale > 1) {
      // scale faster at first
      k *= Math.pow(Math.min(mapScale, 4), 0.15);
      k *= Math.pow(mapScale, 0.05);
    }

    // scale down when map is small
    var smallSide = Math.min(ext.width(), ext.height());
    k *= utils$1.clamp(smallSide / 500, 0.5, 1);

    layers.forEach(function(lyr) {
      lyr.gui.style.dotScale = k;
    });
    if (overlayLyr && overlayLyr.geometry_type == 'point' && overlayLyr.gui.style.dotSize > 0) {
      overlayLyr.gui.style.dotScale = k;
    }
  }

  function countPoints(shapes, max, filter) {
    var count = 0;
    var i, j, n, m, shp;
    for (i=0, n=shapes.length; i<n && count<max; i++) {
      shp = shapes[i];
      for (j=0, m=(shp ? shp.length : 0); j<m; j++) {
        count += filter(shp[j]) ? 1 : 0;
      }
    }
    return count;
  }

  async function showPrompt(msg, title) {
    var popup = showPopupAlert(msg, title);
    return new Promise(function(resolve) {
      popup.onCancel(function() {
        resolve(false);
      });
      popup.button('Yes', function() {
        resolve(true);
      });
      popup.button('No', function() {
        resolve(false);
      });
    });
  }

  function showPopupAlert(msg, title, optsArg) {
    var opts = optsArg || {};
    var self = {}, html = '';
    var _cancel, _close;
    var warningRxp = /^Warning: /;
    var el = El('div').appendTo('body').addClass('alert-wrapper')
      .classed('non-blocking', opts.non_blocking);
    var infoBox = El('div').appendTo(el).addClass('alert-box info-box selectable');
    El('div').appendTo(infoBox).addClass('close2-btn').on('click', function() {
      if (_cancel) _cancel();
      self.close();
    });
    if (opts.max_width) {
      infoBox.node().style.maxWidth = opts.max_width;
    }
    var container = El('div').appendTo(infoBox);
    if (!title && warningRxp.test(msg)) {
      title = 'Warning';
      msg = msg.replace(warningRxp, '');
    }
    if (title) {
      El('div').addClass('alert-title').text(title).appendTo(container);
    }
    var content = El('div').appendTo(infoBox);
    if (msg) {
      content.html(`<p class="alert-message">${msg}</p>`);
    }

    self.container = function() { return content; };

    self.onCancel = function(cb) {
      _cancel = cb;
      return self;
    };

    self.onClose = function(cb) {
      _close = cb;
      return self;
    };

    self.button = function(label, cb) {
      El('div')
        .addClass("btn dialog-btn alert-btn")
        .appendTo(infoBox)
        .html(label)
        .on('click', function() {
          self.close();
          cb();
        });
      return self;
    };

    self.close = function(action) {
      var ms = 0;
      var _el = el;
      if (action == 'fade' && _el) {
        ms = 1000;
        _el.addClass('fade-out');
      }
      if (_close) _close();
      el = _cancel = _close = null;
      setTimeout(function() {
        if (_el) _el.remove();
      }, ms);
    };
    return self;
  }

  function AlertControl(gui) {
    var openAlert; // error popup
    var openPopup; // any popup
    var quiet = false;

    gui.addMode('alert', function() {}, closePopup);

    gui.alert = function(str, title) {
      closePopup();
      openAlert = openPopup = showPopupAlert(str, title);
      openAlert.onClose(gui.clearMode);
      gui.enterMode('alert');
    };

    gui.quiet = function(flag) {
      quiet = !!flag;
    };

    gui.message = function(str, title) {
      if (quiet) return;
      if (openPopup) return; // don't stomp on another popup
      openPopup = showPopupAlert(str, title);
      openPopup.onClose(function() {openPopup = null;});
    };

    function closePopup() {
      if (openPopup) openPopup.close();
      openPopup = openAlert = null;
    }
  }

  function saveZipFile(zipfileName, files, done) {
    internal.zipAsync(files, function(err, buf) {
      if (err) {
        done(errorMessage(err));
      } else {
        saveBlobToLocalFile(zipfileName, new Blob([buf]), done);
      }
    });

    function errorMessage(err) {
      var str = "Error creating Zip file";
      if (err.message) {
        str += ": " + err.message;
      }
      return str;
    }
  }

  function saveFilesToServer(paths, data, done) {
    var i = -1;
    next();
    function next(err) {
      i++;
      if (err) return done(err);
      if (i >= data.length) return done();
      saveBlobToServer(paths[i], new Blob([data[i]]), next);
    }
  }

  function saveBlobToServer(path, blob, done) {
    var q = '?file=' + encodeURIComponent(path);
    var url = window.location.origin + '/save' + q;
    window.fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: blob
    }).then(function(resp) {
      if (resp.status == 400) {
        return resp.text();
      }
    }).then(function(err) {
      done(err);
    }).catch(function(resp) {
      done('connection to server was lost');
    });
  }

  async function saveBlobToLocalFile(filename, blob, done) {
    var chooseDir = GUI.getSavedValue('choose-save-dir');
    done = done || function() {};
    if (chooseDir) {
      saveBlobToSelectedFile(filename, blob, done);
    } else {
      saveBlobToDownloadsFolder(filename, blob, done);
    }
  }

  function showSaveDialog(filename, blob, done) {
    var alert = showPopupAlert(`Save ${filename} to:`)
      .button('selected folder', function() {
        saveBlobToSelectedFile(filename, blob, done);
      })
      .button('downloads', function() {
        saveBlobToDownloadsFolder(filename, blob, done);
      })
      .onCancel(done);
  }

  async function saveBlobToSelectedFile(filename, blob, done) {
    // see: https://developer.chrome.com/articles/file-system-access/
    // note: saving multiple files to a directory using showDirectoryPicker()
    //   does not work well (in Chrome). User is prompted for permission each time,
    //   and some directories (like Downloads and Documents) are blocked.
    //
    var options = getSaveFileOptions(filename);
    var handle;
    try {
      handle = await window.showSaveFilePicker(options);
      var writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch(e) {
      if (e.name == 'SecurityError') {
        // assuming this is a timeout error, with message like:
        // "Must be handling a user gesture to show a file picker."
        showSaveDialog(filename, blob, done);
      } else if (e.name == 'AbortError') {
        // fired if user clicks a cancel button (normal, no error message)
        // BUT: this kind of erro rmay also get fired when saving to a protected folder
        //   (should show error message)
        done();
      } else {
        console.error(e.name, e.message, e);
        done('Save failed for an unknown reason');
      }
      return;
    }

    done();
  }

  function getSaveFileOptions(filename) {
    // see: https://wicg.github.io/file-system-access/#api-filepickeroptions
    var type = internal.guessInputFileType(filename);
    var ext = internal.getFileExtension(filename).toLowerCase();
    var accept = {};
    if (ext == 'kml') {
      accept['application/vnd.google-earth.kml+xml'] = ['.kml'];
    } else if (ext == 'svg') {
      accept['image/svg+xml'] = ['.svg'];
    } else if (ext == 'zip') {
      accept['application/zip'] == ['.zip'];
    } else if (type == 'text') {
      accept['text/csv'] = ['.csv', '.tsv', '.tab', '.txt'];
    } else if (type == 'json') {
      accept['application/json'] = ['.json', '.geojson', '.topojson'];
    } else {
      accept['application/octet-stream'] = ['.' + ext];
    }
    return {
      suggestedName: filename,
      // If startIn is given, Chrome will always start there
      // Default is to start in the previously selected dir (better)
      // // startIn: 'downloads', // or: desktop, documents, [file handle], [directory handle]
      types: [{
        description: 'Files',
        accept: accept
      }]
    };
  }


  function saveBlobToDownloadsFolder(filename, blob, done) {
    var anchor, blobUrl;
    try {
      blobUrl = URL.createObjectURL(blob);
    } catch(e) {
      done("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.");
      return;
    }
    anchor = El('a').attr('href', '#').appendTo('body').node();
    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
        false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
    setTimeout(function() {
      // Revoke blob url to release memory; timeout needed in firefox
      URL.revokeObjectURL(blobUrl);
      anchor.parentNode.removeChild(anchor);
      done();
    }, 400);
  }

  var idb = require('idb-keyval');
  // https://github.com/jakearchibald/idb
  // https://github.com/jakearchibald/idb-keyval
  var sessionId = getUniqId('session');
  var snapshotCount = 0;

  function getUniqId(prefix) {
    return prefix + '_' + (Math.random() + 1).toString(36).substring(2,8);
  }

  function isSnapshotId(str) {
    return /^session_/.test(str);
  }

  function SessionSnapshots(gui) {
    var _menuOpen = false;
    var _menuTimeout;
    var btn, menu;

    init();

    async function init() {
      btn = gui.buttons.addButton('#ribbon-icon').addClass('menu-btn save-btn');
      var enabled = await isStorageEnabled();
      if (!enabled) {
        btn.remove();
        return;
      }
      menu = El('div').addClass('nav-sub-menu save-menu').appendTo(btn.node());
      await initialCleanup();

      window.addEventListener('beforeunload', async function() {
        // delete snapshot data
        // This is not ideal, because the data gets deleted even if the user
        // cancels the page close... but there's no apparent good alternative
        await finalCleanup();
      });

      btn.on('mouseenter', function() {
        btn.addClass('hover');
        clearTimeout(_menuTimeout); // prevent timed closing
        if (!_menuOpen) {
          openMenu();
        }
      });

      btn.on('mouseleave', function() {
        if (!_menuOpen) {
          btn.removeClass('hover');
        } else {
          closeMenu(200);
        }
      });
    }

    async function renderMenu() {
      var snapshots = await fetchSnapshotList();

      menu.empty();
      addMenuLink({
        slug: 'stash',
        // label: 'save data snapshot',
        label: 'create a snapshot',
        action: saveSnapshot
      });

      // var available = await getAvailableStorage();
      // if (available) {
      //   El('div').addClass('save-menu-entry').text(available + ' available').appendTo(menu);
      // }

      // if (snapshots.length > 0) {
      //   El('div').addClass('save-menu-entry').text('snapshots').appendTo(menu);
      // }

      snapshots.forEach(function(item, i) {
        var line = El('div').appendTo(menu).addClass('save-menu-item');
        El('span').appendTo(line).html(`<span class="save-item-label">#${item.number}</span> `);
        // show snapshot size
        El('span').appendTo(line).html(` <span class="save-item-size">${item.display_size}</span>`);
        El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
          await restoreSnapshotById(item.id, gui);
          closeMenu(100);
        }).text('restore');
        El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
          var obj = await idb.get(item.id);
          await internal.compressSnapshotForExport(obj);
          var buf = internal.pack(obj);
          // choose output filename and directory every time
          // saveBlobToLocalFile('mapshaper_snapshot.msx', new Blob([buf]));
          var fileName = `snapshot-${String(item.number).padStart(2, '0')}.msx`;
          saveBlobToSelectedFile(fileName, new Blob([buf]), function() {});
        }).text('export');
        El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
          await removeSnapshotById(item.id);
          closeMenu(300);
          renderMenu();
        }).text('remove');
      });
    }

    function addMenuLink(item) {
      var line = El('div').appendTo(menu);
      var link = El('div').addClass('save-menu-link save-menu-entry').attr('data-name', item.slug).text(item.label).appendTo(line);
      link.on('click', async function(e) {
        await item.action(gui);
        e.stopPropagation();
      });
    }

    function openMenu() {
      clearTimeout(_menuTimeout);
      if (!_menuOpen) {
        btn.addClass('open');
        _menuOpen = true;
        renderMenu();
      }
    }

    function closeMenu(delay) {
      if (!_menuOpen) return;
      clearTimeout(_menuTimeout);
      _menuTimeout = setTimeout(function() {
        _menuOpen = false;
        btn.removeClass('open');
        btn.removeClass('hover');
      }, delay || 0);
    }

    async function saveSnapshot(gui) {
      var obj = await captureSnapshot(gui);
      if (!obj) return;
      // storing an unpacked object is usually a bit faster (~20%)
      // note: we don't know the size of unpacked snapshot objects
      // obj = internal.pack(obj);
      var entryId = String(++snapshotCount).padStart(3, '0');
      var snapshotId = sessionId + '_' + entryId; // e.g. session_d89fw_001
      var size = obj.length;
      var entry = {
        created: Date.now(),
        session: sessionId,
        id: snapshotId,
        name: snapshotCount + '.',
        number: snapshotCount,
        size: size,
        display_size: formatSize(size)
      };

      await idb.set(entry.id, obj);
      await addToIndex(entry);
      renderMenu();
    }
  }

  function formatSize(bytes) {
    var kb = Math.round(bytes / 1000);
    var mb = (bytes / 1e6).toFixed(1);
    if (!kb) return '';
    if (kb < 990) return kb + 'kB';
    return mb + 'MB';
  }

  async function fetchSnapshotList() {
    await removeMissingSnapshots();
    var index = await fetchIndex();
    var snapshots = index.snapshots;
    snapshots = snapshots.filter(function(o) {return o.session == sessionId;});
    return snapshots.sort(function(a, b) {b.created > a.created;});
  }

  async function removeSnapshotById(id, gui) {
    await idb.del(id);
    return updateIndex(function(index) {
      index.snapshots = index.snapshots.filter(function(snap) {
        return snap.id != id;
      });
    });
  }

  async function restoreSnapshotById(id, gui) {
    var data;
    try {
      data = await internal.restoreSessionData(await idb.get(id));
    } catch(e) {
      console.error(e);
      stop$1('Snapshot is not available');
    }
    gui.model.clear();
    importDatasets(data.datasets, gui);
    gui.clearMode();
  }

  // Add datasets to the current project
  // TODO: figure out if interface data should be imported (e.g. should
  //   visibility flag of imported layers be imported)
  async function importSessionData(buf, gui) {
    if (buf instanceof ArrayBuffer) {
      buf = new Uint8Array(buf);
    }
    var data = await internal.unpackSessionData(buf);
    importDatasets(data.datasets, gui);
  }

  function importDatasets(datasets, gui) {
    gui.model.addDatasets(datasets);
    var target = findTargetLayer(datasets);
    delete target.layers[0].active; // kludge, active flag only used in snapshots now
    gui.model.setDefaultTarget(target.layers, target.dataset);
    gui.model.updated({select: true, arc_count: true}); // arc_count to refresh display shapes
  }

  async function captureSnapshot(gui) {
    var lyr = gui.model.getActiveLayer()?.layer;
    if (!lyr) return null; // no data -- no snapshot
    // compact: true applies compression to vector coordinates, for ~30% reduction
    //   in file size in a typical polygon or polyline file, but longer processing time
    var opts = {compact: false, active_layer: lyr};
    var datasets = gui.model.getDatasets();
    // console.time('msx');
    var obj = await internal.exportDatasetsToPack(datasets, opts);
    // console.timeEnd('msx')
    obj.gui = getGuiState(gui);
    return obj;
  }

  // TODO: capture gui state information to allow restoring more of the UI
  function getGuiState(gui) {
    return null;
  }

  async function fetchIndex() {
    var index = await idb.get('msx_index');
    return index || {snapshots: []};
  }

  async function updateIndex(action) {
    return idb.update('msx_index', function(index) {
      if (!index || !Array.isArray(index.snapshots)) {
        index = {snapshots: []};
      }
      action(index);
      return index;
    });
  }

  async function addToIndex(obj) {
    updateSessionData();
    return updateIndex(function(index) {
      index.snapshots.push(obj);
    });
  }

  async function removeMissingSnapshots() {
    var keys = await idb.keys();
    return updateIndex(function(index) {
      index.snapshots = index.snapshots.filter(function(snap) {
        return keys.includes(snap.id);
      });
    });
  }

  async function initialCleanup() {
    // (Safari workaround) remove any lingering data from past sessions
    if (getSessionData().length === 0) {
      await idb.clear();
    }
    // remove any snapshots that are not indexed
    var keys = await idb.keys();
    var indexedIds = (await fetchIndex()).snapshots.map(function(snap) {return snap.id;});
    keys.forEach(function(key) {
      if (isSnapshotId(key) && !indexedIds.includes(key)) {
        idb.del(key);
      }
    });
    // remove old indexed snapshots
    await updateIndex(function(index) {
      index.snapshots = index.snapshots.filter(function(snap) {
        var msPerDay = 1000 * 60 * 60 * 24;
        var daysOld = (Date.now() - snap.created) / msPerDay;
        if (daysOld > 1) {
          if (keys.includes(snap.id)) idb.del(snap.id);
          return false;
        }
        return true;
      });
      return index;
    });
  }

  async function getAvailableStorage() {
    var bytes;
    try {
      var estimate = await navigator.storage.estimate();
      bytes = (estimate.quota - estimate.usage);
    } catch(e) {
      return null;
    }
    var str = (bytes / 1e6).toFixed(1) + 'MB';
    if (str.length > 7) {
      str = (bytes / 1e9).toFixed(1) + 'GB';
    }
    if (str.length > 7) {
      str = (bytes / 1e12).toFixed(1) + 'TB';
    }
    if (parseFloat(str) >= 10) {
      str = str.replace(/\../, '');
    }
    return str;
  }

  function findTargetLayer(datasets) {
    var target;
    datasets.forEach(function(dataset) {
      var lyr = dataset.layers.find(function(lyr) { return !!lyr.active; });
      if (lyr) {
        target = {dataset: dataset, layers: [lyr]};
      }
    });
    if (!target) {
      target = {dataset: datasets[0], layers: [datasets[0].layers[0]]};
    }
    return target;
  }

  // Clean up snapshot data (called just before browser tab is closed)
  async function finalCleanup() {
    // When called on 'beforeunload', idb.clear() seems to complete
    // before tab is unloaded in Chrome and Firefox, but not in Safari.
    // Calling idb.del(key) to selectively delete data for the current session
    // does not seem to complete in any browser.
    // So we wait until the last open session is ending at this URL, and delete
    // data for all recently open sessions.
    //
    var sessions = getSessionData().filter(function(item) {
      // remove current session
      var daysOld = (Date.now() - item.timestamp) / (1000 * 60 * 60 * 24);
      if (item.session == sessionId) return false;
      // also remove any lingering old sessions (ordinarily this shouldn't be needed)
      if (daysOld > 1) return false;
      return true;
    });
    setSessionData(sessions);
    if (sessions.length === 0) {
      await idb.clear();
    }
  }

  function updateSessionData() {
    // make sure the current session is added to the list of open sessions
    var sessions = getSessionData();
    if (sessions.find(o => o.session == sessionId)) return;
    var entry = {
      session: sessionId,
      timestamp: Date.now()
    };
    setSessionData(sessions.concat([entry]));
  }

  function getSessionData() {
    var data = JSON.parse(window.localStorage.getItem('session_data'));
    return data || [];
  }

  function setSessionData(arr) {
    window.localStorage.setItem('session_data', JSON.stringify(arr));
  }

  async function isStorageEnabled() {
    try {
      setSessionData(getSessionData());
      await updateIndex(function() {});
      return true;
    } catch(e) {
      return false;
    }
  }

  function openAddLayerPopup(gui) {
    var popup = showPopupAlert('', 'Add empty layer');
    var el = popup.container();
    el.addClass('option-menu');
    var html = `<div><input type="text" class="layer-name text-input" placeholder="layer name"></div>
  <div style="margin: 2px 0 4px;">
    Type: &nbsp;
    <label><input type="radio" name="geomtype" checked value="point" class="radio">point</label> &nbsp;
    <label><input type="radio" name="geomtype" value="polygon" class="radio">polygon</label> &nbsp;
    <label><input type="radio" name="geomtype" value="polyline" class="radio">line</label>
  </div>
  <div tabindex="0" class="btn dialog-btn">Create</div></span>`;
    el.html(html);
    var name = el.findChild('.layer-name');
    name.node().focus();
    var btn = el.findChild('.btn').on('click', function() {
      var nameStr = name.node().value.trim();
      var type = el.findChild('input:checked').node().value;
      addEmptyLayer(gui, nameStr, type);
      popup.close();
    });
  }

  function addEmptyLayer(gui, name, type) {
    var targ = gui.model.getActiveLayer();
    var crsInfo = targ && internal.getDatasetCrsInfo(targ.dataset);
    var dataset = {
      layers: [{
        name: name || undefined,
        geometry_type: type,
        shapes: []
      }],
      info: {}
    };
    if (type == 'polygon' || type == 'polyline') {
      dataset.arcs = new internal.ArcCollection();
    }
    if (crsInfo) {
      internal.setDatasetCrsInfo(dataset, crsInfo);
    }
    gui.model.addDataset(dataset);
    gui.model.updated({select: true});
  }

  async function considerReprojecting(gui, dataset, opts) {
    var mapCRS = gui.map.getActiveLayerCRS();
    var dataCRS = internal.getDatasetCRS(dataset);
    if (!dataCRS || !mapCRS || internal.crsAreEqual(mapCRS, dataCRS)) return;
    var msg = `The input file ${dataset?.info?.input_files[0] || ''} has a different projection from the current selected layer. Would you like to reproject it to match?`;
    var reproject = await showPrompt(msg, 'Reproject file?');
    if (reproject) {
      internal.projectDataset(dataset, dataCRS, mapCRS, {densify: true});
    }
  }

  // @cb function(<FileList>)
  function DropControl(gui, el, cb) {
    var area = El(el);
    // blocking drag events enables drop event
    area.on('dragleave', block)
        .on('dragover', block)
        .on('drop', ondrop)
        .on('paste', onpaste);
    area.node().addEventListener('paste', onpaste);
    function ondrop(e) {
      block(e);
      cb(e.dataTransfer.files);
    }
    function onpaste(e) {
      var types = Array.from(e.clipboardData.types || []).join(',');
      var items = Array.from(e.clipboardData.items || []);
      var files;
      if (GUI.textIsSelected()) {
        // user is probably pasting text into an editable text field
        return;
      }
      block(e);
      // Browser compatibility (tested on MacOS only):
      // Chrome and Safari: full support
      // FF: supports pasting JSON and CSV from the clipboard but not files.
      //     Single files of all types are pasted as a string and an image/png
      //     Multiple files are pasted as a string containing a list of file names

      // import text from the clipboard (could be csv, json, etc)
      // formatted text can be available as both text/plain and text/html (e.g.
      //   a JSON data object copied from a GitHub issue).
      //
      if (types.includes('text/plain')) {
      // if (types == 'text/plain') {
        // text from clipboard (supported by Chrome, FF, Safari)
        // TODO: handle FF case of string containing multiple file names.
        files = [pastedTextToFile(e.clipboardData.getData('text/plain'))];
      } else {
        files = items.map(function(item) {
          return item.kind == 'file' && !item.type.includes('image') ?
            item.getAsFile() : null;
        });
      }
      files = files.filter(Boolean);
      if (files.length) {
        cb(files);
      } else {
        gui.alert('Pasted content could not be imported.');
      }
    }
    function block(e) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function pastedTextToFile(str) {
    var type = internal.guessInputContentType(str);
    var name;
    if (type == 'text') {
      name = 'pasted.txt';
    } else if (type == 'json') {
      name = 'pasted.json';
    } else {
      return null;
    }
    var blob = new Blob([str]);
    return new File([blob], name);
  }

  // @el DOM element for select button
  // @cb function(<FileList>)
  function FileChooser(el, cb) {
    var btn = El(el).on('click', function() {
      input.el.click();
    });
    var input = El('form')
      .addClass('file-control').appendTo('body')
      .newChild('input')
      .attr('type', 'file')
      .attr('multiple', 'multiple')
      .on('change', onchange);

    async function onchange(e) {
      var files = e.target.files;
      // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
      if (files) {
        // disable the button while files are being processed
        btn.addClass('selected');
        input.attr('disabled', true);
        await cb(files);
        btn.removeClass('selected');
        input.attr('disabled', null);
      }
    }
  }

  function ImportControl(gui, opts) {
    var model = gui.model;
    var initialImport = true;
    var importCount = 0;
    var importTotal = 0;
    var useQuickView = false;
    var queuedFiles = [];
    var manifestFiles = opts.files || [];
    var catalog;

    if (opts.catalog) {
      catalog = new CatalogControl(gui, opts.catalog, downloadFiles);
    }

    var submitBtn = new SimpleButton('#import-options .submit-btn').on('click', importQueuedFiles);
    new SimpleButton('#import-options .cancel-btn').on('click', gui.clearMode);
    new DropControl(gui, 'body', receiveFilesWithOption);
    new FileChooser('#import-options .add-btn', receiveFilesWithOption);
    new FileChooser('#add-file-btn', receiveFiles);
    new SimpleButton('#add-empty-btn').on('click', function() {
      gui.clearMode(); // close import dialog
      openAddLayerPopup(gui);
    });
    // initDropArea('#import-quick-drop', true);
    // initDropArea('#import-drop');
    gui.keyboard.onMenuSubmit(El('#import-options'), importQueuedFiles);

    gui.addMode('import', turnOn, turnOff);
    gui.enterMode('import');

    function turnOn() {
      if (manifestFiles.length > 0) {
        downloadFiles(manifestFiles, true);
        manifestFiles = [];
      } else if (model.isEmpty()) {
        showImportMenu();
      }
    }

    function turnOff() {
      var target;
      if (catalog) catalog.reset(); // re-enable clickable catalog
      if (importCount > 0) {
        onImportComplete();
        importTotal += importCount;
        importCount = 0;
      }
      gui.clearProgressMessage();
      initialImport = false; // unset 'quick view' mode, if on
      clearQueuedFiles();
      hideImportMenu();
    }

    async function importQueuedFiles() {
      // gui.container.removeClass('queued-files');
      hideImportMenu();
      var files = queuedFiles;
      try {
        if (files.length > 0) {
          queuedFiles = [];
          await importFiles(files, readImportOpts());
        }
      } catch(e) {
        console.log(e);
        gui.alert(e.message, 'Import error');
      }
      if (gui.getMode() == 'import') {
        // Mode could also be 'alert' if an error is thrown and handled
        gui.clearMode();
      }
    }



    function onImportComplete() {
      // display last layer of last imported dataset
      // target = model.getDefaultTargets()[0];
      // model.selectLayer(target.layers[target.layers.length-1], target.dataset);
      if (opts.target && importTotal === 0) {
        var target = model.findCommandTargets(opts.target)[0];
        if (target) {
          model.setDefaultTarget([target.layers[0]], target.dataset);
        }
      }
      if (opts.display_all && importTotal === 0) {
        model.getLayers().forEach(function(o) {
          setLayerPinning(o.layer, true);
        });
      }
      model.updated({select: true}); // trigger redraw
    }

    function clearQueuedFiles() {
      queuedFiles = [];
      gui.container.removeClass('queued-files');
      gui.container.findChild('.dropped-file-list').empty();
    }

    function addFilesToQueue(files) {
      var index = {};
      queuedFiles = queuedFiles.concat(files).reduce(function(memo, f) {
        // filter out unreadable types and dupes
        if (internal.looksLikeContentFile(f.name) && f.name in index === false) {
          index[f.name] = true;
          memo.push(f);
        }
        return memo;
      }, []);
    }


    function showQueuedFiles() {
      var list = gui.container.findChild('.dropped-file-list').empty();
      queuedFiles.forEach(function(f) {
        var html = '<span>' + f.name + '</span><img class="close-btn" draggable="false" src="images/close.png">';
        var entry = El('<div>').html(html);
        entry.appendTo(list);
        // init delete button
        GUI.onClick(entry.findChild('img.close-btn'), function(e) {
          e.stopPropagation();
          queuedFiles = queuedFiles.filter(function(item) {
            return item != f;
          });
          if (queuedFiles.length > 0) {
            showQueuedFiles();
          } else {
            gui.clearMode();
          }
        });
      });
      submitBtn.classed('disabled', queuedFiles.length === 0);
    }

    function receiveFilesWithOption(files) {
      var quickView = !El('.advanced-import-options').node().checked;
      receiveFiles(files, quickView);
    }

    async function receiveFiles(files, quickView) {
      var names = getFileNames(files);
      var expanded = [];
      if (files.length === 0) return;
      useQuickView = importTotal === 0 && (opts.quick_view ||
          quickView);
      try {
        expanded = await expandFiles(files);
      } catch(e) {
        console.log(e);
        gui.alert(e.message, 'Import error');
        return;
      }
      addFilesToQueue(expanded);
      if (queuedFiles.length === 0) {
        var msg = `Unable to import data from: ${names.join(', ')}`;
        gui.alert(msg, 'Import error');
        return;
      }
      gui.enterMode('import');
      if (useQuickView) {
        await importQueuedFiles();
      } else {
        showImportMenu();
      }
    }

    function showImportMenu() {
      // gui.container.addClass('queued-files');
      El('#import-options').show();
      gui.container.classed('queued-files', queuedFiles.length > 0);
      El('#path-import-options').classed('hidden', !filesMayContainPaths(queuedFiles));
      showQueuedFiles();
    }

    function hideImportMenu() {
      // gui.container.removeClass('queued-files');
      El('#import-options').hide();
    }

    function getFileNames(files) {
      return Array.from(files).map(function(f) {return f.name;});
    }

    async function expandFiles(files) {
      var expanded = [], tmp;
      await wait(35); // pause a beat so status message can display
      for (var f of files) {
        var data = await readFileData(f);
        if (internal.isGzipFile(f.name)) {
          tmp = await readGzipFile(data);
        } else if (internal.isZipFile(f.name)) {
          tmp = await readZipFile(data);
        } else if (internal.isKmzFile(f.name)) {
          tmp = await readKmzFile(data);
        } else {
          tmp = [data];
        }
        expanded = expanded.concat(tmp);
      }
      files.length = 0; // clear source array for gc (works?)
      return expanded;
    }

    async function importFiles(fileData, importOpts) {
      var groups = groupFilesForImport(fileData, importOpts);
      var optStr = GUI.formatCommandOptions(importOpts);
      fileData = null;
      for (var group of groups) {
        if (group.size > 4e7) {
          gui.showProgressMessage('Importing');
          await wait(35);
        }
        if (group[internal.PACKAGE_EXT]) {
          await importSessionData(group[internal.PACKAGE_EXT].content, gui);
        } else if (await importDataset(group, importOpts)) {
          importCount++;
          gui.session.fileImported(group.filename, optStr);
        }
      }
    }

    async function importDataset(group, importOpts) {
      var dataset = internal.importContent(group, importOpts);
      if (datasetIsEmpty(dataset)) return false;
      if (group.layername) {
        dataset.layers.forEach(lyr => lyr.name = group.layername);
      }
      // TODO: add popup here
      // save import options for use by repair control, etc.
      dataset.info.import_options = importOpts;
      try {
        await considerReprojecting(gui, dataset, importOpts);
      } catch(e) {
        gui.alert(e.message, 'Projection error');
        return false;
      }
      model.addDataset(dataset);
      return true;
    }



    function filesMayContainPaths(files) {
      return utils$1.some(files, function(f) {
          var type = internal.guessInputFileType(f.name);
          return type == 'shp' || type == 'json' || internal.isZipFile(f.name);
      });
    }

    function datasetIsEmpty(dataset) {
      return dataset.layers.every(function(lyr) {
        return internal.getFeatureCount(lyr) === 0;
      });
    }

    function isShapefilePart(name) {
      return /\.(shp|shx|dbf|prj|cpg)$/i.test(name);
    }

    function readImportOpts() {
      var importOpts;
      if (useQuickView) {
        importOpts = {}; // default opts using quickview
      } else {
        var freeform = El('#import-options .advanced-options').node().value;
        importOpts = GUI.parseFreeformOptions(freeform, 'i');
      }
      return importOpts;
    }

    // @file a File object
    async function readContentFileAsync(file, cb) {
      var reader = new FileReader();
      reader.addEventListener('loadend', function(e) {
        if (!reader.result) {
          cb(new Error());
        } else {
          cb(null, reader.result);
        }
      });
      if (internal.isImportableAsBinary(file.name)) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file, 'UTF-8');
      }
    }

    function prepFilesForDownload(names) {
      var items = names.map(function(name) {
        var isUrl = /:\/\//.test(name);
        var item = {name: name};
        if (isUrl) {
          item.url = name;
          item.basename = GUI.getUrlFilename(name);

        } else {
          item.basename = name;
          // Assume non-urls are local files loaded via gui-gui
          item.url = '/data/' + name;
          item.url = item.url.replace('/../', '/~/'); // kludge to allow accessing one parent
        }
        // return GUI.isReadableFileType(item.basename) ? item : null;
        return internal.looksLikeImportableFile(item.basename) ? item : null;
      });
      return items.filter(Boolean);
    }

    function downloadFiles(paths) {
      var items = prepFilesForDownload(paths);
      utils$1.reduceAsync(items, [], downloadNextFile, function(err, files) {
        if (err) {
          gui.alert(err);
        } else if (!files.length) {
          gui.clearMode();
        } else {
          receiveFiles(files);
        }
      });
    }

    function downloadNextFile(memo, item, next) {
      var err;
      fetch(item.url).then(resp => {
        if (resp.status != 200) {
          // e.g. 404 because a URL listed in the GUI query string does not exist
          throw Error();
        }
        return resp.blob();
      }).then(blob => {
        if (blob) {
          blob.name = item.basename;
          memo.push(blob);
        }
      }).catch(e => {
        err = "Error&nbsp;loading&nbsp;" + item.name + ". Possible causes include: wrong URL, no network connection, server not configured for cross-domain sharing (CORS).";
      }).finally(() => {
        next(err, memo);
      });
    }

    function wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function readKmzFile(file) {
      var files = await readZipFile(file);
      var name = files[0] && files[0].name;
      if (name == 'doc.kml') {
        files[0].name = internal.replaceFileExtension(file.name, 'kml');
      }
      return files;
    }

    async function readGzipFile(file) {
      var name = file.name.replace(/\.gz$/, '');
      await wait(35); // pause a beat so status message can display
      return [{
        name: name,
        content: internal.gunzipSync(file.content, name)
      }];
    }

    async function readZipFile(file) {
      // Async is up to twice as fast unzipping large files
      // var index = internal.unzipSync(file.content);
      var index = await utils$1.promisify(internal.unzipAsync)(file.content);
      return Object.keys(index).reduce(function(memo, filename) {
        if (!/\.txt$/i.test(filename)) {
          memo.push({
            name: filename,
            content: index[filename]
          });
        }
        return memo;
      }, []);
    }

    function fileSize(data) {
      return data.content.byteLength || data.content.length; // ArrayBuffer or string
    }

    function fileType(data) {
      return internal.guessInputType(data.name, data.content);
    }

    function key(basename, type) {
      return basename + '.' + type;
    }

    function fileBase(data) {
      return internal.getFileBase(data.name).toLowerCase();
    }

    function fileKey(data) {
      return key(fileBase(data), fileType(data));
    }

    async function readFileData(file) {
      try {
        var content = await utils$1.promisify(readContentFileAsync)(file);
        return {
          content: content,
          name: file.name
        };
      } catch (e) {
        console.error(e);
        throw Error(`Browser was unable to load the file ${file.name}`);
      }
    }

    function groupFilesForImport(data, importOpts) {
      var names = importOpts.name ? [importOpts.name] : null;
      if (initialImport && opts.name) { // name from mapshaper-gui --name option
        names = opts.name.split(',');
      }

      function hasShp(basename) {
        var shpKey = key(basename, 'shp');
        return data.some(d => fileKey(d) == shpKey);
      }

      data.forEach(d => {
        var basename = fileBase(d);
        var type = fileType(d);
        if (type == 'shp' || !isShapefilePart(d.name)) {
          d.group = key(basename, type);
          d.filename = d.name;
        } else if (hasShp(basename)) {
          d.group = key(basename, 'shp');
        } else if (type == 'dbf') {
          d.filename = d.name;
          d.group = key(basename, 'dbf');
        } else {
          // shapefile part without a .shp file
          d.group = null;
        }
      });
      var index = {};
      var groups = [];
      data.forEach(d => {
        if (!d.group) return;
        var g = index[d.group];
        if (!g) {
          g = {};
          g.layername = names ? names[groups.length] || names[names.length - 1] : null;
          groups.push(g);
          index[d.group] = g;
        }
        g.size = (g.size || 0) + fileSize(d); // accumulate size
        g[fileType(d)] = {
          filename: d.name,
          content: d.content
        };
        // kludge: stash import name for session history
        if (d.filename) g.filename = d.filename;
      });
      return groups;
    }
  }

  function draggable(ref) {
    var xdown, ydown;
    var el = El(ref),
        dragging = false,
        obj = new EventDispatcher();
    undraggable(el.node());
    el.on('mousedown', function(e) {
      xdown = e.pageX;
      ydown = e.pageY;
      window.addEventListener('mousemove', onmove);
      window.addEventListener('mouseup', onrelease);
    });

    function onrelease(e) {
      window.removeEventListener('mousemove', onmove);
      window.removeEventListener('mouseup', onrelease);
      if (dragging) {
        dragging = false;
        obj.dispatchEvent('dragend');
      }
    }

    function onmove(e) {
      if (!dragging) {
        dragging = true;
        obj.dispatchEvent('dragstart');
      }
      obj.dispatchEvent('drag', {dx: e.pageX - xdown, dy: e.pageY - ydown});
    }
    return obj;
  }

  function Slider(ref, opts) {
    var _self = this;
    var defaults = {
      space: 7
    };
    opts = utils$1.extend(defaults, opts);

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
            setHandlePos(startX + e.dx);
          })
          .on('dragstart', function(e) {
            startX = position();
            _self.dispatchEvent('start');
          })
          .on('dragend', function(e) {
            _self.dispatchEvent('end');
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

    function setHandlePos(x) {
      x = utils$1.clamp(x, 0, size());
      var pct = x / size();
      if (pct != _pct) {
        _pct = pct;
        _handle.css('left', _handleLeft + x);
        _self.dispatchEvent('change', {pct: _pct});
      }
    }

    function updateHandlePos() {
      var x = _handleLeft + Math.round(position());
      if (_handle) _handle.css('left', x);
    }
  }

  utils$1.inherit(Slider, EventDispatcher);

  // replace default error, stop and message functions
  function setLoggingForGUI(gui) {
    function stop() {
      // Show a popup error message, then throw an error
      var msg = GUI.formatMessageArgs(arguments);
      gui.alert(msg);
      throw new internal.UserError(msg);
    }

    function error() {
      var msg = GUI.formatMessageArgs(arguments);
      console.error(msg);
      gui.alert('An unknown error occured');
      throw new Error(msg);
    }

    function message() {
      var msg = GUI.formatMessageArgs(arguments);
      gui.message(msg);
      internal.logArgs(arguments);
    }

    // GUI warning uses the alert popup, which replaces previous popup
    // (unlike message) -- this allows for catching and handling errors
    // by replacing the error popup with a warning.
    function warn() {
      gui.alert(GUI.formatMessageArgs(arguments));
    }

    internal.setLoggingFunctions(message, error, stop, warn);
  }

  function WriteFilesProxy(gui) {
    // replace CLI version of writeFiles()
    internal.replaceWriteFiles(async function(files, opts) {
      var filename;
      if (!utils$1.isArray(files) || files.length === 0) {
        throw Error("Nothing to export");
      } else if (GUI.canSaveToServer() && !opts.save_to_download_folder) {
        var paths = internal.getOutputPaths(utils$1.pluck(files, 'filename'), opts);
        var data = utils$1.pluck(files, 'content');
        var msg;
        try {
          await utils$1.promisify(saveFilesToServer)(paths, data);
          if (files.length >= 1) {
            gui.alert('<b>Saved</b><br>' + paths.join('<br>'));
          }
        } catch(err) {
          msg = "<b>Direct save failed</b><br>Reason: " + err.message + ".";
          msg += "<br>Saving to download folder instead.";
          gui.alert(msg);
          // fall back to standard method if saving to server fails
          await internal.writeFiles(files, {save_to_download_folder: true});
        }
      } else if (files.length == 1) {
        await utils$1.promisify(saveBlobToLocalFile)(files[0].filename, new Blob([files[0].content]));
      } else {
        filename = internal.getCommonFileBase(utils$1.pluck(files, 'filename')) || "output";
        await utils$1.promisify(saveZipFile)(filename + ".zip", files);
      }
    });
  }

  // Replaces functions for reading from files with functions that try to match
  // already-loaded datasets.
  //
  function ImportFileProxy(gui) {
    var model = gui.model;

    // Try to match an imported dataset or layer.
    // TODO: think about handling import options
    function find(src) {
      var datasets = model.getDatasets();
      var retn = datasets.reduce(function(memo, d) {
        var lyr;
        if (memo) return memo; // already found a match
        // try to match import filename of this dataset
        if (d.info.input_files[0] == src) return d;
        // try to match name of a layer in this dataset
        lyr = utils$1.find(d.layers, function(lyr) {return lyr.name == src;});
        return lyr ? internal.isolateLayer(lyr, d) : null;
      }, null);
      if (!retn) stop$1("Missing data layer [" + src + "]");
      return retn;
    }

    internal.replaceImportFile(function(src, opts) {
      var dataset = find(src);
      // Return a copy with layers duplicated, so changes won't affect original layers
      // This makes an (unsafe) assumption that the dataset arcs won't be changed...
      // need to rethink this.
      return utils$1.defaults({
        layers: dataset.layers.map(internal.copyLayer)
      }, dataset);
    });
  }

  internal.setProjectionLoader(loadProjLibs);

  // load Proj.4 CRS definition files dynamically
  //
  async function loadProjLibs(opts) {
    var mproj = require('mproj');
    var libs = internal.findProjLibs([opts.init || '', opts.match || '', opts.crs || ''].join(' '));
    libs = libs.filter(function(name) {return !mproj.internal.mproj_search_libcache(name);}); // skip loaded libs
    for (var libName of libs) {
      var content = await fetch('assets/' + libName).then(resp => resp.ok ? resp.text() : null);
      if (!content) stop$1(`Unable to load projection resource [${libName}]`);
      mproj.internal.mproj_insert_libcache(libName, content);
    }
  }

  function getDatasetCrsInfo(dataset) {
    var revertLogging = internal.getLoggingSetter();
    var crs, err;
    // prevent GUI message popup on error
    internal.setLoggingForCLI();
    try {
      if (!dataset || internal.datasetIsEmpty(dataset) && !dataset.info?.crs) {
        crs = internal.parseCrsString('wgs84');
      } else {
        crs = internal.getDatasetCRS(dataset);
      }
    } catch(e) {
      err = e.message;
    }
    revertLogging();
    return {
      crs: crs,
      error: err
    };
  }

  // p1: [x, y] coords
  // p2: [x, y] coords offset by 1x1 pixel
  function formatCoordsForDisplay(p1, p2) {
    var dx = Math.abs(p1[0] - p2[0]);
    var dy = Math.abs(p1[1] - p2[1]);
    var offs = (dx + dy) / 2;
    var decimals = 0;
    while (offs < 1 && decimals < 6) {
      offs *= 10;
      decimals++;
    }
    return [p1[0].toFixed(decimals), p1[1].toFixed(decimals)];
  }

  // Convert a point from display CRS coordinates to data coordinates.
  // These are only different when using dynamic reprojection (basemap view).
  function translateDisplayPoint(lyr, p) {
    return isProjectedLayer(lyr) ? lyr.gui.invertPoint(p[0], p[1]) : p;
  }

  function isProjectedLayer(lyr) {
    return !!lyr?.gui.invertPoint;
  }

  var darkStroke = "#334",
      lightStroke = "#b7d9ea",
      violet = "#cc6acc",
      violetFill = "rgba(249, 120, 249, 0.20)",
      gold = "#efc100",
      black = "black",
      grey = "#888",
      selectionFill = "rgba(237, 214, 0, 0.12)",
      hoverFill = "rgba(255, 120, 255, 0.12)",
      activeStyle = { // outline style for the active layer
        type: 'outline',
        strokeColors: [lightStroke, darkStroke],
        strokeWidth: 0.8,
        dotColor: "#223",
        dotSize: 1
      },
      activeStyleDarkMode = {
        type: 'outline',
        strokeColors: [lightStroke, 'white'],
        strokeWidth: 0.9,
        dotColor: 'white',
        dotSize: 1
      },
      activeStyleForLabels = {
        dotColor: "rgba(250, 0, 250, 0.45)", // violet dot with transparency
        dotSize: 1
      },
      referenceStyle = { // outline style for reference layers
        type: 'outline',
        strokeColors: [null, '#78c110'], // upped saturation from #86c927
        strokeWidth: 0.85,
        dotColor: "#73ba20",
        dotSize: 1
      },
      intersectionStyle = {
        dotColor: "#F24400",
        dotSize: 1
      },
      hoverStyles = {
        polygon: {
          fillColor: hoverFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: violet, // black,
          dotSize: 2.5
        }, polyline: {
          strokeColor: black,
          strokeWidth: 2.5,
        }
      },
      unselectedHoverStyles = {
        polygon: {
          fillColor: 'rgba(0,0,0,0)',
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: black, // grey,
          dotSize: 2
        }, polyline:  {
          strokeColor: black, // grey,
          strokeWidth: 2.5
        }
      },
      selectionStyles = {
        polygon: {
          fillColor: hoverFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: violet, // black,
          dotSize: 1.5
        }, polyline:  {
          strokeColor: violet, //  black,
          strokeWidth: 2.5
        }
      },
      // not used
      selectionHoverStyles = {
        polygon: {
          fillColor: selectionFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: black,
          dotSize: 1.5
        }, polyline:  {
          strokeColor: black,
          strokeWidth: 2
        }
      },
      pinnedStyles = {
        polygon: {
          fillColor: violetFill,
          strokeColor: violet,
          strokeWidth: 1.8
        }, point:  {
          dotColor: violet,
          dotSize: 3
        }, polyline:  {
          strokeColor: violet, // black, // violet,
          strokeWidth: 3
        }
      };

  function getIntersectionStyle(lyr, opts) {
    return getDefaultStyle(lyr, intersectionStyle);
  }

  // Style for unselected layers with visibility turned on
  // (styled layers have)
  function getReferenceLayerStyle(lyr, opts) {
    var style;
    if (layerHasCanvasDisplayStyle(lyr) && !opts.outlineMode) {
      style = getCanvasDisplayStyle(lyr);
    } else if (internal.layerHasLabels(lyr) && !opts.outlineMode) {
      style = {dotSize: 0}; // no reference dots if labels are visible
    } else {
      style = getDefaultStyle(lyr, referenceStyle);
    }
    return style;
  }

  function getActiveLayerStyle(lyr, opts) {
    var style;
    if (layerHasCanvasDisplayStyle(lyr) && !opts.outlineMode) {
      style = getCanvasDisplayStyle(lyr);
    } else if (internal.layerHasLabels(lyr) && !opts.outlineMode) {
      style = getDefaultStyle(lyr, activeStyleForLabels);
    } else if (opts.darkMode) {
      style = getDefaultStyle(lyr, activeStyleDarkMode);
    } else {
      style = getDefaultStyle(lyr, activeStyle);
    }
    return style;
  }

  // Returns a display style for the overlay layer.
  // The overlay layer renders several kinds of feature, each of which is displayed
  // with a different style.
  //
  // * hover shapes
  // * selected shapes
  // * pinned shapes
  //
  function getOverlayStyle(baseLyr, o, opts) {
    if (opts.interactionMode == 'vertices') {
      return getVertexStyle(baseLyr, o);
    }
    if (opts.interactionMode == 'edit_lines' ||
        opts.interactionMode == 'edit_polygons') {
      return getLineEditingStyle(o);
    }
    var geomType = baseLyr.geometry_type;
    var topId = o.id; // pinned id (if pinned) or hover id
    var topIdx = -1;
    var styler = function(style, i) {
      var defaultStyle = i === topIdx ? topStyle : outlineStyle;
      if (baseStyle.styler) {
        // TODO: render default stroke widths without scaling
        // (will need to pass symbol scale to the styler function)
        style.strokeWidth = defaultStyle.strokeWidth;
        baseStyle.styler(style, i); // get styled stroke width (if set)
        style.strokeColor = defaultStyle.strokeColor;
        style.fillColor = defaultStyle.fillColor;
      } else {
        Object.assign(style, defaultStyle);
      }
    };
    var baseStyle = getActiveLayerStyle(baseLyr, opts);
    var outlineStyle = getDefaultStyle(baseLyr, selectionStyles[geomType]);
    var topStyle;
    var ids = o.ids.filter(function(i) {
      return i != o.id; // move selected id to the end
    });
    if (o.id > -1) { // pinned or hover style
      topStyle = getSelectedFeatureStyle(baseLyr, o, opts);
      topIdx = ids.length;
      ids.push(o.id); // put the pinned/hover feature last in the render order
    }
    var style = {
      baseStyle: baseStyle,
      styler,
      ids,
      overlay: true
    };

    if (layerHasCanvasDisplayStyle(baseLyr) && !opts.outlineMode) {
      if (geomType == 'point') {
        style.styler = getOverlayPointStyler(getCanvasDisplayStyle(baseLyr).styler, styler);
      }
      style.type = 'styled';
    }
    return ids.length > 0 ? style : null;
  }


  function getDefaultStyle(lyr, baseStyle) {
    return Object.assign({}, baseStyle);
  }


  // style for vertex edit mode
  function getVertexStyle(lyr, o) {
    return {
      ids: o.ids,
      overlay: true,
      strokeColor: black,
      strokeWidth: 1.5,
      vertices: true,
      vertex_overlay: o.hit_coordinates || null,
      selected_points: o.selected_points || null,
      fillColor: null
    };
  }

  // style for vertex edit mode
  function getLineEditingStyle(o) {
    return {
      ids: o.ids,
      overlay: true,
      strokeColor: 'black',
      strokeWidth: 1.2,
      vertices: true,
      vertex_overlay_color: o.hit_type == 'vertex' ? violet : black,
      vertex_overlay_scale: o.hit_type == 'vertex' ? 2.5 : 2,
      vertex_overlay: o.hit_coordinates || null,
      selected_points: o.selected_points || null,
      fillColor: null
    };
  }


  function getSelectedFeatureStyle(lyr, o, opts) {
    var isPinned = o.pinned;
    var inSelection = o.ids.indexOf(o.id) > -1;
    var geomType = lyr.geometry_type;
    var style;
    if (isPinned && opts.interactionMode == 'rectangles') {
      // kludge for rectangle editing mode
      style = selectionStyles[geomType];
    } else if (isPinned) {
      // a feature is pinned
      style = pinnedStyles[geomType];
    } else if (inSelection) {
      // normal hover, or hover id is in the selection set
      style = hoverStyles[geomType];
    } else {
      // features are selected, but hover id is not in the selection set
      style = unselectedHoverStyles[geomType];
    }
    return getDefaultStyle(lyr, style);
  }

  // Modify style to use scaled circle instead of dot symbol
  function getOverlayPointStyler(baseStyler, overlayStyler) {
    return function(obj, i) {
      var dotColor;
      var id = obj.ids ? obj.ids[i] : -1;
      obj.strokeWidth = 0; // kludge to support setting minimum stroke width
      baseStyler(obj, id);
      if (overlayStyler) {
        overlayStyler(obj, i);
      }
      dotColor = obj.dotColor;
      if (obj.radius && dotColor) {
        obj.radius += 0.4;
        // delete obj.fillColor; // only show outline
        obj.fillColor = dotColor; // comment out to only highlight stroke
        obj.strokeColor = dotColor;
        obj.strokeWidth = Math.max(obj.strokeWidth + 0.8, 1.5);
        obj.opacity = 1;
      }
    };
  }

  function getCanvasDisplayStyle(lyr) {
    var styleIndex = {
          opacity: 'opacity',
          r: 'radius',
          'fill': 'fillColor',
          'fill-pattern': 'fillPattern',
          'fill-effect': 'fillEffect',
          'fill-opacity': 'fillOpacity',
          'stroke': 'strokeColor',
          'stroke-width': 'strokeWidth',
          'stroke-dasharray': 'lineDash',
          'stroke-opacity': 'strokeOpacity',
          'stroke-linecap': 'lineCap',
          'stroke-linejoin': 'lineJoin',
          'stroke-miterlimit': 'miterLimit'
        },
        // array of field names of relevant svg display properties
        fields = getCanvasStyleFields(lyr).filter(function(f) {return f in styleIndex;}),
        records = lyr.data.getRecords();
    var styler = function(style, i) {
      var rec = records[i];
      var fname, val;
      for (var j=0; j<fields.length; j++) {
        fname = fields[j];
        val = rec && rec[fname];
        if (val == 'none') {
          val = 'transparent'; // canvas equivalent of CSS 'none'
        }
        // convert svg property name to mapshaper style equivalent
        style[styleIndex[fname]] = val;
      }

      if (style.strokeWidth && !style.strokeColor) {
        style.strokeColor = 'black';
      }
      if (!('strokeWidth' in style) && style.strokeColor) {
        style.strokeWidth = 1;
      }
      if (style.radius > 0 && !style.strokeWidth && !style.fillColor && lyr.geometry_type == 'point') {
        style.fillColor = 'black';
      }
    };
    return {styler: styler, type: 'styled'};
  }

  // check if layer should be displayed with styles
  function layerHasCanvasDisplayStyle(lyr) {
    var fields = getCanvasStyleFields(lyr);
    if (lyr.geometry_type == 'point') {
      return fields.indexOf('r') > -1; // require 'r' field for point symbols
    }
    return utils$1.difference(fields, ['opacity', 'class']).length > 0;
  }


  function getCanvasStyleFields(lyr) {
    var fields = lyr.data ? lyr.data.getFields() : [];
    return internal.findPropertiesBySymbolGeom(fields, lyr.geometry_type);
  }

  // Create low-detail versions of large arc collections for faster rendering
  // at zoomed-out scales.
  function enhanceArcCollectionForDisplay(unfilteredArcs) {
    var size = unfilteredArcs.getPointCount(),
        filteredArcs, filteredSegLen;

    // Only generate low-detail arcs for larger datasets
    if (size > 5e5) {
      update();
    }

    function update() {
      if (unfilteredArcs.getVertexData().zz) {
        // Use precalculated simplification data for vertex filtering, if available
        filteredArcs = initFilteredArcs(unfilteredArcs);
        filteredSegLen = internal.getAvgSegment(filteredArcs);
      } else {
        // Use fast simplification as a fallback
        filteredSegLen = internal.getAvgSegment(unfilteredArcs) * 4;
        filteredArcs = internal.simplifyArcsFast(unfilteredArcs, filteredSegLen);
      }
    }

    function initFilteredArcs(arcs) {
      var filterPct = 0.08;
      var nth = Math.ceil(arcs.getPointCount() / 5e5);
      var currInterval = arcs.getRetainedInterval();
      var filterZ = arcs.getThresholdByPct(filterPct, nth);
      var filteredArcs = arcs.setRetainedInterval(filterZ).getFilteredCopy();
      arcs.setRetainedInterval(currInterval); // reset current simplification
      return filteredArcs;
    }

    // TODO: better job of detecting arc change... e.g. revision number
    unfilteredArcs.getScaledArcs = function(ext) {
      // check for changes in the number of arcs (probably due to editing)
      if (filteredArcs && filteredArcs.size() != unfilteredArcs.size()) {
        // arc count has changed... probably due to editing
        update();
        if (filteredArcs.size() != unfilteredArcs.size()) {
          throw Error('Internal error');
        }
      }
      if (filteredArcs) {
        // match simplification of unfiltered arcs
        filteredArcs.setRetainedInterval(unfilteredArcs.getRetainedInterval());
      }
      // switch to filtered version of arcs at small scales
      var unitsPerPixel = 1/ext.getTransform().mx,
          useFiltering = filteredArcs && unitsPerPixel > filteredSegLen * 1.5;
      return useFiltering ? filteredArcs : unfilteredArcs;
    };
  }

  function getDisplayLayerForTable(tableArg) {
    var table = tableArg || new internal.DataTable(0),
        n = table.size(),
        cellWidth = 12,
        cellHeight = 5,
        gutter = 6,
        arcs = [],
        shapes = [],
        aspectRatio = 1.1,
        x, y, col, row, blockSize;

    if (n > 10000) {
      arcs = null;
      gutter = 0;
      cellWidth = 4;
      cellHeight = 4;
      aspectRatio = 1.45;
    } else if (n > 5000) {
      cellWidth = 5;
      gutter = 3;
      aspectRatio = 1.45;
    } else if (n > 1000) {
      gutter = 3;
      cellWidth = 8;
      aspectRatio = 1.3;
    }

    if (n < 25) {
      blockSize = n;
    } else {
      blockSize = Math.sqrt(n * (cellWidth + gutter) / cellHeight / aspectRatio) | 0;
    }

    for (var i=0; i<n; i++) {
      row = i % blockSize;
      col = Math.floor(i / blockSize);
      x = col * (cellWidth + gutter);
      y = cellHeight * (blockSize - row);
      if (arcs) {
        arcs.push(getArc(x, y, cellWidth, cellHeight));
        shapes.push([[i]]);
      } else {
        shapes.push([[x, y]]);
      }
    }

    function getArc(x, y, w, h) {
      return [[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]];
    }

    return {
      layer: {
        geometry_type: arcs ? 'polygon' : 'point',
        shapes: shapes,
        data: table
      },
      arcs: arcs ? new internal.ArcCollection(arcs) : null
    };
  }

  var R = 6378137;
  var D2R = Math.PI / 180;
  var R2D = 180 / Math.PI;

  // Assumes projections are available

  function needReprojectionForDisplay(sourceCRS, displayCRS) {
    if (!sourceCRS || !displayCRS) {
      return false;
    }
    if (internal.crsAreEqual(sourceCRS, displayCRS)) {
      return false;
    }
    return true;
  }

  // bbox in wgs84 coords
  // dest: CRS, which may also be wgs84
  function projectLatLonBBox(bbox, dest) {
    if (!dest || internal.isWGS84(dest)) {
      return bbox.concat();
    }
    var proj = internal.getProjTransform2(internal.parseCrsString('wgs84'), dest);
    var bbox2 = proj(bbox[0], bbox[1]).concat(proj(bbox[2], bbox[3]));
    return bbox2;
  }

  function projectArcsForDisplay(arcs, src, dest) {
    var copy = arcs.getCopy(); // need to flatten first?
    var destIsWebMerc = internal.isWebMercator(dest);
    if (destIsWebMerc && internal.isWebMercator(src)) {
      return copy;
    }

    var wgs84 = internal.parseCrsString('wgs84');
    var toWGS84 = internal.getProjTransform2(src, wgs84);
    var fromWGS84 = internal.getProjTransform2(wgs84, dest);

    try {
      // first try projectArcs() -- it's fast and preserves arc ids
      // (so vertex editing doesn't break)
      if (!internal.isWGS84(src)) {
        // use wgs84 as a pivot CRS, so we can handle polar coordinates
        // that can't be projected to Mercator
        internal.projectArcs(copy, toWGS84);
      }
      if (destIsWebMerc) {
        // handle polar points by clamping them to they will project
        // (downside: may cause unexpected behavior when editing vertices interactively)
        clampY(copy);
      }
      internal.projectArcs(copy, fromWGS84);
    } catch(e) {
      console.error(e);
      // use the more robust projectArcs2 if projectArcs throws an error
      // downside: projectArcs2 discards Z values and changes arc indexing,
      // which will break vertex editing.
      var reproject = internal.getProjTransform2(src, dest);
      copy = arcs.getCopy();
      internal.projectArcs2(copy, reproject);
    }
    return copy;
  }

  function clampY(arcs) {
    var max = 89.9,
        min = -89.9,
        bbox = arcs.getBounds().toArray();
    if (bbox[1] >= min && bbox[3] <= max) return;
    arcs.transformPoints(function(x, y) {
      if (y > max) return [x, max];
      if (y < min) return [x, min];
    });
  }

  function projectPointsForDisplay(lyr, src, dest) {
    var copy = utils$1.extend({}, lyr);
    var proj = internal.getProjTransform2(src, dest);
    copy.shapes = internal.cloneShapes(lyr.shapes);
    internal.projectPointLayer(copy, proj);
    return copy;
  }


  function toWebMercator(lng, lat) {
    var k = Math.cos(lat * D2R);
    var x = R * lng * D2R;
    var y = R * Math.log(Math.tan(Math.PI * 0.25 + lat * D2R * 0.5));
    return [x, y];
  }

  function fromWebMercator(x, y) {
    var lon = x / R * R2D;
    var lat = R2D * (Math.PI * 0.5 - 2 * Math.atan(Math.exp(-y / R)));
    return [lon, lat];
  }

  function scaleToZoom(metersPerPix) {
    return Math.log(40075017 / 512 / metersPerPix) / Math.log(2);
  }

  function getMapboxBounds() {
    var ymax = toWebMercator(0, 84)[1];
    var ymin = toWebMercator(0, -84)[1];
    return [-Infinity, ymin, Infinity, ymax];
  }


  // Update map extent and trigger redraw, after a new display CRS has been applied
  function projectMapExtent(ext, src, dest, newBounds) {
    var oldBounds = ext.getBounds();
    var oldScale = ext.scale();
    var newCP, proj, strictBounds;

    if (dest && internal.isWebMercator(dest)) {
      // clampToMapboxBounds(newBounds);
      strictBounds = getMapboxBounds();
    }

    // if source or destination CRS is unknown, show full extent
    // if map is at full extent, show full extent
    // TODO: handle case that scale is 1 and map is panned away from center
    if (ext.scale() == 1 || !dest) {
      ext.setFullBounds(newBounds, strictBounds);
      ext.reset();
    } else {
      // if map is zoomed, stay centered on the same geographic location, at the same relative scale
      proj = internal.getProjTransform2(src, dest);
      newCP = proj(oldBounds.centerX(), oldBounds.centerY());
      ext.setFullBounds(newBounds, strictBounds);
      if (!newCP) {
        // projection of center point failed; use center of bounds
        // (also consider just resetting the view using ext.home())
        newCP = [newBounds.centerX(), newBounds.centerY()];
      }
      ext.recenter(newCP[0], newCP[1], oldScale);
    }
    // trigger full redraw, in case some SVG symbols are unprojectable
    ext.dispatchEvent('change', {redraw: true});
  }

  // Called from console; for testing dynamic crs
  function setDisplayProjection(gui, cmd) {
    var arg = cmd.replace(/^projd[ ]*/, '');
    if (arg) {
      gui.map.setDisplayCRS(internal.parseCrsString(arg));
    } else {
      gui.map.setDisplayCRS(null);
    }
  }

  // lyr: a map layer with gui property
  // displayCRS: CRS to use for display, or null (which clears any current display CRS)
  function projectLayerForDisplay(lyr, displayCRS) {
    var crsInfo = getDatasetCrsInfo(lyr.gui.source.dataset);
    var sourceCRS = crsInfo.crs || null; // let enhanceLayerForDisplay() handle null case
    if (!lyr.gui.geographic) {
      return;
    }
    if (lyr.gui.dynamic_crs && internal.crsAreEqual(sourceCRS, lyr.gui.dynamic_crs)) {
      return;
    }
    var gui = lyr.gui;
    enhanceLayerForDisplay(lyr, lyr.gui.source.dataset, {crs: displayCRS});
    utils$1.defaults(lyr.gui, gui); // re-apply any properties that were lost (e.g. svg_id)
    if (lyr.gui.style?.ids) {
      // re-apply layer filter
      lyr.gui.displayLayer = filterLayerByIds(lyr.gui.displayLayer, lyr.gui.style.ids);
    }
  }


  // Supplement a layer with information needed for rendering
  function enhanceLayerForDisplay(layer, dataset, opts) {
    var gui = {
      empty: internal.getFeatureCount(layer) === 0,
      geographic: false,
      displayArcs: null,
      displayLayer: null,
      source: {dataset},
      bounds: null,
      style: null,
      dynamic_crs: null,
      invertPoint: null,
      projectPoint: null
    };

    var displayCRS = opts.crs || null;
    // display arcs may have been generated when another layer in the dataset
    // was converted for display... re-use if available
    var displayArcs = dataset.gui?.displayArcs;
    var unprojectable = false;
    var sourceCRS;
    var emptyArcs;

    if (displayCRS && layer.geometry_type) {
      var crsInfo = getDatasetCrsInfo(dataset);
      if (crsInfo.error) {
        // unprojectable dataset -- return empty layer
        gui.unprojectable = true;
      } else {
        sourceCRS = crsInfo.crs;
      }
    }

    // make sure that every path layer has an associated arc collection
    // (if the layer is empty, its dataset may not have an arc collection).
    // this enables adding shapes using the drawing tools.
    if (!dataset.arcs && (layer.geometry_type == 'polygon' || layer.geometry_type == 'polyline')) {
      dataset.arcs = new internal.ArcCollection();
    }

    // Assume that dataset.displayArcs is in the display CRS
    // (it must be deleted upstream if reprojection is needed)
    // if (!obj.empty && dataset.arcs && !displayArcs) {
    if (dataset.arcs && !displayArcs && !gui.unprojectable) {
      // project arcs, if needed
      if (needReprojectionForDisplay(sourceCRS, displayCRS)) {
        displayArcs = projectArcsForDisplay(dataset.arcs, sourceCRS, displayCRS);
      } else {
        // Use original arcs for display if there is no dynamic reprojection
        displayArcs = dataset.arcs;
      }

      enhanceArcCollectionForDisplay(displayArcs);
      dataset.gui = {displayArcs}; // stash these in the dataset for other layers to use
    }

    if (internal.layerHasFurniture(layer)) {
      // TODO: consider how to render furniture in GUI
      // treating furniture layers (other than frame) as tabular for now,
      // so there is something to show if they are selected
    }

    if (gui.unprojectable) {
      gui.displayLayer = {shapes: []}; // TODO: improve
    } else if (layer.geometry_type) {
      gui.geographic = true;
      gui.displayLayer = layer;
      gui.displayArcs = displayArcs;
    } else {
      var table = getDisplayLayerForTable(layer.data);
      gui.tabular = true;
      gui.displayLayer = table.layer;
      gui.displayArcs = table.arcs;
    }

    // dynamic reprojection (arcs were already reprojected above)
    if (gui.geographic && needReprojectionForDisplay(sourceCRS, displayCRS)) {
      gui.dynamic_crs = displayCRS;
      gui.invertPoint = internal.getProjTransform2(displayCRS, sourceCRS);
      gui.projectPoint = internal.getProjTransform2(sourceCRS, displayCRS);
      if (internal.layerHasPoints(layer)) {
        gui.displayLayer = projectPointsForDisplay(layer, sourceCRS, displayCRS);
      } else if (internal.layerHasPaths(layer)) {
        emptyArcs = findEmptyArcs(displayArcs);
        if (emptyArcs.length > 0) {
          // Don't try to draw paths containing coordinates that failed to project
          gui.displayLayer = internal.filterPathLayerByArcIds(gui.displayLayer, emptyArcs);
        }
      }
    }

    gui.bounds = getDisplayBounds(gui.displayLayer, gui.displayArcs);
    layer.gui = gui;
  }

  function getDisplayBounds(lyr, arcs) {
    var bounds = internal.getLayerBounds(lyr, arcs) || new Bounds();
    if (lyr.geometry_type == 'point' && arcs && bounds.hasBounds() && bounds.area() > 0 === false) {
      // if a point layer has no extent (e.g. contains only a single point),
      // then merge with arc bounds, to place the point in context.
      bounds = bounds.mergeBounds(arcs.getBounds());
    }
    return bounds;
  }

  // Returns an array of ids of empty arcs (arcs can be set to empty if errors occur while projecting them)
  function findEmptyArcs(arcs) {
    var nn = arcs.getVertexData().nn;
    var ids = [];
    for (var i=0, n=nn.length; i<n; i++) {
      if (nn[i] === 0) {
        ids.push(i);
      }
    }
    return ids;
  }

  function flattenArcs(lyr) {
    lyr.gui.source.dataset.arcs.flatten();
    if (isProjectedLayer(lyr)) {
      lyr.gui.displayArcs.flatten();
    }
  }

  // Test if adding point p to a sequence of points (in pixel coords)
  // would result in a polyline that deviates from a straight line by
  // more than a given number of pixels
  //
  function pointExceedsTolerance(p, points, tolerance) {
    if (points.length < 2) return false;
    var p1 = points[0], p2, dist, angle;
    for (var i=1; i<points.length; i++) {
      p2 = points[i];
      dist = Math.sqrt(geom.pointSegDistSq(p2[0], p2[1], p1[0], p1[1], p[0], p[1]));
      if (dist > tolerance) return true;
    }
    return false;
  }

  function getAvgPoint(points) {
    var x=0, y=0;
    for (var i=0; i<points.length; i++) {
      x += points[i][0];
      y += points[i][1];
    }
    return [x/points.length, y/points.length];
  }

  function setZ(lyr, z) {
    lyr.gui.source.dataset.arcs.setRetainedInterval(z);
    if (isProjectedLayer(lyr)) {
      lyr.gui.displayArcs.setRetainedInterval(z);
    }
  }

  function updateZ(lyr) {
    if (isProjectedLayer(lyr) && !lyr.gui.source.dataset.arcs.isFlat()) {
      lyr.gui.displayArcs.setThresholds(lyr.gui.source.dataset.arcs.getVertexData().zz);
    }
  }

  function appendNewDataRecord(layer) {
    if (!layer.data) return null;
    var fields = layer.data.getFields();
    var d = getEmptyDataRecord(layer.data);
    // TODO: handle SVG symbol layer
    if (internal.layerHasLabels(layer)) {
      d['label-text'] = 'TBD'; // without text, new labels will be invisible
    } else if (layer.geometry_type == 'point' && fields.includes('r')) {
      d.r = 3; // show a black circle if layer is styled
    }
    if (layer.geometry_type == 'polyline' || layer.geometry_type == 'polygon') {
      if (fields.includes('stroke')) d.stroke = 'black';
      if (fields.includes('stroke-width')) d['stroke-width'] = 1;
    }
    if (layer.geometry_type == 'polygon') {
      if (fields.includes('fill')) {
        d.fill = 'rgba(0,0,0,0.10)'; // 'rgba(249,120,249,0.20)';
      }
    }
    // TODO: better styling
    layer.data.getRecords().push(d);
    return d;
  }

  function getEmptyDataRecord(table) {
    return table.getFields().reduce(function(memo, name) {
      memo[name] = null;
      return memo;
    }, {});
  }

  // p1, p2: two points in source data CRS coords.
  function appendNewPath(lyr, p1, p2) {
    var arcId = lyr.gui.displayArcs.size();
    internal.appendEmptyArc(lyr.gui.displayArcs);
    lyr.shapes.push([[arcId]]);
    if (isProjectedLayer(lyr)) {
      internal.appendEmptyArc(lyr.gui.source.dataset.arcs);
    }
    appendVertex$1(lyr, p1);
    appendVertex$1(lyr, p2);
    appendNewDataRecord(lyr);
  }

  function deleteLastPath(lyr) {
    var arcId = lyr.gui.displayArcs.size() - 1;
    if (lyr.data) {
      lyr.data.getRecords().pop();
    }
    var shp = lyr.shapes.pop();
    internal.deleteLastArc(lyr.gui.displayArcs);
    if (isProjectedLayer(lyr)) {
      internal.deleteLastArc(lyr.gui.source.dataset.arcs);
    }
  }

  // p: one point in source data coords
  function appendNewPoint(lyr, p) {
    lyr.shapes.push([p]);
    if (lyr.data) {
      appendNewDataRecord(lyr);
    }
    // this reprojects all the points... TODO: improve
    if (isProjectedLayer(lyr)) {
      projectLayerForDisplay(lyr, lyr.gui.dynamic_crs);
    }
  }

  function deleteFeature(lyr, fid) {
    var records = lyr.data?.getRecords();
    if (records) records.splice(fid, 1);
    lyr.shapes.splice(fid, 1);
    if (isProjectedLayer(lyr) && lyr.geometry_type == 'point') {
      lyr.gui.displayLayer.shapes.splice(fid, 1); // point layer
    }
  }

  function insertFeature(lyr, fid, shp, d) {
    var records = lyr.data?.getRecords();
    if (records) records.splice(fid, 0, d);
    lyr.shapes.splice(fid, 0, shp);
    if (isProjectedLayer(lyr) && lyr.geometry_type == 'point') {
      var shp2 = projectPointCoords(shp, lyr.gui.projectPoint);
      lyr.gui.displayLayer.shapes.splice(fid, 0, shp2);
    }
  }

  function deleteLastPoint(lyr) {
    if (lyr.data) {
      lyr.data.getRecords().pop();
    }
    lyr.shapes.pop();
    if (isProjectedLayer(lyr)) {
      lyr.gui.displayLayer.shapes.pop();
    }
  }

  // p: point in source data CRS coords.
  function insertVertex$1(lyr, id, p) {
    internal.insertVertex(lyr.gui.source.dataset.arcs, id, p);
    if (isProjectedLayer(lyr)) {
      internal.insertVertex(lyr.gui.displayArcs, id, lyr.gui.projectPoint(p[0], p[1]));
    }
  }

  function appendVertex$1(lyr, p) {
    var n = lyr.gui.source.dataset.arcs.getPointCount();
    insertVertex$1(lyr, n, p);
  }

  // TODO: make sure we're not also removing an entire arc
  function deleteLastVertex(lyr) {
    deleteVertex$1(lyr, lyr.gui.displayArcs.getPointCount() - 1);
  }


  function deleteVertex$1(lyr, id) {
    internal.deleteVertex(lyr.gui.displayArcs, id);
    if (isProjectedLayer(lyr)) {
      internal.deleteVertex(lyr.gui.source.dataset.arcs, id);
    }
  }

  function getLastArcCoords(target) {
    var arcId = target.gui.source.dataset.arcs.size() - 1;
    return internal.getUnfilteredArcCoords(arcId, target.gui.source.dataset.arcs);
  }

  function getLastVertexCoords(target) {
    var arcs = target.gui.source.dataset.arcs;
    return internal.getVertexCoords(arcs.getPointCount() - 1, arcs);
  }

  function getLastArcLength(target) {
    var arcId = target.gui.source.dataset.arcs.size() - 1;
    return internal.getUnfilteredArcLength(arcId, target.gui.source.dataset.arcs);
  }

  function getVertexCoords(lyr, id) {
    return lyr.gui.source.dataset.arcs.getVertex2(id);
  }

  // set data coords (not display coords) of one or more vertices.
  function setVertexCoords(lyr, ids, dataPoint) {
    internal.snapVerticesToPoint(ids, dataPoint, lyr.gui.source.dataset.arcs);
    if (isProjectedLayer(lyr)) {
      var p = lyr.gui.projectPoint(dataPoint[0], dataPoint[1]);
      internal.snapVerticesToPoint(ids, p, lyr.gui.displayArcs);
    }
  }

  function updateVertexCoords(lyr, ids) {
    if (!isProjectedLayer(lyr)) return;
    var p = lyr.gui.displayArcs.getVertex2(ids[0]);
    internal.snapVerticesToPoint(ids, lyr.gui.invertPoint(p[0], p[1]), lyr.gui.source.dataset.arcs);
  }

  function setRectangleCoords(lyr, ids, coords) {
    ids.forEach(function(id, i) {
      var p = coords[i];
      internal.snapVerticesToPoint([id], p, lyr.gui.source.dataset.arcs);
      if (isProjectedLayer(lyr)) {
        internal.snapVerticesToPoint([id], lyr.gui.projectPoint(p[0], p[1]), lyr.gui.displayArcs);
      }
    });
  }

  // Update source data coordinates by projecting display coordinates
  function updatePointCoords(lyr, fid) {
    if (!isProjectedLayer(lyr)) return;
    var displayShp = lyr.gui.displayLayer.shapes[fid];
    lyr.shapes[fid] = projectPointCoords(displayShp, lyr.gui.invertPoint);
  }

  // coords: [[x, y]] point in data CRS (not display CRS)
  function setPointCoords(lyr, fid, coords) {
    lyr.shapes[fid] = coords;
    if (isProjectedLayer(lyr)) {
      lyr.gui.displayLayer.shapes[fid] = projectPointCoords(coords, lyr.gui.projectPoint);
    }
  }

  // return an [[x, y]] point in data CRS
  function getPointCoords(lyr, fid) {
    var coords = lyr.geometry_type == 'point' && lyr.shapes[fid];
    if (!coords || coords.length != 1) {
      return null;
    }
    return internal.cloneShape(coords);
  }

  // export function getPointCoords(lyr, fid) {
  //   return internal.cloneShape(lyr.shapes[fid]);
  // }

  function projectPointCoords(src, proj) {
    var dest = [], p;
    for (var i=0; i<src.length; i++) {
      p = proj(src[i][0], src[i][1]);
      if (p) dest.push(p);
    }
    return dest.length ? dest : null;
  }

  /*
  How changes in the simplify control should affect other components

  data calculated, 100% simplification
   -> [map] filtered arcs update

  data calculated, <100% simplification
   -> [map] filtered arcs update, redraw; [repair] intersection update

  change via text field
   -> [map] redraw; [repair] intersection update

  slider drag start
   -> [repair] hide display

  slider drag
   -> [map] redraw

  slider drag end
   -> [repair] intersection update

  */

  var SimplifyControl = function(gui) {
    var model = gui.model;
    var control = {};
    var _value = 1;
    var el = gui.container.findChild('.simplify-control-wrapper');
    var menu = gui.container.findChild('.simplify-options');
    var slider, text, fromPct;
    var menuBtn = gui.container.findChild('.simplify-btn').addClass('disabled');

    // init settings menu
    new SimpleButton(menu.findChild('.submit-btn').addClass('default-btn')).on('click', onSubmit);
    new SimpleButton(menu.findChild('.close2-btn')).on('click', function() {
      if (el.visible()) {
        // cancel just hides menu if slider is visible
        menu.hide();
      } else {
        gui.clearMode();
      }
    });
    new SimpleButton(el.findChild('.simplify-settings-btn')).on('click', function() {
      if (menu.visible()) {
        menu.hide();
      } else {
        showMenu();
      }
    });
    gui.keyboard.onMenuSubmit(menu, onSubmit);

    // init simplify button and mode
    gui.addMode('simplify', turnOn, turnOff, menuBtn);

    model.on('update', function(e) {
      // exit simplify mode if data has been changed from outside the simplify
      // tool
      // (TODO: try to only respond to changes that might affect simplification)
      if (e.flags.simplify_method || e.flags.simplify_amount) {
        return;
      }
      menuBtn.classed('disabled', !model.getActiveLayer());
      if (gui.getMode() == 'simplify') gui.clearMode();
    });


    // exit simplify mode when user clicks off the visible part of the menu
    menu.on('click', GUI.handleDirectEvent(gui.clearMode));

    // init slider
    slider = new Slider(el.findChild(".simplify-control .slider"));
    slider.handle(el.findChild(".simplify-control .handle"));
    slider.track(el.findChild(".simplify-control .track"));
    slider.on('change', function(e) {
      var pct = fromSliderPct(e.pct);
      text.value(pct);
      pct = utils$1.parsePercent(text.text()); // use rounded value (for consistency w/ cli)
      onChange(pct);
    });
    slider.on('start', function(e) {
      gui.dispatchEvent('simplify_drag_start'); // trigger intersection control to hide
    }).on('end', function(e) {
      gui.dispatchEvent('simplify_drag_end'); // trigger intersection control to redraw
    });

    // init text box showing simplify pct
    text = new ClickText(el.findChild(".simplify-control .clicktext"));
    text.bounds(0, 1);
    text.formatter(function(val) {
      if (isNaN(val)) return '-';
      var pct = val * 100;
      var decimals = 0;
      if (pct <= 0) decimals = 1;
      else if (pct < 0.001) decimals = 4;
      else if (pct < 0.01) decimals = 3;
      else if (pct < 1) decimals = 2;
      else if (pct < 100) decimals = 1;
      return utils$1.formatNumberForDisplay(pct, decimals) + "%";
    });

    text.parser(function(s) {
      return parseFloat(s) / 100;
    });

    text.value(0);
    text.on('change', function(e) {
      var pct = e.value;
      slider.pct(toSliderPct(pct));
      onChange(pct);
      gui.dispatchEvent('simplify_drag_end'); // (kludge) trigger intersection control to redraw
    });

    control.reset = function() {
      control.value(1);
      el.hide();
      menu.hide();
      gui.container.removeClass('simplify');
    };

    control.value = function(val) {
      if (!isNaN(val)) {
        // TODO: validate
        _value = val;
        slider.pct(toSliderPct(val));
        text.value(val);
      }
      return _value;
    };

    control.value(_value);

    function turnOn() {
      var target = model.getActiveLayer();
      var arcs = target.dataset.arcs;
      if (!internal.layerHasPaths(target.layer)) {
        gui.alert("This layer can not be simplified");
        return;
      }
      if (arcs.getVertexData().zz) {
        // TODO: try to avoid calculating pct (slow);
        showSlider(); // need to show slider before setting; TODO: fix
        fromPct = internal.getThresholdFunction(arcs, false);
        control.value(arcs.getRetainedPct());

      } else {
        showMenu();
      }
    }

    function showMenu() {
      var dataset = model.getActiveLayer().dataset;
      var showPlanarOpt = !dataset.arcs.isPlanar();
      var opts = internal.getStandardSimplifyOpts(dataset, dataset.info && dataset.info.simplify);
      menu.findChild('.planar-opt-wrapper').node().style.display = showPlanarOpt ? 'block' : 'none';
      menu.findChild('.planar-opt').node().checked = !opts.spherical;
      menu.findChild('.import-retain-opt').node().checked = opts.keep_shapes;
      menu.findChild('input[value=' + opts.method + ']').node().checked = true;
      menu.show();
    }

    function turnOff() {
      menu.hide();
      control.reset();
    }

    function onSubmit() {
      var dataset = model.getActiveLayer().dataset;
      var showMsg = dataset.arcs && dataset.arcs.getPointCount() > 1e6;
      var delay = 0;
      if (showMsg) {
        delay = 35;
        gui.showProgressMessage('Calculating');
      }
      menu.hide();
      setTimeout(function() {
        var opts = getSimplifyOptions();
        mapshaper.cmd.simplify(dataset, opts);
        gui.session.simplificationApplied(getSimplifyOptionsAsString());
        updateZ(gui.map.getActiveLayer()); // question: does this update all display layers?
        model.updated({
          // trigger filtered arc rebuild without redraw if pct is 1
          simplify_method: opts.percentage == 1,
          simplify: opts.percentage < 1
        });
        showSlider();
        fromPct = internal.getThresholdFunction(dataset.arcs, false);
        gui.clearProgressMessage();
      }, delay);
    }

    function showSlider() {
      el.show();
      gui.container.addClass('simplify'); // for resizing, hiding layer label, etc.
    }

    function getSimplifyOptions() {
      var method = menu.findChild('input[name=method]:checked').attr('value') || null;
      return {
        method: method,
        percentage: _value,
        no_repair: true,
        keep_shapes: !!menu.findChild('.import-retain-opt').node().checked,
        planar: !!menu.findChild('.planar-opt').node().checked
      };
    }

    function getSimplifyOptionsAsString() {
      var opts = getSimplifyOptions();
      var str = 'percentage=' + opts.percentage;
      if (opts.method == 'visvalingam' || opts.method == 'dp') str += ' ' + opts.method;
      if (opts.no_repair) str += ' no-repair';
      if (opts.keep_shapes) str += ' keep-shapes';
      if (opts.planar) str += ' planar';
      return str;
    }

    function toSliderPct(p) {
      p = Math.sqrt(p);
      var pct = 1 - p;
      return pct;
    }

    function fromSliderPct(p) {
      var pct = 1 - p;
      return pct * pct;
    }

    function onChange(pct) {
      if (_value != pct) {
        _value = pct;
        // model.getActiveLayer().dataset.arcs.setRetainedInterval(fromPct(pct));
        setZ(gui.map.getActiveLayer(), fromPct(pct));
        gui.session.updateSimplificationPct(pct);
        model.updated({'simplify_amount': true});
        updateSliderDisplay();
      }
    }

    function updateSliderDisplay() {
      // TODO: display resolution and vertex count
      // var dataset = model.getActiveLayer().dataset;
      // var interval = dataset.arcs.getRetainedInterval();
    }
  };

  function Console(gui) {
    var model = gui.model;
    var CURSOR = '$ ';
    var PROMPT = 'Enter mapshaper commands or type "tips" for examples and console help';
    var el = gui.container.findChild('.console').hide();
    var content = el.findChild('.console-buffer');
    var log = El('div').appendTo(content);
    var line = El('div').addClass('command-line').appendTo(content);
    var cursor = El('span').appendTo(line).text(CURSOR);
    var input = El('span').appendTo(line)
      .addClass('input-field')
      .attr('spellcheck', false)
      .attr('autocorrect', false)
      .attr('contentEditable', true)
      .on('focus', receiveFocus)
      .on('paste', onPaste);
    var history = [];
    var historyId = 0;
    var _isOpen = false;
    var btn = gui.container.findChild('.console-btn').on('click', toggle);
    var globals = {}; // share user-defined globals between runs

    // expose this function, so other components can run commands (e.g. box tool)
    this.runMapshaperCommands = runMapshaperCommands;

    this.runInitialCommands = function(str) {
      str = str.trim();
      if (!str) return;
      turnOn();
      submit(str);
    };

    consoleMessage(PROMPT);
    gui.keyboard.on('keydown', onKeyDown);
    window.addEventListener('beforeunload', saveHistory); // save history if console is open on refresh

    GUI.onClick(el, function(e) {
      var targ = El(e.target);
      if (targ.hasClass('console-window') || targ.hasClass('command-line')) {
        input.node().focus(); // focus if user clicks blank part of console
      }
    });

    function toggle() {
      if (_isOpen) turnOff();
      else turnOn();
    }

    function getHistory() {
      return GUI.getSavedValue('console_history') || [];
    }

    function saveHistory() {
      history = history.filter(Boolean); // TODO: fix condition that leaves a blank line on the history
      if (history.length > 0) {
        GUI.setSavedValue('console_history', history.slice(-100));
      }
    }

    function toLog(str, cname) {
      var msg = El('div').text(str).appendTo(log);
      if (cname) {
        msg.addClass(cname);
      }
      scrollDown();
    }

    function turnOn() {
      // if (!_isOpen && !model.isEmpty()) {
      if (!_isOpen) {
        btn.addClass('active');
        _isOpen = true;
        // use console for messages while open
        // TODO: find a solution for logging problem when switching between multiple
        // gui instances with the console open. E.g. console could close
        // when an instance loses focus.
        internal.setLoggingFunctions(consoleMessage, consoleError, consoleStop);
        gui.container.addClass('console-open');
        el.show();
        gui.dispatchEvent('resize');
        input.node().focus();
        history = getHistory();
      }
    }

    function turnOff() {
      if (_isOpen) {
        btn.removeClass('active');
        _isOpen = false;
        if (GUI.isActiveInstance(gui)) {
          setLoggingForGUI(gui); // reset stop, message and error functions
        }
        el.hide();
        input.node().blur();
        saveHistory();
        gui.container.removeClass('console-open');
        gui.dispatchEvent('resize');
      }
    }

    function onPaste(e) {
      // paste plain text (remove any copied HTML tags)
      e.preventDefault();
      e.stopPropagation(); // don't try to import pasted text as data (see gui-import-control.js)
      var str = (e.originalEvent || e).clipboardData.getData('text/plain');
      document.execCommand("insertHTML", false, str);
    }

    function receiveFocus() {
      placeCursor();
    }

    function placeCursor() {
      var el = input.node();
      var range, selection;
      if (readCommandLine().length > 0) {
        // move cursor to end of text
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); //collapse the range to the end point.
        selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    function scrollDown() {
      var el = content.parent().node();
      el.scrollTop = el.scrollHeight;
    }

    function metaKey(e) {
      return e.metaKey || e.ctrlKey || e.altKey;
    }

    function isTextInput(el) {
      return el && el.type != 'radio' && el.type != 'checkbox';
    }

    function onKeyDown(evt) {
      var e = evt.originalEvent,
          kc = e.keyCode,
          inputEl = GUI.getInputElement(),
          typing = isTextInput(inputEl),
          typingInConsole = inputEl && inputEl == input.node(),
          inputText = readCommandLine(),
          capture = false;

      // esc key
      if (kc == 27) {
        if (typing) {
          inputEl.blur();
        }
        if (gui.getMode()) {
          gui.clearMode(); // esc closes any open panels
        } else {
          turnOff();
        }
        capture = true;

      // l/r arrow keys while not typing in a text field
      } else if ((kc == 37 || kc == 39) && (!typing || typingInConsole && !inputText)) {
        if (kc == 37) {
          model.selectPrevLayer();
        } else {
          model.selectNextLayer();
        }

      // shift key -- don't do anything (need to interoperate with shift-drag box tools)
      } else if (kc == 16) {

      // delete key while not inputting text
      } else if (kc == 8 && !typing) {
        capture = true; // prevent delete from leaving page

      // any key while console is open and not typing in a non-console field
      // TODO: prevent console from blocking <enter> for menus
      } else if (_isOpen && (typingInConsole || !typing)) {
        capture = true;
        // clearMode() causes some of the arrow-button modes to be cancelled,
        // which is irksome...
        // // gui.clearMode(); // close any panels that  might be open
        //
        if (kc == 13) { // enter
          onEnter();
        } else if (kc == 9) { // tab
          tabComplete();
        } else if (kc == 38) {
          back();
        } else if (kc == 40) {
          forward();
        } else if (kc == 32 && (!typing || (inputText === '' && typingInConsole))) {
          // space bar closes if nothing has been typed
          turnOff();
        } else if (!typing && e.target != input.node() && !metaKey(e)) {
          // typing returns focus, unless a meta key is down (to allow Cmd-C copy)
          // or user is typing in a different input area somewhere
          input.node().focus();
          capture = false;
        } else if (/\n\n$/.test(inputText) && e.key && e.key.length == 1) {
          // Convert double newline to single on first typing after \ continuation
          // (for compatibility with Firefox; see onEnter() function)
          // Assumes that cursor is at end of text (TODO: remove this assumption)
          toCommandLine(inputText.substr(0, inputText.length - 1) + e.key);
        } else {
          capture = false; // normal typing
        }

      // various shortcuts (while not typing in an input field or editable el)
      } else if (!typing) {
         if (kc == 32) { // space bar opens console
          capture = true;
          turnOn();
        // } else if (kc == 73) { // letter i opens inspector
        //   gui.dispatchEvent('interaction_toggle');
        } else if (kc == 72) { // letter h resets map extent
          gui.dispatchEvent('map_reset');
        } else if (kc == 13) {
          gui.dispatchEvent('enter_key', evt); // signal for default buttons on any open menus
        }
      }

      if (capture) {
        e.preventDefault();
      }
    }

    function tabComplete() {
      var line = readCommandLine(),
          match = /\w+$/.exec(line),
          stub = match ? match[0] : '',
          names, name;
      if (!stub) return;
      names = getCompletionWords();
      names = names.filter(function(name) {
        return name.indexOf(stub) === 0;
      });
      if (names.length > 0) {
        name = internal.getCommonFileBase(names);
        if (name.length > stub.length) {
          toCommandLine(line.substring(0, match.index) + name);
        }
      }
    }

    // get active layer field names and other layer names
    function getCompletionWords() {
      var lyr = model.getActiveLayer().layer;
      var fieldNames = lyr.data ? lyr.data.getFields() : [];
      var lyrNames = findOtherLayerNames(lyr);
      return fieldNames.concat(lyrNames).concat(fieldNames);
    }

    function findOtherLayerNames(lyr) {
      return model.getLayers().reduce(function(memo, o) {
        var name = o.layer.name;
        if (name && name != lyr.name) {
          memo.push(name);
        }
        return memo;
      }, []);
    }

    function readCommandLine() {
      // return input.node().textContent.trim();
      return input.node().textContent;
    }

    function toCommandLine(str) {
      input.node().textContent = str;
      placeCursor();
    }

    function peekHistory(i) {
      var idx = history.length - 1 - (i || 0);
      return idx >= 0 ? history[idx] : null;
    }

    function toHistory(str) {
      if (historyId > 0) { // if we're back in the history stack
        if (peekHistory() === '') {
          // remove empty string (which may have been appended when user started going back)
          history.pop();
        }
        historyId = 0; // move back to the top of the stack
      }
      if (str && str != peekHistory()) {
        history.push(str);
      }
    }

    function fromHistory() {
      toCommandLine(peekHistory(historyId));
    }

    function back() {
      if (history.length === 0) return;
      if (historyId === 0) {
        history.push(readCommandLine());
      }
      historyId = Math.min(history.length - 1, historyId + 1);
      fromHistory();
    }

    function forward() {
      if (historyId <= 0) return;
      historyId--;
      fromHistory();
      if (historyId === 0) {
        history.pop();
      }
    }

    function clear() {
      log.empty();
      scrollDown();
    }

    function getCommandFlags(commands) {
      return commands.reduce(function(memo, cmd) {
        memo[cmd.name] = true;
        return memo;
      }, {});
    }

    function onEnter() {
      var str = readCommandLine();
      var wrap = /\\\n?$/.test(str); // \n? is to workaround odd Chrome behavior (newline appears after eol backslash)
      if (wrap) {
        toCommandLine(str.trim() + '\n\n'); // two newlines needed in all tested browsers
      } else {
        submit(str);
      }
    }

    // display char codes in string (for debugging console input)
    function strCodes(str) {
      return str.split('').map(function(c) {return c.charCodeAt(0);}).join(',');
    }

    function submit(str) {
      // remove newlines
      // TODO: remove other whitespace at beginning + end of lines
      // var cmd = str.replace(/\\?\n/g, ' ').trim();
      var cmd = str.trim();
      toLog(CURSOR + str);
      toCommandLine('');
      if (cmd) {
        if (cmd == 'clear') {
          clear();
        } else if (cmd == 'tips') {
          printExamples();
        } else if (cmd == 'history') {
          toLog(gui.session.toCommandLineString());
        } else if (cmd == 'layers') {
          message$1("Available layers:",
            internal.getFormattedLayerList(model));
        } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
          turnOff();
        } else if (/^projd/.test(cmd)) {
          // set the display CRS (for testing)
          setDisplayProjection(gui, cmd);
        } else {
          line.hide(); // hide cursor while command is being run
          // quit certain edit modes
          if (!gui.interaction.modeWorksWithConsole(gui.interaction.getMode())) {
            gui.interaction.turnOff();
          }
          runMapshaperCommands(cmd, function(err, flags) {
            if (flags) {
              gui.clearMode();
            }
            if (err) {
              onError(err);
            }
            line.show();
            input.node().focus();
          });
        }
        toHistory(str);
      }
    }

    function runMapshaperCommands(str, done) {
      var commands;
      try {
        commands = internal.parseConsoleCommands(str);
        // don't add info commands to console history
        // (for one thing, they interfere with target resetting)
        commands = internal.runAndRemoveInfoCommands(commands);
      } catch (e) {
        return done(e, {});
      }
      if (commands.length === 0) return done();
      applyParsedCommands(commands, function(err, flags) {
        if (!err) {
          str = internal.standardizeConsoleCommands(str);
          gui.session.consoleCommands(str);
          // kludge to terminate unclosed -if blocks
          if (str.includes('-if') && !str.includes('-endif')) {
            gui.session.consoleCommands('-endif');
          }
        }
        if (flags) {
          model.updated(flags); // info commands do not return flags
        }
        done(err, flags);
      });
    }

    function applyParsedCommands(commands, done) {
      var active = model.getActiveLayer(),
          prevArcs = active?.dataset.arcs,
          prevTable = active?.layer.data,
          prevTableSize = prevTable ? prevTable.size() : 0,
          prevArcCount = prevArcs ? prevArcs.size() : 0,
          job = new internal.Job(model);

      job.defs = globals; // share globals between runs
      internal.runParsedCommands(commands, job, function(err) {
        var flags = getCommandFlags(commands),
            active2 = model.getActiveLayer(),
            postArcs = active2?.dataset.arcs,
            postArcCount = postArcs ? postArcs.size() : 0,
            postTable = active2?.layer.data,
            postTableSize = postTable ? postTable.size() : 0,
            sameTable = prevTable == postTable && prevTableSize == postTableSize,
            sameArcs = prevArcs == postArcs && postArcCount == prevArcCount;

        // kludge to signal map that filtered arcs need refreshing
        // TODO: find a better solution, outside the console
        if (!sameArcs) {
          flags.arc_count = true;
        }
        if (sameTable) {
          flags.same_table = true;
        }
        if (active && active?.layer == active2?.layer) {
          // this can get set after some commands that don't set a new target
          // (e.g. -dissolve)
          flags.select = true;
        }
        // signal the map to update even if an error has occured, because the
        // commands may have partially succeeded and changes may have occured to
        // the data.
        done(err, flags);
      });
    }

    function onError(err) {
      if (utils$1.isString(err)) {
        consoleStop(err);
      } else if (err.name == 'UserError' ) {
        // stop() has already been called, don't need to log
        console.error(err.stack);
      } else if (err.name) {
        console.error(err.stack);
        // log to console window
        consoleWarning(err.message);
      }
    }

    function consoleStop() {
      var msg = GUI.formatMessageArgs(arguments);
      consoleWarning(msg);
      throw new UserError$1(msg);
    }

    function consoleWarning() {
      var msg = GUI.formatMessageArgs(arguments);
      toLog(msg, 'console-error');
    }

    function consoleMessage() {
      var msg = GUI.formatMessageArgs(arguments);
      if (internal.loggingEnabled()) {
        toLog(msg, 'console-message');
      }
    }

    function consoleError() {
      var msg = GUI.formatMessageArgs(arguments);
      throw new Error(msg);
    }

    function printExample(comment, command) {
      toLog(comment, 'console-message');
      toLog(command, 'console-example');
    }

    function printExamples() {
      printExample("See a list of all console commands", "$ help");
      printExample("Get help using a single command", "$ help innerlines");
      printExample("Get information about imported datasets", "$ info");
      printExample("Display browser session as shell commands", "$ history");
      printExample("Delete one state from a national dataset","$ filter 'STATE != \"Alaska\"'");
      printExample("Aggregate counties to states by dissolving shared edges" ,"$ dissolve 'STATE'");
      printExample("Clear the console", "$ clear");
    }

  }

  // Test if map should be re-framed to show updated layer
  function mapNeedsReset(newBounds, prevBounds, viewportBounds, flags) {
    var viewportPct = getIntersectionPct(newBounds, viewportBounds);
    var contentPct = getIntersectionPct(viewportBounds, newBounds);
    var boundsChanged = !prevBounds.equals(newBounds);
    var inView = newBounds.intersects(viewportBounds);
    var areaChg = newBounds.area() / prevBounds.area();
    var chgThreshold = flags.proj ? 1e3 : 1e8;
    // don't reset if layer extent hasn't changed
    if (!boundsChanged) return false;
    // reset if layer is out-of-view
    if (!inView) return true;
    // reset if content is mostly offscreen
    if (viewportPct < 0.3 && contentPct < 0.9) return true;
    // reset if content bounds have changed a lot (e.g. after projection)
    if (areaChg > chgThreshold || areaChg < 1/chgThreshold) return true;
    return false;
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.simplify_method || flags.simplify || flags.proj ||
      flags.arc_count || flags.repair || flags.clip || flags.erase ||
      flags.slice || flags.affine || flags.rectangle || flags.buffer ||
      flags.union || flags.mosaic || flags.snap || flags.clean || flags.drop || false;
  }

  // check for operations that may change the number of self intersections in the
  // target layer.
  function intersectionsMayHaveChanged(flags) {
    return arcsMayHaveChanged(flags) || flags.select || flags['merge-layers'] ||
    flags.filter || flags.dissolve || flags.dissolve2;
  }

  // Test if an update allows hover popup to stay open
  function popupCanStayOpen(flags) {
    // keeping popup open after -drop geometry causes problems...
    // // if (arcsMayHaveChanged(flags)) return false;
    if (arcsMayHaveChanged(flags)) return false;
    if (flags.points || flags.proj) return false;
    if (!flags.same_table) return false;
    return true;
  }

  // Returns proportion of bb2 occupied by bb1
  function getIntersectionPct(bb1, bb2) {
    return getBoundsIntersection(bb1, bb2).area() / bb2.area() || 0;
  }

  function getBoundsIntersection(a, b) {
    var c = new Bounds();
    if (a.intersects(b)) {
      c.setBounds(Math.max(a.xmin, b.xmin), Math.max(a.ymin, b.ymin),
      Math.min(a.xmax, b.xmax), Math.min(a.ymax, b.ymax));
    }
    return c;
  }

  function RepairControl(gui) {
    var map = gui.map,
        model = gui.model,
        el = gui.container.findChild(".intersection-display"),
        readout = el.findChild(".intersection-count"),
        checkBtn = el.findChild(".intersection-check"),
        repairBtn = el.findChild(".repair-btn"),
        _simplifiedXX, // saved simplified intersections, for repair
        _unsimplifiedXX, // saved unsimplified intersection data, for performance
        _disabled = false,
        _on = false;

    el.findChild('.close-btn').on('click', dismissForever);

    gui.on('simplify_drag_start', function() {
      if (intersectionsAreOn()) {
        hide();
      }
    });

    gui.on('simplify_drag_end', function() {
      updateSync('simplify_drag_end');
    });

    checkBtn.on('click', function() {
      checkBtn.hide();
      _on = true;
      updateSync();
    });

    repairBtn.on('click', function() {
      var e = model.getActiveLayer();
      if (!_simplifiedXX || !e.dataset.arcs) return;
      _simplifiedXX = internal.repairIntersections(e.dataset.arcs, _simplifiedXX);
      showIntersections(_simplifiedXX, e.layer, e.dataset.arcs);
      repairBtn.hide();
      model.updated({repair: true});
      gui.session.simplificationRepair();
    });

    model.on('update', function(e) {
      if (!intersectionsAreOn()) {
        reset(); // need this?
        return;
      }
      var needRefresh = e.flags.simplify_method || e.flags.simplify ||
        e.flags.repair || e.flags.clean;
      if (needRefresh) {
        updateAsync();
      } else if (e.flags.simplify_amount) {
        // slider is being dragged - hide readout and dots, retain data
        hide();
      } else if (intersectionsMayHaveChanged(e.flags)) {
        // intersections may have changed -- reset the display
        reset();
      } else {
        // keep displaying the current intersections
      }
    });

    function intersectionsAreOn() {
      return _on && !_disabled;
    }

    function turnOff() {
      hide();
      _on = false;
      _simplifiedXX = null;
      _unsimplifiedXX = null;
    }

    function reset() {
      turnOff();
      if (_disabled) {
        return;
      }
      var e = model.getActiveLayer();
      if (!e) return;
      if (internal.layerHasPaths(e.layer)) {
        el.show();
        checkBtn.show();
        readout.hide();
        repairBtn.hide();
      }
    }

    function dismissForever() {
      _disabled = true;
      turnOff();
    }

    function hide() {
      map.setIntersectionLayer(null);
      el.hide();
    }

    // Update intersection display, after a short delay so map can redraw after previous
    // operation (e.g. simplification change)
    function updateAsync() {
      setTimeout(updateSync, 10);
    }

    function updateSync(action) {
      if (!intersectionsAreOn()) return;
      var e = model.getActiveLayer();
      var arcs = e.dataset && e.dataset.arcs;
      var intersectionOpts = {
        unique: true,
        tolerance: 0
      };
      if (!arcs || !internal.layerHasPaths(e.layer)) {
        return;
      }
      if (arcs.getRetainedInterval() > 0) {
        // simplification
        _simplifiedXX = internal.findSegmentIntersections(arcs, intersectionOpts);
      } else {
        // no simplification
        _simplifiedXX = null; // clear any old simplified XX
        if (_unsimplifiedXX && action == 'simplify_drag_end') {
          // re-use previously generated intersection data (optimization)
        } else {
          _unsimplifiedXX = internal.findSegmentIntersections(arcs, intersectionOpts);
        }
      }
      showIntersections(_simplifiedXX || _unsimplifiedXX, e.layer, arcs);
    }

    function showIntersections(xx, lyr, arcs) {
      var pointLyr, count = 0, html;
      el.show();
      readout.show();
      checkBtn.hide();
      if (xx.length > 0) {
        pointLyr = internal.getIntersectionLayer(xx, lyr, arcs);
        count = internal.countPointsInLayer(pointLyr);
      }
      if (count == 0) {
        map.setIntersectionLayer(null);
        html = '<span class="icon black"></span>No self-intersections';
      } else {
        map.setIntersectionLayer(pointLyr, {layers:[pointLyr]});
        html = utils$1.format('<span class="icon"></span>%s line intersection%s', count, utils$1.pluralSuffix(count));
      }
      readout.html(html);

      if (_simplifiedXX && count > 0) {
        repairBtn.show();
      } else {
        repairBtn.hide();
      }
    }
  }

  utils$1.inherit(RepairControl, EventDispatcher);

  async function saveFileContentToClipboard(content) {
    var str = utils$1.isString(content) ? content : content.toString();
    await navigator.clipboard.writeText(str);
  }

  // Export buttons and their behavior
  var ExportControl = function(gui) {
    var model = gui.model;
    var unsupportedMsg = "Exporting is not supported in this browser";
    var menu = gui.container.findChild('.export-options').on('click', GUI.handleDirectEvent(gui.clearMode));
    var layersArr = [];
    var toggleBtn = null; // checkbox <input> for toggling layer selection
    var exportBtn = gui.container.findChild('.export-btn').addClass('disabled');
    var ofileName = gui.container.findChild('#ofile-name');
    new SimpleButton(menu.findChild('.close2-btn')).on('click', gui.clearMode);

    if (!GUI.exportIsSupported()) {
      exportBtn.on('click', function() {
        gui.alert(unsupportedMsg);
      });

      internal.writeFiles = function() {
        error$1(unsupportedMsg);
      };
      return;
    }

    model.on('update', function() {
      exportBtn.classed('disabled', !model.getActiveLayer());
    });

    new SimpleButton(menu.findChild('#export-btn').addClass('default-btn')).on('click', onExportClick);
    gui.addMode('export', turnOn, turnOff, exportBtn);
    gui.keyboard.onMenuSubmit(menu, onExportClick);
    var savePreferenceCheckbox;
    if (window.showSaveFilePicker) {
      savePreferenceCheckbox = menu.findChild('#save-preference')
        .css('display', 'inline-block')
        .findChild('input')
        .on('change', function() {
          GUI.setSavedValue('choose-save-dir', this.checked);
        })
        .attr('checked', GUI.getSavedValue('choose-save-dir') || null);
    }
    var clipboardCheckbox = menu.findChild('#save-to-clipboard')
      .findChild('input')
      .on('change', function() {
        updateExportCheckboxes();
      });

    function setDisabled(inputEl, flag) {
      if (!inputEl) return;
      inputEl.node().disabled = !!flag;
      inputEl.parent().css({color: flag ? '#bbb' : 'black'});
    }

    function checkboxOn(inputEl) {
      if (!inputEl) return false;
      return inputEl.node().checked && !inputEl.node().disabled;
    }

    function updateExportCheckboxes() {
      // disable cliboard if not usable
      var canUseClipboard = clipboardIsAvailable();
      setDisabled(clipboardCheckbox, !canUseClipboard);

      // disable save to directory checkbox if clipboard is selected
      setDisabled(savePreferenceCheckbox, checkboxOn(clipboardCheckbox));
    }

    function clipboardIsAvailable() {
      var layers = getSelectedLayerEntries();
      var fmt = getSelectedFormat();
      return layers.length == 1 && ['json', 'geojson', 'dsv', 'topojson'].includes(fmt);
    }


    function turnOn() {
      layersArr = initLayerMenu();
      // initZipOption();
      initFormatMenu();
      updateExportCheckboxes();
      menu.show();
    }

    function turnOff() {
      layersArr = [];
      menu.hide();
    }

    function getSelectedLayerEntries() {
      return layersArr.reduce(function(memo, o) {
        return o.checkbox.checked ? memo.concat(o.target) : memo;
      }, []);
    }

    function getExportTargets() {
      return internal.groupLayersByDataset(getSelectedLayerEntries());
    }

    function onExportClick() {
      var targets = getExportTargets();
      if (targets.length === 0) {
        return gui.alert('No layers were selected');
      }
      gui.clearMode();
      gui.showProgressMessage('Exporting');
      setTimeout(function() {
        exportMenuSelection(targets).catch(function(err) {
          if (utils$1.isString(err)) {
            gui.alert(err);
          } else {
            // stack seems to change if Error is logged directly
            console.error(err.stack);
            var msg = 'Export failed for an unknown reason';
            if (err.name == 'UserError') {
              msg = err.message;
            }
            gui.alert(msg, 'Export failed');
          }
        }).finally(function() {
          gui.clearProgressMessage();
        });
      }, 20);
    }

    function getExportOpts() {
      return GUI.parseFreeformOptions(getExportOptsAsString(), 'o');
    }

    function getExportOptsAsString() {
      var freeform = menu.findChild('.advanced-options').node().value;
      if (/format=/.test(freeform) === false) {
        freeform += ' format=' + getSelectedFormat();
      }
      if (getZipOption()) {
        freeform += ' zip';
      }
      return freeform.trim();
    }

    // done: function(string|Error|null)
    async function exportMenuSelection(targets) {
      // note: command line "target" option gets ignored
      var opts = getExportOpts();
      opts.active_layer = gui.model.getActiveLayer().layer; // kludge to support restoring active layer in gui
      var files = await internal.exportTargetLayers(model, targets, opts);
      gui.session.layersExported(getTargetLayerIds(), getExportOptsAsString());
      if (files.length == 1 && checkboxOn(clipboardCheckbox)) {
        await saveFileContentToClipboard(files[0].content);
      } else {
        await internal.writeFiles(files, opts);
      }
    }

    function initLayerItem(o, i) {
      var template = '<input type="checkbox" value="%s" checked> <span class="layer-name dot-underline-black">%s</span>';
      var target = {
        dataset: o.dataset,
        // shallow-copy layer, so it can be renamed in the export dialog
        // without changing its name elsewhere
        layer: Object.assign({}, o.layer)
      };
      var html = utils$1.format(template, i + 1, target.layer.name || '[unnamed layer]');
      // return {layer: o.layer, html: html};
      var el = El('div').html(html).addClass('layer-item');
      var box = el.findChild('input').node();
      box.addEventListener('click', updateToggleBtn);

      new ClickText2(el.findChild('.layer-name'))
        .on('change', function(e) {
          var str = cleanLayerName(this.value());
          this.value(formatLayerNameForDisplay(str));
          target.layer.name = str;
          // gui.session.layerRenamed(target.layer, str);
        });


      return {
        target: target,
        el: el,
        checkbox: box
      };
    }

    function initSelectAll() {
      var toggleHtml = '<label><input type="checkbox" value="toggle" checked> Select All</label>';
      var el = El('div').html(toggleHtml);
      var btn = el.findChild('input').node();
      toggleBtn = btn;

      btn.addEventListener('click', function() {
        var state = getSelectionState();
        if (state == 'all') {
          setLayerSelection(false);
        } else {
          setLayerSelection(true);
        }
        updateToggleBtn();
      });
      return el;
    }

    function initLayerMenu() {
      var list = menu.findChild('.export-layer-list').empty();
      var layers = model.getLayers();
      sortLayersForMenuDisplay(layers);

      if (layers.length > 2) {
        // add select all toggle
        list.appendChild(initSelectAll());
      }

      // add layers to menu
      var objects = layers.map(function(target, i) {
        var o = initLayerItem(target, i);
        list.appendChild(o.el);
        return o;
      });

      // hide checkbox if only one layer
      if (layers.length < 2) {
        menu.findChild('.export-layers input').css('display', 'none');
      }

      // update menu title
      gui.container.findChild('.export-layers .menu-title').html(layers.length == 1 ? 'Layer name' : 'Layers');

      return objects;
    }

    function setLayerSelection(checked) {
      layersArr.forEach(function(o) {
        o.checkbox.checked = !!checked;
      });
    }

    function updateToggleBtn() {
      updateExportCheckboxes(); // checkbox visibility is affected by number of export layers
      if (!toggleBtn) return;
      var state = getSelectionState();
      // style of intermediate checkbox state doesn't look right in Chrome --
      // removing intermediate state, only using checked and unchecked states
      if (state == 'all') {
        toggleBtn.checked = true;
      } else if (state == 'some') {
        toggleBtn.checked = false;
      } else {
        toggleBtn.checked = false;
      }
    }

    function getSelectionState() {
      var count = getTargetLayerIds().length;
      if (count == layersArr.length) return 'all';
      if (count === 0) return 'none';
      return 'some';
    }

    function getDefaultExportFormat() {
      var dataset = model.getActiveLayer().dataset;
      var inputFmt = dataset.info && dataset.info.input_formats &&
          dataset.info.input_formats[0];
      return getExportFormats().includes(inputFmt) ? inputFmt : 'geojson';
    }

    function getExportFormats() {
      // return ['shapefile', 'geojson', 'topojson', 'json', 'dsv', 'kml', 'svg', internal.PACKAGE_EXT];
      return ['shapefile', 'json', 'geojson', 'dsv', 'topojson', 'kml', internal.PACKAGE_EXT, 'svg'];
    }

    function initFormatMenu() {
      var formats = getExportFormats();
      // var formats = utils.uniq(getExportFormats().concat(getInputFormats()));
      var items = formats.map(function(fmt) {
        return utils$1.format('<td><label><input type="radio" name="format" value="%s"' +
          ' class="radio">%s</label></td>', fmt, internal.getFormatName(fmt));
      });
      var table = '<table>';
      for (var i=0; i<items.length; i+=2) {
        table += '<tr>' + items[i] + items[i+1] + '<tr>';
      }
      table += '</table>';

      // menu.findChild('.export-formats').html(items.join('\n'));
      menu.findChild('.export-formats').html(table);
      menu.findChild('.export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
      // update save-as settings when value changes
      menu.findChildren('input[type="radio"]').forEach(el => {
        el.on('change', updateExportCheckboxes);
      });
    }


    // function getInputFormats() {
    //   return model.getDatasets().reduce(function(memo, d) {
    //     var fmts = d.info && d.info.input_formats || [];
    //     return memo.concat(fmts);
    //   }, []);
    // }


    function initZipOption() {
      var html = `<label><input type="checkbox">Save to .zip file</label>`;
      menu.findChild('.export-zip-option').html(html);
    }

    function getSelectedFormat() {
      return menu.findChild('.export-formats input:checked').node().value;
    }

    function getZipOption() {
      return !!menu.findChild('.export-zip-option input:checked');
    }

    function getTargetLayerIds() {
      return layersArr.reduce(function(memo, o, i) {
        if (o.checkbox.checked) memo.push(o.checkbox.value);
        return memo;
      }, []);
    }

  };

  function DomCache() {
    var cache = {};
    var used = {};

    this.contains = function(html) {
      return html in cache;
    };

    this.use = function(html) {
      var el = used[html] = cache[html];
      return el;
    };

    this.cleanup = function() {
      cache = used;
      used = {};
    };

    this.add = function(html, el) {
      used[html] = el;
    };
  }

  var openMenu;

  document.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('contextmenu-item')) {
      return; // don't close menu if clicking on a menu link
    }
    closeOpenMenu();
  });

  function closeOpenMenu() {
    if (openMenu) {
      openMenu.close();
      openMenu = null;
    }
  }

  function openContextMenu(e, lyr, parent) {
    var menu = new ContextMenu(parent);
    closeOpenMenu();
    menu.open(e, lyr);
  }

  function ContextMenu(parentArg) {
    var body = document.querySelector('body');
    var parent = parentArg || body;
    // var menu = El('div').addClass('contextmenu rollover').appendTo(body);
    var menu = El('div').addClass('contextmenu rollover').appendTo(parent);
    var _open = false;
    var _openCount = 0;

    this.isOpen = function() {
      return _open;
    };

    this.close = close;

    function close() {
      var count = _openCount;
      if (!_open) return;
      setTimeout(function() {
        if (count == _openCount) {
          menu.hide();
          _open = false;
        }
      }, 200);
    }

    function addMenuItem(label, func, prefixArg) {
      var prefix = prefixArg === undefined ? '• &nbsp;' : prefixArg;
      var item = El('div')
        .appendTo(menu)
        .addClass('contextmenu-item')
        .html(prefix + label)
        .show();

      GUI.onClick(item, function(e) {
        func();
        closeOpenMenu();
      });
    }

    function addMenuLabel(label) {
      El('div')
        .appendTo(menu)
        .addClass('contextmenu-label')
        .html(label);
    }

    this.open = function(e, lyr) {
      var copyable = e.ids?.length;
      if (_open) close();
      menu.empty();

      if (openMenu && openMenu != this) {
        openMenu.close();
      }
      openMenu = this;

      if (e.deleteLayer) {
       addMenuItem('delete layer', e.deleteLayer, '');
      }
      if (e.selectLayer) {
       addMenuItem('select layer', e.selectLayer, '');
      }

      if (lyr && lyr.gui.geographic) {
        if (e.deleteVertex || e.deletePoint || copyable || e.deleteFeature) {

          addMenuLabel('selection');
          if (e.deleteVertex) {
            addMenuItem('delete vertex', e.deleteVertex);
          }
          if (e.deletePoint) {
            addMenuItem('delete point', e.deletePoint);
          }
          if (e.ids?.length) {
            addMenuItem('copy as GeoJSON', copyGeoJSON);
          }
          if (e.deleteFeature) {
            addMenuItem(getDeleteLabel(), e.deleteFeature);
          }
        }

        if (e.lonlat_coordinates) {
          addMenuLabel('longitude, latitude');
          addCoords(e.lonlat_coordinates);
        }
        if (e.projected_coordinates) {
          addMenuLabel('x, y');
          addCoords(e.projected_coordinates);
        }
      }

      if (menu.node().childNodes.length === 0) {
        return;
      }

      var rspace = body.clientWidth - e.pageX;
      var offs = getParentOffset();
      var xoffs = 10;
      if (rspace > 150) {
        menu.css('left', e.pageX - offs.left + xoffs + 'px');
        menu.css('right', null);
      } else {
        menu.css('right', (body.clientWidth - e.pageX - offs.left + xoffs) + 'px');
        menu.css('left', null);
      }
      menu.css('top', (e.pageY - offs.top - 15) + 'px');
      menu.show();

      _open = true;
      _openCount++;

      function getParentOffset() { // crossbrowser version
        if (parent == body) {
          return {top: 0, left: 0};
        }

        var box = parent.getBoundingClientRect();
        var docEl = document.documentElement;

        var scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop;
        var scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft;

        var clientTop = docEl.clientTop || body.clientTop || 0;
        var clientLeft = docEl.clientLeft || body.clientLeft || 0;

        var top  = box.top +  scrollTop - clientTop;
        var left = box.left + scrollLeft - clientLeft;

        return { top: Math.round(top), left: Math.round(left) };
      }

      function getDeleteLabel() {
        return 'delete ' + (lyr.geometry_type == 'point' ? 'point' : 'shape');
      }

      function addCoords(p) {
        var coordStr = p[0] + ',' + p[1];
        // var displayStr = '• &nbsp;' + coordStr.replace(/-/g, '–').replace(',', ', ');
        var displayStr = coordStr.replace(/-/g, '–').replace(',', ', ');
        addMenuItem(displayStr, function() {
          saveFileContentToClipboard(coordStr);
        });
      }

      function copyGeoJSON() {
        var opts = {
          no_replace: true,
          ids: e.ids,
          quiet: true
        };
        var dataset = lyr.gui.source.dataset;
        var layer = mapshaper.cmd.filterFeatures(lyr, dataset.arcs, opts);
        // the drawing tool can send open paths with 'polygon' geometry type,
        // should be changed to 'polyline'
        if (layer.geometry_type == 'polygon' && layerHasOpenPaths(layer, dataset.arcs)) {
          layer.geometry_type = 'polyline';
        }
        var features = internal.exportLayerAsGeoJSON(layer, dataset, {rfc7946: true, prettify: true}, true, 'string');
        var str = internal.geojson.formatCollection({"type": "FeatureCollection"}, features);
        saveFileContentToClipboard(str);
      }
    };
  }


  function layerHasOpenPaths(layer, arcs) {
    var retn = false;
    internal.editShapes(layer.shapes, function(part) {
      if (!geom.pathIsClosed(part, arcs)) retn = true;
    });
    return retn;
  }

  function LayerControl(gui) {
    var model = gui.model;
    var map = gui.map;
    var el = gui.container.findChild(".layer-control").on('click', GUI.handleDirectEvent(gui.clearMode));
    var btn = gui.container.findChild('.layer-control-btn');
    var isOpen = false;
    var cache = new DomCache();
    var pinAll = el.findChild('.pin-all'); // button for toggling layer visibility

    // layer repositioning
    var dragTargetId = null;
    var dragging = false;
    var layerOrderSlug;

    gui.addMode('layer_menu', turnOn, turnOff, btn.findChild('.header-btn'));

    // kludge to show menu button after initial import dialog is dismissed
    gui.on('mode', function(e) {
      if (!e.name) {
        updateMenuBtn();
      }
    });

    model.on('update', function(e) {
      updateMenuBtn();
      if (isOpen) render();
    });

    el.on('mouseup', stopDragging);
    el.on('mouseleave', stopDragging);

    // init show/hide all button
    pinAll.on('click', function() {
      var allOn = testAllLayersPinned();
      model.getLayers().forEach(function(target) {
        setLayerPinning(target.layer, !allOn);
      });
      El.findAll('.pinnable', el.node()).forEach(function(item) {
        El(item).classed('pinned', !allOn);
      });
      map.redraw();
    });

    function updatePinAllButton() {
      pinAll.classed('pinned', testAllLayersPinned());
    }

    function testAllLayersPinned() {
      var allPinned = true;
      model.forEachLayer(function(lyr, dataset) {
        if (isPinnable(lyr) && !lyr.pinned) {
          allPinned = false;
        }
      });
      return allPinned;
    }

    function findLayerById(id) {
      return model.findLayer(function(lyr, dataset) {
        return lyr.menu_id == id;
      });
    }

    function getLayerOrderSlug() {
      return sortLayersForMenuDisplay(model.getLayers()).map(function(o) {
        return map.isVisibleLayer(o.layer) ? o.layer.menu_id : '';
      }).join('');
    }

    function clearClass(name) {
      var targ = el.findChild('.' + name);
      if (targ) targ.removeClass(name);
    }

    function stopDragging() {
      clearClass('dragging');
      clearClass('drag-target');
      clearClass('insert-above');
      clearClass('insert-below');
      dragTargetId = layerOrderSlug = null;
      if (dragging) {
        renderLayerList(); // in case menu changed...
        dragging = false;
      }
    }

    function insertLayer(dragId, dropId, above) {
      var dragLyr = findLayerById(dragId);
      var dropLyr = findLayerById(dropId);
      var slug;
      if (dragId == dropId) return;
      dragLyr.layer.menu_order = dropLyr.layer.menu_order + (above ? 0.5 : -0.5);
      slug = getLayerOrderSlug();
      if (slug != layerOrderSlug) {
        layerOrderSlug = slug;
        map.redraw();
      }
    }

    function turnOn() {
      isOpen = true;
      el.findChild('div.info-box-scrolled').css('max-height', El('body').height() - 80);
      render();
      el.show();
    }

    function turnOff() {
      stopDragging();
      isOpen = false;
      el.hide();
    }

    function updateMenuBtn() {
      var lyr = model.getActiveLayer()?.layer;
      var lyrName = lyr?.name || '';
      var menuTitle = lyrName || lyr && '[unnamed layer]' || '[no data]';
      var pageTitle = lyrName || 'mapshaper';
      btn.classed('active', 'true').findChild('.layer-name').html(menuTitle + " &nbsp;&#9660;");
      window.document.title = pageTitle;
    }

    function render() {
      renderLayerList();
      renderSourceFileList();
    }

    function renderSourceFileList() {
      el.findChild('.no-layer-note').classed('hidden', model.getActiveLayer());
      el.findChild('.source-file-section').classed('hidden', !model.getActiveLayer());
      var list = el.findChild('.file-list');
      var files = [];
      list.empty();
      model.forEachLayer(function(lyr, dataset) {
        var file = internal.getLayerSourceFile(lyr, dataset);
        if (!file || files.includes(file)) return;
        files.push(file);
        var warnings = getWarnings(lyr, dataset);
        var html = '<div class="layer-item">';
        html += rowHTML('name', file);
        if (warnings) {
          // html += rowHTML('problems', warnings, 'layer-problems');
          html += rowHTML('', warnings, 'layer-problems');
        }
        html += '</div>';
        list.appendChild(El('div').html(html).firstChild());
      });

    }

    function renderLayerList() {
      var list = el.findChild('.layer-list');
      var uniqIds = {};
      var pinnableCount = 0;
      var layerCount = 0;
      list.empty();
      model.forEachLayer(function(lyr, dataset) {
        // Assign a unique id to each layer, so html strings
        // can be used as unique identifiers for caching rendered HTML, and as
        // an id for layer menu event handlers
        if (!lyr.menu_id || uniqIds[lyr.menu_id]) {
          lyr.menu_id = utils$1.getUniqueName();
        }
        uniqIds[lyr.menu_id] = true;
        if (isPinnable(lyr)) pinnableCount++;
        layerCount++;
      });

      if (pinnableCount < 2) {
        pinAll.hide();
      } else {
        pinAll.show();
        updatePinAllButton();
      }

      sortLayersForMenuDisplay(model.getLayers()).forEach(function(o) {
        var lyr = o.layer;
        var opts = {
          show_source: layerCount < 5,
          pinnable: pinnableCount > 1 && isPinnable(lyr)
        };
        var html, element;
        html = renderLayer(lyr, o.dataset, opts);
        if (cache.contains(html)) {
          element = cache.use(html);
        } else {
          element = El('div').html(html).firstChild();
          initMouseEvents(element, lyr.menu_id, opts.pinnable);
          cache.add(html, element);
        }
        list.appendChild(element);
      });
    }

    cache.cleanup();

    function renderLayer(lyr, dataset, opts) {
      var classes = 'layer-item';
      var entry, html;

      if (opts.pinnable) classes += ' pinnable';
      if (map.isActiveLayer(lyr)) classes += ' active';
      if (lyr.hidden) classes += ' invisible';
      if (lyr.pinned) classes += ' pinned';

      html = '<!-- ' + lyr.menu_id + '--><div class="' + classes + '">';
      html += rowHTML('name', '<span class="layer-name colored-text dot-underline">' + formatLayerNameForDisplay(lyr.name) + '</span>', 'row1');
      html += rowHTML('contents', describeLyr(lyr, dataset));
      // html += '<img class="close-btn" draggable="false" src="images/close.png">';
      if (opts.pinnable) {
        html += '<img class="eye-btn black-eye" draggable="false" src="images/eye.png">';
        html += '<img class="eye-btn green-eye" draggable="false" src="images/eye2.png">';
      }
      html += '</div>';
      return html;
    }

    function initMouseEvents(entry, id, pinnable) {
      entry.on('mouseover', init);
      function init() {
        entry.removeEventListener('mouseover', init);
        initMouseEvents2(entry, id, pinnable);
      }
    }

    function initLayerDragging(entry, id) {

      // support layer drag-drop
      entry.on('mousemove', function(e) {
        var rect, insertionClass;
        // stop dragging when mouse button is released
        if (!e.buttons && (dragging || dragTargetId)) {
          stopDragging();
        }
        // start dragging when button is first pressed
        if (e.buttons && !dragTargetId) {
          // don't start dragging if pointer is over the close button
          // (before, clicking this button wqs finicky -- the mouse had to remain
          // perfectly still between mousedown and mouseup)
          if (El(e.target).hasClass('close-btn')) return;
          dragTargetId = id;
          entry.addClass('drag-target');
        }
        if (!dragTargetId) {
          return;
        }
        if (dragTargetId != id) {
          // signal to redraw menu later; TODO: improve
          dragging = true;
        }
        rect = entry.node().getBoundingClientRect();
        insertionClass = e.pageY - rect.top < rect.height / 2 ? 'insert-above' : 'insert-below';
        if (!entry.hasClass(insertionClass)) {
          clearClass('dragging');
          clearClass('insert-above');
          clearClass('insert-below');
          entry.addClass('dragging');
          entry.addClass(insertionClass);
          insertLayer(dragTargetId, id, insertionClass == 'insert-above');
        }
      });
    }

    function initMouseEvents2(entry, id, pinnable) {
      initLayerDragging(entry, id);

      function deleteLayer() {
        var target = findLayerById(id);
        if (map.isVisibleLayer(target.layer)) {
          // TODO: check for double map refresh after model.deleteLayer() below
          setLayerPinning(target.layer, false);
        }
        model.deleteLayer(target.layer, target.dataset);
      }

      function selectLayer(closeMenu) {
        var target = findLayerById(id);
        // don't select if user is typing or dragging
        if (GUI.textIsSelected() || dragging) return;
        // undo any temporary hiding when layer is selected
        target.layer.hidden = false;
        if (!map.isActiveLayer(target.layer)) {
          model.selectLayer(target.layer, target.dataset);
        }
        // close menu after a delay
        if (closeMenu === true) setTimeout(function() {
          gui.clearMode();
        }, 230);
      }

      // init delete button
      // GUI.onClick(entry.findChild('img.close-btn'), function(e) {
      //   e.stopPropagation();
      //   deleteLayer();
      // });

      if (pinnable) {
        // init pin button
        GUI.onClick(entry.findChild('img.black-eye'), function(e) {
          var target = findLayerById(id);
          var lyr = target.layer;
          var active = map.isActiveLayer(lyr);
          var hidden = false; // active && lyr.hidden || false;
          var pinned = false;
          var unpinned = false;
          e.stopPropagation();
          if (active) {
            hidden = !lyr.hidden;
            pinned = !hidden && lyr.unpinned;
            unpinned = lyr.pinned && hidden;
          } else {
            pinned = !lyr.pinned;
          }
          lyr.hidden = hidden;
          lyr.unpinned = unpinned;
          setLayerPinning(lyr, pinned);
          entry.classed('pinned', pinned);
          entry.classed('invisible', hidden);
          updatePinAllButton();
          map.redraw();
        });

        // catch click event on black (top) pin button button
        GUI.onClick(entry.findChild('img.black-eye'), function(e) {
          e.stopPropagation();
        });
      }

      // init name editor
      new ClickText2(entry.findChild('.layer-name'))
        .on('change', function(e) {
          var target = findLayerById(id);
          var str = cleanLayerName(this.value());
          this.value(formatLayerNameForDisplay(str));
          target.layer.name = str;
          gui.session.layerRenamed(target.layer, str);
          updateMenuBtn();
        });

      // init click-to-select
      GUI.onClick(entry, function() {
        selectLayer(true);
      });

      GUI.onContextClick(entry, function(e) {
        e.deleteLayer = deleteLayer;
        e.selectLayer = selectLayer;
        // contextMenu.open(e);
        // openContextMenu(e, null, entry.node())
        openContextMenu(e, null, null);
      });
    }

    function describeLyr(lyr, dataset) {
      var n = internal.getFeatureCount(lyr),
          isFrame = internal.isFrameLayer(lyr, dataset.arcs),
          str, type;
      if (lyr.data && !lyr.shapes) {
        type = 'data record';
      } else if (lyr.geometry_type) {
        type = lyr.geometry_type + ' feature';
      }
      if (isFrame) {
        str = 'map frame';
      } else if (type) {
        str = utils$1.format('%,d %s%s', n, type, utils$1.pluralSuffix(n));
      } else {
        str = "[empty]";
      }
      return str;
    }

    function getWarnings(lyr, dataset) {
      var file = internal.getLayerSourceFile(lyr, dataset);
      var missing = [];
      var msg;
      // show missing file warning for first layer in dataset
      // (assuming it represents the content of the original file)
      if (utils$1.endsWith(file, '.shp') && lyr == dataset.layers[0]) {
        if (!lyr.data) {
          missing.push('.dbf');
        }
        if (!dataset.info.prj && !dataset.info.crs) {
          missing.push('.prj');
        }
      }
      if (missing.length) {
        msg = 'missing ' + missing.join(' and ') + ' data';
      }
      return msg;
    }

    function describeSrc(lyr, dataset) {
      return internal.getLayerSourceFile(lyr, dataset);
    }

    function isPinnable(lyr) {
      return internal.layerIsGeometric(lyr) || internal.layerHasFurniture(lyr);
    }

    function rowHTML(c1, c2, cname) {
      return utils$1.format('<div class="row%s"><div class="col1">%s</div>' +
        '<div class="col2">%s</div></div>', cname ? ' ' + cname : '', c1, c2);
    }
  }

  function SessionHistory(gui) {
    var commands = [];
    // commands that can be ignored when checking for unsaved changes
    var nonEditingCommands = 'i,target,info,version,verbose,projections,inspect,help,h,encodings,calc'.split(',');

    this.unsavedChanges = function() {
      var cmd, cmdName;
      for (var i=commands.length - 1; i >= 0; i--) {
        cmdName = getCommandName(commands[i]);
        if (cmdName == 'o') break;
        if (nonEditingCommands.includes(cmdName)) continue;
        return true;
      }
      return false;
    };

    this.fileImported = function(file, optStr) {
      var cmd = '-i ' + file;
      if (optStr) {
        cmd += ' ' + optStr;
      }
      commands.push(cmd);
    };

    this.layerRenamed = function(lyr, name) {
      var currTarget = getCurrentTarget();
      var layerTarget = getTargetFromLayer(lyr);
      if (currTarget == layerTarget) {
        commands.push('-rename-layers ' + name);
      } else {
        commands.push('-rename-layers ' + name + ' target=' + layerTarget);
        commands.push('-target ' + currTarget);
      }
    };

    this.consoleCommands = function(str) {
      commands.push(str); // todo: split commands?
    };

    this.simplificationApplied = function(optStr) {
      commands.push('-simplify ' + optStr);
    };

    this.simplificationRepair = function() {
      //  TODO: improve this... repair does not necessarily apply to most recent
      //  simplification command
      //  consider adding a (hidden) repair command to handle this event
      var i = indexOfLastCommand('-simplify');
      if (i > -1) {
        commands[i] = commands[i].replace(' no-repair', '');
      }
    };

    this.updateSimplificationPct = function(pct) {
      var i = indexOfLastCommand('-simplify');
      if (i > -1) {
        commands[i] = commands[i].replace(/percentage=[^ ]+/, 'percentage=' + pct);
      }
    };

    this.dataValueUpdated = function(ids, field, value) {
      var cmd = `-each 'd[${JSON.stringify(field)}] = ${JSON.stringify(value)}' ids=${ids.join(",")}`;
      commands.push(cmd);
    };

    this.layersExported = function(ids, optStr) {
      var layers = gui.model.getLayers();
      var cmd = '-o';
      if (layers.length > 1) {
        cmd += ' target=' + ids.map(getTargetFromId).join(',');
      }
      if (optStr) {
        cmd += ' ' + optStr;
      }
      commands.push(cmd);
    };

    this.setTargetLayer = function(lyr) {
      var layers = gui.model.getLayers();
      if (layers.length > 1) {
        if (indexOfLastCommand('-target') == commands.length - 1) {
          commands.pop(); // if last commands was -target, remove it
        }
        commands.push('-target ' + getTargetFromLayer(lyr));
      }
    };

    this.toCommandLineString = function() {
      var str = commands.join(' \\\n  ');
      return 'mapshaper ' + str;
    };

    function getCommandName(cmd) {
      var rxp = /^-([a-z0-9-]+)/;
      var match = rxp.exec(cmd);
      return match ? match[1] : null;
    }

    function getCurrentTarget() {
      return getTargetFromLayer(gui.model.getActiveLayer().layer);
    }

    function indexOfLastCommand(cmd) {
      return commands.reduce(function(memo, str, i) {
        return str.indexOf(cmd) === 0 ? i : memo;
      }, -1);
    }

    function getTargetFromId(id) {
      var layers = gui.model.getLayers();
      return getTargetFromLayer(layers[id - 1].layer);
    }

    function getTargetFromLayer(lyr) {
      var id = internal.getLayerTargetId(gui.model, lyr);
      return internal.formatOptionValue(id);
    }
  }

  var copyRecord = internal.copyRecord;

  function isUndoEvt(e) {
    return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key == 'z';
  }

  function isRedoEvt(e) {
    return (e.ctrlKey || e.metaKey) && (e.shiftKey && e.key == 'z' || !e.shiftKey && e.key == 'y');
  }

  function Undo(gui) {
    var history, offset, stashedUndo;
    reset();

    // Undo history is cleared when the editing mode changes.
    gui.on('interaction_mode_change', function(e) {
      gui.undo.clear();
    });

    function reset() {
      history = [];
      stashedUndo = null;
      offset = 0;
    }

    function makeMultiDataSetter(ids) {
      if (ids.length == 1) return makeDataSetter(ids[0]);
      var target = gui.model.getActiveLayer();
      var recs = ids.map(id => copyRecord(target.layer.data.getRecordAt(id)));
      return function() {
        var data = target.layer.data.getRecords();
        for (var i=0; i<ids.length; i++) {
          data[ids[i]] = recs[i];
        }
        gui.dispatchEvent('popup-needs-refresh');
      };
    }

    function makeDataSetter(id) {
      var target = gui.model.getActiveLayer();
      var rec = copyRecord(target.layer.data.getRecordAt(id));
      return function() {
        target.layer.data.getRecords()[id] = rec;
        gui.dispatchEvent('popup-needs-refresh');
      };
    }

    gui.keyboard.on('keydown', function(evt) {
      var e = evt.originalEvent,
          kc = e.keyCode;
      if (isUndoEvt(e)) {
        this.undo();
        e.stopPropagation();
        e.preventDefault();
      }
      if (isRedoEvt(e)) {
        this.redo();
        e.stopPropagation();
        e.preventDefault();
      }
    }, this, 10);

    gui.on('symbol_dragend', function(e) {
      var target = e.data.target;
      var undo = function() {
        setPointCoords(target, e.FID, e.startCoords);
      };
      var redo = function() {
        setPointCoords(target, e.FID, e.endCoords);
      };
      addHistoryState(undo, redo);
    });

    // undo/redo label dragging
    //
    gui.on('label_dragstart', function(e) {
      stashedUndo = makeDataSetter(e.FID);
    });

    gui.on('label_dragend', function(e) {
      var redo = makeDataSetter(e.FID);
      addHistoryState(stashedUndo, redo);
    });

    // undo/redo data editing
    // TODO: consider setting selected feature to the undo/redo target feature
    //
    gui.on('data_preupdate', function(e) {
      stashedUndo = makeMultiDataSetter(e.ids);
    });

    gui.on('data_postupdate', function(e) {
      var redo = makeMultiDataSetter(e.ids);
      addHistoryState(stashedUndo, redo);
    });

    gui.on('rectangle_dragend', function(e) {
      var target = e.data.target;
      var points1 = e.points;
      var points2 = e.ids.map(id => getVertexCoords(target, id));
      var undo = function() {
        setRectangleCoords(target, e.ids, points1);
      };
      var redo = function() {
        setRectangleCoords(target, e.ids, points2);
      };
      addHistoryState(undo, redo);
    });

    gui.on('vertex_dragend', function(e) {
      var target = e.data.target;
      var startPoint = e.point; // in data coords
      var endPoint = getVertexCoords(target, e.ids[0]);
      var undo = function() {
        if (e.data.type == 'interpolated') {
          deleteVertex$1(target, e.ids[0]);
        } else {
          setVertexCoords(target, e.ids, startPoint);
        }
      };
      var redo = function() {
        if (e.insertion) {
          insertVertex$1(target, e.ids[0], endPoint);
        }
        setVertexCoords(target, e.ids, endPoint);
      };
      addHistoryState(undo, redo);
    });

    gui.on('vertex_delete', function(e) {
      // get vertex coords in data coordinates (not display coordinates);
      var p = getVertexCoords(e.data.target, e.vertex_id);
      var redo = function() {
        deleteVertex$1(e.data.target, e.vertex_id);
      };
      var undo = function() {
        insertVertex$1(e.data.target, e.vertex_id, p);
      };
      addHistoryState(undo, redo);
    });

    gui.on('point_add', function(e) {
      var redo = function() {
        appendNewPoint(e.data.target, e.p);
      };
      var undo = function() {
        deleteLastPoint(e.data.target);
      };
      addHistoryState(undo, redo);
    });

    gui.on('feature_delete', function(e) {
      var redo = function() {
        deleteFeature(e.data.target, e.fid);
      };
      var undo = function() {
        insertFeature(e.data.target, e.fid, e.coords, e.d);
      };
      addHistoryState(undo, redo);
    });

    gui.on('path_add', function(e) {
      var redo = function() {
        gui.dispatchEvent('redo_path_add', {p1: e.p1, p2: e.p2});
      };
      var undo = function() {
        gui.dispatchEvent('undo_path_add');
      };
      addHistoryState(undo, redo);
    });

    gui.on('path_extend', function(e) {
      var redo = function() {
        gui.dispatchEvent('redo_path_extend', {p: e.p, shapes: e.shapes2});
      };
      var undo = function() {
        gui.dispatchEvent('undo_path_extend', {shapes: e.shapes1});
      };
      addHistoryState(undo, redo);
    });

    this.clear = function() {
      reset();
    };

    function addHistoryState(undo, redo) {
      if (offset > 0) {
        history.splice(-offset);
        offset = 0;
      }
      history.push({undo, redo});
    }

    this.undo = function() {
      // firing even if history is empty
      // (because this event may trigger a new history state)
      gui.dispatchEvent('undo_redo_pre', {type: 'undo'});
      var item = getHistoryItem();
      if (item) {
        offset++;
        item.undo();
        gui.dispatchEvent('undo_redo_post', {type: 'undo'});
        gui.dispatchEvent('map-needs-refresh');
      }
    };

    this.redo = function() {
      gui.dispatchEvent('undo_redo_pre', {type: 'redo'});
      if (offset <= 0) return;
      offset--;
      var item = getHistoryItem();
      item.redo();
      gui.dispatchEvent('undo_redo_post', {type: 'redo'});
      gui.dispatchEvent('map-needs-refresh');
    };

    function getHistoryItem() {
      var item = history[history.length - offset - 1];
      return item || null;
    }

  }

  function SidebarButtons(gui) {
    var root = gui.container.findChild('.mshp-main-map');
    var buttons = El('div').addClass('nav-buttons').appendTo(root).hide();
    var _hidden = true;
    gui.on('active', updateVisibility);
    gui.on('inactive', updateVisibility);
    gui.model.on('update', updateVisibility);

    // @iconRef: selector for an (svg) button icon
    this.addButton = function(iconRef) {
      var btn = initButton(iconRef).addClass('nav-btn');
      btn.appendTo(buttons);
      return btn;
    };

    this.show = function() {
      _hidden = false;
      updateVisibility();
    };

    this.hide = function() {
      _hidden = true;
      updateVisibility();
    };

    var initButton = this.initButton = function(iconRef) {
      var icon = El('body').findChild(iconRef).node().cloneNode(true);
      var btn = El('div')
        .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
      btn.appendChild(icon);
      if (icon.hasAttribute('id')) icon.removeAttribute('id');
      return btn;
    };

    function updateVisibility() {
      if (GUI.isActiveInstance(gui) && !_hidden) {
        buttons.show();
      } else {
        buttons.hide();
      }
    }
  }

  function ModeButton(modes, el, name) {
    var btn = El(el),
        active = false;
    modes.on('mode', function(e) {
      active = e.name == name;
      if (active) {
        btn.addClass('active');
      } else {
        btn.removeClass('active');
      }
    });

    btn.on('click', function() {
      if (btn.hasClass('disabled')) return;
      modes.enterMode(active ? null : name);
    });
  }

  function ToggleButton(el) {
    var btn = El(el),
        self = new EventDispatcher(),
        on = false;

    btn.on('click', function(e) {
      on = !on;
      btn.classed('active', on);
      self.dispatchEvent('click', {on: on, active: on});
    });

    self.turnOff = function() {
      on = false;
      btn.removeClass('active');
    };

    self.turnOn = function() {
      on = true;
      btn.addClass('active');
    };

    return self;
  }

  function ModeSwitcher() {
    var self = this;
    var mode = null;

    self.getMode = function() {
      return mode;
    };

    // return a function to trigger this mode
    self.addMode = function(name, enter, exit, btn) {
      self.on('mode', function(e) {
        if (e.prev == name) {
          exit();
        }
        if (e.name == name) {
          enter();
        }
      });
      if (btn) {
        new ModeButton(self, btn, name);
      }
    };

    self.addMode(null, function() {}, function() {}); // null mode

    self.clearMode = function() {
      self.enterMode(null);
    };

    self.enterMode = function(next) {
      var prev = mode;
      if (next != prev) {
        mode = next;
        self.dispatchEvent('mode', {name: next, prev: prev});
      }
    };
  }

  utils$1.inherit(ModeSwitcher, EventDispatcher);

  function KeyboardEvents(gui) {
    var self = this;
    var shiftDown = false;
    var ctrlDown = false;
    var metaDown = false;
    var altDown = false;
    var spaceDown = false;

    function updateControlKeys(e, evtName) {
      shiftDown = e.shiftKey;
      ctrlDown = e.ctrlKey;
      metaDown = e.metaKey;
      altDown = e.altKey;
      if (e.keyCode == 32) {
        spaceDown = evtName == 'keydown';
      }
    }

    function mouseIsPressed() {
      return gui.map.getMouse().isDown();
    }

    document.addEventListener('keyup', function(e) {
      if (!GUI.isActiveInstance(gui) || e.repeat && e.keyCode == 32) return;
      updateControlKeys(e, 'keyup');
      self.dispatchEvent('keyup', getEventData(e));
    });

    document.addEventListener('keydown', function(e) {
      if (!GUI.isActiveInstance(gui) || e.repeat && e.keyCode == 32) return;
      updateControlKeys(e, 'keydown');
      self.dispatchEvent('keydown', getEventData(e));
    });

    document.addEventListener('mousemove', function(e) {
      // refreshing these here to prevent problems when context menu opens
      updateControlKeys(e);
    });

    this.shiftIsPressed = () => shiftDown;
    this.ctrlIsPressed = () => ctrlDown;
    this.altIsPressed = () => altDown;
    this.metaIsPressed = () => metaDown;
    this.spaceIsPressed = () => spaceDown;

    this.onMenuSubmit = function(menuEl, cb) {
      gui.on('enter_key', function(e) {
        if (menuEl.visible()) {
          e.originalEvent.stopPropagation();
          cb();
        }
      });
    };
  }

  var names = {
    8: 'delete',
    9: 'tab',
    13: 'enter',
    16: 'shift',
    17: 'ctrl',
    27: 'esc',
    32: 'space',
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down'
  };

  function getEventData(originalEvent) {
    var keyCode = originalEvent.keyCode;
    var keyName = names[keyCode] || '';
    return {originalEvent, keyCode, keyName};
  }

  utils$1.inherit(KeyboardEvents, EventDispatcher);

  function InteractionMode(gui) {

    var menus = {
      standard: ['info', 'selection', 'box'],
      empty: ['edit_polygons', 'edit_lines', 'edit_points', 'box'],
      polygons: ['info', 'selection', 'box', 'edit_polygons'],
      rectangles: ['info', 'selection', 'box', 'rectangles', 'edit_polygons'],
      lines: ['info', 'selection', 'box' , 'edit_lines'],
      table: ['info', 'selection'],
      labels: ['info', 'selection', 'box', 'labels', 'edit_points'],
      points: ['info', 'selection', 'box', 'edit_points'] // , 'add-points'
    };

    var prompts = {
      box: 'Shift-drag to draw a box',
      data: 'Click-select features to edit their attributes',
      selection: 'Click-select or shift-drag to select features'
    };

    // mode name -> menu text lookup
    var labels = {
      info: 'inspect features',
      box: 'rectangle tool',
      data: 'edit attributes',
      labels: 'position labels',
      edit_points: 'add/drag points',
      edit_lines: 'draw/edit polylines',
      edit_polygons: 'draw/edit polygons',
      vertices: 'edit vertices',
      selection: 'selection tool',
      'add-points': 'add points',
      rectangles: 'drag-to-resize',
      off: 'turn off'
    };
    var btn, menu;
    var _menuTimeout;

    // state variables
    var _editMode = 'off';
    var _prevMode;
    var _menuOpen = false;

    // Only render edit mode button/menu if this option is present
    if (gui.options.inspectorControl) {
      // use z-index so the menu is over other buttons
      btn = gui.buttons.addButton('#pointer-icon').addClass('menu-btn pointer-btn'),
      menu = El('div').addClass('nav-sub-menu').appendTo(btn.node());

      btn.on('mouseleave', function() {
        if (!_menuOpen) {
          btn.removeClass('hover');
        } else {
          closeMenu(200);
        }
      });

      btn.on('mouseenter', function() {
        btn.addClass('hover');
        if (_menuOpen) {
          clearTimeout(_menuTimeout); // prevent timed closing
        } else {
          openMenu();
        }
        // if (_editMode != 'off') {
        //   openMenu();
        // }
      });

      btn.on('click', function(e) {
        if (active()) {
          setMode('off');
          closeMenu();
        } else if (_menuOpen) {
          setMode('info'); // select info (inspect) as the default
          // closeMenu(350);
        } else {
          openMenu();
        }
        e.stopPropagation();
      });
    }

    this.turnOff = function() {
      setMode('off');
    };

    this.modeWorksWithConsole = function(mode) {
      return ['off', 'info'];
    };

    this.modeUsesHitDetection = function(mode) {
      return ['info', 'selection', 'data', 'labels', 'edit_points', 'vertices', 'rectangles', 'edit_lines', 'edit_polygons'].includes(mode);
    };

    this.modeUsesPopup = function(mode) {
      return ['info', 'selection', 'data', 'box', 'labels', 'edit_points', 'rectangles'].includes(mode);
    };

    this.getMode = getInteractionMode;

    this.setMode = function(mode) {
      // TODO: check that this mode is valid for the current dataset
      if (mode in labels) {
        setMode(mode);
      }
    };

    gui.model.on('update', function(e) {
      // change mode if active layer doesn't support the current mode
      updateCurrentMode();
      if (_menuOpen) {
        renderMenu();
      }
    }, null, -1); // low priority?

    function active() {
      return _editMode && _editMode != 'off';
    }

    function getAvailableModes() {
      var o = gui.model.getActiveLayer();
      if (!o || !o.layer) {
        return menus.empty; // TODO: more sensible handling of missing layer
      }
      if (!o.layer.geometry_type) {
        return menus.table;
      }
      if (internal.layerHasLabels(o.layer)) {
        return menus.labels;
      }
      if (o.layer.geometry_type == 'point') {
        return menus.points;
      }
      if (o.layer.geometry_type == 'polyline') {
        return menus.lines;
      }
      if (o.layer.geometry_type == 'polygon') {
        return internal.layerOnlyHasRectangles(o.layer, o.dataset.arcs) ?
          menus.rectangles : menus.polygons;
      }

      return menus.standard;
    }

    function getInteractionMode() {
      return active() ? _editMode : 'off';
    }

    function renderMenu() {
      if (!menu) return;
      var modes = getAvailableModes();
      menu.empty();
      modes.forEach(function(mode) {
        // don't show "turn off" link if not currently editing
        if (_editMode == 'off' && mode == 'off') return;
        var link = El('div').addClass('nav-menu-item').attr('data-name', mode).text(labels[mode]).appendTo(menu);
        link.on('click', function(e) {
          if (_editMode == mode) {
            // closeMenu();
            setMode('off');
          } else if (_editMode != mode) {
            setMode(mode);
            if (mode == 'off') closeMenu(120); // only close if turning off
            // closeMenu(mode == 'off' ? 120 : 400); // close after selecting
          }
          e.stopPropagation();
        });
      });
      updateSelectionHighlight();
    }

    // if current editing mode is not available, turn off the tool
    function updateCurrentMode() {
      var modes = getAvailableModes();
      if (modes.indexOf(_editMode) == -1) {
        setMode('off');
      }
    }

    function openMenu() {
      clearTimeout(_menuTimeout);
      if (!_menuOpen) {
        _menuOpen = true;
        renderMenu();
        updateArrowButton();
      }
    }

    // Calling with a delay lets users see the menu update after clicking a selection,
    // and prevents the menu from closing immediately if the pointer briefly drifts
    // off the menu while hovering.
    //
    function closeMenu(delay) {
      if (!_menuOpen) return;
      clearTimeout(_menuTimeout);
      _menuTimeout = setTimeout(function() {
        _menuOpen = false;
        updateArrowButton();
      }, delay || 0);
    }

    function setMode(mode) {
      var changed = mode != _editMode;
      if (changed) {
        menu.classed('active', mode != 'off');
        _prevMode = _editMode;
        _editMode = mode;
        onModeChange();
        updateArrowButton();
        updateSelectionHighlight();
      }
    }

    function onModeChange() {
      var mode = getInteractionMode();
      gui.state.interaction_mode = mode;
      gui.dispatchEvent('interaction_mode_change', {mode: mode, prev_mode: _prevMode});
    }

    // Update button highlight and selected menu item highlight (if any)
    function updateArrowButton() {
      if (!menu) return;
      if (_menuOpen) {
        btn.addClass('open');
      } else {
        btn.removeClass('open');
      }
      btn.classed('hover', _menuOpen);
      // btn.classed('selected', active() && !_menuOpen);
      btn.classed('selected', active());
    }

    function updateSelectionHighlight() {
      El.findAll('.nav-menu-item').forEach(function(el) {
        el = El(el);
        el.classed('selected', el.attr('data-name') == _editMode);
      });
    }
  }

  function Model(gui) {
    var self = new internal.Catalog();
    var deleteLayer = self.deleteLayer;
    utils$1.extend(self, EventDispatcher.prototype);

    // override Catalog method (so -drop command will work in web console)
    self.deleteLayer = function(lyr, dataset) {
      var active, flags;
      deleteLayer.call(self, lyr, dataset);
      if (self.isEmpty()) {
        // refresh browser if deleted layer was the last layer
        window.location.href = window.location.href.toString();
      } else {
        // trigger event to update layer list and, if needed, the map view
        flags = {};
        active = self.getActiveLayer();
        if (active.layer != lyr) {
          flags.select = true;
        }
        internal.cleanupArcs(active.dataset);
        if (internal.layerHasPaths(lyr)) {
          flags.arc_count = true; // looks like a kludge, try to remove
        }
        self.updated(flags, active.layer, active.dataset);
      }
    };

    self.updated = function(flags) {
      var targets = self.getDefaultTargets();
      var active = self.getActiveLayer();
      if (internal.countTargetLayers(targets) > 1) {
        self.setDefaultTarget([active.layer], active.dataset);
        gui.session.setTargetLayer(active.layer); // add -target command to target single layer
      }
      if (flags.select) {
        self.dispatchEvent('select', active);
      }
      self.dispatchEvent('update', utils$1.extend({flags: flags}, active));
    };

    self.selectLayer = function(lyr, dataset) {
      if (self.getActiveLayer().layer == lyr) {
        return;
      }
      self.setDefaultTarget([lyr], dataset);
      self.updated({select: true});
      gui.session.setTargetLayer(lyr);
    };

    self.selectNextLayer = function() {
      var next = self.findNextLayer(self.getActiveLayer().layer);
      if (next) self.selectLayer(next.layer, next.dataset);
    };

    self.selectPrevLayer = function() {
      var prev = self.findPrevLayer(self.getActiveLayer().layer);
      if (prev) self.selectLayer(prev.layer, prev.dataset);
    };

    return self;
  }

  // Fall back to browserify's Buffer polyfill
  var B = typeof Buffer != 'undefined' ? Buffer : require('buffer').Buffer;

  // This module provides a way for multiple jobs to run together asynchronously
  // while keeping job-level context variables (like "defs") separate.

  var stash = {};

  function stashVar(key, val) {
    if (key in stash) {
      error('Tried to replace a stashed variable:', key);
    }
    stash[key] = val;
  }

  function getStashedVar(key) {
    if (key in stash === false) {
      return undefined; // to support running commands in tests
      // error('Tried to read a nonexistent variable from the stash:', key);
    }
    return stash[key];
  }

  function clearStash() {
    stash = {};
  }

  var LOGGING = false;
  var STDOUT = false; // use stdout for status messages
  var _error, _stop, _message, _warn;

  var _interrupt = function() {
    throw new NonFatalError(formatLogArgs(arguments));
  };

  setLoggingForCLI();

  function getLoggingSetter() {
    var e = _error, s = _stop, m = _message, w = _warn;
    return function() {
      setLoggingFunctions(m, e, s, w);
    };
  }

  function setLoggingForCLI() {
    function stop() {
      throw new UserError(formatLogArgs(arguments));
    }

    function error() {
      var msg = utils.toArray(arguments).join(' ');
      throw new Error(msg);
    }

    function message() {
      logArgs(arguments);
    }

    // CLI warning is just a message (GUI behaves differently)
    var warn = message;

    setLoggingFunctions(message, error, stop, warn);
  }

  function enableLogging() {
    LOGGING = true;
  }

  function loggingEnabled() {
    return !!LOGGING;
  }

  // Handle an unexpected condition (internal error)
  function error() {
    _error.apply(null, utils.toArray(arguments));
  }

  // Handle an error caused by invalid input or misuse of API
  function stop() {
    // _stop.apply(null, utils.toArray(arguments));
    _stop.apply(null, messageArgs(arguments));
  }

  function interrupt() {
    _interrupt.apply(null, utils.toArray(arguments));
  }

  // Print a status message
  function message() {
    _message.apply(null, messageArgs(arguments));
  }

  function warn() {
    _warn.apply(null, messageArgs(arguments));
  }

  // A way for the GUI to replace the CLI logging functions
  function setLoggingFunctions(message, error, stop, warn) {
    _message = message;
    _error = error;
    _stop = stop;
    _warn = warn;
  }

  // get detailed error information from error stack (if available)
  // Example stack string (Node.js):
  /*
  /Users/someuser/somescript.js:226
      opacity: Math.round(weight * 5 / 5 // 0.2 0.4 0.6 etc
                                       ^

  SyntaxError: missing ) after argument list
      at internalCompileFunction (node:internal/vm:73:18)
      at wrapSafe (node:internal/modules/cjs/loader:1149:20)
      at Module._compile (node:internal/modules/cjs/loader:1190:27)
      ...
  */
  function getErrorDetail(e) {
    var parts = (typeof e.stack == 'string') ? e.stack.split(/\n\s*\n/) : [];
    if (parts.length > 1 || true) {
      return '\nError details:\n' + parts[0];
    }
    return '';
  }

  // print a message to stdout
  function print() {
    STDOUT = true; // tell logArgs() to print to stdout, not stderr
    // calling message() adds the "[command name]" prefix
    _message(utils.toArray(arguments));
    STDOUT = false;
  }

  function verbose() {
    // verbose can be set globally with the -verbose command or separately for each command
    if (getStashedVar('VERBOSE')) {
      message.apply(null, arguments);
    }
  }

  function debug() {
    if (getStashedVar('DEBUG')) {
      logArgs(arguments);
    }
  }

  function printError(err) {
    var msg;
    if (!LOGGING) return;
    if (utils.isString(err)) {
      err = new UserError(err);
    }
    if (err.name == 'NonFatalError') {
      console.error(messageArgs([err.message]).join(' '));
    } else if (err.name == 'UserError') {
      msg = err.message;
      if (!/Error/.test(msg)) {
        msg = "Error: " + msg;
      }
      console.error(messageArgs([msg]).join(' '));
      console.error("Run mapshaper -h to view help");
    } else {
      // not a user error (i.e. a bug in mapshaper)
      console.error(err);
      // throw err;
    }
  }

  function UserError(msg) {
    var err = new Error(msg);
    err.name = 'UserError';
    return err;
  }

  function NonFatalError(msg) {
    var err = new Error(msg);
    err.name = 'NonFatalError';
    return err;
  }

  function formatColumns(arr, alignments) {
    var widths = arr.reduce(function(memo, line) {
      return line.map(function(str, i) {
        return memo ? Math.max(memo[i], str.length) : str.length;
      });
    }, null);
    return arr.map(function(line) {
      line = line.map(function(str, i) {
        var rt = alignments && alignments[i] == 'right';
        var pad = (rt ? str.padStart : str.padEnd).bind(str);
        return pad(widths[i], ' ');
      });
      return '  ' + line.join(' ');
    }).join('\n');
  }

  // Format an array of (preferably short) strings in columns for console logging.
  function formatStringsAsGrid(arr, width) {
    // TODO: variable column width
    var longest = arr.reduce(function(len, str) {
          return Math.max(len, str.length);
        }, 0),
        colWidth = longest + 2,
        perLine = Math.floor((width || 80) / colWidth) || 1;
    return arr.reduce(function(memo, name, i) {
      var col = i % perLine;
      if (i > 0 && col === 0) memo += '\n';
      if (col < perLine - 1) { // right-pad all but rightmost column
        name = utils.rpad(name, colWidth - 2, ' ');
      }
      return memo +  '  ' + name;
    }, '');
  }

  // expose so GUI can use it
  function formatLogArgs(args) {
    return utils.toArray(args).join(' ');
  }

  function messageArgs(args) {
    var arr = utils.toArray(args);
    var cmd = getStashedVar('current_command');
    if (cmd && cmd != 'help') {
      arr.unshift('[' + cmd + ']');
    }
    return arr;
  }

  function logArgs(args) {
    if (!LOGGING || getStashedVar('QUIET') || !utils.isArrayLike(args)) return;
    var msg = formatLogArgs(args);
    if (STDOUT) console.log(msg);
    else console.error(msg);
  }

  function truncateString(str, maxLen) {
    maxLen = maxLen || 80;
    if (str.length > maxLen) {
      str = str.substring(0, maxLen - 3).trimEnd() + '...';
    }
    return str;
  }

  var uniqCount = 0;
  function getUniqueName(prefix) {
    return (prefix || "__id_") + (++uniqCount);
  }

  function isFunction(obj) {
    return typeof obj == 'function';
  }

  function isPromise(arg) {
    return arg ? isFunction(arg.then) : false;
  }

  function isObject(obj) {
    return obj === Object(obj); // via underscore
  }

  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  function isArray(obj) {
    return Array.isArray(obj);
  }

  // Is obj a valid number or NaN? (test if obj is type number)
  function isNumber(obj) {
    return obj != null && obj.constructor == Number;
  }

  function isValidNumber(val) {
    return isNumber(val) && !isNaN(val);
  }

  // Similar to isFinite() but does not coerce strings or other types
  function isFiniteNumber(val) {
    return isValidNumber(val) && val !== Infinity && val !== -Infinity;
  }

  // This uses type conversion
  // export function isFiniteNumber(val) {
  //   return val > -Infinity && val < Infinity;
  // }

  function isNonNegNumber(val) {
    return isNumber(val) && val >= 0;
  }

  function isInteger(obj) {
    return isNumber(obj) && ((obj | 0) === obj);
  }

  function isEven(obj) {
    return (obj % 2) === 0;
  }

  function isOdd(obj) {
    return (obj % 2) === 1;
  }

  function isString(obj) {
    return obj != null && obj.toString === String.prototype.toString;
    // TODO: replace w/ something better.
  }

  function isDate(obj) {
    return !!obj && obj.getTime === Date.prototype.getTime;
  }

  function isBoolean(obj) {
    return obj === true || obj === false;
  }

  function formatDateISO(d) {
    if (!isDate(d)) return '';
    return d.toISOString().replace(':00.000Z', 'Z');
  }

  // Convert an array-like object to an Array, or make a copy if @obj is an Array
  function toArray(obj) {
    var arr;
    if (!isArrayLike(obj)) error("toArray() requires an array-like object");
    try {
      arr = Array.prototype.slice.call(obj, 0); // breaks in ie8
    } catch(e) {
      // support ie8
      arr = [];
      for (var i=0, n=obj.length; i<n; i++) {
        arr[i] = obj[i];
      }
    }
    return arr;
  }

  // Array like: has length property, is numerically indexed and mutable.
  // TODO: try to detect objects with length property but no indexed data elements
  function isArrayLike(obj) {
    if (!obj) return false;
    if (isArray(obj)) return true;
    if (isString(obj)) return false;
    if (obj.length === 0 || obj.length > 0) return true;
    return false;
  }

  // See https://raw.github.com/kvz/phpjs/master/functions/strings/addslashes.js
  function addslashes(str) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
  }

  // Escape a literal string to use in a regexp.
  // Ref.: http://simonwillison.net/2006/Jan/20/escape/
  function regexEscape(str) {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }


  // See https://github.com/janl/mustache.js/blob/master/mustache.js
  var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  function htmlEscape(s) {
    return String(s).replace(/[&<>"'/]/g, function(s) {
      return entityMap[s];
    });
  }


  function defaults(dest) {
    for (var i=1, n=arguments.length; i<n; i++) {
      var src = arguments[i] || {};
      for (var key in src) {
        if (key in dest === false && src.hasOwnProperty(key)) {
          dest[key] = src[key];
        }
      }
    }
    return dest;
  }

  function extend(o) {
    var dest = o || {},
        n = arguments.length,
        key, i, src;
    for (i=1; i<n; i++) {
      src = arguments[i] || {};
      for (key in src) {
        if (src.hasOwnProperty(key)) {
          dest[key] = src[key];
        }
      }
    }
    return dest;
  }

  // Pseudoclassical inheritance
  //
  // Inherit from a Parent function:
  //    inherit(Child, Parent);
  // Call parent's constructor (inside child constructor):
  //    this.__super__([args...]);
  function inherit(targ, src) {
    var f = function() {
      if (this.__super__ == f) {
        // add __super__ of parent to front of lookup chain
        // so parent class constructor can call its parent using this.__super__
        this.__super__ = src.prototype.__super__;
        // call parent constructor function. this.__super__ now points to parent-of-parent
        src.apply(this, arguments);
        // remove temp __super__, expose targ.prototype.__super__ again
        delete this.__super__;
      }
    };

    f.prototype = src.prototype || src; // added || src to allow inheriting from objects as well as functions
    // Extend targ prototype instead of wiping it out --
    //   in case inherit() is called after targ.prototype = {stuff}; statement
    targ.prototype = extend(new f(), targ.prototype); //
    targ.prototype.constructor = targ;
    targ.prototype.__super__ = f;
  }

  function promisify(asyncFn) {
    return function() {
      var args = toArray(arguments);
      return new Promise((resolve, reject) => {
        var cb = function(err, data) {
          if (err) reject(err);
          else resolve(data);
        };
        args.push(cb);
        asyncFn.apply(this, args);
      });
    };
  }

   function runAsync(fn, arg) {
      return new Promise((resolve, reject) => {
        fn(arg, function(err, data) {
          return err ? reject(err) : resolve(data);
        });
      });
    }

  // Call @iter on each member of an array (similar to Array#reduce(iter))
  //    iter: function(memo, item, callback)
  // Call @done when all members have been processed or if an error occurs
  //    done: function(err, memo)
  // @memo: Initial value
  //
  function reduceAsync(arr, memo, iter, done) {
    var call = typeof setImmediate == 'undefined' ? setTimeout : setImmediate;
    var i=0;
    next(null, memo);

    function next(err, memo) {
      // Detach next operation from call stack to prevent overflow
      // Don't use setTimeout(, 0) if setImmediate is available
      // (setTimeout() can introduce a long delay if previous operation was slow,
      //    as of Node 0.10.32 -- a bug?)
      if (err) {
        return done(err, null);
      }
      call(function() {
        if (i < arr.length === false) {
          done(null, memo);
        } else {
          iter(memo, arr[i++], next);
        }
      }, 0);
    }
  }


  // Append elements of @src array to @dest array
  function merge(dest, src) {
    if (!isArray(dest) || !isArray(src)) {
      error("Usage: merge(destArray, srcArray);");
    }
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
    return dest;
  }

  // Returns elements in arr and not in other
  // (similar to underscore diff)
  function difference(arr, other) {
    var index = arrayToIndex(other);
    return arr.filter(function(el) {
      return !Object.prototype.hasOwnProperty.call(index, el);
    });
  }

  // Return the intersection of two arrays
  function intersection(a, b) {
    return a.filter(function(el) {
      return b.includes(el);
    });
  }

  function indexOf(arr, item) {
    var nan = item !== item;
    for (var i = 0, len = arr.length || 0; i < len; i++) {
      if (arr[i] === item) return i;
      if (nan && arr[i] !== arr[i]) return i;
    }
    return -1;
  }

  // Test a string or array-like object for existence of substring or element
  function contains(container, item) {
    if (isString(container)) {
      return container.indexOf(item) != -1;
    }
    else if (isArrayLike(container)) {
      return indexOf(container, item) != -1;
    }
    error("Expected Array or String argument");
  }

  function some(arr, test) {
    return arr.reduce(function(val, item) {
      return val || test(item); // TODO: short-circuit?
    }, false);
  }

  function every(arr, test) {
    return arr.reduce(function(val, item) {
      return val && test(item);
    }, true);
  }

  function find(arr, test, ctx) {
    var matches = arr.filter(test, ctx);
    return matches.length === 0 ? null : matches[0];
  }

  function range(len, start, inc) {
    var arr = [],
        v = start === void 0 ? 0 : start,
        i = inc === void 0 ? 1 : inc;
    while(len--) {
      arr.push(v);
      v += i;
    }
    return arr;
  }

  function repeat(times, func) {
    var values = [],
        val;
    for (var i=0; i<times; i++) {
      val = func(i);
      if (val !== void 0) {
        values[i] = val;
      }
    }
    return values.length > 0 ? values : void 0;
  }

  // Calc sum, skip falsy and NaN values
  // Assumes: no other non-numeric objects in array
  //
  function sum(arr, info) {
    if (!isArrayLike(arr)) error ("sum() expects an array, received:", arr);
    var tot = 0,
        nan = 0,
        val;
    for (var i=0, n=arr.length; i<n; i++) {
      val = arr[i];
      if (val) {
        tot += val;
      } else if (isNaN(val)) {
        nan++;
      }
    }
    if (info) {
      info.nan = nan;
    }
    return tot;
  }

  // Calculate min and max values of an array, ignoring NaN values
  function getArrayBounds(arr) {
    var min = Infinity,
      max = -Infinity,
      nan = 0, val;
    for (var i=0, len=arr.length; i<len; i++) {
      val = arr[i];
      if (val !== val) nan++;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    return {
      min: min,
      max: max,
      nan: nan
    };
  }

  // export function uniq(src) {
  //   var index = {};
  //   return src.reduce(function(memo, el) {
  //     if (el in index === false) {
  //       index[el] = true;
  //       memo.push(el);
  //     }
  //     return memo;
  //   }, []);
  // }

  function uniq(src) {
    var index = new Set();
    var arr = [];
    var item;
    for (var i=0, n=src.length; i<n; i++) {
      item = src[i];
      if (!index.has(item)) {
        arr.push(item);
        index.add(item);
      }
    }
    return arr;
  }

  function pluck(arr, key) {
    return arr.map(function(obj) {
      return obj[key];
    });
  }

  function countValues(arr) {
    return arr.reduce(function(memo, val) {
      memo[val] = (val in memo) ? memo[val] + 1 : 1;
      return memo;
    }, {});
  }

  function indexOn(arr, k) {
    return arr.reduce(function(index, o) {
      index[o[k]] = o;
      return index;
    }, {});
  }

  function groupBy(arr, k) {
    return arr.reduce(function(index, o) {
      var keyval = o[k];
      if (keyval in index) {
        index[keyval].push(o);
      } else {
        index[keyval] = [o];
      }
      return index;
    }, {});
  }

  function arrayToIndex(arr, val) {
    var init = arguments.length > 1;
    return arr.reduce(function(index, key) {
      index[key] = init ? val : true;
      return index;
    }, {});
  }

  // Support for iterating over array-like objects, like typed arrays
  function forEach(arr, func, ctx) {
    if (!isArrayLike(arr)) {
      throw new Error("#forEach() takes an array-like argument. " + arr);
    }
    for (var i=0, n=arr.length; i < n; i++) {
      func.call(ctx, arr[i], i);
    }
  }

  function forEachProperty(o, func, ctx) {
    Object.keys(o).forEach(function(key) {
      func.call(ctx, o[key], key);
    });
  }

  function initializeArray(arr, init) {
    for (var i=0, len=arr.length; i<len; i++) {
      arr[i] = init;
    }
    return arr;
  }

  function replaceArray(arr, arr2) {
    arr.splice(0, arr.length);
    for (var i=0, n=arr2.length; i<n; i++) {
      arr.push(arr2[i]);
    }
  }

  function repeatString(src, n) {
    var str = "";
    for (var i=0; i<n; i++)
      str += src;
    return str;
  }

  function splitLines(str) {
    return str.split(/\r?\n/);
  }

  function pluralSuffix(count) {
    return count != 1 ? 's' : '';
  }

  function endsWith(str, ending) {
      return str.indexOf(ending, str.length - ending.length) !== -1;
  }

  function lpad(str, size, pad) {
    pad = pad || ' ';
    str = String(str);
    return repeatString(pad, size - str.length) + str;
  }

  function rpad(str, size, pad) {
    pad = pad || ' ';
    str = String(str);
    return str + repeatString(pad, size - str.length);
  }

  function trim(str) {
    return ltrim(rtrim(str));
  }

  var ltrimRxp = /^\s+/;
  function ltrim(str) {
    return str.replace(ltrimRxp, '');
  }

  var rtrimRxp = /\s+$/;
  function rtrim(str) {
    return str.replace(rtrimRxp, '');
  }

  function addThousandsSep(str) {
    var fmt = '',
        start = str[0] == '-' ? 1 : 0,
        dec = str.indexOf('.'),
        end = str.length,
        ins = (dec == -1 ? end : dec) - 3;
    while (ins > start) {
      fmt = ',' + str.substring(ins, end) + fmt;
      end = ins;
      ins -= 3;
    }
    return str.substring(0, end) + fmt;
  }

  function numToStr(num, decimals) {
    return decimals >= 0 ? num.toFixed(decimals) : String(num);
  }

  function formatNumber(val) {
    return val + '';
  }

  function formatIntlNumber(val) {
    var str = formatNumber(val);
    return '"' + str.replace('.', ',') + '"'; // need to quote if comma-delimited
  }

  function formatNumberForDisplay(num, decimals, nullStr, showPos) {
    var fmt;
    if (isNaN(num)) {
      fmt = nullStr || '-';
    } else {
      fmt = numToStr(num, decimals);
      fmt = addThousandsSep(fmt);
      if (showPos && parseFloat(fmt) > 0) {
        fmt = "+" + fmt;
      }
    }
    return fmt;
  }

  function shuffle(arr) {
    var tmp, i, j;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  // Sort an array of objects based on one or more properties.
  // Usage: sortOn(array, key1, asc?[, key2, asc? ...])
  //
  function sortOn(arr) {
    var comparators = [];
    for (var i=1; i<arguments.length; i+=2) {
      comparators.push(getKeyComparator(arguments[i], arguments[i+1]));
    }
    arr.sort(function(a, b) {
      var cmp = 0,
          i = 0,
          n = comparators.length;
      while (i < n && cmp === 0) {
        cmp = comparators[i](a, b);
        i++;
      }
      return cmp;
    });
    return arr;
  }

  // Sort array of values that can be compared with < > operators (strings, numbers)
  // null, undefined and NaN are sorted to the end of the array
  // default order is ascending
  //
  function genericSort(arr, ascending) {
    var compare = getGenericComparator(ascending);
    Array.prototype.sort.call(arr, compare);
    return arr;
  }

  function getSortedIds(arr, asc) {
    var ids = range(arr.length);
    sortArrayIndex(ids, arr, asc);
    return ids;
  }

  function sortArrayIndex(ids, arr, asc) {
    var compare = getGenericComparator(asc);
    ids.sort(function(i, j) {
      // added i, j comparison to guarantee that sort is stable
      var cmp = compare(arr[i], arr[j]);
      return cmp > 0 || cmp === 0 && i > j ? 1 : -1;
    });
  }

  function reorderArray(arr, idxs) {
    var len = idxs.length;
    var arr2 = [];
    for (var i=0; i<len; i++) {
      var idx = idxs[i];
      if (idx < 0 || idx >= len) error("Out-of-bounds array idx");
      arr2[i] = arr[idx];
    }
    replaceArray(arr, arr2);
  }

  function getKeyComparator(key, asc) {
    var compare = getGenericComparator(asc);
    return function(a, b) {
      return compare(a[key], b[key]);
    };
  }

  function getGenericComparator(asc) {
    asc = asc !== false && asc != 'descending'; // ascending is the default
    return function(a, b) {
      var retn = 0;
      if (b == null) {
        retn = a == null ? 0 : -1;
      } else if (a == null) {
        retn = 1;
      } else if (a < b) {
        retn = asc ? -1 : 1;
      } else if (a > b) {
        retn = asc ? 1 : -1;
      } else if (a !== a) {
        retn = 1;
      } else if (b !== b) {
        retn = -1;
      }
      return retn;
    };
  }


  // Generic in-place sort (null, NaN, undefined not handled)
  function quicksort(arr, asc) {
    quicksortPartition(arr, 0, arr.length-1);
    if (asc === false) Array.prototype.reverse.call(arr); // Works with typed arrays
    return arr;
  }

  // Moved out of quicksort() (saw >100% speedup in Chrome with deep recursion)
  function quicksortPartition (a, lo, hi) {
    var i = lo,
        j = hi,
        pivot, tmp;
    while (i < hi) {
      pivot = a[lo + hi >> 1]; // avoid n^2 performance on sorted arrays
      while (i <= j) {
        while (a[i] < pivot) i++;
        while (a[j] > pivot) j--;
        if (i <= j) {
          tmp = a[i];
          a[i] = a[j];
          a[j] = tmp;
          i++;
          j--;
        }
      }
      if (lo < j) quicksortPartition(a, lo, j);
      lo = i;
      j = hi;
    }
  }


  function findRankByValue(arr, value) {
    if (isNaN(value)) return arr.length;
    var rank = 1;
    for (var i=0, n=arr.length; i<n; i++) {
      if (value > arr[i]) rank++;
    }
    return rank;
  }

  function findValueByPct(arr, pct) {
    var rank = Math.ceil((1-pct) * (arr.length));
    return findValueByRank(arr, rank);
  }

  // See http://ndevilla.free.fr/median/median/src/wirth.c
  // Elements of @arr are reordered
  //
  function findValueByRank(arr, rank) {
    if (!arr.length || rank < 1 || rank > arr.length) error("[findValueByRank()] invalid input");

    rank = clamp(rank | 0, 1, arr.length);
    var k = rank - 1, // conv. rank to array index
        n = arr.length,
        l = 0,
        m = n - 1,
        i, j, val, tmp;

    while (l < m) {
      val = arr[k];
      i = l;
      j = m;
      do {
        while (arr[i] < val) {i++;}
        while (val < arr[j]) {j--;}
        if (i <= j) {
          tmp = arr[i];
          arr[i] = arr[j];
          arr[j] = tmp;
          i++;
          j--;
        }
      } while (i <= j);
      if (j < k) l = i;
      if (k < i) m = j;
    }
    return arr[k];
  }

  function findMedian(arr) {
    return findQuantile(arr, 0.5);
  }

  function findQuantile(arr, k) {
    var n = arr.length,
        i1 = Math.floor((n - 1) * k),
        i2 = Math.ceil((n - 1) * k);
    if (i1 < 0 || i2 >= n) return NaN;
    var v1 = findValueByRank(arr, i1 + 1);
    if (i1 == i2) return v1;
    var v2 = findValueByRank(arr, i2 + 1);
    // use linear interpolation
    var w1 = i2 / (n - 1) - k;
    var w2 = k - i1 / (n - 1);
    var v = (v1 * w1 + v2 * w2) * (n - 1);
    return v;
  }

  function mean(arr) {
    var count = 0,
        avg = NaN,
        val;
    for (var i=0, n=arr.length; i<n; i++) {
      val = arr[i];
      if (isNaN(val)) continue;
      avg = ++count == 1 ? val : val / count + (count - 1) / count * avg;
    }
    return avg;
  }


  /*
  A simplified version of printf formatting
  Format codes: %[flags][width][.precision]type

  supported flags:
    +   add '+' before positive numbers
    0   left-pad with '0'
    '   Add thousands separator
  width: 1 to many
  precision: .(1 to many)
  type:
    s     string
    di    integers
    f     decimal numbers
    xX    hexidecimal (unsigned)
    %     literal '%'

  Examples:
    code    val    formatted
    %+d     1      '+1'
    %4i     32     '  32'
    %04i    32     '0032'
    %x      255    'ff'
    %.2f    0.125  '0.13'
    %'f     1000   '1,000'
  */

  // Usage: format(formatString, [values])
  // Tip: When reusing the same format many times, use formatter() for 5x - 10x better performance
  //
  function format(fmt) {
    var fn = formatter(fmt);
    var str = fn.apply(null, Array.prototype.slice.call(arguments, 1));
    return str;
  }

  function formatValue(val, matches) {
    var flags = matches[1];
    var padding = matches[2];
    var decimals = matches[3] ? parseInt(matches[3].substr(1)) : void 0;
    var type = matches[4];
    var isString = type == 's',
        isHex = type == 'x' || type == 'X',
        // isInt = type == 'd' || type == 'i',
        // isFloat = type == 'f',
        isNumber = !isString;

    var sign = "",
        padDigits = 0,
        isZero = false,
        isNeg = false;

    var str, padChar, padStr;
    if (isString) {
      str = String(val);
    }
    else if (isHex) {
      str = val.toString(16);
      if (type == 'X')
        str = str.toUpperCase();
    }
    else if (isNumber) {
      // str = formatNumberForDisplay(val, isInt ? 0 : decimals);
      str = numToStr(val, decimals);
      if (str[0] == '-') {
        isNeg = true;
        str = str.substr(1);
      }
      isZero = parseFloat(str) == 0;
      if (flags.indexOf("'") != -1 || flags.indexOf(',') != -1) {
        str = addThousandsSep(str);
      }
      if (!isZero) { // BUG: sign is added when num rounds to 0
        if (isNeg) {
          sign = "\u2212"; // U+2212
        } else if (flags.indexOf('+') != -1) {
          sign = '+';
        }
      }
    }

    if (padding) {
      var strLen = str.length + sign.length;
      var minWidth = parseInt(padding, 10);
      if (strLen < minWidth) {
        padDigits = minWidth - strLen;
        padChar = flags.indexOf('0') == -1 ? ' ' : '0';
        padStr = repeatString(padChar, padDigits);
      }
    }

    if (padDigits == 0) {
      str = sign + str;
    } else if (padChar == '0') {
      str = sign + padStr + str;
    } else {
      str = padStr + sign + str;
    }
    return str;
  }

  // Get a function for interpolating formatted values into a string.
  function formatter(fmt) {
    var codeRxp = /%([',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;
    var literals = [],
        formatCodes = [],
        startIdx = 0,
        prefix = "",
        matches = codeRxp.exec(fmt),
        literal;

    while (matches) {
      literal = fmt.substring(startIdx, codeRxp.lastIndex - matches[0].length);
      if (matches[0] == '%%') {
        prefix += literal + '%';
      } else {
        literals.push(prefix + literal);
        prefix = '';
        formatCodes.push(matches);
      }
      startIdx = codeRxp.lastIndex;
      matches = codeRxp.exec(fmt);
    }
    literals.push(prefix + fmt.substr(startIdx));

    return function() {
      var str = literals[0],
          n = arguments.length;
      if (n != formatCodes.length) {
        error("[format()] Data does not match format string; format:", fmt, "data:", arguments);
      }
      for (var i=0; i<n; i++) {
        str += formatValue(arguments[i], formatCodes[i]) + literals[i+1];
      }
      return str;
    };
  }

  function wildcardToRegExp(name) {
    var rxp = name.split('*').map(function(str) {
      return regexEscape(str);
    }).join('.*');
    return new RegExp('^' + rxp + '$');
  }

  function createBuffer(arg, arg2) {
    if (isInteger(arg)) {
      return B.allocUnsafe ? B.allocUnsafe(arg) : new B(arg);
    } else {
      // check allocUnsafe to make sure Buffer.from() will accept strings (it didn't before Node v5.10)
      return B.from && B.allocUnsafe ? B.from(arg, arg2) : new B(arg, arg2);
    }
  }

  function toBuffer(src) {
    if (src instanceof B) return src;
    if (src instanceof ArrayBuffer) return B.from(src);
    if (src instanceof Uint8Array) {
      return B.from(src.buffer, src.byteOffset, src.byteLength);
    }
    error('Unexpected argument type');
  }

  function expandoBuffer(constructor, rate) {
    var capacity = 0,
        k = rate >= 1 ? rate : 1.2,
        buf;
    return function(size) {
      if (size > capacity) {
        capacity = Math.ceil(size * k);
        buf = constructor ? new constructor(capacity) : createBuffer(capacity);
      }
      return buf;
    };
  }

  function copyElements(src, i, dest, j, n, rev) {
    var same = src == dest || src.buffer && src.buffer == dest.buffer;
    var inc = 1,
        offs = 0,
        k;
    if (rev) {
      if (same) error('copy error');
      inc = -1;
      offs = n - 1;
    }
    if (same && j > i) {
      for (k=n-1; k>=0; k--) {
        dest[j + k] = src[i + k];
      }
    } else {
      for (k=0; k<n; k++, offs += inc) {
        dest[k + j] = src[i + offs];
      }
    }
  }

  function extendBuffer(src, newLen, copyLen) {
    var len = Math.max(src.length, newLen);
    var n = copyLen || src.length;
    var dest = new src.constructor(len);
    copyElements(src, 0, dest, 0, n);
    return dest;
  }

  function mergeNames(name1, name2) {
    var merged;
    if (name1 && name2) {
      merged = findStringPrefix(name1, name2).replace(/[-_]$/, '');
    }
    return merged || '';
  }

  function findStringPrefix(a, b) {
    var i = 0;
    for (var n=a.length; i<n; i++) {
      if (a[i] !== b[i]) break;
    }
    return a.substr(0, i);
  }

  function parsePercent(o) {
    var str = String(o);
    var isPct = str.indexOf('%') > 0;
    var pct;
    if (isPct) {
      pct = Number(str.replace('%', '')) / 100;
    } else {
      pct = Number(str);
    }
    if (!(pct >= 0 && pct <= 1)) {
      stop(format("Invalid percentage: %s", str));
    }
    return pct;
  }

  function formatVersionedName(name, i) {
    var suffix = String(i);
    if (/[0-9]$/.test(name)) {
      suffix = '-' + suffix;
    }
    return name + suffix;
  }

  function uniqifyNames(names, formatter) {
    var counts = countValues(names),
        format = formatter || formatVersionedName,
        names2 = [];

    names.forEach(function(name) {
      var i = 0,
          candidate = name,
          versionedName;
      while (
          names2.indexOf(candidate) > -1 || // candidate name has already been used
          candidate == name && counts[candidate] > 1 || // duplicate unversioned names
          candidate != name && counts[candidate] > 0) { // versioned name is a preexisting name
        i++;
        versionedName = format(name, i);
        if (!versionedName || versionedName == candidate) {
          throw new Error("Naming error"); // catch buggy versioning function
        }
        candidate = versionedName;
      }
      names2.push(candidate);
    });
    return names2;
  }


  // Assume: @raw is string, undefined or null
  function parseString(raw) {
    return raw ? raw : "";
  }

  // Assume: @raw is string, undefined or null
  // Use null instead of NaN for unparsable values
  // (in part because if NaN is used, empty strings get converted to "NaN"
  // when re-exported).
  function parseNumber(raw) {
    return parseToNum(raw, cleanNumericString);
  }

  function parseIntlNumber(raw) {
    return parseToNum(raw, convertIntlNumString);
  }

  function parseToNum(raw, clean) {
    var str = String(raw).trim();
    var parsed = str ? Number(clean(str)) : NaN;
    return isNaN(parsed) ? null : parsed;
  }

  // Remove comma separators from strings
  function cleanNumericString(str) {
    return (str.indexOf(',') > 0) ? str.replace(/,([0-9]{3})/g, '$1') : str;
  }

  function convertIntlNumString(str) {
    str = str.replace(/[ .]([0-9]{3})/g, '$1');
    return str.replace(',', '.');
  }

  function trimQuotes(str) {
    var len = str.length, first, last;
    if (len >= 2) {
      first = str.charAt(0);
      last = str.charAt(len-1);
      if (first == '"' && last == '"' && !str.includes('","') ||
          first == "'" && last == "'" && !str.includes("','")) {
        str = str.substr(1, len-2);
        // remove string escapes
        str = str.replace(first == '"' ? /\\(?=")/g : /\\(?=')/g, '');
      }
    }
    return str;
  }

  function absArcId(arcId) {
    return arcId >= 0 ? arcId : ~arcId;
  }

  function calcArcBounds(xx, yy, start, len) {
    var i = start | 0,
        n = isNaN(len) ? xx.length - i : len + i,
        x, y, xmin, ymin, xmax, ymax;
    if (n > 0) {
      xmin = xmax = xx[i];
      ymin = ymax = yy[i];
    }
    for (i++; i<n; i++) {
      x = xx[i];
      y = yy[i];
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
    return [xmin, ymin, xmax, ymax];
  }

  function getUnfilteredArcLength(arcId, arcs) {
    var data = arcs.getVertexData();
    return data.nn[arcId];
  }

  function getUnfilteredArcCoords(arcId, arcs) {
    var data = arcs.getVertexData();
    var coords = [];
    var start = data.ii[arcId];
    var n = data.nn[arcId];
    for (var i=0; i<n; i++) {
      coords.push([data.xx[start + i], data.yy[start + i]]);
    }
    return coords;
  }

  function findArcIdFromVertexId(i, ii) {
    // binary search
    // possible optimization: use interpolation to find a better partition value.
    var lower = 0, upper = ii.length - 1;
    var middle;
    while (lower < upper) {
      middle = Math.ceil((lower + upper) / 2);
      if (i < ii[middle]) {
        upper = middle - 1;
      } else {
        lower = middle;
      }
    }
    return lower; // assumes dataset is not empty
  }

  function deleteLastArc(arcs) {
    var data = arcs.getVertexData();
    var arcId = arcs.size() - 1;
    var arcLen = data.nn[arcId];
    var n = data.xx.length;
    var z = arcs.getRetainedInterval();
    var xx2 = new Float64Array(data.xx.buffer, 0, n-arcLen);
    var yy2 = new Float64Array(data.yy.buffer, 0, n-arcLen);
    var nn2 = new Int32Array(data.nn.buffer, 0, arcs.size() - 1);
    var zz2 = arcs.isFlat() ?
      null :
      new Float64Array(data.zz.buffer, 0, n-arcLen);
    arcs.updateVertexData(nn2, xx2, yy2, zz2);
    arcs.setRetainedInterval(z);
  }

  function deleteVertex(arcs, i) {
    var data = arcs.getVertexData();
    var nn = data.nn;
    var n = data.xx.length;
    // avoid re-allocating memory
    var xx2 = new Float64Array(data.xx.buffer, 0, n-1);
    var yy2 = new Float64Array(data.yy.buffer, 0, n-1);
    var zz2 = arcs.isFlat() ? null : new Float64Array(data.zz.buffer, 0, n-1);
    var z = arcs.getRetainedInterval();
    var count = 0;
    var found = false;
    for (var j=0; j<nn.length; j++) {
      count += nn[j];
      if (count >= i && !found) { // TODO: confirm this
        nn[j] = nn[j] - 1;
        found = true;
      }
    }
    utils.copyElements(data.xx, 0, xx2, 0, i);
    utils.copyElements(data.yy, 0, yy2, 0, i);
    utils.copyElements(data.xx, i+1, xx2, i, n-i-1);
    utils.copyElements(data.yy, i+1, yy2, i, n-i-1);
    if (zz2) {
      utils.copyElements(data.zz, 0, zz2, 0, i);
      utils.copyElements(data.zz, i+1, zz2, i, n-i-1);
    }
    arcs.updateVertexData(nn, xx2, yy2, zz2);
    arcs.setRetainedInterval(z);
  }

  function appendEmptyArc(arcs) {
    var data = arcs.getVertexData();
    var nn = utils.extendBuffer(data.nn, data.nn.length + 1, data.nn.length);
    arcs.updateVertexData(nn, data.xx, data.yy, data.zz);
  }

  // adds vertex to last arc
  // (used when adding lines in the GUI)
  // p: [x, y] point in display coordinates
  function appendVertex(arcs, p) {
    var i = arcs.getPointCount(); // one past the last idx
    insertVertex(arcs, i, p);
  }

  function insertVertex(arcs, i, p) {
    var data = arcs.getVertexData();
    var nn = data.nn;
    var n = data.xx.length;
    var count = 0;
    var xx2, yy2, zz2;
    // avoid re-allocating memory on each insertion
    if (data.xx.buffer.byteLength >= data.xx.length * 8 + 8) {
      xx2 = new Float64Array(data.xx.buffer, 0, n+1);
      yy2 = new Float64Array(data.yy.buffer, 0, n+1);
    } else {
      xx2 = new Float64Array(new ArrayBuffer((n + 50) * 8), 0, n+1);
      yy2 = new Float64Array(new ArrayBuffer((n + 50) * 8), 0, n+1);
    }
    if (!arcs.isFlat()) {
      zz2 = new Float64Array(new ArrayBuffer((n + 1) * 8), 0, n+1);
    }
    if (i < 0 || i > n) {
      error('Out-of-range vertex insertion index:', i);
    } else if (i == n) {
      // appending vertex to last arc
      nn[nn.length - 1]++;
    } else {
      for (var j=0; j<nn.length; j++) {
        count += nn[j];
        if (count >= i) { // TODO: confirm this
          nn[j] = nn[j] + 1;
          break;
        }
      }
    }

    utils.copyElements(data.xx, 0, xx2, 0, i);
    utils.copyElements(data.yy, 0, yy2, 0, i);
    utils.copyElements(data.xx, i, xx2, i+1, n-i);
    utils.copyElements(data.yy, i, yy2, i+1, n-i);
    xx2[i] = p[0];
    yy2[i] = p[1];
    if (zz2) {
      zz2[i] = Infinity;
      utils.copyElements(data.zz, 0, zz2, 0, i);
      utils.copyElements(data.zz, i, zz2, i+1, n-i);
    }
    arcs.updateVertexData(nn, xx2, yy2, zz2);
  }

  function countFilteredVertices(zz, zlimit) {
    var count = 0;
    for (var i=0, n = zz.length; i<n; i++) {
      if (zz[i] >= zlimit) count++;
    }
    return count;
  }

  function filterVertexData(o, zlimit) {
    if (!o.zz) error('Expected simplification data');
    var xx = o.xx,
        yy = o.yy,
        zz = o.zz,
        len2 = countFilteredVertices(zz, zlimit),
        arcCount = o.nn.length,
        xx2 = new Float64Array(len2),
        yy2 = new Float64Array(len2),
        zz2 = new Float64Array(len2),
        nn2 = new Int32Array(arcCount),
        i = 0, i2 = 0,
        n, n2;

    for (var arcId=0; arcId < arcCount; arcId++) {
      n2 = 0;
      n = o.nn[arcId];
      for (var end = i+n; i < end; i++) {
        if (zz[i] >= zlimit) {
          xx2[i2] = xx[i];
          yy2[i2] = yy[i];
          zz2[i2] = zz[i];
          i2++;
          n2++;
        }
      }
      if (n2 == 1) {
        error("Collapsed arc");
        // This should not happen (endpoints should be z == Infinity)
        // Could handle like this, instead of throwing an error:
        // n2 = 0;
        // xx2.pop();
        // yy2.pop();
        // zz2.pop();
      } else if (n2 === 0) {
        // collapsed arc... ignoring
      }
      nn2[arcId] = n2;
    }
    return {
      xx: xx2,
      yy: yy2,
      zz: zz2,
      nn: nn2
    };
  }

  // featureFilter: optional test function, accepts feature id
  //
  function getShapeHitTest(layer, ext, interactionMode, featureFilter) {
    var geoType = layer.gui.displayLayer.geometry_type;
    var test;
    if (geoType == 'point' && layer.gui.style.type == 'styled') {
      test = getGraduatedCircleTest(getRadiusFunction(layer.gui.style));
    } else if (geoType == 'point') {
      test = pointTest;
    } else if (interactionMode == 'edit_polygons') {
      test = polygonVertexTest;
    } else if (
        interactionMode == 'vertices' ||
        interactionMode == 'edit_lines') {
      test = vertexTest;
    } else if (geoType == 'polyline') {
      test = polylineTest;
    } else if (geoType == 'polygon') {
      test = polygonTest;
    } else {
      error$1("Unexpected geometry type:", geoType);
    }
    return test;

    // Convert pixel distance to distance in coordinate units.
    function getHitBuffer(pix) {
      return pix / ext.getTransform().mx;
    }

    // reduce hit threshold when zoomed out
    function getZoomAdjustedHitBuffer(pix, minPix) {
      var scale = ext.scale();
      if (scale < 1) {
        pix *= scale;
      }
      if (minPix > 0 && pix < minPix) pix = minPix;
      return getHitBuffer(pix);
    }

    function polygonTest(x, y) {
      var maxDist = getZoomAdjustedHitBuffer(10, 1),
          cands = findHitCandidates(x, y, maxDist),
          hits = [],
          cand, hitId;
      for (var i=0; i<cands.length; i++) {
        cand = cands[i];
        if (geom.testPointInPolygon(x, y, cand.shape, layer.gui.displayArcs)) {
          hits.push(cand);
        }
      }
      if (cands.length > 0 && hits.length === 0) {
        // secondary detection: proximity, if not inside a polygon
        sortByDistance(x, y, cands, layer.gui.displayArcs);
        hits = pickNearestCandidates(cands, 0, maxDist);
      }
      return {
        ids: utils$1.pluck(hits, 'id')
      };
    }

    function polygonVertexTest(x, y) {
      var a = polygonTest(x, y);
      var b = polylineTest(x, y, 5);
      return {
        ids: utils$1.uniq(b.ids.concat(a.ids))
      };
    }

    function vertexTest(x, y) {
      return polylineTest(x, y, 0);
    }

    function polylineTest(x, y, bufArg) {
      var maxDist = getZoomAdjustedHitBuffer(15, 2),
          bufPix = bufArg >= 0 ? bufArg : 0.05, // tiny threshold for hitting almost-identical lines
          bufDist = getZoomAdjustedHitBuffer(bufPix),
          cands = findHitCandidates(x, y, maxDist);
      sortByDistance(x, y, cands, layer.gui.displayArcs);
      cands = pickNearestCandidates(cands, bufDist, maxDist);
      return {
        ids: utils$1.pluck(cands, 'id')
      };
    }

    function pickNearestCandidates(sorted, bufDist, maxDist) {
      var hits = [],
          cand, minDist;
      for (var i=0; i<sorted.length; i++) {
        cand = sorted[i];
        if (cand.dist < maxDist !== true) {
          break;
        } else if (i === 0) {
          minDist = cand.dist;
        } else if (cand.dist - minDist > bufDist) {
          break;
        }
        hits.push(cand);
      }
      return hits;
    }

    function sortByDistance(x, y, cands, arcs) {
      var cand;
      for (var i=0; i<cands.length; i++) {
        cand = cands[i];
        cand.info = geom.getPointToShapeInfo(x, y, cands[i].shape, arcs);
        cand.dist = cand.info.distance;
      }
      utils$1.sortOn(cands, 'dist');
    }

    function pointTest(x, y) {
      var bullseyeDist = 2, // hit all points w/in 2 px
          // use small threshold when adding points
          hitThreshold = interactionMode == 'edit_points' ? 12 : 25,
          toPx = ext.getTransform().mx,
          hits = [];

      // inlining forEachPoint() does not not appreciably speed this up
      internal.forEachPoint(layer.gui.displayLayer.shapes, function(p, id) {
        var dist = geom.distance2D(x, y, p[0], p[1]) * toPx;
        if (dist > hitThreshold) return;
        if (dist < hitThreshold && hitThreshold > bullseyeDist) {
          hits = [];
          hitThreshold = Math.max(bullseyeDist, dist);
        }
        hits.push(id);
      });
      // TODO: add info on what part of a shape gets hit?
      return {
        ids: utils$1.uniq(hits) // multipoint features can register multiple hits
      };
    }

    function getRadiusFunction(style) {
      var o = {};
      if (style.styler) {
        return function(i) {
          style.styler(o, i);
          return o.radius || 0;
        };
      }
      return function() {return style.radius || 0;};
    }

    function getGraduatedCircleTest(radius) {
      return function(x, y) {
        var hits = [],
            margin = getHitBuffer(12),
            limit = getHitBuffer(50), // short-circuit hit test beyond this threshold
            directHit = false,
            hitRadius = 0,
            hitDist;
        internal.forEachPoint(layer.gui.displayLayer.shapes, function(p, id) {
          var distSq = geom.distanceSq(x, y, p[0], p[1]);
          var isHit = false;
          var isOver, isNear, r, d, rpix;
          if (distSq > limit * limit) return;
          rpix = radius(id);
          r = getHitBuffer(rpix + 1); // increase effective radius to make small bubbles easier to hit in clusters
          d = Math.sqrt(distSq) - r; // pointer distance from edge of circle (negative = inside)
          isOver = d < 0;
          isNear = d < margin;
          if (!isNear || rpix > 0 === false) {
            isHit = false;
          } else if (hits.length === 0) {
            isHit = isNear;
          } else if (!directHit && isOver) {
            isHit = true;
          } else if (directHit && isOver) {
            isHit = r == hitRadius ? d <= hitDist : r < hitRadius; // smallest bubble wins if multiple direct hits
          } else if (!directHit && !isOver) {
            // closest to bubble edge wins
            isHit = hitDist == d ? r <= hitRadius : d < hitDist; // closest bubble wins if multiple indirect hits
          }
          if (isHit) {
            if (hits.length > 0 && (r != hitRadius || d != hitDist)) {
              hits = [];
            }
            hitRadius = r;
            hitDist = d;
            directHit = isOver;
            hits.push(id);
          }
        });
        return {
          ids: hits
        };
      };
    }

    // Returns array of shape ids for shapes that pass a buffered bounding-box test
    function findHitCandidates(x, y, dist) {
      var arcs = layer.gui.displayArcs,
          index = {},
          cands = [],
          bbox = [];
      layer.gui.displayLayer.shapes.forEach(function(shp, shpId) {
        var cand;
        if (featureFilter && !featureFilter(shpId)) {
          return;
        }
        for (var i = 0, n = shp && shp.length; i < n; i++) {
          arcs.getSimpleShapeBbox(shp[i], bbox);
          if (x + dist < bbox[0] || x - dist > bbox[2] ||
            y + dist < bbox[1] || y - dist > bbox[3]) {
            continue; // bbox non-intersection
          }
          cand = index[shpId];
          if (!cand) {
            cand = index[shpId] = {shape: [], id: shpId, dist: 0};
            cands.push(cand);
          }
          cand.shape.push(shp[i]);
        }
      });
      return cands;
    }
  }

  function getSymbolNodeId(node) {
    return parseInt(node.getAttribute('data-id'));
  }

  function getSvgSymbolTransform(xy, ext) {
    var scale = ext.getSymbolScale();
    var p = ext.translateCoords(xy[0], xy[1]);
    return internal.svg.getTransform(p, scale);
  }

  function repositionSymbols(elements, layer, ext) {
    var el, idx, shp, p, displayOn, inView, displayBounds;
    for (var i=0, n=elements.length; i<n; i++) {
      el = elements[i];
      idx = getSymbolNodeId(el);
      shp = layer.shapes[idx];
      if (!shp) continue;
      p = shp[0];
      // OPTIMIZATION: only display symbols that are in view
      // quick-and-dirty hit-test: expand the extent rectangle by a percentage.
      //   very large symbols will disappear before they're completely out of view
      displayBounds = ext.getBounds(1.15);
      displayOn = !el.hasAttribute('display') || el.getAttribute('display') == 'block';
      inView = displayBounds.containsPoint(p[0], p[1]);
      if (inView) {
        if (!displayOn) el.setAttribute('display', 'block');
        el.setAttribute('transform', getSvgSymbolTransform(p, ext));
      } else {
        if (displayOn) el.setAttribute('display', 'none');
      }
    }
  }

  function renderSymbols(lyr, ext) {
    var records = lyr.data.getRecords();
    var symbols = lyr.shapes.map(function(shp, i) {
      var d = records[i];
      var obj = internal.svg.renderPoint(d);
      if (!obj || !shp) return null;
      obj.properties.class = 'mapshaper-svg-symbol';
      obj.properties.transform = getSvgSymbolTransform(shp[0], ext);
      obj.properties['data-id'] = i;
      return obj;
    }).filter(Boolean);
    var obj = internal.getEmptyLayerForSVG(lyr, {});
    obj.children = symbols;
    return internal.svg.stringify(obj);
  }

  function getSvgHitTest(displayLayer) {

    return function(pointerEvent) {
      // target could be a part of an SVG symbol, or the SVG element, or something else
      var target = pointerEvent.originalEvent.target;
      var symbolNode = getSymbolNode(target);
      if (!symbolNode) {
        return null;
      }
      return {
        targetId: getSymbolNodeId(symbolNode), // TODO: some validation on id
        targetSymbol: symbolNode,
        targetNode: target,
        container: symbolNode.parentNode
      };
    };

    // target: event target (could be any DOM element)
    function getSymbolNode(target) {
      var node = target;
      while (node && nodeHasSymbolTagType(node)) {
        if (isSymbolNode(node)) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    // TODO: switch to attribute detection
    function nodeHasSymbolTagType(node) {
      var tag = node.tagName;
      return tag == 'g' || tag == 'tspan' || tag == 'text' || tag == 'image' ||
        tag == 'path' || tag == 'circle' || tag == 'rect' || tag == 'line';
    }

    function isSymbolNode(node) {
      return node.hasAttribute('data-id') && (node.tagName == 'text' || node.tagName == 'g');
    }

    function isSymbolChildNode(node) {

    }

    function getChildId(childNode) {

    }

    function getSymbolId(symbolNode) {

    }

    function getFeatureId(symbolNode) {

    }

  }

  function getPointerHitTest(mapLayer, ext, interactionMode, featureFilter) {
    var shapeTest, targetLayer;
    // need hit test on empty layers, in case we are drawing shapes
    // if (!mapLayer || !internal.layerHasGeometry(mapLayer.gui?.displayLayer)) {
    if (!mapLayer || !mapLayer.gui?.displayLayer.geometry_type) {
      return function() {return {ids: []};};
    }
    shapeTest = getShapeHitTest(mapLayer, ext, interactionMode, featureFilter);

    // e: pointer event
    return function(e) {
      var p = ext.translatePixelCoords(e.x, e.y);
      // update SVG hit test on each test, in case SVG layer has been redrawn
      // and the symbol container has changed
      var svgTest = getSvgHitTest(mapLayer);
      var data = shapeTest(p[0], p[1]) || {ids:[]};
      var svgData = svgTest(e); // null or a data object
      if (svgData) { // mouse is over an SVG symbol
        utils$1.extend(data, svgData);
        // placing symbol id in front of any other hits
        data.ids = utils$1.uniq([svgData.targetId].concat(data.ids));
      }
      data.id = data.ids.length > 0 ? data.ids[0] : -1;
      return data;
    };
  }

  function HitControl(gui, ext, mouse) {
    var self = new EventDispatcher();
    var storedData = noHitData(); // may include additional data from SVG symbol hit (e.g. hit node)
    var selectionIds = [];
    var transientIds = []; // e.g. hit ids while dragging a box
    var drawingId = -1; // kludge to allow hit detection and drawing (different feature ids)
    var active = false;
    var targetLayer;
    var hitTest;
    var pinnedOn; // used in multi-edit mode (selection) for toggling pinning behavior

    // event priority is higher than navigation, so stopping propagation disables
    // pan navigation
    var priority = 2;

    mouse.on('contextmenu', function(e) {
      e.originalEvent.preventDefault();
      if (El('body').hasClass('map-view')) {
        triggerHitEvent('contextmenu', e);
      }
    });

    // init keyboard controls for pinned features
    gui.keyboard.on('keydown', function(evt) {
      var e = evt.originalEvent;

      if (gui.interaction.getMode() == 'off' || !targetLayer) return;

      // esc key clears selection (unless in an editing mode -- esc key also exits current mode)
      if (e.keyCode == 27 && !gui.getMode()) {
        self.clearSelection();
        return;
      }

      // ignore keypress if no feature is selected or user is editing text
      if (pinnedId() == -1 || GUI.textIsSelected()) return;

      if (e.keyCode == 37 || e.keyCode == 39) {
        // L/R arrow keys
        // advance pinned feature
        advanceSelectedFeature(e.keyCode == 37 ? -1 : 1);
        e.stopPropagation();

      } else if (e.keyCode == 8) {
        // DELETE key
        // delete pinned feature
        // to help protect against inadvertent deletion, don't delete
        // when console is open or a popup menu is open
        if (!gui.getMode() && !gui.consoleIsOpen()) {
          internal.deleteFeatureById(targetLayer, pinnedId());
          self.clearSelection();
          gui.model.updated({flags: 'filter'}); // signal map to update
        }
      }
    }, !!'capture'); // preempt the layer control's arrow key handler

    self.setLayer = function(mapLayer) {
      targetLayer = mapLayer;
      updateHitTest();
    };

    function updateHitTest(featureFilter) {
      hitTest = getPointerHitTest(targetLayer, ext, interactionMode(), featureFilter);
    }

    function interactionMode() {
      return gui.interaction.getMode();
    }

    function turnOn(mode) {
      active = true;
      updateHitTest();
    }

    function turnOff() {
      if (active) {
        updateSelectionState(null); // no hit data, no event
        active = false;
        hitTest = null;
        pinnedOn = false;
        drawingId = -1;
      }
    }

    function selectable() {
      return interactionMode() == 'selection';
    }

    function pinnable() {
      return clickable() && !selectable();
      // return clickable();
    }

    function draggable() {
      var mode = interactionMode();
      return mode == 'vertices' || mode == 'edit_points' ||
        mode == 'labels' || mode == 'edit_lines' || mode == 'edit_polygons';
    }

    function clickable() {
      var mode = interactionMode();
      // click used to pin popup and select features
      return mode == 'data' || mode == 'info' || mode == 'selection' ||
      mode == 'rectangles' || mode == 'edit_points';
    }

    self.getHitId = function() {
      return hitTest ? storedData.id : -1;
    };

    self.setHitId = function(id) {
      if (storedData.id == id) return;
      storedData.id = id;
      storedData.ids = id == -1 ? [] : [id];
      triggerHitEvent('change');
    };

    // Get a reference to the active layer, so listeners to hit events can interact
    // with data and shapes
    self.getHitTarget = function() {
      return targetLayer;
    };

    self.addSelectionIds = function(ids) {
      turnOn('selection');
      selectionIds = utils$1.uniq(selectionIds.concat(ids));
      ids = utils$1.uniq(storedData.ids.concat(ids));
      updateSelectionState({ids: ids});
    };

    self.setPinning = function(val) {
      if (pinnedOn != val) {
        pinnedOn = val;
        triggerHitEvent('change');
      }
    };

    self.setTransientIds = function(ids) {
      // turnOn('selection');
      transientIds = ids || [];
      if (active) {
        triggerHitEvent('change');
      }
    };

    // manually set the selected feature id(s)
    // used when hit detection is turned off, e.g. 'drawing' mode
    self.setDrawingId = function(id) {
      if (id == drawingId) return;
      drawingId = id >= 0 ? id : -1;
      updateHitTest(function(shpId) {
        return shpId != id;
      });
      self.triggerChangeEvent();
    };

    self.triggerChangeEvent = function() {
      triggerHitEvent('change');
    };

    self.clearDrawingId = function() {
      self.setDrawingId(-1);
    };

    self.setHoverVertex = function(p, type) {
      var p2 = storedData.hit_coordinates;
      if (!active || !p) return;
      if (p2 && p2[0] == p[0] && p2[1] == p[1]) return;
      storedData.hit_coordinates = p;
      storedData.hit_type = type || '';
      triggerHitEvent('change');
    };

    self.clearHoverVertex = function() {
      if (!storedData.hit_coordinates) return;
      delete storedData.hit_coordinates;
      delete storedData.hit_type;
      triggerHitEvent('change');
    };

    self.clearSelection = function() {
      updateSelectionState(null);
    };

    self.clearHover = function() {
      updateSelectionState(mergeHoverData({ids: []}));
    };

    self.getSelectionIds = function() {
      return selectionIds.concat();
    };

    self.getTargetDataTable = function() {
      var targ = self.getHitTarget();
      return targ?.data || null;
    };

    // get function for selecting next or prev feature within the current set of
    // selected features
    self.getSwitchTrigger = function(diff) {
      return function() {
        switchWithinSelection(diff);
      };
    };

    // diff: 1 or -1
    function advanceSelectedFeature(diff) {
      var n = internal.getFeatureCount(targetLayer);
      if (n < 2 || pinnedId() == -1) return;
      storedData.id = (pinnedId() + n + diff) % n;
      storedData.ids = [storedData.id];
      triggerHitEvent('change');
    }

    // diff: 1 or -1
    function switchWithinSelection(diff) {
      var id = pinnedId();
      var i = storedData.ids.indexOf(id);
      var n = storedData.ids.length;
      if (i < 0 || n < 2) return;
      storedData.id = storedData.ids[(i + diff + n) % n];
      triggerHitEvent('change');
    }

    // make sure popup is unpinned and turned off when switching editing modes
    // (some modes do not support pinning)
    gui.on('interaction_mode_change', function(e) {
      self.clearSelection();
      if (gui.interaction.modeUsesHitDetection(e.mode)) {
        turnOn(e.mode);
      } else {
        turnOff();
      }
    });

    gui.on('undo_redo_pre', function() {
      self.clearSelection();
    });

    gui.on('shift_drag_start', function() {
      self.clearHover();
    });

    mouse.on('dblclick', handlePointerEvent, null, priority);
    mouse.on('dragstart', handlePointerEvent, null, priority);
    mouse.on('drag', handlePointerEvent, null, priority);
    mouse.on('dragend', handlePointerEvent, null, priority);


    mouse.on('click', function(e) {
      var pinned = storedData.pinned;
      if (!hitTest || !active) return;
      if (!eventIsEnabled('click')) return;
      e.stopPropagation();

      // TODO: move pinning to inspection control?
      if (clickable()) {
        updateSelectionState(convertClickDataToSelectionData(hitTest(e)));
      }

      if (pinned && interactionMode() == 'edit_points') {
        // kludge: intercept the click event if popup is turning off, so
        // a new point doesn't get made
        return;
      }
      triggerHitEvent('click', e);
    }, null, priority);

    // Hits are re-detected on 'hover' (if hit detection is active)
    mouse.on('hover', function(e) {
      if (gui.contextMenu.isOpen()) return;
      handlePointerEvent(e);
      if (storedData.pinned || !hitTest || !active) return;
      if (e.hover && isOverMap(e)) {
        // mouse is hovering directly over map area -- update hit detection
        updateSelectionState(mergeHoverData(hitTest(e)));
      } else if (targetIsRollover(e.originalEvent.target)) {
        // don't update hit detection if mouse is over the rollover (to prevent
        // on-off flickering)
      } else {
        updateSelectionState(mergeHoverData({ids:[]}));
      }
    }, null, priority);


    function targetIsRollover(target) {
      while (target.parentNode && target != target.parentNode) {
        if (target.className && String(target.className).indexOf('rollover') > -1) {
          return true;
        }
        target = target.parentNode;
      }
      return false;
    }

    function noHitData() {return {ids: [], id: -1, pinned: false};}

    // Translates feature hit data from a mouse click into feature selection data
    // hitData: hit data from a mouse click
    function convertClickDataToSelectionData(hitData) {
      // mergeCurrentState(hitData);
      // TOGGLE pinned state under some conditions
      var id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
      hitData.id = id;
      if (pinnable()) {
        if (!storedData.pinned && id > -1) {
          hitData.pinned = true; // add pin
        } else if (storedData.pinned && storedData.id == id) {
          delete hitData.pinned; // remove pin
          // hitData.id = -1; // keep highlighting (pointer is still hovering)
        } else if (storedData.pinned && id > -1) {
          hitData.pinned = true; // stay pinned, switch id
        }
      }
      if (selectable()) {
        if (id > -1) {
          selectionIds = toggleId(id, selectionIds);
        }
        hitData.ids = selectionIds;
      }
      return hitData;
    }

    function mergeSelectionModeHoverData(hitData) {
        if (hitData.ids.length === 0 || selectionIds.includes(hitData.ids[0])) {
          hitData.ids = selectionIds;
          hitData.pinned = storedData.pinned;
        } else {
          //
        }

        // kludge to inhibit hover effect while dragging a box
        if (gui.keydown) hitData.id = -1;
        return hitData;
    }

    function mergeHoverData(hitData) {
      if (storedData.pinned) {
        hitData.id = storedData.id;
        hitData.pinned = true;
      } else {
        hitData.id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
      }
      if (selectable()) {
        hitData.ids = selectionIds;
        // kludge to inhibit hover effect while dragging a box
        if (gui.keydown) hitData.id = -1;
      }
      return hitData;
    }

    function pinnedId() {
      return storedData.pinned ? storedData.id : -1;
    }

    function toggleId(id, ids) {
      if (ids.indexOf(id) > -1) {
        return utils$1.difference(ids, [id]);
      }
      return [id].concat(ids);
    }

    // If hit ids have changed, update stored hit ids and fire 'hover' event
    // evt: (optional) mouse event
    function updateSelectionState(newData) {
      var nonEmpty = newData && (newData.ids.length || newData.id > -1);
      transientIds = [];
      if (!newData) {
        newData = noHitData();
        selectionIds = [];
      }

      if (!testHitChange(storedData, newData)) {
        return;
      }

      storedData = newData;
      gui.container.findChild('.map-layers').classed('symbol-hit', nonEmpty);
      if (active) {
        triggerHitEvent('change');
      }
    }

    // check if an event is used in the current interaction mode
    function eventIsEnabled(type) {
      var mode = interactionMode();
      if (!active) return false;
      if (type == 'click' && gui.keyboard.ctrlIsPressed()) {
        return false; // don't fire if context menu might open
      }
      if (type == 'click' && gui.contextMenu.isOpen()) {
        return false;
      }
      if (type == 'click' &&
        (mode == 'edit_lines' || mode == 'edit_polygons')) {
        return true; // click events are triggered even if no shape is hit
      }
      if (type == 'click' && mode == 'edit_points') {
        return true;
      }
      if ((mode == 'edit_lines' || mode == 'edit_polygons') &&
          (type == 'hover' || type == 'dblclick')) {
        return true; // special case -- using hover for line drawing animation
      }

      // ignore pointer events when no features are being hit
      // (don't block pan and other navigation when events aren't being used for editing)
      var hitId = self.getHitId();
      if (hitId == -1) return false;

      if ((type == 'drag' || type == 'dragstart' || type == 'dragend') && !draggable()) {
        return false;
      }
      return true;
    }

    function isOverMap(e) {
      return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
    }

    function possiblyStopPropagation(e) {
      if (interactionMode() == 'edit_lines' || interactionMode() == 'edit_polygons') {
        // handled conditionally in the control
        return;
      }
      e.stopPropagation();
    }

    function handlePointerEvent(e) {
      if (eventIsEnabled(e.type)) {
        possiblyStopPropagation(e);
        triggerHitEvent(e.type, e);
      }
    }

    // evt: event data (may be a pointer event object, an ordinary object or null)
    function triggerHitEvent(type, evt) {
      var eventData = {
        mode: interactionMode()
      };
      if (evt) {
        // data coordinates
        eventData.projected_coordinates = gui.map.pixelCoordsToProjectedCoords(evt.x, evt.y);
        eventData.lonlat_coordinates = gui.map.pixelCoordsToLngLatCoords(evt.x, evt.y);
        eventData.originalEvent = evt;
        eventData.overMap = isOverMap(evt);
      }
      // Merge stored hit data into the event data
      utils$1.defaults(eventData, evt && evt.data || {}, storedData);
      // utils.extend(eventData, storedData);
      if (transientIds.length) {
        // add transient ids to any other hit ids
        eventData.ids = utils$1.uniq(transientIds.concat(eventData.ids || []));
      }
      // when drawing, we want the overlay layer to show the path being currently
      // drawn.
      if (drawingId >= 0) {
        // eventData.ids = [drawingId];
        // eventData.id = drawingId;
        eventData.ids = utils$1.uniq(eventData.ids.concat([drawingId]));
      }
      if (pinnedOn) {
        eventData.pinned = true;
      }
      self.dispatchEvent(type, eventData);
    }

    // Test if two hit data objects are equivalent
    function testHitChange(a, b) {
      // check change in 'container', e.g. so moving from anchor hit to label hit
      //   is detected
      if (sameIds(a.ids, b.ids) && a.container == b.container && a.pinned == b.pinned && a.id == b.id) {
        return false;
      }
      return true;
    }

    function sameIds(a, b) {
      if (a.length != b.length) return false;
      for (var i=0; i<a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }

    return self;
  }

  function getTimerFunction() {
    return typeof requestAnimationFrame == 'function' ?
      requestAnimationFrame : function(cb) {setTimeout(cb, 25);};
  }

  function Timer() {
    var self = this,
        running = false,
        busy = false,
        tickTime, startTime, duration;

    this.start = function(ms) {
      var now = +new Date();
      duration = ms || Infinity;
      startTime = now;
      running = true;
      if (!busy) startTick(now);
    };

    this.stop = function() {
      running = false;
    };

    function startTick(now) {
      busy = true;
      tickTime = now;
      getTimerFunction()(onTick);
    }

    function onTick() {
      var now = +new Date(),
          elapsed = now - startTime,
          pct = Math.min((elapsed + 10) / duration, 1),
          done = pct >= 1;
      if (!running) { // interrupted
        busy = false;
        return;
      }
      if (done) running = false;
      self.dispatchEvent('tick', {
        elapsed: elapsed,
        pct: pct,
        done: done,
        time: now,
        tickTime: now - tickTime
      });
      busy = false;
      if (running) startTick(now);
    }
  }

  utils$1.inherit(Timer, EventDispatcher);

  function Tween(ease) {
    var self = this,
        timer = new Timer(),
        start, end;

    timer.on('tick', onTick);

    this.start = function(a, b, duration) {
      start = a;
      end = b;
      timer.start(duration || 500);
    };

    function onTick(e) {
      var pct = ease ? ease(e.pct) : e.pct,
          val = end * pct + start * (1 - pct);
      self.dispatchEvent('change', {value: val});
    }
  }

  utils$1.inherit(Tween, EventDispatcher);

  Tween.sineInOut = function(n) {
    return 0.5 - Math.cos(n * Math.PI) / 2;
  };

  Tween.quadraticOut = function(n) {
    return 1 - Math.pow((1 - n), 2);
  };

  function ElementPosition(ref) {
    var self = this,
        el = El(ref),
        pageX = 0,
        pageY = 0,
        width = 0,
        height = 0;

    el.on('mouseover', update);
    if (window.onorientationchange) window.addEventListener('orientationchange', update);
    window.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    // trigger an update, e.g. when map container is resized
    this.update = function() {
      update();
    };

    this.resize = function(w, h) {
      el.css('width', w).css('height', h);
      update();
    };

    this.width = function() { return width; };
    this.height = function() { return height; };
    this.position = function() {
      return {
        element: el.node(),
        pageX: pageX,
        pageY: pageY,
        width: width,
        height: height
      };
    };

    function update() {
      var div = el.node(),
          xy = getPageXY(div),
          w = div.clientWidth,
          h = div.clientHeight,
          x = xy.x,
          y = xy.y,
          resized = w != width || h != height,
          moved = x != pageX || y != pageY;
      if (resized || moved) {
        pageX = x;
        pageY = y;
        width = w;
        height = h;
        self.dispatchEvent('change', self.position());
        if (resized) {
          self.dispatchEvent('resize', self.position());
        }
      }
    }
    update();
  }

  utils$1.inherit(ElementPosition, EventDispatcher);

  function MouseWheelDirection() {
    var prevTime = 0;
    var getAvgDir;

    // returns 1, -1 or 0 to indicate direction of scroll
    // use avg of three values, as a buffer against single anomalous values
    return function(e, now) {
      var delta = e.wheelDelta || -e.detail || 0;
      var dir = delta > 0 && 1 || delta < 0 && -1 || 0;
      var avg;
      if (!getAvgDir || now - prevTime > 300) {
        getAvgDir =  LimitedAverage(3); // reset if wheel has paused
      }
      prevTime = now;
      avg = getAvgDir(dir) || dir; // handle average == 0
      return avg > 0 && 1 || avg < 0 && -1 || 0;
    };
  }

  function LimitedAverage(maxSize) {
    var arr = [];
    return function(val) {
      var sum = 0,
          i = -1;
      arr.push(val);
      if (arr.length > maxSize) arr.shift();
      while (++i < arr.length) {
        sum += arr[i];
      }
      return sum / arr.length;
    };
  }

  // @mouse: MouseArea object
  function MouseWheel(mouse) {
    var self = this,
        active = false,
        timer = new Timer().addEventListener('tick', onTick),
        sustainInterval = 150,
        fadeDelay = 70,
        eventTime = 0,
        getAverageRate = LimitedAverage(10),
        getWheelDirection = MouseWheelDirection(),
        wheelDirection;

    if (window.onmousewheel !== undefined) { // ie, webkit
      window.addEventListener('mousewheel', handleWheel, {passive: false});
    } else { // firefox
      window.addEventListener('DOMMouseScroll', handleWheel);
    }

    function updateSustainInterval(eventRate) {
      var fadeInterval = 80;
      fadeDelay = eventRate + 50; // adding a little extra time helps keep trackpad scrolling smooth in Firefox
      sustainInterval = fadeDelay + fadeInterval;
    }

    function handleWheel(evt) {
      var now = +new Date();
      wheelDirection = getWheelDirection(evt, now);
      if (evt.ctrlKey) {
        // Prevent pinch-zoom in Chrome (doesn't work in Safari, though)
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }
      if (!mouse.isOver()) return;
      if (wheelDirection === 0) {
        // first event may not have a direction, e.g. if 'smooth scrolling' is on
        return;
      }
      evt.preventDefault();
      if (!active) {
        active = true;
        self.dispatchEvent('mousewheelstart');
      } else {
        updateSustainInterval(getAverageRate(now - eventTime));
      }
      eventTime = now;
      timer.start(sustainInterval);
    }

    function onTick(evt) {
      var tickInterval = evt.time - eventTime,
          multiplier = evt.tickTime / 25,
          fadeFactor = 0,
          obj;
      if (tickInterval > fadeDelay) {
        fadeFactor = Math.min(1, (tickInterval - fadeDelay) / (sustainInterval - fadeDelay));
      }
      if (evt.done) {
        active = false;
      } else {
        if (fadeFactor > 0) {
          // Decelerate towards the end of the sustain interval (for smoother zooming)
          multiplier *= Tween.quadraticOut(1 - fadeFactor);
        }
        obj = utils$1.extend({direction: wheelDirection, multiplier: multiplier}, mouse.mouseData());
        self.dispatchEvent('mousewheel', obj);
      }
    }
  }

  utils$1.inherit(MouseWheel, EventDispatcher);


  function MouseArea(element, pos) {
    var _pos = pos || new ElementPosition(element),
        _areaPos = _pos.position(),
        _self = this,
        _dragging = false,
        _isOver = false,
        _disabled = false,
        _prevEvt,
        _downEvt;

    _pos.on('change', function() {_areaPos = _pos.position();});
    // TODO: think about touch events
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    element.addEventListener('mouseover', onAreaEnter);
    element.addEventListener('mousemove', onAreaEnter);
    element.addEventListener('mouseout', onAreaOut);
    element.addEventListener('mousedown', onAreaDown);
    element.addEventListener('dblclick', onAreaDblClick);
    document.addEventListener('contextmenu', function(e) {
      if (!(e.ctrlKey && e.altKey)) {
        e.preventDefault();
      }
    });
    element.addEventListener('contextmenu', function(e) {
      if (!(e.ctrlKey && e.altKey)) {
        _self.dispatchEvent('contextmenu', procMouseEvent(e));
      }
    });

    this.enable = function() {
      if (!_disabled) return;
      _disabled = false;
      element.style.pointerEvents = 'auto';
    };

    this.stopDragging = function() {
      if (_downEvt) {
        if (_dragging) stopDragging(_downEvt);
        _downEvt = null;
      }
    };

    this.disable = function() {
      if (_disabled) return;
      _disabled = true;
      if (_isOver) onAreaOut();
      this.stopDragging();
      element.style.pointerEvents = 'none';
    };

    this.isOver = function() {
      return _isOver;
    };

    this.isDown = function() {
      return !!_downEvt;
    };

    this.mouseData = function() {
      return utils$1.extend({}, _prevEvt);
    };

    function onAreaDown(e) {
      e.preventDefault(); // prevent text selection cursor on drag
    }

    function onAreaEnter() {
      if (!_isOver) {
        _isOver = true;
        _self.dispatchEvent('enter');
      }
    }

    function onAreaOut() {
      _isOver = false;
      _self.dispatchEvent('leave');
    }

    function onMouseUp(e) {
      var evt = procMouseEvent(e),
          elapsed, dx, dy;
      _self.dispatchEvent('mouseup', evt);
      if (_dragging) {
        stopDragging(evt);
      }
      if (_downEvt) {
        elapsed = evt.time - _downEvt.time;
        dx = evt.pageX - _downEvt.pageX;
        dy = evt.pageY - _downEvt.pageY;
        if (_isOver && elapsed < 500 && Math.sqrt(dx * dx + dy * dy) < 6) {
          _self.dispatchEvent('click', evt);
        }
        _downEvt = null;
      }
    }

    function stopDragging(evt) {
      _dragging = false;
      _self.dispatchEvent('dragend', evt);
    }

    function onMouseDown(e) {
     if (e.button != 2 && e.which != 3) { // ignore right-click
        _downEvt = procMouseEvent(e);
      }
    }

    function onMouseMove(e) {
      var evt = procMouseEvent(e);
      _self.dispatchEvent('mousemove', evt);
      if (!_dragging && _downEvt && _downEvt.hover) {
        _dragging = true;
        _self.dispatchEvent('dragstart', evt);
      }
      if (evt.dx === 0 && evt.dy === 0) return; // seen in Chrome
      if (_dragging) {
        var obj = {
          dragX: evt.pageX - _downEvt.pageX,
          dragY: evt.pageY - _downEvt.pageY
        };
        _self.dispatchEvent('drag', utils$1.extend(obj, evt));
      } else {
        _self.dispatchEvent('hover', evt);
      }
    }

    function onAreaDblClick(e) {
      if (_isOver) _self.dispatchEvent('dblclick', procMouseEvent(e));
    }

    function procMouseEvent(e) {
      var pageX = e.pageX,
          pageY = e.pageY,
          prev = _prevEvt;
      _prevEvt = {
        originalEvent: e,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        time: +new Date(),
        pageX: pageX,
        pageY: pageY,
        hover: _isOver,
        x: pageX - _areaPos.pageX,
        y: pageY - _areaPos.pageY,
        dx: prev ? pageX - prev.pageX : 0,
        dy: prev ? pageY - prev.pageY : 0
      };
      return _prevEvt;
    }
  }

  utils$1.inherit(MouseArea, EventDispatcher);

  function initVariableClick(node, cb) {
    var downEvent = null;
    var downTime = 0;

    node.addEventListener('mousedown', function(e) {
      downEvent = e;
      downTime = Date.now();
    });

    node.addEventListener('mouseup', function(upEvent) {
      if (!downEvent) return;
      var shift = Math.abs(downEvent.pageX - upEvent.pageX) +
          Math.abs(downEvent.pageY - upEvent.pageY);
      var elapsed = Date.now() - downTime;
      if (shift > 5 || elapsed > 1000) return;
      downEvent = null;
      cb({time: elapsed});
    });
  }

  function HighlightBox(gui, optsArg) {
    var el = El('div').addClass('zoom-box').appendTo('body'),
        opts = Object.assign({
          name: 'box',
          handles: false,
          persistent: false,
          draggable: false  // does dragging the map draw a box
        }, optsArg),
        box = new EventDispatcher(),
        stroke = 2,
        activeHandle = null,
        prevXY = null,
        boxCoords = null,
        _on = false,
        _visible = false,
        handles;

    if (opts.classname) {
      el.addClass(opts.classname);
    }

    el.hide();

    gui.on('map_rendered', function() {
      if (!_on || !_visible) return;
      redraw();
    });

    gui.on('shift_drag', function(e) {
      if (!_on) return;
      if (!opts.draggable) return;
      boxCoords = getBoxCoords(e.data);
      redraw();
      box.dispatchEvent('drag');
    });

    gui.on('shift_drag_end', function(e) {
      if (!_on || !_visible || !opts.draggable) return;
      boxCoords = getBoxCoords(e.data);
      var pix = coordsToPix(boxCoords, gui.map.getExtent());
      box.dispatchEvent('dragend', {map_bbox: pix});
      if (!opts.persistent) {
        box.hide();
      } else {
        redraw();
      }
    });

    if (opts.handles) {
      handles = initHandles(el);
      handles.forEach(function(handle) {
        handle.el.on('mousedown', function(e) {
          activeHandle = handle;
          activeHandle.el.css('background', 'black');
          prevXY = {x: e.pageX, y: e.pageY};
        });
      });

      gui.map.getMouse().on('mousemove', function(e) {
        if (!_on || !activeHandle || !prevXY || !boxCoords || !_visible) return;
        var xy = {x: e.pageX, y: e.pageY};
        var scaling = gui.keyboard.shiftIsPressed() && activeHandle.type == 'corner';
        if (scaling) {
          rescaleBox(e.x, e.y);
        } else {
          resizeBox(xy.x - prevXY.x, xy.y - prevXY.y, activeHandle);
        }
        prevXY = xy;
        redraw();
        box.dispatchEvent('handle_drag');
      });

      gui.map.getMouse().on('mouseup', function(e) {
        if (activeHandle && _on) {
          activeHandle.el.css('background', null);
          activeHandle = null;
          prevXY = null;
          box.dispatchEvent('handle_up');
          // reset box if it has been inverted (by dragging)
          fixBounds(boxCoords);
          redraw();
        }
      });
    }

    function resizeBox(dx, dy, activeHandle) {
      var shifting = activeHandle.type == 'center';
      var centered = gui.keyboard.shiftIsPressed() && activeHandle.type == 'edge';
      var scale = gui.map.getExtent().getPixelSize();
      dx *= scale;
      dy *= -scale;

      if (activeHandle.col == 'left' || shifting) {
        boxCoords[0] += dx;
        if (centered) boxCoords[2] -= dx;
      }
      if (activeHandle.col == 'right' || shifting) {
        boxCoords[2] += dx;
        if (centered) boxCoords[0] -= dx;
      }
      if (activeHandle.row == 'top' || shifting) {
        boxCoords[3] += dy;
        if (centered) boxCoords[1] -= dy;
      }
      if (activeHandle.row == 'bottom' || shifting) {
        boxCoords[1] += dy;
        if (centered) boxCoords[3] -= dy;
      }
    }

    function rescaleBox(x, y) {
      var p = gui.map.getExtent().translatePixelCoords(x, y);
      var cx = (boxCoords[0] + boxCoords[2])/2;
      var cy = (boxCoords[1] + boxCoords[3])/2;
      var dist2 = geom.distance2D(cx, cy, p[0], p[1]);
      var dist = geom.distance2D(cx, cy, boxCoords[0], boxCoords[1]);
      var k = dist2 / dist;
      var dx = (boxCoords[2] - cx) * k;
      var dy = (boxCoords[3] - cy) * k;
      boxCoords = [cx - dx, cy - dy, cx + dx, cy + dy];
    }

    box.setDataCoords = function(bbox) {
      boxCoords = bbox;
      redraw();
    };

    box.getDataCoords = function() {
      if (!boxCoords) return null;
      var lyr = gui.map.getActiveLayer();
      var dataBox = lyr ? translateCoordsToLayerCRS(boxCoords, lyr) : translateCoordsToLatLon(boxCoords);
      fixBounds(dataBox);
      return dataBox;
    };

    box.turnOn = function() {
      _on = true;
    };

    box.turnOff = function() {
      _on = false;
    };

    box.hide = function() {
      el.hide();
      boxCoords = null;
      _visible = false;
    };

    box.show = function(x1, y1, x2, y2) {
      _visible = true;
      var w = Math.abs(x1 - x2),
          h = Math.abs(y1 - y2),
          props = {
            top: Math.min(y1, y2),
            left: Math.min(x1, x2),
            width: Math.max(w - stroke / 2, 1),
            height: Math.max(h - stroke / 2, 1)
          };
      el.css(props);
      el.show();
      if (handles) {
        showHandles(handles, props, x2 < x1, y2 < y1);
      }
    };

    function translateCoordsToLatLon(bbox) {
      var crs = gui.map.getDisplayCRS();
      var a = internal.toLngLat([bbox[0], bbox[1]], crs);
      var b = internal.toLngLat([bbox[2], bbox[3]], crs);
      return a.concat(b);
    }

    // bbox: display coords
    // intended to work with rectangular projections like Mercator
    function translateCoordsToLayerCRS(bbox, lyr) {
      if (!isProjectedLayer(lyr)) return bbox.concat();
      var a = translateDisplayPoint(lyr, [bbox[0], bbox[1]]);
      var b = translateDisplayPoint(lyr, [bbox[2], bbox[3]]);
      var bounds = new internal.Bounds();
      bounds.mergePoint(a[0], a[1]);
      bounds.mergePoint(b[0], b[1]);
      return bounds.toArray();
    }

    // get bbox coords in the display CRS
    function getBoxCoords(e) {
      var bbox = pixToCoords(e.a.concat(e.b), gui.map.getExtent());
      fixBounds(bbox);
      return bbox;
    }

    function redraw() {
      if (!boxCoords) return;
      var ext = gui.map.getExtent();
      var b = coordsToPix(boxCoords, ext);
      var pos = ext.position();
      var dx = pos.pageX,
          dy = pos.pageY;
      box.show(b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy);
    }

    return box;
  }

  function coordsToPix(bbox, ext) {
    var a = ext.translateCoords(bbox[0], bbox[1]);
    var b = ext.translateCoords(bbox[2], bbox[3]);
    return [Math.round(a[0]), Math.round(b[1]), Math.round(b[0]), Math.round(a[1])];
  }

  function pixToCoords(bbox, ext) {
    var a = ext.translatePixelCoords(bbox[0], bbox[1]);
    var b = ext.translatePixelCoords(bbox[2], bbox[3]);
    return [a[0], b[1], b[0], a[1]];
  }


  function fixBounds(bbox) {
    var tmp;
    if (bbox[0] > bbox[2]) {
      tmp = bbox[0];
      bbox[0] = bbox[2];
      bbox[2] = tmp;
    }
    if (bbox[1] > bbox[3]) {
      tmp = bbox[1];
      bbox[1] = bbox[3];
      bbox[3] = tmp;
    }
  }

  function initHandles(el) {
    var handles = [];
    for (var i=0; i<9; i++) {
      // if (i == 4) continue; // skip middle handle
      var c = Math.floor(i / 3);
      var r = i % 3;
      var type = i == 4 && 'center' || c != 1 && r != 1 && 'corner' || 'edge';
      handles.push({
        el: El('div').addClass('handle').appendTo(el),
        type: type,
        col: c == 0 && 'left' || c == 1 && 'center' || 'right',
        row: r == 0 && 'top' || r == 1 && 'center' || 'bottom'
      });
    }
    return handles;
  }

  function showHandles(handles, props, xinv, yinv) {
    var scaledSize = Math.ceil(Math.min(props.width, props.height) / 3) - 1;
    var HANDLE_SIZE = Math.min(scaledSize, 7);
    var OFFS = Math.floor(HANDLE_SIZE / 2) + 1;
    handles.forEach(function(handle) {
      var top = 0,
          left = 0;
      if (handle.col == 'center') {
        left += props.width / 2 - HANDLE_SIZE / 2;
      } else if (handle.col == 'left' && xinv || handle.col == 'right' && !xinv) {
        left += props.width - HANDLE_SIZE + OFFS;
      } else {
        left -= OFFS;
      }
      if (handle.row == 'center') {
        top += props.height / 2 - HANDLE_SIZE / 2;
      } else if (handle.row == 'top' && yinv || handle.row == 'bottom' && !yinv) {
        top += props.height - HANDLE_SIZE + OFFS;
      } else {
        top -= OFFS;
      }

      handle.el.css({
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        top: top,
        left: left
      });
    });
  }

  function MapNav(gui, ext, mouse) {
    var wheel = new MouseWheel(mouse),
        zoomTween = new Tween(Tween.sineInOut),
        zoomBox = new HighlightBox(gui, {draggable: true, name: 'zoom-box'}), // .addClass('zooming'),
        shiftDrag = false,
        zoomScaleMultiplier = 1,
        panCount = 0,
        inBtn, outBtn,
        dragStartEvt,
        _fx, _fy; // zoom foci, [0,1]

    // Was used in old frame view... remove?
    this.setZoomFactor = function(k) {
      zoomScaleMultiplier = k || 1;
    };

    this.zoomToBbox = zoomToBbox;

    if (gui.options.homeControl) {
      gui.buttons.addButton("#home-icon").on('click', function() {
        if (disabled()) return;
        gui.dispatchEvent('map_reset');
      });
    }

    if (gui.options.zoomControl) {
      inBtn = gui.buttons.addButton("#zoom-in-icon");
      outBtn = gui.buttons.addButton("#zoom-out-icon");
      initVariableClick(inBtn.node(), zoomIn);
      initVariableClick(outBtn.node(), zoomOut);
      ext.on('change', function() {
        inBtn.classed('disabled', ext.scale() >= ext.maxScale());
      });
    }

    gui.on('map_reset', function() {
      ext.reset(true);
    });

    zoomTween.on('change', function(e) {
      ext.zoomToExtent(e.value, _fx, _fy);
    });

    mouse.on('click', function(e) {
      gui.dispatchEvent('map_click', e);
    });

    mouse.on('dblclick', function(e) {
      if (disabled()) return;
      zoomByPct(getZoomInPct(), e.x / ext.width(), e.y / ext.height());
    });

    mouse.on('dragstart', function(e) {
      if (disabled()) return;
      // allow drawing rectangles if active layer is empty
      // var lyr = gui.model.getActiveLayer()?.layer;
      // if (lyr && !internal.layerHasGeometry(lyr)) return;
      shiftDrag = !!e.shiftKey;
      panCount = 0;
      if (shiftDrag) {
        if (useBoxZoom()) zoomBox.turnOn();
        dragStartEvt = e;
        gui.dispatchEvent('shift_drag_start');
      }
    });

    mouse.on('drag', function(e) {
      if (disabled()) return;
      if (shiftDrag) {
        gui.dispatchEvent('shift_drag', getBoxData(e));
        return;
      }
      if (++panCount == 1) {
        El('body').addClass('pan');
        setTimeout(function() {
          var body = El('body');
          if (body.hasClass('pan')) {
            body.addClass('panning');
          }
        }, 100);
      }
      ext.pan(e.dx, e.dy);
    });

    mouse.on('dragend', function(e) {
      var bbox;
      if (disabled()) return;
      if (shiftDrag) {
        shiftDrag = false;
        gui.dispatchEvent('shift_drag_end', getBoxData(e));
        zoomBox.turnOff();
      } else {
        El('body').removeClass('panning').removeClass('pan');
      }
    });

    zoomBox.on('dragend', function(e) {
      zoomToBbox(e.map_bbox);
    });

    wheel.on('mousewheel', function(e) {
      var tickFraction = 0.11; // 0.15; // fraction of zoom step per wheel event;
      var k = 1 + (tickFraction * e.multiplier * zoomScaleMultiplier),
          delta = e.direction > 0 ? k : 1 / k;
      if (disabled()) return;
      ext.zoomByPct(delta, e.x / ext.width(), e.y / ext.height());
    });

    function useBoxZoom() {
      var mode = gui.getMode();
      return !'selection_tool,box_tool,rectangle_tool,drawing_tool'.includes(mode);
    }

    function getBoxData(e) {
      return {
        a: [e.x, e.y],
        b: [dragStartEvt.x, dragStartEvt.y]
      };
    }

    function disabled() {
      return !!gui.options.disableNavigation;
    }

    function zoomIn(e) {
      if (disabled()) return;
      zoomByPct(getZoomInPct(e.time), 0.5, 0.5);
    }

    function zoomOut(e) {
      if (disabled()) return;
      zoomByPct(1/getZoomInPct(e.time), 0.5, 0.5);
    }

    function getZoomInPct(clickTime) {
      var minScale = 0.2,
          maxScale = 4,
          minTime = 100,
          maxTime = 800,
          time = utils$1.clamp(clickTime || 200, minTime, maxTime),
          k = (time - minTime) / (maxTime - minTime),
          scale = minScale + k * (maxScale - minScale);
      return 1 + scale * zoomScaleMultiplier;
    }

    // @box Bounds with pixels from t,l corner of map area.
    function zoomToBbox(bbox) {
      var bounds = new Bounds(bbox),
          pct = Math.max(bounds.width() / ext.width(), bounds.height() / ext.height()),
          fx = bounds.centerX() / ext.width() * (1 + pct) - pct / 2,
          fy = bounds.centerY() / ext.height() * (1 + pct) - pct / 2;
      zoomByPct(1 / pct, fx, fy);
    }

    // @pct Change in scale (2 = 2x zoom)
    // @fx, @fy zoom focus, [0, 1]
    function zoomByPct(pct, fx, fy) {
      var w = ext.getBounds().width();
      _fx = fx;
      _fy = fy;
      zoomTween.start(w, w / pct, 400);
    }
  }

  function SelectionTool(gui, ext, hit) {
    var popup = gui.container.findChild('.selection-tool-options');
    var box = new HighlightBox(gui, {draggable: true});
    var coords = popup.findChild('.box-coords').hide();
    var _on = false;

    gui.addMode('selection_tool', turnOn, turnOff);

    gui.on('interaction_mode_change', function(e) {
      if (e.mode === 'selection') {
        gui.enterMode('selection_tool');
      } else if (_on) {
        turnOff();
      }
    });

    box.on('drag', function(e) {
      if (!_on) return;
      updateSelection(box.getDataCoords(), true);
    });

    box.on('dragend', function(e) {
      if (!_on) return;
      updateSelection(box.getDataCoords());
    });

    gui.on('selection_bridge', function(e) {
      updateSelection(e.map_data_bbox);
    });

    function updateSelection(bbox, transient) {
      var active = gui.model.getActiveLayer();
      var ids = internal.findShapesIntersectingBBox(bbox, active.layer, active.dataset.arcs);
      if (transient) {
        hit.setTransientIds(ids);
      } else if (ids.length) {
        hit.addSelectionIds(ids);
      }
    }

    function turnOn() {
      box.turnOn();
      _on = true;
    }

    function turnOff() {
      dataBtn.turnOff();
      box.turnOff();
      reset();
      _on = false;
      if (gui.interaction.getMode() == 'selection') {
        // mode change was not initiated by interactive menu -- turn off interactivity
        gui.interaction.turnOff();
      }
    }

    function reset() {
      hidePopup();
      setPinning(false);
      hit.clearSelection();
    }

    function setPinning(on) {
      hit.setPinning(on);
      if (on) dataBtn.turnOn();
      else dataBtn.turnOff();
    }

    function getIdsOpt() {
      return hit.getSelectionIds().join(',');
    }

    hit.on('change', function(e) {
      if (e.mode != 'selection') return;
      var ids = hit.getSelectionIds();
      if (ids.length > 0) {
        // enter this mode when we're ready to show the selection options
        // (this closes any other active mode, e.g. box_tool)
        gui.enterMode('selection_tool');
        popup.show();
        updateCoords();
      } else {
        hidePopup();
      }
    });

    function hidePopup() {
      popup.hide();
      hideCoords();
    }

    new SimpleButton(popup.findChild('.delete-btn')).on('click', function() {
      var cmd = '-filter invert ids=' + getIdsOpt();
      runCommand(cmd);
    });

    new SimpleButton(popup.findChild('.filter-btn')).on('click', function() {
      var cmd = '-filter ids=' + getIdsOpt();
      runCommand(cmd);
    });

    new SimpleButton(popup.findChild('.split-btn')).on('click', function() {
      var cmd = '-split ids=' + getIdsOpt();
      runCommand(cmd);
    });

    var dataBtn = new ToggleButton(popup.findChild('.data-btn')).on('click', function(e) {
      setPinning(e.on);
    });

    new SimpleButton(popup.findChild('.duplicate-btn')).on('click', function() {
      var cmd = '-filter + name=selection ids=' + getIdsOpt();
      runCommand(cmd);
    });

    var coordsBtn = new SimpleButton(popup.findChild('.coords-btn')).on('click', function() {
      if (coords.visible()) hideCoords(); else showCoords();
    });

    new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
      hit.clearSelection();
    });

    function getSelectionBounds() {
      var ids = hit.getSelectionIds();
      if (ids.length === 0) return null;
      var {layer, dataset} = gui.model.getActiveLayer();
      var filtered = {
        geometry_type: layer.geometry_type,
        shapes: ids.map(id => layer.shapes[id])
      };
      var bbox = internal.getLayerBounds(filtered, dataset.arcs).toArray();
      return internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
    }

    function updateCoords() {
      if (coords.visible()) {
        showCoords();
      }
    }

    function showCoords() {
      var bbox = getSelectionBounds();
      if (!bbox) {
        hideCoords();
        return;
      }
      El(coordsBtn.node()).addClass('active');
      coords.text(bbox.join(','));
      coords.show();
      GUI.selectElement(coords.node());
    }

    function hideCoords() {
      El(coordsBtn.node()).removeClass('active');
      coords.hide();
    }

    function runCommand(cmd, turnOff) {
      hidePopup();
      gui.quiet(true);
      if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {
        gui.quiet(false);
        reset();
        if (turnOff) gui.clearMode();
      });
    }
  }

  function openAddFieldPopup(gui, ids, lyr) {
    var popup = showPopupAlert('', 'Add field');
    var el = popup.container();
    el.addClass('option-menu');
    var html = `<div><input type="text" class="field-name text-input" placeholder="field name"></div>
  <div><input type="text" class="field-value text-input" placeholder="value"><div>
  <div tabindex="0" class="btn dialog-btn">Apply</div> <span class="inline-checkbox"><input type="checkbox" class="all" />assign value to all records</span>`;
    el.html(html);

    var name = el.findChild('.field-name');
    name.node().focus();
    var val = el.findChild('.field-value');
    var box = el.findChild('.all');
    var btn = el.findChild('.btn').on('click', function() {
      var table = internal.getLayerDataTable(lyr); // creates new table if missing
      var all = box.node().checked;
      var nameStr = name.node().value.trim();
      if (!nameStr) return;
      if (table.fieldExists(nameStr)) {
        name.node().value = '';
        return;
      }
      var valStr = val.node().value.trim();
      var value = internal.parseUnknownType(valStr);
      // table.addField(nameStr, function(d) {
      //   // parse each time to avoid multiple references to objects
      //   return (all || d == rec) ? parseUnknownType(valStr) : null;
      // });

      var cmdStr = `-each "d['${nameStr}'] = `;
      if (!all) {
        cmdStr += ids.length == 1 ?
          `this.id != ${ids[0]}` :
          `!${JSON.stringify(ids)}.includes(this.id)`;
        cmdStr += ' ? null : ';
      }
      valStr = JSON.stringify(JSON.stringify(value)); // add escapes to strings
      cmdStr = valStr.replace('"', cmdStr);

      gui.console.runMapshaperCommands(cmdStr, function(err) {
        if (!err) {
          popup.close();
        } else {
          console.error(err);
        }
      });
    });
  }

  // toNext, toPrev: trigger functions for switching between multiple records
  function Popup(gui, toNext, toPrev) {
    var self = new EventDispatcher();
    var parent = gui.container.findChild('.mshp-main-map');
    var el = El('div').addClass('popup').appendTo(parent).hide();
    var content = El('div').addClass('popup-content').appendTo(el);
    // multi-hit display and navigation
    var tab = El('div').addClass('popup-tab').appendTo(el).hide();
    var nav = El('div').addClass('popup-nav').appendTo(tab);
    var prevLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('◀');
    var navInfo = El('span').addClass('popup-nav-info').appendTo(nav);
    var nextLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('▶');
    var refresh;

    el.addClass('rollover'); // used as a sentinel for the hover function

    nextLink.on('click', toNext);
    prevLink.on('click', toPrev);
    gui.on('popup-needs-refresh', function() {
      if (refresh) refresh();
    });

    self.show = function(id, ids, lyr, pinned, edit) {
      var singleEdit = edit || pinned && !internal.layerHasAttributeData(lyr);
      var multiEdit = pinned && gui.interaction.getMode() == 'selection';
      var maxHeight = parent.node().clientHeight - 36;

      // stash a function for refreshing the current popup when data changes
      // while the popup is being displayed (e.g. while dragging a label)
      refresh = function() {
        render(id, ids, lyr, pinned, singleEdit || multiEdit);
      };
      refresh();
      if (multiEdit) {
        showRecords(ids.length);
      } else if (ids && ids.length > 1 && !multiEdit) {
        showNav(id, ids, pinned);
      } else {
        tab.hide();
      }
      el.show();
      if (content.node().clientHeight > maxHeight) {
        content.css('height:' + maxHeight + 'px');
      }
    };

    self.hide = function() {
      if (!isOpen()) return;
      refresh = null;
      // make sure any pending edits are made before re-rendering popup
      GUI.blurActiveElement(); // this should be more selective -- could cause a glitch if typing in console
      content.empty();
      content.node().removeAttribute('style'); // remove inline height
      el.hide();
    };

    return self;

    function isOpen() {
      return el.visible();
    }

    function showRecords(n) {
      navInfo.text(n);
      nextLink.css('display','none');
      prevLink.css('display','none');
      tab.show();
    }

    function showNav(id, ids, pinned) {
      var num = ids.indexOf(id) + 1;
      navInfo.text(' ' + num + ' / ' + ids.length + ' ');
      nextLink.css('display', pinned ? 'inline-block' : 'none');
      prevLink.css('display', pinned && ids.length > 2 ? 'inline-block' : 'none');
      tab.show();
    }

    function render(id, ids, lyr, pinned, editable) {
      var recIds = id >= 0 ? [id] : ids;
      var el = content;
      var table = lyr.data; // table can be null (e.g. if layer has no attribute data)
      var tableEl = table ? renderTable(recIds, table, editable) : null;
      el.empty(); // clean up if panel is already open
      if (tableEl) {
        tableEl.appendTo(el);
        tableEl.on('copy', function(e) {
          // remove leading or trailing tabs that sometimes get copied when
          // selecting from a table
          var pasted = window.getSelection().toString();
          var cleaned = pasted.replace(/^\t/, '').replace(/\t$/, '');
          if (pasted != cleaned && !window.clipboardData) { // ignore ie
            (e.clipboardData || e.originalEvent.clipboardData).setData("text", cleaned);
            e.preventDefault(); // don't copy original string with tabs
          }
        });
      } else {
        // Some individual features can have undefined values for some or all of
        // their data properties (properties are set to undefined when an input JSON file
        // has inconsistent fields, or after force-merging layers with inconsistent fields).
        el.html(utils$1.format('<div class="note">This %s is missing attribute data.</div>',
            table && table.getFields().length > 0 ? 'feature': 'layer'));
      }

      var footer = El('div').appendTo(el);
      if (editable) {
        // render "add field" button
        El('span').addClass('add-field-btn').appendTo(footer).on('click', async function(e) {
          // show "add field" dialog
          openAddFieldPopup(gui, recIds, lyr);
        }).text('+ add field');
      } else if (pinned) {
        // render "Click to edit" button
        El('span').addClass('edit-data-btn').appendTo(footer).on('click', async function(e) {
          self.show(id, ids, lyr, true, true);
        }).text('▸ click to edit');
      }
    }

    function renderTable(recIds, table, editable) {
      var tableEl = El('table').addClass('selectable');
      var rows = 0;
      var rec;
      if (recIds.length == 1) {
        rec = editable ?
          table.getReadOnlyRecordAt(recIds[0]) :
          table.getRecordAt(recIds[0]);
      } else {
        rec = getMultiRecord(recIds, table);
      }
      rec = rec || {};
      utils$1.forEachProperty(rec, function(v, k) {
        // missing GeoJSON fields are set to undefined on import; skip these
        if (v === undefined) return;
        var rowEl = renderRow(k, v, recIds, table, editable);
        if (rowEl) {
          rowEl.appendTo(tableEl);
          rows++;
        }
      });
      return rows > 0 ? tableEl : null;
    }

    function getMultiRecord(recIds, table) {
      var fields = table.getFields();
      var rec = {};
      recIds.forEach(function(id) {
        var d = table.getRecordAt(id) || {};
        var k, v;
        for (var i=0; i<fields.length; i++) {
          k = fields[i];
          v = d[k];
          if (k in rec === false) {
            rec[k] = v;
          } else if (rec[k] !== v) {
            rec[k] = null;
          }
        }
      });
      return rec;
    }


    function renderRow(key, val, recIds, table, editable) {
      var type = getFieldType(val, key, table);
      var str = formatInspectorValue(val, type);
      var rowHtml = `<td class="field-name">${key}</td><td><span class="value">${utils$1.htmlEscape(str)}</span> </td>`;
      var rowEl = El('tr').html(rowHtml);
      var cellEl = rowEl.findChild('.value');
      setFieldClass(cellEl, val, type);
      if (editable) {
        editItem(cellEl, key, val, recIds, table, type);
      }
      return rowEl;
    }

    function setFieldClass(el, val, type) {
      var isNum = type ? type == 'number' : utils$1.isNumber(val);
      var isNully = val === undefined || val === null || val !== val;
      var isEmpty = val === '';
      el.classed('num-field', isNum);
      el.classed('object-field', type == 'object');
      el.classed('null-value', isNully);
      el.classed('empty', isEmpty);
    }

    function editItem(el, key, val, recIds, table, type) {
      var input = new ClickText2(el),
          strval = formatInspectorValue(val, type),
          parser = internal.getInputParser(type);
      el.parent().addClass('editable-cell');
      el.addClass('colored-text dot-underline');
      input.on('change', function(e) {
        var val2 = parser(input.value()),
            strval2 = formatInspectorValue(val2, type);
        if (val2 === null && type != 'object') { // allow null objects
          // invalid value; revert to previous value
          input.value(strval);
        } else if (strval != strval2) {
          // field content has changed
          strval = strval2;
          gui.dispatchEvent('data_preupdate', {ids: recIds}); // for undo/redo
          // rec[key] = val2;
          updateRecords(recIds, key, val2, table);
          gui.dispatchEvent('data_postupdate', {ids: recIds});
          input.value(strval);
          setFieldClass(el, val2, type);
          self.dispatchEvent('data_updated', {field: key, value: val2, ids: recIds});
        }
      });
    }
  }

  function updateRecords(ids, f, v, table) {
    var records = table.getRecords();
    ids.forEach(function(id) {
      var d = records[id] || {};
      d[f] = v;
      records[id] = d;
    });
  }

  function formatInspectorValue(val, type) {
    var str;
    if (type == 'date') {
      str = utils$1.formatDateISO(val);
    } else if (type == 'object') {
      str = val ? JSON.stringify(val) : "";
    } else {
      str = String(val);
    }
    return str;
  }


  function getFieldType(val, key, table) {
    // if a field has a null value, look at entire column to identify type
    return internal.getValueType(val) || internal.getColumnType(key, table.getRecords()) ;
  }

  function InspectionControl2(gui, hit) {
    var _popup = new Popup(gui, hit.getSwitchTrigger(1), hit.getSwitchTrigger(-1));
    var _self = new EventDispatcher();

    gui.on('interaction_mode_change', function(e) {
      if (!gui.interaction.modeUsesPopup(e.mode)) {
        inspect(-1); // clear the popup
      }
    });

    _popup.on('data_updated', function(e) {
      // data_change event no longer needed (update is handled below)
      // _self.dispatchEvent('data_change', e.data); // let map know which field has changed
      gui.session.dataValueUpdated(e.ids, e.field, e.value);
      // Refresh the display if a style variable has been changed interactively
      if (internal.isSupportedSvgStyleProperty(e.field)) {
        gui.dispatchEvent('map-needs-refresh');
      }
    });

    hit.on('contextmenu', function(e) {
      if (!e.overMap || e.mode == 'edit_lines' || e.mode == 'edit_polygons' ||
        e.mode == 'edit_points') {
        return;
      }
      var target = hit.getHitTarget();
      if (e.ids.length == 1) {
        e.deleteFeature = function() {
          deleteFeature(target, e.ids[0]);
          gui.model.updated({filter:true});
        };
      }
      gui.contextMenu.open(e, target);
    });

    hit.on('change', function(e) {
      if (!inspecting()) return;
      if (gui.keyboard.ctrlIsPressed()) return;
      var ids;
      if (e.mode == 'selection') {
        ids = e.pinned && e.ids || [];
      } else {
        ids = e.ids || [];
      }
      inspect(e.id, ids, e.pinned);
    });

    // id: Id of a feature in the active layer, or -1
    function inspect(id, ids, pin) {
      var target = hit.getHitTarget();
      if ((id > -1 || ids && ids.length > 0) && inspecting() && target && target) {
        _popup.show(id, ids, target, pin);
      } else {
        _popup.hide();
      }
    }

    // does the attribute inspector appear on rollover
    function inspecting() {
      return gui.interaction && gui.interaction.modeUsesPopup(gui.interaction.getMode());
    }

    return _self;
  }

  function isMultilineLabel(textNode) {
    return textNode.childNodes.length > 1;
  }

  // export function toggleTextAlign(textNode, rec) {
  //   var curr = rec['text-anchor'] || 'middle';
  //   var value = curr == 'middle' && 'start' || curr == 'start' && 'end' || 'middle';
  //   updateTextAnchor(value, textNode, rec);
  // }

  // Set an attribute on a <text> node and any child <tspan> elements
  // (mapshaper's svg labels require tspans to have the same x and dx values
  //  as the enclosing text node)
  function setMultilineAttribute(textNode, name, value) {
    var n = textNode.childNodes.length;
    var i = -1;
    var child;
    textNode.setAttribute(name, value);
    while (++i < n) {
      child = textNode.childNodes[i];
      if (child.tagName == 'tspan') {
        child.setAttribute(name, value);
      }
    }
  }

  function findSvgRoot(el) {
    while (el && el.tagName != 'html' && el.tagName != 'body') {
      if (el.tagName == 'svg') return el;
      el = el.parentNode;
    }
    return null;
  }

  // p: pixel coordinates of label anchor
  function autoUpdateTextAnchor(textNode, rec, p) {
    var svg = findSvgRoot(textNode);
    var rect = textNode.getBoundingClientRect();
    var labelCenterX = rect.left - svg.getBoundingClientRect().left + rect.width / 2;
    var xpct = (labelCenterX - p[0]) / rect.width; // offset of label center from anchor center

    var value = xpct < -0.25 && 'end' || xpct > 0.25 && 'start' || 'middle';
    updateTextAnchor(value, textNode, rec);
  }

  // @value: optional position to set; if missing, auto-set
  function updateTextAnchor(value, textNode, rec) {
    var rect = textNode.getBoundingClientRect();
    var width = rect.width;
    var curr = rec['text-anchor'] || 'middle';
    var xshift = 0;

    if (curr == 'middle' && value == 'end' || curr == 'start' && value == 'middle') {
      xshift = width / 2;
    } else if (curr == 'middle' && value == 'start' || curr == 'end' && value == 'middle') {
      xshift = -width / 2;
    } else if (curr == 'start' && value == 'end') {
      xshift = width;
    } else if (curr == 'end' && value == 'start') {
      xshift = -width;
    }
    if (xshift) {
      rec['text-anchor'] = value;
      applyDelta(rec, 'dx', xshift / getScaleAttribute(textNode));
    }
  }

  function getScaleAttribute(node) {
    // this is fragile, consider passing in the value of <MapExtent>.getSymbolScale()
    var transform = node.getAttribute('transform') ||
      node.parentNode.getAttribute('transform'); // compound label puts it here
    var match = /scale\(([^)]+)\)/.exec(transform || '');
    return match ? parseFloat(match[1]) : 1;
  }

  // handle either numeric strings or numbers in record
  function applyDelta(rec, key, delta) {
    var currVal = rec[key];
    var newVal = (+currVal + delta) || 0;
    updateNumber(rec, key, newVal);
  }

  // handle either numeric strings or numbers in record
  function updateNumber(rec, key, num) {
    var isString = utils$1.isString(rec[key]);
    rec[key] = isString ? String(num) : num;
  }

  function initLabelDragging(gui, ext, hit) {
    var downEvt;
    var activeId = -1;
    var prevHitEvt;
    var activeRecord;

    function active() {
      return gui.interaction.getMode() == 'labels';
    }

    function labelSelected(e) {
      return e.id > -1 && active();
    }

    hit.on('dragstart', function(e) {
      if (!labelSelected(e)) return;
      var symNode = getSymbolTarget(e);
      var table = hit.getTargetDataTable();
      if (!symNode || !table) {
        activeId = -1;
        return false;
      }
      activeId = e.id;
      activeRecord = getLabelRecordById(activeId);
      downEvt = e;
      gui.dispatchEvent('label_dragstart', {FID: activeId});
    });

    hit.on('change', function(e) {
      if (!active()) return;
      if (prevHitEvt) clearLabelHighlight(prevHitEvt);
      showLabelHighlight(e);
      prevHitEvt = e;
    });

    function clearLabelHighlight(e) {
      var txt = getTextNode(getSymbolTarget(e));
      if (txt) txt.classList.remove('active-label');
    }

    function showLabelHighlight(e) {
      var txt = getTextNode(getSymbolTarget(e));
      if (txt) txt.classList.add('active-label');
    }

    hit.on('drag', function(e) {
      if (!labelSelected(e) || activeId == -1) return;
      if (e.id != activeId) {
        error$1("Mismatched hit ids:", e.id, activeId);
      }
      var scale = ext.getSymbolScale() || 1;
      var symNode, textNode;
      applyDelta(activeRecord, 'dx', e.dx / scale);
      applyDelta(activeRecord, 'dy', e.dy / scale);
      symNode = getSymbolTarget(e);
      textNode = getTextNode(symNode);
      // update anchor position of labels based on label position relative
      // to anchor point, for better placement when eventual display font is
      // different from mapshaper's font.
      // if (!isMultilineLabel(textNode)) {
      autoUpdateTextAnchor(textNode, activeRecord, getDisplayCoordsById(activeId, hit.getHitTarget(), ext));
      // }
      updateNumber(activeRecord, 'dx', internal.roundToDigits(+activeRecord.dx, 3));
      updateNumber(activeRecord, 'dy', internal.roundToDigits(+activeRecord.dy, 3));
      updateTextNode(textNode, activeRecord);
      // updateSymbolNode(symNode, activeRecord, activeId);
      gui.dispatchEvent('popup-needs-refresh');
    });

    hit.on('dragend', function(e) {
      if (!labelSelected(e) || activeId == -1) return;
      gui.dispatchEvent('label_dragend', {FID: e.id});
      activeId = -1;
      activeRecord = null;
      downEvt = null;
    });

    function getDisplayCoordsById(id, layer, ext) {
      var coords = getPointCoordsById(id, layer);
      return ext.translateCoords(coords[0], coords[1]);
    }

    function getPointCoordsById(id, layer) {
      var coords = layer && layer.geometry_type == 'point' && layer.shapes[id];
      if (!coords || coords.length != 1) {
        return null;
      }
      return coords[0];
    }

    function getSymbolTarget(e) {
      return e.id > -1 ? getSymbolNodeById(e.id) : null;
    }

    function getTextNode(symNode) {
      if (!symNode) return null;
      if (symNode.tagName == 'text') return symNode;
      return symNode.querySelector('text');
    }

    // function getSymbolNodeById_OLD(id, parent) {
    //   var sel = '[data-id="' + id + '"]';
    //   return parent.querySelector(sel);
    // }

    function getSymbolNodeById(id) {
      // TODO: optimize selector
      var sel = '[data-id="' + id + '"]';
      var activeLayer = hit.getHitTarget();
      return activeLayer.gui.svg_container.querySelector(sel);
    }

    // function getTextTarget2(e) {
    //   var el = e && e.targetSymbol || null;
    //   if (el && el.tagName == 'tspan') {
    //     el = el.parentNode;
    //   }
    //   return el && el.tagName == 'text' ? el : null;
    // }

    // function getTextTarget(e) {
    //   var el = e.target;
    //   if (el.tagName == 'tspan') {
    //     el = el.parentNode;
    //   }
    //   return el.tagName == 'text' ? el : null;
    // }

    function getLabelRecordById(id) {
      var table = hit.getTargetDataTable();
      if (id >= 0 === false || !table) return null;
      // add dx and dy properties, if not available
      if (!table.fieldExists('dx')) {
        table.addField('dx', 0);
      }
      if (!table.fieldExists('dy')) {
        table.addField('dy', 0);
      }
      if (!table.fieldExists('text-anchor')) {
        table.addField('text-anchor', '');
      }
      return table.getRecordAt(id);
    }

    // update symbol by setting attributes
    function updateTextNode(node, d) {
      var a = d['text-anchor'];
      if (a) node.setAttribute('text-anchor', a);
      // dx data property is applied to svg x property
      // setMultilineAttribute(node, 'dx', d.dx || 0);
      setMultilineAttribute(node, 'x', d.dx || 0);
      node.setAttribute('y', d.dy || 0);
    }

    // update symbol by re-rendering it
    // fails when symbol includes a dot (<g><circle/><text/></g> structure)
    function updateSymbolNode(node, d, id) {
      var o = internal.svg.renderStyledLabel(d); // TODO: symbol support
      var activeLayer = hit.getHitTarget();
      var xy = activeLayer.shapes[id][0];
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      var node2;
      o.properties.transform = getSvgSymbolTransform(xy, ext);
      o.properties['data-id'] = id;
      o.properties.class = 'mapshaper-svg-symbol';
      // o.properties['class'] = 'selected';
      g.innerHTML = internal.svg.stringify(o);
      node2 = g.firstChild;
      node.parentNode.replaceChild(node2, node);
    }
  }

  function initPointEditing(gui, ext, hit) {
    var instructionsShown = false;
    var symbolInfo, alert;
    function active(e) {
      return gui.interaction.getMode() == 'edit_points';
    }

    function overPoint(e) {
      return active(e) && e.id > -1;
    }

    function hideInstructions() {
      if (!alert) return;
      alert.close('fade');
      alert = null;
    }

    function showInstructions() {
      var isMac = navigator.userAgent.includes('Mac');
      var symbol = isMac ? '⌘' : '^';
      var msg = `Instructions: Click on the map to add points. Move points by dragging. Type ${symbol}Z/${symbol}Y to undo/redo.`;
      alert = showPopupAlert(msg, null, { non_blocking: true, max_width: '360px'});
    }

    gui.on('interaction_mode_change', function(e) {
      if (e.mode == 'edit_points' && !gui.model.getActiveLayer()) {
        addEmptyLayer(gui, undefined, 'point');
      } else if (e.prev_mode == 'edit_points') {
        hideInstructions();
        gui.container.findChild('.map-layers').classed('add-points', false);
      }
      if (e.mode == 'edit_points' && !instructionsShown) {
        instructionsShown = true;
        showInstructions();
      }
    });

    hit.on('contextmenu', function(e) {
      if (!active(e)) return;
      var target = hit.getHitTarget();
      var id = e.id;
      if (id > -1) {
        e.deletePoint = function() {
          removePoint(target, id);
        };
      }
      gui.contextMenu.open(e, target);
    });

    function removePoint(target, id) {
      var d = target.data ? target.data.getRecords()[id] : null;
      var coords = target.shapes[id];
      deleteFeature(target, id);
      gui.dispatchEvent('feature_delete', {coords, d, target, fid: id});
      gui.dispatchEvent('map-needs-refresh');
      hit.setHitId(-1);
    }

    hit.on('click', function(e) {
      if (overPoint(e) || !active(e)) return;
      hideInstructions();

      // add point
      var p = pixToDataCoords(e.x, e.y);
      var target = hit.getHitTarget();
      appendNewPoint(target, p);
      gui.dispatchEvent('point_add', {p, target});
      gui.dispatchEvent('map-needs-refresh');
      hit.setHitId(target.shapes.length - 1); // highlight new point
    });

    hit.on('change', function(e) {
      if (!active(e)) return;
      gui.container.findChild('.map-layers').classed('add-points', !overPoint(e));
    });

    hit.on('dragstart', function(e) {
      if (!overPoint(e)) return;
      hideInstructions();
      var target = hit.getHitTarget();
      symbolInfo = {
        FID: e.id,
        startCoords: getPointCoords(target, e.id),
        target: target
      };
    });

    hit.on('drag', function(e) {
      if (!overPoint(e)) return;
      // TODO: support multi points... get id of closest part to the pointer
      // var p = getPointCoordsById(e.id, symbolInfo.target);
      var id = symbolInfo.FID;
      var shp = symbolInfo.target.gui.displayLayer.shapes[id];
      if (!shp) return;
      var diff = translateDeltaDisplayCoords(e.dx, e.dy, ext);
      shp[0][0] += diff[0];
      shp[0][1] += diff[1];
      gui.dispatchEvent('map-needs-refresh');
    });

    hit.on('dragend', function(e) {
      if (!overPoint(e) || !symbolInfo ) return;
      updatePointCoords(symbolInfo.target, symbolInfo.FID);
      symbolInfo.endCoords = getPointCoords(symbolInfo.target, e.id);
      gui.dispatchEvent('symbol_dragend', symbolInfo);
      symbolInfo = null;
    });

    function pixToDataCoords(x, y) {
      var target = hit.getHitTarget();
      return translateDisplayPoint(target, ext.translatePixelCoords(x, y));
    }

    function translateDeltaDisplayCoords(dx, dy, ext) {
      var a = ext.translatePixelCoords(0, 0);
      var b = ext.translatePixelCoords(dx, dy);
      return [b[0] - a[0], b[1] - a[1]];
    }
  }

  // pixel distance threshold for hovering near a vertex or segment midpoint
  var HOVER_THRESHOLD = 10;

  function initLineEditing(gui, ext, hit) {
    var hoverVertexInfo;
    var prevVertexAddedEvent;
    var prevHoverEvent;
    var initialArcCount = -1;
    var initialShapeCount = -1;
    var drawingId = -1; // feature id of path being drawn
    var sessionCount = 0;
    var alert;
    var pencilPoints = [];
    var _dragging = false;

    function active() {
      return initialArcCount >= 0;
    }

    function vertexDragging() {
      return _dragging;
    }

    function pathDrawing() {
      return drawingId > -1;
    }

    function cmdKeyDown() {
      return gui.keyboard.altIsPressed() || gui.keyboard.metaIsPressed();
    }

    function pencilIsActive() {
      return active() && (cmdKeyDown() || pathDrawing()) && !vertexDragging() && !!pencilPoints;
    }

    function polygonMode() {
      return active() && hit.getHitTarget().geometry_type == 'polygon';
    }

    function clearHoverVertex() {
      hit.clearHoverVertex();
      hoverVertexInfo = null;
    }

    gui.addMode('drawing_tool', turnOn, turnOff);

    gui.on('interaction_mode_change', function(e) {
      if (e.mode == 'edit_lines' || e.mode == 'edit_polygons') {
        if (!gui.model.getActiveLayer()) {
          addEmptyLayer(gui, undefined, e.mode == 'edit_lines' ? 'polyline' : 'polygon');
        }
        gui.enterMode('drawing_tool');
      } else if (gui.getMode() == 'drawing_tool') {
        gui.clearMode();
      } else if (active()) {
        turnOff();
      }
      updateCursor();
    }, null, 10); // higher priority than hit control, so turnOff() has correct hit target

    gui.on('redo_path_add', function(e) {
      var target = hit.getHitTarget();
      clearDrawingInfo();
      appendNewPath(target, e.p1, e.p2);
      deleteLastVertex(target); // second vertex is a placeholder
      gui.undo.redo(); // add next vertex in the path
      fullRedraw();
    });

    gui.on('undo_path_add', function(e) {
      deleteLastPath(hit.getHitTarget());
      clearDrawingInfo();
    });

    gui.on('redo_path_extend', function(e) {
      var target = hit.getHitTarget();

      if (pathDrawing() && prevHoverEvent) {
        updatePathEndpoint(e.p);
        appendVertex$1(target, pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
      } else {
        appendVertex$1(target, e.p);
      }
      if (e.shapes) {
        replaceDrawnShapes(e.shapes);
      }
    });

    gui.on('undo_path_extend', function(e) {
      var target = hit.getHitTarget();
      if (pathDrawing() && prevHoverEvent) {
        deleteLastVertex(target);
        updatePathEndpoint(pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
      } else {
        deleteLastVertex(target);
      }
      if (e.shapes) {
        replaceDrawnShapes(e.shapes);
      }
      if (getLastArcLength(target) < 2) {
        gui.undo.undo(); // remove the path
      }
    });

    function turnOn() {
      if (active()) return;
      var target = hit.getHitTarget();
      initialArcCount = target.gui.displayArcs.size();
      initialShapeCount = target.shapes.length;
      if (sessionCount === 0) {
        showInstructions();
      }
      sessionCount++;
    }

    function showInstructions() {
      var isMac = navigator.userAgent.includes('Mac');
      var undoKey = isMac ? '⌘' : '^';
      var msg = `Instructions: click to start a path, click or drag to keep drawing. Drag vertices to reshape a path. Type ${undoKey}Z/${undoKey}Y to undo/redo.`;
        alert = showPopupAlert(msg, null, {
          non_blocking: true, max_width: '388px'});
    }

    function hideInstructions() {
      if (!alert) return;
      alert.close('fade');
      alert = null;
    }

    function turnOff() {
      var removed = 0;
      var mode = gui.interaction.getMode();
      finishCurrentPath();
      if (polygonMode()) {
        removed = removeOpenPolygons();
      }
      clearDrawingInfo();
      hideInstructions();
      initialArcCount = -1;
      initialShapeCount = -1;
      if (mode == 'edit_lines' || mode == 'edit_polygons') {
        // mode change was not initiated by interactive menu -- turn off interactivity
        gui.interaction.turnOff();
      }
      updateCursor();
      if (removed > 0) {
        fullRedraw();
      }
    }

    // returns number of removed shapes
    function removeOpenPolygons() {
      var target = hit.getHitTarget();
      var arcs = target.gui.source.dataset.arcs;
      var n = target.shapes.length;
      // delete open paths
      for (var i=initialShapeCount; i<n; i++) {
        var shp = target.shapes[i];
        if (!geom.pathIsClosed(shp[0], arcs)) { // assume open paths have one arc
          target.shapes[i] = null;
        }
      }
      // removes features with wrong winding order or null geometry
      mapshaper.cmd.filterFeatures(target, arcs, {remove_empty: true, quiet: true});
      return n - target.shapes.length;
    }

    // updates display arcs and redraws all layers
    function fullRedraw() {
      gui.model.updated({arc_count: true});
    }

    function clearDrawingInfo() {
      hit.clearDrawingId();
      drawingId = -1;
      hoverVertexInfo = null;
      prevVertexAddedEvent = prevHoverEvent = null;
      updateCursor();
    }

    gui.keyboard.on('keydown', function(e) {
      if (pathDrawing() && e.keyName == 'space') {
        e.stopPropagation(); // prevent console from opening if shift-panning
      }
    }, null, 1);

    hit.on('contextmenu', function(e) {
      if (!active() || pathDrawing() || vertexDragging()) return;
      var target = hit.getHitTarget();
      var vInfo = hoverVertexInfo;
      if (hoverVertexInfo?.type == 'vertex' && !vertexIsEndpoint(vInfo, target)) {
        e.deleteVertex = function() {
          deleteActiveVertex(e, vInfo);
        };
      }

      // don't allow copying of open paths as geojson in polygon mode
      gui.contextMenu.open(e, target);
    });

    hit.on('dragstart', function(e) {
      if (!active() || pathDrawing() || !hoverVertexInfo) return;
      hideInstructions();
      e.originalEvent.stopPropagation();
      _dragging = true;
      updateCursor();
      if (hoverVertexInfo.type == 'interpolated') {
        insertVertex$1(hit.getHitTarget(), hoverVertexInfo.i, hoverVertexInfo.point);
        hoverVertexInfo.ids = [hoverVertexInfo.i];
      }
      hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
    });

    gui.map.getMouse().on('dragend', function(e) {
      pencilPoints = []; // re-enable pencil after closing a path
    });

    gui.map.getMouse().on('drag', function(e) {
      if (!pencilIsActive()) {
        if (!pencilPoints) {
          // null points signals that a path was just completed -- block panning
          e.stopPropagation();
        }
        return;
      }
      if (gui.keyboard.spaceIsPressed()) {
        // pan if dragging with spacebar down
        pencilPoints = []; // don't continue previous line after panning
        return;
      }
      e.stopPropagation(); // prevent panning
      hoverVertexInfo = findPathStartInfo(e);
      var xy = [e.x, e.y], xy2;
      var p = pixToDataCoords(e.x, e.y);
      var addedToPath = true;
      if (!pathDrawing()) {
        pencilPoints = [xy];
        startNewPath(p);
      } else if (pencilPoints.length == 0) {
        // start pencil-drawing when a path is started
        pencilPoints = [xy];
        extendCurrentPath(p);
      } else if (polygonMode() && hoverVertexInfo && pencilPoints.length > 2) {
        // close path
        p = hoverVertexInfo.point;
        appendVertex$1(hit.getHitTarget(), p);
        extendCurrentPath(p);
        pencilPoints = null; // stop drawing
      } else if (pencilPoints.length >= 2 && pointExceedsTolerance(xy, pencilPoints, 1.2)) {
        xy2 = pencilPoints.pop();
        p = pixToDataCoords(xy2[0], xy2[1]);
        extendCurrentPath(p);
        // kludgy way to get a smoother line (could be better)
        // not this pencilPoints = [getAvgPoint(pencilPoints), xy2, xy];
        // not this pencilPoints = pencilPoints.slice(-2).concat([xy2, xy]);
        pencilPoints = [getAvgPoint(pencilPoints.slice(-3).concat([xy2])), xy2, xy];
      } else {
        // skip this point, update the hover line
        pencilPoints.push(xy);
        updatePathEndpoint(p);
        addedToPath = false;
      }
      if (addedToPath) {
        //
        prevVertexAddedEvent = e;
      }
    }, null, 3); // higher priority than hit control

    hit.on('drag', function(e) {
      if (!vertexDragging() || pathDrawing()) {
        return;
      }
      e.originalEvent.stopPropagation();
      // dragging a vertex
      var target = hit.getHitTarget();
      var p = ext.translatePixelCoords(e.x, e.y);
      if (gui.keyboard.shiftIsPressed()) {
        internal.snapPointToArcEndpoint(p, hoverVertexInfo.ids, target.gui.displayArcs);
      }
      internal.snapVerticesToPoint(hoverVertexInfo.ids, p, target.gui.displayArcs);
      hit.setHoverVertex(p, '');
      // redrawing the whole map updates the data layer as well as the overlay layer
      // gui.dispatchEvent('map-needs-refresh');
    });

    hit.on('dragend', function(e) {
      if (!vertexDragging()) return;
      _dragging = false;
      var target = hit.getHitTarget();
      // kludge to get dataset to recalculate internal bounding boxes
      target.gui.displayArcs.transformPoints(function() {});
      updateVertexCoords(target, hoverVertexInfo.ids);
      gui.dispatchEvent('vertex_dragend', hoverVertexInfo);
      gui.dispatchEvent('map-needs-refresh'); // redraw basemap
      clearHoverVertex();
    });

    // shift + double-click deletes a vertex (when not drawing)
    // double-click finishes a path (when drawing)
    hit.on('dblclick', function(e) {
      if (!active()) return;
      // double click finishes a path
      // note: if the preceding 'click' finished the path, this does not fire
      if (pathDrawing()) {
        finishCurrentPath();
        e.originalEvent.stopPropagation(); // prevent dblclick zoom
        return;
      }
    });

    // hover event highlights the nearest point in close proximity to the pointer
    // ... or the closest point along the segment (for adding a new vertex)
    hit.on('hover', function(e) {
      if (!active() || vertexDragging()) return;

      if (pathDrawing()) {
        if (!e.overMap) {
          finishCurrentPath();
          return;
        }
        if (gui.keyboard.shiftIsPressed()) {
          alignPointerPosition(e, prevVertexAddedEvent);
        }
        updatePathEndpoint(pixToDataCoords(e.x, e.y));
      }

      // highlight nearby snappable vertex (the closest vertex on a nearby line,
      //   or the first vertex of the current drawing path if not near a line)
      hoverVertexInfo = e.id >= 0 && findDraggableVertices(e) ||
          pathDrawing() && findPathStartInfo(e) ||
          e.id >= 0 && findInterpolatedPoint(e);
      if (hoverVertexInfo) {
        // hovering near a vertex: highlight the vertex
        hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
      } else {
        clearHoverVertex();
      }
      updateCursor();
      prevHoverEvent = e;
    }, null, 100);

    // click starts or extends a new path
    hit.on('click', function(e) {
      if (!active()) return;
      if (detectDoubleClick(e)) return; // ignore second click of a dblclick
      var p = pixToDataCoords(e.x, e.y);
      if (pathDrawing()) {
        extendCurrentPath(hoverVertexInfo?.point || p);
      } else if (hoverVertexInfo?.type == 'interpolated') {
        // don't start new path if hovering along a segment -- this is
        // likely to be an attempt to add a new vertex, not start a new path
      } else {
        startNewPath(p);
      }
      prevVertexAddedEvent = e;
    });

    // esc or enter key finishes a path
    gui.keyboard.on('keydown', function(e) {
      if (pathDrawing() && (e.keyName == 'esc' || e.keyName == 'enter')) {
        e.stopPropagation();
        finishCurrentPath();
        e.originalEvent.preventDefault(); // block console "enter"
      }
    }, null, 10);

    // detect second 'click' event of a double-click action
    function detectDoubleClick(evt) {
      if (!prevVertexAddedEvent) return false;
      var elapsed = evt.time - prevVertexAddedEvent.time;
      var dx = Math.abs(evt.x - prevVertexAddedEvent.x);
      var dy = Math.abs(evt.y - prevVertexAddedEvent.y);
      var dbl = elapsed < 500 && dx <= 2 && dy <= 2;
      return dbl;
    }

    function updateCursor() {
      var el = gui.container.findChild('.map-layers');
      el.classed('draw-tool', active());
      var useArrow = hoverVertexInfo && !hoverVertexInfo.extendable && !pathDrawing();
      el.classed('dragging', useArrow);
      el.classed('drawing', pathDrawing());
    }

    function vertexIsEndpoint(info, target) {
      var vId = info.ids[0];
      return internal.vertexIsArcStart(vId, target.gui.displayArcs) ||
        internal.vertexIsArcEnd(vId, target.gui.displayArcs);
    }

    // info: optional vertex info object
    function deleteActiveVertex(e, infoArg) {
      var info = infoArg || findDraggableVertices(e);
      if (!info || info.type != 'vertex') return;
      var vId = info.ids[0];
      var target = hit.getHitTarget();
      if (vertexIsEndpoint(info, target)) return;
      gui.dispatchEvent('vertex_delete', {
        target: target,
        vertex_id: vId
      });
      deleteVertex$1(target, vId);
      clearHoverVertex();
      gui.dispatchEvent('map-needs-refresh');
    }

    function pixToDataCoords(x, y) {
      var target = hit.getHitTarget();
      return translateDisplayPoint(target, ext.translatePixelCoords(x, y));
    }

    // Change the x, y pixel location of thisEvt so that the segment extending
    // from prevEvt is aligned to one of 8 angles.
    function alignPointerPosition(thisEvt, prevEvt) {
      if (!prevEvt) return;
      var x0 = prevEvt.x;
      var y0 = prevEvt.y;
      var dist = geom.distance2D(thisEvt.x, thisEvt.y, x0, y0);
      if (dist < 1) return;
      var dist2 = dist / Math.sqrt(2);
      var minDist = Infinity;
      var cands = [
        {dx: 0, dy: dist},
        {dx: 0, dy: -dist},
        {dx: dist, dy: 0},
        {dx: -dist, dy: 0},
        {dx: dist2, dy: dist2},
        {dx: dist2, dy: -dist2},
        {dx: -dist2, dy: dist2},
        {dx: -dist2, dy: -dist2}
      ];
      var snapped = cands.reduce(function(memo, cand) {
        var dist = geom.distance2D(thisEvt.x, thisEvt.y, x0 + cand.dx, y0 + cand.dy);
        if (dist < minDist) {
          minDist = dist;
          return cand;
        }
        return memo;
      }, null);
      thisEvt.x = x0 + snapped.dx;
      thisEvt.y = y0 + snapped.dy;

      return null;
    }

    function finishCurrentPath() {
      if (!pathDrawing()) return;
      var target = hit.getHitTarget();
      if (getLastArcLength(target) <= 2) { // includes hover point
        // deleteLastPath(target);
        gui.undo.undo(); // assume previous undo event was path_add
      } else {
        deleteLastVertex(target);
      }
      clearDrawingInfo();
      fullRedraw();
    }

    // p: [x, y] source data coordinates
    function startNewPath(p2) {
      var target = hit.getHitTarget();
      var p1 = hoverVertexInfo?.point || p2;
      appendNewPath(target, p1, p2);
      gui.dispatchEvent('path_add', {target, p1, p2});
      drawingId = target.shapes.length - 1;
      hit.setDrawingId(drawingId);
      hideInstructions();
      updateCursor();
    }

    // p: [x, y] source data coordinates of new point on path
    function extendCurrentPath(p) {
      var target = hit.getHitTarget();
      var shapes1, shapes2;
      // finish the path if a vertex is selected (but not an interpolated point)
      var finish = hoverVertexInfo?.type == 'vertex';
      if (getLastArcLength(target) < 2) {
        stop$1('Defective path');
      }
      if (finish && polygonMode()) {
        shapes1 = target.shapes.slice(initialShapeCount);
        try {
          shapes2 = convertClosedPaths(shapes1);
        } catch(e) {
          console.error(e);
          stop$1('Invalid path');
        }
      }
      if (shapes2) {
        replaceDrawnShapes(shapes2);
        gui.dispatchEvent('path_extend', {target, p, shapes1, shapes2});
        clearDrawingInfo();
        fullRedraw();
      } else {
        appendVertex$1(target, p);
        gui.dispatchEvent('path_extend', {target, p});
        hit.triggerChangeEvent(); // trigger overlay redraw
      }
    }

    function replaceDrawnShapes(shapes) {
      var target = hit.getHitTarget();
      var records = target.data?.getRecords();
      var prevLen = target.shapes.length;
      var newLen = initialShapeCount + shapes.length;
      var recordCount = records?.length || 0;
      target.shapes = target.shapes.slice(0, initialShapeCount).concat(shapes);
      while (records && records.length > newLen) {
        records.pop();
      }
      while (records && records.length < newLen) {
        appendNewDataRecord(target);
      }
    }

    // p: [x, y] source data coordinates
    function updatePathEndpoint(p) {
      var target = hit.getHitTarget();
      var i = target.gui.displayArcs.getPointCount() - 1;
      if (hoverVertexInfo) {
        p = hoverVertexInfo.point; // snap to selected point
      }
      setVertexCoords(target, [i], p);
      hit.triggerChangeEvent();
    }

    function findPathStartInfo(e) {
      if (!pathDrawing()) return false;
      var target = hit.getHitTarget();
      var arcId = target.gui.displayArcs.size() - 1;
      var p1 = ext.translatePixelCoords(e.x, e.y); // mouse coords
      var p2 = internal.getArcStartCoords(arcId, target.gui.displayArcs); // vertex coords
      var p3 = internal.getArcStartCoords(arcId, target.gui.source.dataset.arcs);
      var dist = geom.distance2D(p1[0], p1[1], p2[0], p2[1]);
      var data = target.gui.source.dataset.arcs.getVertexData();
      var i = data.ii[arcId];
      var pathLen = data.nn[arcId];
      var pixelDist = dist / ext.getPixelSize();
      if (pixelDist > HOVER_THRESHOLD || pathLen < 4) {
        return null;
      }
      return {
        target, ids: [i], extendable: false, displayPoint: p2, point: p3, type: 'vertex'
      };
    }

    // return data on the nearest vertex (or identical vertices) to the pointer
    // (if within a distance threshold)
    //
    function findDraggableVertices(e) {
      var target = hit.getHitTarget();
      var shp = target.shapes[e.id];
      var p = ext.translatePixelCoords(e.x, e.y);
      var ids = internal.findNearestVertices(p, shp, target.gui.displayArcs);
      var p2 = target.gui.displayArcs.getVertex2(ids[0]);
      var dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
      var pixelDist = dist / ext.getPixelSize();
      if (pixelDist > HOVER_THRESHOLD) {
        return null;
      }
      var point = getVertexCoords(target, ids[0]); // data coordinates
      // find out if the vertex is the endpoint of a single path
      // (which could be extended by a newly drawn path)
      var extendable = ids.length == 1 &&
        internal.vertexIsArcEndpoint(ids[0], target.gui.displayArcs);
      var displayPoint = target.gui.displayArcs.getVertex2(ids[0]);
      return {target, ids, extendable, point, displayPoint, type: 'vertex'};
    }


    function findInterpolatedPoint(e) {
      var target = hit.getHitTarget();
      //// vertex insertion not supported with simplification
      // if (!target.arcs.isFlat()) return null;
      var p = ext.translatePixelCoords(e.x, e.y);
      var minDist = Infinity;
      var shp = target.shapes[e.id];
      var closest;
      internal.forEachSegmentInShape(shp, target.gui.displayArcs, function(i, j, xx, yy) {
        var x1 = xx[i],
            y1 = yy[i],
            x2 = xx[j],
            y2 = yy[j],
            p2 = internal.findClosestPointOnSeg(p[0], p[1], x1, y1, x2, y2, 0),
            dist = geom.distance2D(p2[0], p2[1], p[0], p[1]);
        if (dist < minDist) {
          minDist = dist;
          closest = {
            i: (i < j ? i : j) + 1, // insertion vertex id
            displayPoint: p2,
            distance: dist
          };
        }
      });

      if (closest.distance / ext.getPixelSize() > HOVER_THRESHOLD) {
        return null;
      }
      closest.point = translateDisplayPoint(target, closest.displayPoint);
      closest.type = 'interpolated';
      closest.target = target;
      return closest;
    }

    // Try to form polygon shapes from an array of path shapes
    // shapes: array of all shapes that have been drawn in the current session
    function convertClosedPaths(shapes) {
      var target = hit.getHitTarget();
      // try to convert paths to polygons
      // NOTE: added "no_cuts" option to prevent polygons function from modifying
      // arcs, which would break undo/redo and cause other problems
      var tmpLyr = {
        geometry_type: 'polyline',
        shapes: shapes.concat()
      };
      var output = mapshaper.cmd.polygons([tmpLyr], target.gui.source.dataset, {no_cuts: true});
      var closedShapes = output[0].shapes;

      // find paths that were not convertible to polygons
      var isOpenPath = getOpenPathTest(closedShapes);
      var openShapes = shapes.filter(function(shp) { return isOpenPath(shp); });

      // retain both converted polygons and unconverted polylines
      return openShapes.concat(closedShapes);
    }

    // Returns a function for testing if a shape is an unclosed path, and doesn't
    // overlap with an array of polygon shapes
    function getOpenPathTest(polygonShapes) {
      var polygonArcs = [];
      internal.forEachArcId(polygonShapes, function(arcId) {
        polygonArcs.push(internal.absArcId(arcId));
      });

      return function(shp) {
        // assume that any compound shape is a polygon
        return shapeHasOneFwdArc(shp) && !polygonArcs.includes(shp[0][0]);
      };
    }

    function shapeHasOneFwdArc(shp) {
      return shp.length == 1 && shp[0].length == 1 && shp[0][0] >= 0;
    }
  }

  function initInteractiveEditing(gui, ext, hit) {
    initLabelDragging(gui, ext, hit);
    initPointEditing(gui, ext, hit);
    initLineEditing(gui, ext, hit);
  }

  function MapExtent(_position) {
    var _scale = 1,
        _cx, _cy, // center in geographic units
        _fullBounds, // full (zoomed-out) content bounds, including any padding
        _strictBounds, // full extent must fit inside, if set
        _self = this,
        _frame; // optional frame data (bbox, width, height)

    _position.on('resize', function(e) {
      if (ready()) {
        // triggerChangeEvent({resize: true});
        triggerChangeEvent();
      }
    });

    function ready() { return !!_fullBounds; }

    this.reset = function(fire) {
      if (!ready()) return;
      recenter(_fullBounds.centerX(), _fullBounds.centerY(), 1);
      if (fire) {
        triggerChangeEvent();
      }
    };

    this.home = function() {
      if (!ready()) return;
      recenter(_fullBounds.centerX(), _fullBounds.centerY(), 1);
      triggerChangeEvent();
    };

    this.pan = function(xpix, ypix) {
      if (!ready()) return;
      var t = this.getTransform();
      recenter(_cx - xpix / t.mx, _cy - ypix / t.my);
      triggerChangeEvent();
    };

    // Zoom to @w (width of the map viewport in coordinates)
    // @xpct, @ypct: optional focus, [0-1]...
    this.zoomToExtent = function(w, xpct, ypct) {
      if (!ready()) return;
      if (arguments.length < 3) {
        xpct = 0.5;
        ypct = 0.5;
      }
      var b = this.getBounds(),
          scale = limitScale(b.width() / w * _scale),
          fx = b.xmin + xpct * b.width(),
          fy = b.ymax - ypct * b.height(),
          dx = b.centerX() - fx,
          dy = b.centerY() - fy,
          ds = _scale / scale,
          dx2 = dx * ds,
          dy2 = dy * ds,
          cx = fx + dx2,
          cy = fy + dy2;
      recenter(cx, cy, scale);
      triggerChangeEvent();
    };

    this.zoomByPct = function(pct, xpct, ypct) {
      if (!ready()) return;
      this.zoomToExtent(this.getBounds().width() / pct, xpct, ypct);
    };

    this.resize = _position.resize;
    this.width = _position.width;
    this.height = _position.height;
    this.position = _position.position;
    this.recenter = recenter;

    // get zoom factor (1 == full extent, 2 == 2x zoom, etc.)
    this.scale = function() {
      return _scale;
    };

    this.maxScale = maxScale;

    // Display scale, e.g. meters per pixel or degrees per pixel
    this.getPixelSize = function() {
      return 1 / this.getTransform().mx;
    };

    // Get params for converting geographic coords to pixel coords
    this.getTransform = function(pixScale) {
      // get transform (y-flipped);
      var viewBounds = new Bounds(0, 0, _position.width(), _position.height());
      if (pixScale) {
        viewBounds.xmax *= pixScale;
        viewBounds.ymax *= pixScale;
      }
      return this.getBounds().getTransform(viewBounds, true);
    };

    // k scales the size of the bbox (used by gui to control fp error when zoomed very far)
    this.getBounds = function(k) {
      if (!_fullBounds) return new Bounds();
      return calcBounds(_cx, _cy, _scale / (k || 1));
    };

    this.getFullBounds = function() {
      return _fullBounds;
    };

    // Update the extent of 'full' zoom without navigating the current view
    //
    this.setFullBounds = function(fullBounds, strictBounds) {
      var prev = _fullBounds;
      var b = _fullBounds = fullBounds;
      if (!b.hasBounds()) return; // kludge
      if (strictBounds) {
        _strictBounds = Array.isArray(strictBounds) ? new Bounds(strictBounds) : strictBounds;
      } else {
        _strictBounds = null;
      }
      if (_strictBounds) {
        _fullBounds = fitIn(_fullBounds, _strictBounds);
      }
      if (prev) {
        _scale = _scale * fillOut(_fullBounds).width() / fillOut(prev).width();
      } else {
        _cx = _fullBounds.centerX();
        _cy = _fullBounds.centerY();
      }
    };

    // translate display CRS coords to pixel coords
    this.translateCoords = function(x, y) {
      return this.getTransform().transform(x, y);
    };

    this.setFrameData = function(frame) {
      _frame = frame || null;
    };

    this.getFrameData = function() {
      return _frame || null;
    };

    this.getSymbolScale = function() {
      if (!_frame) return 1;
      var bounds = new Bounds(_frame.bbox);
      var bounds2 = bounds.clone().transform(this.getTransform());
      return bounds2.width() / _frame.width;
    };

    // convert pixel coords (0,0 is top left corner of map) to display CRS coords
    this.translatePixelCoords = function(x, y) {
      return this.getTransform().invert().transform(x, y);
    };

    function recenter(cx, cy, scale) {
      scale = scale ? limitScale(scale) : _scale;
      if (cx == _cx && cy == _cy && scale == _scale) return;
      navigate(cx, cy, scale);
    }

    function navigate(cx, cy, scale) {
      if (_strictBounds) {
        var full = fillOut(_fullBounds);
        var minScale = full.height() / _strictBounds.height();
        if (scale < minScale) {
          var dx = cx - _cx;
          cx = _cx + dx * (minScale - _scale) / (scale - _scale);
          scale = minScale;
        }
        var dist = full.height() / 2 / scale;
        var ymax = _strictBounds.ymax - dist;
        var ymin = _strictBounds.ymin + dist;
        if (cy > ymax ) {
          cy = ymax;
        }
        if (cy < ymin) {
          cy = ymin;
        }
      }
      _cx = cx;
      _cy = cy;
      _scale = scale;
    }

    function triggerChangeEvent() {
      _self.dispatchEvent('change');
    }

    // stop zooming before rounding errors become too obvious
    function maxScale() {
      var minPixelScale = 1e-16;
      var xmax = maxAbs(_fullBounds.xmin, _fullBounds.xmax, _fullBounds.centerX());
      var ymax = maxAbs(_fullBounds.ymin, _fullBounds.ymax, _fullBounds.centerY());
      var xscale = _fullBounds.width() / _position.width() / xmax / minPixelScale;
      var yscale = _fullBounds.height() / _position.height() / ymax / minPixelScale;
      return Math.min(xscale, yscale);
    }

    function maxAbs() {
      return Math.max.apply(null, utils$1.toArray(arguments).map(Math.abs));
    }

    function limitScale(scale) {
      return Math.min(scale, maxScale());
    }

    function calcBounds(cx, cy, scale) {
      var full = fillOut(_fullBounds);
      if (_strictBounds) {
        full = fitIn(full, _strictBounds);
      }
      var w = full.width() / scale;
      var h = full.height() / scale;
      return new Bounds(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
    }

    // Calculate viewport bounds from frame data
    function fillOutFrameBounds(frame) {
      var bounds = new Bounds(frame.bbox);
      var kx = _position.width() / frame.width;
      var ky = _position.height() / frame.height;
      bounds.scale(kx, ky);
      return bounds;
    }

    function padBounds(b, marginpix) {
      var wpix = _position.width() - 2 * marginpix,
          hpix = _position.height() - 2 * marginpix,
          xpad, ypad, b2;
      if (wpix <= 0 || hpix <= 0) {
        return new Bounds(0, 0, 0, 0);
      }
      b = b.clone();
      b2 = b.clone();
      b2.fillOut(wpix / hpix);
      xpad = b2.width() / wpix * marginpix;
      ypad = b2.height() / hpix * marginpix;
      b.padBounds(xpad, ypad, xpad, ypad);
      return b;
    }

    function fitIn(b, b2) {
      // only fitting vertical extent
      // (currently only used in basemap view to enforce Mapbox's vertical limits)
      if (b.height() > b2.height()) {
        b.scale(b2.height() / b.height());
      }
      if (b.ymin < b2.ymin) {
        b.shift(0, b2.ymin - b.ymin);
      }
      if (b.ymax > b2.ymax) {
        b.shift(0, b2.ymax - b.ymax);
      }
      return b;
    }

    // Pad bounds vertically or horizontally to match viewport aspect ratio
    function fillOut(b) {
      var wpix = _position.width(),
          hpix = _position.height();
      b = b.clone();
      b.fillOut(wpix / hpix);
      return b;
    }
  }

  utils$1.inherit(MapExtent, EventDispatcher);

  var hatches = {}; // cached patterns

  function getCanvasFillEffect(ctx, shp, arcs, ext, style) {
    var bounds = arcs.getMultiShapeBounds(shp);
    if (!bounds.hasBounds() || style.fillEffect != 'sphere') {
      return null;
    }
    bounds.transform(ext.getTransform(GUI.getPixelRatio()));
    bounds.fillOut(1); // convert to square
    var o = convertSvgSphereParams(bounds);
    var fill = ctx.createRadialGradient(o.x0, o.y0, o.r0, o.x1, o.y1, o.r1);
    o.stops.forEach(function(stop) {
      fill.addColorStop(stop.offset, stop.color);
    });
    return fill;
  }

  function convertSvgSphereParams(bounds) {
    var bbox = bounds.toArray(),
        d = Math.max(bounds.width(), bounds.height()),
        cx = bounds.centerX(),
        cy = bounds.centerY(),
        o = internal.getSphereEffectParams();
    return {
      x0: bbox[0] + d * o.fx,
      y0: bbox[1] + d * o.fy,
      r0: 0,
      x1: bbox[0] + d * o.cx,
      y1: bbox[1] + d * o.cy,
      r1: d * o.r,
      stops: o.stops.map(function(stop) {
        return {offset: stop.offset, color: `rgba(0,0,0,${stop.opacity})`};
      })
    };
  }


  function getCanvasFillPattern(style) {
    var fill = hatches[style.fillPattern];
    if (fill === undefined) {
      fill = makePatternFill(style);
      hatches[style.fillPattern] = fill;
    }
    return fill || style.fill || '#000'; // use fill if hatches are invalid
  }

  function makePatternFill(style) {
    var o = internal.parsePattern(style.fillPattern);
    if (!o) return null;
    var canv = document.createElement('canvas');
    var ctx = canv.getContext('2d');
    var res = GUI.getPixelRatio();
    var w = o.tileSize[0] * res;
    var h = o.tileSize[1] * res;
    canv.setAttribute('width', w);
    canv.setAttribute('height', h);
    if (o.background) {
      ctx.fillStyle = o.background;
      ctx.fillRect(0, 0, w, h);
    }
    if (o.type == 'dots' || o.type == 'squares') makeDotFill(o, ctx, res);
    if (o.type == 'dashes') makeDashFill(o, ctx, res);
    if (o.type == 'hatches') makeHatchFill(o, ctx, res);
    var pattern = ctx.createPattern(canv, 'repeat');
    if (o.rotation) {
      pattern.setTransform(new DOMMatrix('rotate(' + o.rotation + 'deg)'));
    }
    return pattern;
  }

  function makeDashFill(o, ctx, res) {
    var x = 0;
    for (var i=0; i<o.colors.length; i++) {
      ctx.fillStyle = o.colors[i];
      ctx.fillRect(x, 0, o.width * res, o.dashes[0] * res);
      x += res * (o.spacing + o.width);
    }
  }

  function makeDotFill(o, ctx, res) {
    var dotSize = o.size * res;
    var r = dotSize / 2;
    var n = o.colors.length;
    var dist = dotSize + o.spacing * res;
    var dots = n * n;
    var x = 0, y = 0;
    for (var i=0; i<dots; i++) {
      if (o.type == 'dots') ctx.beginPath();
      ctx.fillStyle = o.colors[(i + Math.floor(i / n)) % n];
      if (o.type == 'dots') {
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      } else {
        ctx.fillRect(x, y, dotSize, dotSize);
      }
      if (o.type == 'dots') ctx.fill();
      x = ((i + 1) % n) * dist;
      if (x == 0) y += dist;
    }
  }

  function makeHatchFill(o, ctx, res) {
    var h = o.tileSize[1] * res;
    var w;
    for (var i=0, x=0; i<o.widths.length; i++) {
      w = o.widths[i] * res;
      ctx.fillStyle = o.colors[i];
      ctx.fillRect(x, 0, x + w, h);
      x += w;
    }
  }

  // TODO: consider moving this upstream
  function getArcsForRendering(lyr, ext) {
    var dataset = lyr.gui.source.dataset;
    var sourceArcs = dataset.arcs;
    if (lyr.gui.geographic && dataset.gui?.displayArcs) {
      return dataset.gui.displayArcs.getScaledArcs(ext);
    }
    return lyr.gui.displayArcs;
  }

  function drawOutlineLayerToCanvas(lyr, canv, ext) {
    var arcs;
    var style = lyr.gui.style;
    var arcCounts = lyr.gui.arcCounts;
    var darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
        lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
    var filter;
    if (internal.layerHasPaths(lyr.gui.displayLayer)) {
      if (!arcCounts) {
        arcCounts = lyr.gui.arcCounts = new Uint8Array(lyr.gui.displayArcs.size());
        internal.countArcsInShapes(lyr.gui.displayLayer.shapes, arcCounts);
      }
      arcs = getArcsForRendering(lyr, ext);
      if (lightStyle.strokeColor) {
        filter = getArcFilter(arcs, ext, false, arcCounts);
        canv.drawArcs(arcs, lightStyle, filter);
      }
      if (darkStyle.strokeColor && lyr.gui.displayLayer.geometry_type != 'point') {
        filter = getArcFilter(arcs, ext, true, arcCounts);
        canv.drawArcs(arcs, darkStyle, filter);
      }
    }
    if (lyr.gui.displayLayer.geometry_type == 'point') {
      canv.drawSquareDots(lyr.gui.displayLayer.shapes, style);
    }
  }

  function drawStyledLayerToCanvas(lyr, canv, ext) {
    // TODO: add filter for out-of-view shapes
    var style = lyr.gui.style;
    var layer = lyr.gui.displayLayer;
    var arcs, filter;
    if (layer.geometry_type == 'point') {
      if (style.type == 'styled') {
        canv.drawPoints(layer.shapes, style);
      } else {
        canv.drawSquareDots(layer.shapes, style);
      }
    } else {
      arcs = getArcsForRendering(lyr, ext);
      filter = getShapeFilter(arcs, ext);
      canv.drawStyledPaths(layer.shapes, arcs, style, filter);
      if (style.vertices) {
        canv.drawVertices(layer.shapes, arcs, style, filter);
      }
    }
    canv.clearStyles();
  }


  // Return a function for testing if an arc should be drawn in the current view
  function getArcFilter(arcs, ext, usedFlag, arcCounts) {
    var MIN_PATH_LEN = 0.1;
    var minPathLen = ext.getPixelSize() * MIN_PATH_LEN, // * 0.5
        geoBounds = ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds()),
        visible;
    // don't continue dropping paths if user zooms out farther than full extent
    if (ext.scale() < 1) minPathLen *= ext.scale();
    return function(i) {
        var visible = true;
        if (usedFlag != arcCounts[i] > 0) { // show either used or unused arcs
          visible = false;
        } else if (arcs.arcIsSmaller(i, minPathLen)) {
          visible = false;
        } else if (!allIn && !arcs.arcIntersectsBBox(i, geoBBox)) {
          visible = false;
        }
        return visible;
      };
    }

  // Return a function for testing if a shape should be drawn in the current view
  function getShapeFilter(arcs, ext) {
    var viewBounds = ext.getBounds();
    var bounds = new Bounds();
    if (ext.scale() < 1.1) return null; // full or almost-full zoom: no filter
    return function(shape) {
      bounds.empty();
      arcs.getMultiShapeBounds(shape, bounds);
      return viewBounds.intersects(bounds);
    };
  }

  function getPixelColorFunction() {
    var canv = El('canvas').node();
    canv.width = canv.height = 1;
    var ctx = canv.getContext('2d', {willReadFrequently: true});
    return function(col) {
      var pixels;
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, 1, 1);
      pixels = new Uint32Array(ctx.getImageData(0, 0, 1, 1).data.buffer);
      return pixels[0];
    };
  }

  function DisplayCanvas() {
    var _self = El('canvas'),
        _canvas = _self.node(),
        // TODO: compare performance of willReadFrequently setting
        // _ctx = _canvas.getContext('2d', {willReadFrequently: true}),
        _ctx = _canvas.getContext('2d'),
        _pixelColor = getPixelColorFunction(),
        _ext;

    _self.clearStyles = function() {
      _ctx.fillStyle = null;
      _ctx.strokeStyle = null;
    };

    _self.prep = function(extent) {
      var w = extent.width(),
          h = extent.height(),
          pixRatio = GUI.getPixelRatio();
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      _canvas.width = w * pixRatio;
      _canvas.height = h * pixRatio;
      _self.classed('retina', pixRatio == 2);
      _self.show();
      _ext = extent;
    };

    /*
    // Original function, not optimized
    _self.drawStyledPaths = function(shapes, arcs, style) {
      var startPath = getPathStart(_ext),
          drawPath = getShapePencil(arcs, _ext),
          styler = style.styler || null;
      for (var i=0, n=shapes.length; i<n; i++) {
        if (styler) styler(style, i);
        startPath(_ctx, style);
        drawPath(shapes[i], _ctx);
        endPath(_ctx, style);
      }
    };
    */

    _self.drawVertices = function(shapes, arcs, style, filter) {
      var iter = new internal.ShapeIter(arcs);
      var t = getScaledTransform(_ext);
      var bounds = _ext.getBounds();
      var radius = (style.strokeWidth > 2 ? style.strokeWidth * 0.9 : 1.8) * GUI.getPixelRatio() * getScaledLineScale(_ext, style);
      var color = style.strokeColor || 'black';

      var i, j, p;
      _ctx.beginPath();
      _ctx.fillStyle = color;
      for (i=0; i<shapes.length; i++) {
        var shp = shapes[i];
        if (!shp || filter && !filter(shp)) continue;
        for (j=0; j<shp.length; j++) {
          iter.init(shp[j]);
          while (iter.hasNext()) {
            if (!bounds.containsPoint(iter.x, iter.y)) continue;
            drawCircle(iter.x * t.mx + t.bx, iter.y * t.my + t.by, radius, _ctx);
          }
        }
      }
      _ctx.fill();
      _ctx.closePath();

      if (style.vertex_overlay) {
        _ctx.beginPath();
        _ctx.fillStyle = style.vertex_overlay_color || 'black';
        p = style.vertex_overlay;
        drawCircle(p[0] * t.mx + t.bx, p[1] * t.my + t.by, radius *
            (style.vertex_overlay_scale || 2), _ctx);
        _ctx.fill();
        _ctx.closePath();
      }
    };

    // Optimized to draw paths in same-style batches (faster Canvas drawing)
    _self.drawStyledPaths = function(shapes, arcs, style, filter) {
      var styleIndex = {};
      var batchSize = 1500;
      var startPath = getPathStart(_ext, getScaledLineScale(_ext, style));
      var draw = getShapePencil(arcs, _ext);
      var key, item, shp;
      var styler = style.styler || null;
      for (var i=0; i<shapes.length; i++) {
        shp = shapes[i];
        if (!shp || filter && !filter(shp)) continue;
        if (styler) {
          styler(style, i);
        }
        if (style.overlay || style.opacity < 1 || style.fillOpacity < 1 || style.strokeOpacity < 1 || style.fillEffect) {
          // don't batch shapes with opacity, in case they overlap
          drawPaths([shp], startPath, draw, style);
          continue;
        }
        key = getStyleKey(style);
        if (key in styleIndex === false) {
          styleIndex[key] = {
            style: utils$1.defaults({}, style),
            shapes: []
          };
        }
        item = styleIndex[key];
        item.shapes.push(shp);
        if (item.shapes.length >= batchSize) {
          drawPaths(item.shapes, startPath, draw, item.style);
          item.shapes = [];
        }
      }
      Object.keys(styleIndex).forEach(function(key) {
        var item = styleIndex[key];
        drawPaths(item.shapes, startPath, draw, item.style);
      });
    };

    function drawPaths(shapes, beginPath, drawShape, style) {
      beginPath(_ctx, style);
      for (var i=0, n=shapes.length; i<n; i++) {
        drawShape(shapes[i], _ctx, style);
      }
      endPath(_ctx, style);
    }

    _self.drawSquareDots = function(shapes, style) {
      var t = getScaledTransform(_ext),
          size = getDotSize(style),
          styler = style.styler || null,
          xmax = _canvas.width + size,
          ymax = _canvas.height + size,
          color = style.dotColor || "black",
          shp, x, y, i, j, n, m,
          mx = t.mx,
          my = t.my,
          bx = t.bx,
          by = t.by;
      if (size === 0) return;
      if (size <= 6 && !styler) {
        // optimized drawing of many small same-colored dots
        _self.drawSquareDotsFaster(shapes, color, size, t);
        return;
      }
      _ctx.fillStyle = color;
      for (i=0, n=shapes.length; i<n; i++) {
        if (styler !== null) { // e.g. selected points
          styler(style, i);
          size = getDotSize(style);
          if (style.dotColor != color) {
            color = style.dotColor;
            _ctx.fillStyle = color;
          }
        }
        shp = shapes[i];
        for (j=0, m=shp ? shp.length : 0; j<m; j++) {
          x = shp[j][0] * mx + bx;
          y = shp[j][1] * my + by;
          if (x > -size && y > -size && x < xmax && y < ymax) {
            drawSquare(x, y, size, _ctx);
          }
        }
      }
    };

    _self.drawSquareDotsFaster = function(shapes, color, size, t) {
      var w = _canvas.width,
          h = _canvas.height,
          rgba = _pixelColor(color),
          imageData = _ctx.getImageData(0, 0, w, h),
          pixels = new Uint32Array(imageData.data.buffer),
          shp, x, y, i, j, n, m,
          mx = t.mx,
          my = t.my,
          bx = t.bx,
          by = t.by;
      for (i=0, n=shapes.length; i<n; i++) {
        shp = shapes[i];
        for (j=0, m=shp ? shp.length : 0; j<m; j++) {
          x = shp[j][0] * mx + bx;
          y = shp[j][1] * my + by;
          if (x >= 0 && y >= 0 && x <= w && y <= h) {
            drawSquareFaster(x, y, rgba, size, pixels, w, h);
          }
        }
      }
      _ctx.putImageData(imageData, 0, 0);
    };

    // color: 32-bit integer value containing rgba channel values
    // size: pixels on a side (assume integer)
    // x, y: non-integer center coordinates
    // pixels: Uint32Array of pixel colors
    // w, h: Size of canvas
    function drawSquareFaster(x, y, rgba, size, pixels, w, h) {
      var xmin = x < 0 ? 0 : (x - size * 0.5) | 0;
      var ymin = y < 0 ? 0 : (y - size * 0.5) | 0;
      var xmax = x >= w-1 ? w-1 : xmin + size - 1;
      var ymax = y >= h-1 ? h-1 : ymin + size - 1;
      for (var r = ymin; r <= ymax; r++) {
        for (var c = xmin; c <= xmax; c++) {
          pixels[r * w + c] = rgba;
        }
      }
    }

    // TODO: consider using drawStyledPaths(), which draws paths in batches
    // for faster Canvas rendering. Downside: changes stacking order, which
    // is bad if circles are graduated.
    _self.drawPoints = function(shapes, style) {
      var t = getScaledTransform(_ext),
          scale = GUI.getPixelRatio() * (_ext.getSymbolScale() || 1),
          startPath = getPathStart(_ext),
          styler = style.styler || null,
          shp, p,
          mx = t.mx,
          my = t.my,
          bx = t.bx,
          by = t.by;

      for (var i=0, n=shapes.length; i<n; i++) {
        shp = shapes[i];
        if (styler) styler(style, i);
        startPath(_ctx, style);
        if (!shp || style.radius > 0 === false) continue;
        for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
          p = shp[j];
          drawCircle(p[0] * mx + bx, p[1] * my + by, style.radius * scale, _ctx);
        }
        endPath(_ctx, style);
      }
    };

    _self.drawArcs = function(arcs, style, filter) {
      var startPath = getPathStart(_ext, getLineScale(_ext)),
          t = getScaledTransform(_ext),
          ctx = _ctx,
          batch = 25, // render paths in batches of this size (an optimization)
          count = 0,
          n = arcs.size(),
          i, iter;

      startPath(ctx, style);
      for (i=0; i<n; i++) {
        if (filter && !filter(i)) continue;
        if (++count % batch === 0) {
          endPath(ctx, style);
          startPath(ctx, style);
        }
        iter = protectIterForDrawing(arcs.getArcIter(i), _ext);
        // drawPath(iter, t, ctx, 0.1);
        drawPath2(iter, t, ctx, roundToHalfPix);
      }
      endPath(ctx, style);
    };

    function getStyleKey(style) {
      return (style.strokeWidth > 0 ? style.strokeColor + '~' + style.strokeWidth +
        '~' + (style.lineDash ? style.lineDash + '~' : '') : '') +
        (style.fillColor || '') +
        // styles with <1 opacity are no longer batch-rendered, not relevent to key
        // (style.strokeOpacity >= 0 ? style.strokeOpacity + '~' : '') : '') +
        // (style.fillOpacity ? '~' + style.fillOpacity : '') +
        // (style.opacity < 1 ? '~' + style.opacity : '') +
        (style.fillPattern ? '~' + style.fillPattern : '');
    }
    return _self;
  }

  function getScaledLineScale(ext, style) {
    var previewScale = ext.getSymbolScale();
    var k = 1;
    if (previewScale == 1 || style.type != 'styled' || style.baseStyle && style.baseStyle.type != 'styled') {
      return getLineScale(ext);
    }
    if (style.baseStyle?.type == 'styled') {
      // bump up overlay line width in preview mode
      k = previewScale < 2 && 2 || previewScale < 5 && 1.5 || previewScale < 10 && 1.25 || 1.1;
    }
    return previewScale * k;
  }

  // Vary line width according to zoom ratio.
  // For performance and clarity don't start widening until zoomed quite far in.
  function getLineScale(ext) {
    var mapScale = ext.scale(),
        s = 1;
    if (mapScale < 0.5) {
      s *= Math.pow(mapScale + 0.5, 0.35);
    } else if (mapScale > 100) {
      s *= Math.pow(mapScale - 99, 0.10);
    }
    return s;
  }

  function getDotSize(style) {
    var size = style.dotSize || 1;
    // TODO: improve
    var scale = style.dotScale || 1;
    size += (scale - 1) / 2;
    size *= Math.pow(scale, 0.3);

    // shrink dots slightly on retina displays, to adjust for greater clarity
    // and reduce number of pixels to draw on large datasets.
    return Math.round(Math.pow(GUI.getPixelRatio(), 0.8) * size);
  }

  function getScaledTransform(ext) {
    var t = ext.getTransform(GUI.getPixelRatio());
    // A recent Chrome update (v80?) seems to have introduced a performance
    // regression causing slow object property access.
    // the effect is intermittent and pretty mysterious.
    return {
      mx: t.mx,
      my: t.my,
      bx: t.bx,
      by: t.by
    };
  }

  function drawCircle(x, y, radius, ctx) {
    if (radius > 0) {
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2, true);
    }
  }

  function drawSquare(x, y, size, ctx) {
    var offs = size / 2;
    if (size > 0) {
      x = Math.round(x - offs);
      y = Math.round(y - offs);
      size = Math.ceil(size);
      ctx.fillRect(x, y, size, size);
    }
  }

  // Draw a path, but skip vertices within a given pixel threshold from the prev. vertex
  // This optimization introduces visible gaps between filled polygons unless the
  // threshold is much smaller than a pixel, so switching to drawPath2.
  function drawPath(vec, t, ctx, minLen) {
    // copy to local variables because of odd performance regression in Chrome 80
    var mx = t.mx,
        my = t.my,
        bx = t.bx,
        by = t.by;
    var x, y, xp, yp;
    if (!vec.hasNext()) return;
    x = xp = vec.x * mx + bx;
    y = yp = vec.y * my + by;
    ctx.moveTo(x, y);
    while (vec.hasNext()) {
      x = vec.x * mx + bx;
      y = vec.y * my + by;
      if (Math.abs(x - xp) > minLen || Math.abs(y - yp) > minLen) {
        ctx.lineTo(x, y);
        xp = x;
        yp = y;
      }
    }
  }


  // Draw a path, optimized by snapping pixel coordinates and skipping
  // duplicate coords.
  function drawPath2(vec, t, ctx, round) {
    // copy to local variables because of odd performance regression in Chrome 80
    var mx = t.mx,
        my = t.my,
        bx = t.bx,
        by = t.by;
    var x, y, xp, yp;
    var count = 0;
    if (!vec.hasNext()) return;
    x = round(vec.x * mx + bx);
    y = round(vec.y * my + by);
    ctx.moveTo(x, y);
    while (vec.hasNext()) {
      xp = x;
      yp = y;
      x = round(vec.x * mx + bx);
      y = round(vec.y * my + by);
      if (x != xp || y != yp) {
        ctx.lineTo(x, y);
        count++;
      }
    }
    if (count === 0) {
      // draw a tiny line if all coords round to the same location,
      // so tiny shapes with strokes will consistently be drawn as dots,
      ctx.lineTo(x + 0.1, y);
    }
  }

  function roundToPix(x) {
    return x + 0.5 | 0;
  }

  function roundToHalfPix(x) {
    return (x * 2 | 0) / 2;
  }

  function getShapePencil(arcs, ext) {
    var t = getScaledTransform(ext);
    var iter = new internal.ShapeIter(arcs);
    return function(shp, ctx, style) {
      if (style.fillEffect) {
        ctx.fillStyle = getCanvasFillEffect(ctx, shp, arcs, ext, style);
      }
      for (var i=0, n=shp ? shp.length : 0; i<n; i++) {
        iter.init(shp[i]);
        // 0.2 trades visible seams for performance
        // drawPath(protectIterForDrawing(iter, ext), t, ctx, 0.2);
        drawPath2(protectIterForDrawing(iter, ext), t, ctx, roundToPix);
      }
    };
  }

  function protectIterForDrawing(iter, ext) {
    var bounds, k;
    if (ext.scale() > 100) {
      // clip to rectangle when zoomed far in (canvas stops drawing shapes when
      // the coordinates become too large)
      // scale the bbox to avoid large fp errors
      // (affects projected datasets when zoomed very far in)
      // k too large, long segments won't render; too small, segments will jump around
      // TODO: consider converting to pixels before clipping
      k = Math.pow(ext.scale(), 0.45);
      bounds = ext.getBounds(k);
      iter = new internal.PointIter(internal.clipIterByBounds(iter, bounds));
    }
    return iter;
  }

  function getPathStart(ext, lineScale) {
    var pixRatio = GUI.getPixelRatio();
    if (!lineScale) lineScale = 1;
    return function(ctx, style) {
      var strokeWidth;
      ctx.beginPath();
      if (style.strokeWidth > 0) {
        strokeWidth = style.strokeWidth;
        if (pixRatio > 1) {
          // bump up thin lines on retina, but not to more than 1px
          // (tests on Chrome showed much faster rendering of 1px lines)
          // strokeWidth = strokeWidth < 1 ? 1 : strokeWidth * pixRatio;
          strokeWidth = strokeWidth * pixRatio;
        }
        ctx.lineCap = style.lineCap || 'round';
        ctx.lineJoin = style.lineJoin || 'round';
        ctx.lineWidth = strokeWidth * lineScale;
        ctx.strokeStyle = style.strokeColor;
        if (style.lineDash){
          ctx.lineCap = 'butt';
          ctx.setLineDash(style.lineDash.split(' '));
        }
        if (style.miterLimit) {
          ctx.miterLimit = style.miterLimit;
        }
      }

      if (style.fillPattern) {
        ctx.fillStyle = getCanvasFillPattern(style);
      } else if (style.fillColor) {
        ctx.fillStyle = style.fillColor;
      }
    };
  }

  function endPath(ctx, style) {
    var fo = style.opacity >= 0 ? style.opacity : 1,
        so = fo;
    if (style.strokeOpacity >= 0) so *= style.strokeOpacity;
    if (style.fillColor || style.fillPattern || style.fillEffect) {
      if (style.fillOpacity >= 0) {
        fo *= style.fillOpacity;
      } else if (style.fillEffect && style.opacity >= 0 === false) {
        fo = 0.35; // kludge: default opacity of sphere effect
      }
      ctx.globalAlpha = fo;
      ctx.fill();
    }
    if (style.strokeWidth > 0) {
      ctx.globalAlpha = so;
      ctx.stroke();
      if (style.lineDash) {
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
    ctx.closePath();
  }

  function getSvgFurnitureTransform(ext) {
    var scale = ext.getSymbolScale();
    var frame = ext.getFrameData();
    var p = ext.translateCoords(frame.bbox[0], frame.bbox[3]);
    return internal.svg.getTransform(p, scale);
  }

  function repositionFurniture(container, layer, ext) {
    var g = El.findAll('.mapshaper-svg-furniture', container)[0];
    g.setAttribute('transform', getSvgFurnitureTransform(ext));
  }

  function renderFurniture(lyr, ext) {
    var frame = ext.getFrameData(); // frame should be set if we're rendering a furniture layer
    var obj = internal.getEmptyLayerForSVG(lyr, {});
    if (!frame) {
      stop$1('Missing map frame data');
    }
    obj.properties.transform = getSvgFurnitureTransform(ext);
    obj.properties.class = 'mapshaper-svg-furniture';
    obj.children = internal.renderFurnitureLayer(lyr, frame);
    return internal.svg.stringify(obj);
  }

  function SvgDisplayLayer(gui, ext, mouse) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var el = El(svg);

    el.clear = function() {
      while (svg.childNodes.length > 0) {
        svg.removeChild(svg.childNodes[0]);
      }
    };

    el.reposition = function(lyr, type) {
      resize(ext);
      reposition(lyr, type, ext);
    };

    el.drawLayer = function(lyr, type) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      var html = '';
      // generate a unique id so layer can be identified when symbols are repositioned
      // use it as a class name to avoid id collisions
      var id = utils$1.getUniqueName();
      var classNames = [id, 'mapshaper-svg-layer', 'mapshaper-' + type + '-layer'];
      g.setAttribute('class', classNames.join(' '));
      lyr.gui.svg_id = id;
      lyr.gui.svg_container = g;
      resize(ext);
      if (type == 'label' || type == 'symbol') {
        html = renderSymbols(lyr.gui.displayLayer, ext);
      } else if (type == 'furniture') {
        html = renderFurniture(lyr.gui.displayLayer, ext);
      }
      g.innerHTML = html;
      svg.append(g);

      // prevent svg hit detection on inactive layers
      if (!gui.map.isActiveLayer(lyr)) {
        g.style.pointerEvents = 'none';
      }
    };

    function reposition(lyr, type, ext) {
      var container = el.findChild('.' + lyr.gui.svg_id);
      if (!container || !container.node()) {
        console.error('[reposition] missing SVG container');
        return;
      }
      var elements;
      if (type == 'symbol') {
        elements = El.findAll('.mapshaper-svg-symbol', container.node());
        repositionSymbols(elements, lyr.gui.displayLayer, ext);
      } else if (type == 'furniture') {
        repositionFurniture(container.node(), lyr.gui.displayLayer, ext);
      } else {
        // container.getElementsByTagName('text')
        error('Unsupported symbol type:', type);
      }
    }

    function resize(ext) {
      svg.style.width = ext.width() + 'px';
      svg.style.height = ext.height() + 'px';
    }

    return el;
  }

  function LayerRenderer(gui, container) {
    var el = El(container),
        ext = gui.map.getExtent(),
        mouse = gui.map.getMouse(),
        _mainCanv = new DisplayCanvas().appendTo(el),
        _overlayCanv = new DisplayCanvas().appendTo(el),
        _svg = new SvgDisplayLayer(gui, ext, mouse).appendTo(el),
        _furniture = new SvgDisplayLayer(gui, ext, null).appendTo(el),
        _ext = ext;

    // don't let furniture container block events to symbol layers
    _furniture.css('pointer-events', 'none');

    this.drawMainLayers = function(layers, action) {
      var needSvgRedraw = action != 'nav' && action != 'hover';
      if (skipMainLayerRedraw(action)) return;
      _mainCanv.prep(_ext);
      if (needSvgRedraw) {
        _svg.clear();
      }
      layers.forEach(function(lyr) {
        var isSvgLayer = internal.layerHasSvgSymbols(lyr) || internal.layerHasLabels(lyr);
        if (isSvgLayer && !needSvgRedraw) {
          _svg.reposition(lyr, 'symbol');
        } else if (isSvgLayer) {
          _svg.drawLayer(lyr, 'symbol');
        } else {
           drawCanvasLayer(lyr, _mainCanv);
        }
      });
    };

    // Draw highlight effect for hover and selection
    // Highlights get drawn on the main canvas most of the time, because redrawing
    //   is noticeably slower during animations with multiple canvases.
    // Highlights are drawn on a separate canvas while hovering, because this
    //   is generally faster than redrawing all of the shapes.
    this.drawOverlayLayer = function(lyr, action) {
      if (action == 'hover' && lyr) {
        _overlayCanv.prep(_ext);
        drawCanvasLayer(lyr, _overlayCanv);
      } else {
        _overlayCanv.hide();
        drawCanvasLayer(lyr, _mainCanv);
      }
    };

    this.drawFurnitureLayers = function(layers, action) {
      // re-render if action == 'nav', because scalebars get resized
      var noRedraw = action == 'hover';
      if (!noRedraw) {
        _furniture.clear();
      }
      layers.forEach(function(lyr) {
        if (noRedraw) {
          _furniture.reposition(lyr, 'furniture');
        } else {
          _furniture.drawLayer(lyr, 'furniture');
        }
      });
    };

    // kludge: skip rendering base layers if hovering, except on first hover
    // (because highlight shapes may be rendered to the main canvas)
    function skipMainLayerRedraw(action) {
      return action == 'hover' && _overlayCanv.visible();
    }

    function drawCanvasLayer(lyr, canv) {
      if (!lyr) return;
      if (lyr.gui.style.type == 'outline') {
        drawOutlineLayerToCanvas(lyr, canv, ext);
      } else {
        drawStyledLayerToCanvas(lyr, canv, ext);
      }
    }

    function getSvgLayerType(layer) {
      var type = null;
      if (internal.layerHasSvgSymbols(layer)) {
        type = 'symbol'; // also label + symbol
      } else if (internal.layerHasLabels(layer)) {
        type = 'symbol';
      }
      return type;
    }
  }

  // Controls the shift-drag box editing tool
  //
  function BoxTool(gui, ext, nav) {
    var self = new EventDispatcher();
    var box = new HighlightBox(gui, {name: 'box-tool', persistent: true, handles: true, draggable: true});
    var popup = gui.container.findChild('.box-tool-options');
    var coords = popup.findChild('.box-coords');
    var _on = false;
    var instructionsShown = false;
    var alert;

    var infoBtn = new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
      if (coords.visible()) hideCoords(); else showCoords();
    });

    new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
      reset();
    });

    new SimpleButton(popup.findChild('.select-btn')).on('click', function() {
      var coords = box.getDataCoords();
      if (!coords || noData()) return;
      gui.enterMode('selection_tool');
      gui.interaction.setMode('selection');
      // kludge to pass bbox to the selection tool
      gui.dispatchEvent('selection_bridge', {
        map_data_bbox: coords
      });
    });

    function noData() {
      return !gui.model.getActiveLayer();
    }

    new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
      runCommand('-clip bbox=' + box.getDataCoords().join(','));
    });

    new SimpleButton(popup.findChild('.erase-btn')).on('click', function() {
      runCommand('-erase bbox=' + box.getDataCoords().join(','));
    });

    new SimpleButton(popup.findChild('.rect-btn')).on('click', function() {
      var cmd = '-rectangle + bbox=' + box.getDataCoords().join(',');
      runCommand(cmd);
    });

    new SimpleButton(popup.findChild('.frame-btn')).on('click', function() {
      openAddFramePopup(gui, box.getDataCoords());
    });

    gui.addMode('box_tool', turnOn, turnOff);

    gui.on('interaction_mode_change', function(e) {
      if (e.mode === 'box') {
        gui.enterMode('box_tool');
        if (!instructionsShown) {
          instructionsShown = true;
          showInstructions();
        }
      } else if (_on) {
        turnOff();
      }
    });

    gui.on('shift_drag_start', function() {
      hideCoords();
    });

    box.on('dragend', function(e) {
      if (_on) {
        hideInstructions();
        popup.show();
      }
    });

    box.on('handle_drag', function() {
      if (coords.visible()) {
        showCoords();
      }
    });

    function showInstructions() {
      var isMac = navigator.userAgent.includes('Mac');
      var symbol = isMac ? '⌘' : '^';
      var msg = `Instructions: Shift-drag to draw a rectangle. Drag handles to resize. Shift-drag handles to resize symmetrically.`;
      alert = showPopupAlert(msg, null, { non_blocking: true, max_width: '360px'});
    }

    function hideInstructions() {
      if (!alert) return;
      alert.close('fade');
      alert = null;
    }

    function inZoomMode() {
      return !_on && gui.getMode() != 'selection_tool';
    }

    function runCommand(cmd) {
      if (gui.console) {
        gui.console.runMapshaperCommands(cmd, function(err) {
          reset();
          gui.clearMode();
        });
      }
      // reset(); // TODO: exit interactive mode
    }

    function showCoords() {
      El(infoBtn.node()).addClass('selected-btn');
      var bbox = box.getDataCoords();
      var rounded = internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
      coords.text(rounded.join(','));
      coords.show();
      GUI.selectElement(coords.node());
    }

    function hideCoords() {
      El(infoBtn.node()).removeClass('selected-btn');
      coords.hide();
    }

    function turnOn() {
      box.turnOn();
      _on = true;
    }

    function turnOff() {
      box.turnOff();
      hideInstructions();
      if (gui.interaction.getMode() == 'box') {
        // mode change was not initiated by interactive menu -- turn off interactivity
        gui.interaction.turnOff();
      }
      _on = false;
      reset();
    }

    function reset() {
      box.hide();
      popup.hide();
      hideCoords();
    }

    function openAddFramePopup(gui, bbox) {
      var popup = showPopupAlert('', 'Add a map frame');
      var el = popup.container();
      el.addClass('option-menu');
      var html = `<p>Enter a width in px, cm or inches to create a frame layer
for setting the size of the map for symbol scaling in the
GUI and setting the size and crop of SVG output.</p><div><input type="text" class="frame-width text-input" placeholder="examples: 600px 5in"></div>
    <div tabindex="0" class="btn dialog-btn">Create</div></span>`;
      el.html(html);
      var input = el.findChild('.frame-width');
      input.node().focus();
      var btn = el.findChild('.btn').on('click', function() {
        var widthStr = input.node().value.trim();
        if (parseFloat(widthStr) > 0 === false) {
          // invalid input
          input.node().value = '';
          return;
        }
        var cmd = `-rectangle + name=frame bbox='${bbox.join(',')}' width='${widthStr}'`;
        runCommand(cmd);
        popup.close();
      });
    }

    return self;
  }

  function RectangleControl(gui, hit) {
    var box = new HighlightBox(gui, {name: 'rectangle-tool', persistent: true, handles: true, classname: 'rectangles', draggable: false});
    var _on = false;
    var dragInfo;

    gui.addMode('rectangle_tool', turnOn, turnOff);

    gui.on('interaction_mode_change', function(e) {
      if (e.mode === 'rectangles') {
        gui.enterMode('rectangle_tool');
      } else if (_on) {
        turnOff();
      }
    });

    hit.on('change', function(e) {
      if (!_on) return;
      // TODO: handle multiple hits (see gui-inspection-control)
      var id = e.id;
      if (e.id > -1 && e.pinned) {
        var target = hit.getHitTarget();
        var path = target.shapes[e.id][0];
        var bbox = target.gui.displayArcs.getSimpleShapeBounds(path).toArray();
        box.setDataCoords(bbox);
        dragInfo = {
          id: e.id,
          target: target,
          ids: [],
          points: []
        };
        var iter = target.gui.displayArcs.getShapeIter(path);
        while (iter.hasNext()) {
          dragInfo.points.push([iter.x, iter.y]);
          dragInfo.ids.push(iter._arc.i);
        }
        gui.container.findChild('.map-layers').classed('dragging', true);

      } else if (dragInfo) {
        gui.dispatchEvent('rectangle_dragend', dragInfo); // save undo state
        gui.container.findChild('.map-layers').classed('dragging', false);
        reset();
      } else {
        box.hide();
      }

    });

    box.on('handle_drag', function(e) {
      if (!_on || !dragInfo) return;
      var coords = internal.bboxToCoords(box.getDataCoords());
      setRectangleCoords(dragInfo.target, dragInfo.ids, coords);
      gui.dispatchEvent('map-needs-refresh');
    });

    function turnOn() {
      box.turnOn();
      _on = true;
    }

    function turnOff() {
      box.turnOff();
      if (gui.interaction.getMode() == 'rectangles') {
        // mode change was not initiated by interactive menu -- turn off interactivity
        gui.interaction.turnOff();
      }
      _on = false;
      reset();
    }

    function reset() {
      box.hide();
      dragInfo = null;
    }
  }

  utils$1.inherit(MshpMap, EventDispatcher);

  function MshpMap(gui) {
    var opts = gui.options,
        el = gui.container.findChild('.map-layers').node(),
        position = new ElementPosition(el),
        model = gui.model,
        map = this,
        _mouse = new MouseArea(el, position),
        _ext = new MapExtent(position),
        _nav = new MapNav(gui, _ext, _mouse),
        _visibleLayers = [], // cached visible map layers
        _hit,
        _intersectionLyr, _activeLyr, _overlayLyr,
        _renderer, _dynamicCRS;

    _mouse.disable(); // wait for gui.focus() to activate mouse events

    model.on('select', function(e) {
      _intersectionLyr = null;
      _overlayLyr = null;
    });

    gui.on('active', function() {
      _mouse.enable();
    });

    gui.on('inactive', function() {
      _mouse.disable();
    });

    gui.on('map-needs-refresh', function() {
      drawLayers();
    });

    model.on('update', onUpdate);

    document.addEventListener('visibilitychange', function(e) {
      // refresh map when browser tab is re-activated (Chrome on mac has been
      // blanking the canvas after several other tabs are visited)
      if (document.visibilityState == 'visible') drawLayers();
    });

    // Update display of segment intersections
    this.setIntersectionLayer = function(lyr, dataset) {
      if (lyr == _intersectionLyr) return; // no change
      if (lyr) {
        enhanceLayerForDisplay(lyr, dataset, getDisplayOptions());
        _intersectionLyr = lyr;
        _intersectionLyr.gui.style = getIntersectionStyle(_intersectionLyr.gui.displayLayer, getGlobalStyleOptions());
      } else {
        _intersectionLyr = null;
      }
      // TODO: try to avoid redrawing layers twice (in some situations)
      drawLayers();
    };

    this.pixelCoordsToLngLatCoords = function(x, y) {
      var crsFrom = this.getDisplayCRS();
      if (!crsFrom) return null; // e.g. table view
      var p1 = internal.toLngLat(_ext.translatePixelCoords(x, y), crsFrom);
      var p2 = internal.toLngLat(_ext.translatePixelCoords(x+1, y+1), crsFrom);
      return p1 && p2 && p1[1] <= 90 && p1[1] >= -90 ?
        formatCoordsForDisplay(p1, p2) : null;
    };

    this.pixelCoordsToProjectedCoords = function(x, y) {
      if (!_activeLyr) return null;
      var info = getDatasetCrsInfo(_activeLyr.gui.source.dataset);
      if (info && internal.isLatLngCRS(info.crs)) {
        return null; // latlon dataset
      }
      var p1 = translateDisplayPoint(_activeLyr, _ext.translatePixelCoords(x, y));
      var p2 = translateDisplayPoint(_activeLyr, _ext.translatePixelCoords(x+1, y+1));
      return p1 && p2 ? formatCoordsForDisplay(p1, p2) : null;
    };

    // this.getCenterLngLat = function() {
    //   var bounds = _ext.getBounds();
    //   var crs = this.getDisplayCRS();
    //   // TODO: handle case where active layer is a frame layer
    //   if (!bounds.hasBounds() || !crs) {
    //     return null;
    //   }
    //   return internal.toLngLat([bounds.centerX(), bounds.centerY()], crs);
    // };

    this.getDisplayCRS = function() {
      if (!_activeLyr) {
        return _dynamicCRS || internal.parseCrsString('wgs84');
      }
      if (!_activeLyr.gui.geographic) {
        return null;
      }
      if (_activeLyr.gui.dynamic_crs) {
        return _activeLyr.gui.dynamic_crs;
      }
      return this.getActiveLayerCRS();
    };

    this.getActiveLayerCRS = function() {
      if (!_activeLyr || !_activeLyr.gui.geographic) {
        return null;
      }
      var info = getDatasetCrsInfo(_activeLyr.gui.source.dataset);
      return info.crs || null;
    };

    this.getExtent = function() {return _ext;};
    this.getMouse = function() {return _mouse;};
    this.isActiveLayer = isActiveLayer;
    this.isVisibleLayer = isVisibleLayer;
    this.getActiveLayer = function() { return _activeLyr; };
    // this.getViewData = function() {
    //   return {
    //     isPreview: isPreviewView(),
    //     isTable: isTableView(),
    //     isEmpty: !_activeLyr,
    //     dynamicCRS: _dynamicCRS || null
    //   };
    // };

    // called by layer menu after layer visibility is updated
    this.redraw = function() {
      updateVisibleMapLayers();
      drawLayers();
    };

    // Set or clear a CRS to use for display, without reprojecting the underlying dataset(s).
    // crs: a CRS object or string, or null to clear the current setting
    this.setDisplayCRS = function(crs) {
      // TODO: update bounds of frame layer, if there is a frame layer
      var oldCRS = this.getDisplayCRS();
      var newCRS = utils$1.isString(crs) ? internal.parseCrsString(crs) : crs;
      // TODO: handle case that old and new CRS are the same
      _dynamicCRS = newCRS;
      // if (!_activeLyr) return; // stop here if no layers have been selected

      // clear any stored FilteredArcs objects (so they will be recreated with the desired projection)
      clearAllDisplayArcs();

      // Reproject all visible map layers
      getContentLayers().forEach(function(lyr) {
        projectLayerForDisplay(lyr, newCRS);
      });

      // kludge to make sure all layers have styles
      updateLayerStyles(getContentLayers());

      // Update map extent (also triggers redraw)
      projectMapExtent(_ext, oldCRS, this.getDisplayCRS(), calcFullBounds());
      updateFullBounds();
    };

    // Initialization just before displaying the map for the first time
    this.init = function() {
      if (_renderer) return;
      _ext.setFullBounds(calcFullBounds());
      _ext.resize();
      _renderer = new LayerRenderer(gui, el);

      if (opts.inspectorControl) {
        _hit = new HitControl(gui, _ext, _mouse),
        new InspectionControl2(gui, _hit);
        new SelectionTool(gui, _ext, _hit),
        new BoxTool(gui, _ext, _nav),
        new RectangleControl(gui, _hit),
        initInteractiveEditing(gui, _ext, _hit);
        _hit.on('change', updateOverlayLayer);
      }

      _ext.on('change', function(e) {
        gui?.basemap.refresh(); // keep basemap synced up (if enabled)
        drawLayers(e.redraw ? '' : 'nav');
      });

      gui.on('resize', function() {
        position.update(); // kludge to detect new map size after console toggle
      });
    };

    function getGlobalStyleOptions(opts) {
      var mode = gui.state.interaction_mode;
      return Object.assign({
        darkMode: !!gui.state.dark_basemap,
        outlineMode: mode == 'vertices',
        interactionMode: mode
      }, opts);
    }

    // Refresh map display in response to data changes, layer selection, etc.
    function onUpdate(e) {
      var prevLyr = _activeLyr || null;
      var fullBounds;
      var needReset;
      if (!prevLyr) {
        // initMap(); // first call
      }

      if (arcsMayHaveChanged(e.flags)) {
        // regenerate filtered arcs the next time they are needed for rendering
        // delete e.dataset.gui.displayArcs
        clearAllDisplayArcs();

        // reset simplification after projection (thresholds have changed)
        // TODO: preserve simplification pct (need to record pct before change)
        if (e.flags.proj && e.dataset.arcs) {
          e.dataset.arcs.setRetainedPct(1);
        }
      }

      if (e.flags.simplify_method) { // no redraw needed
        return false;
      }

      if (e.flags.simplify_amount || e.flags.redraw_only) { // only redraw (slider drag)
        drawLayers();
        return;
      }

      if (e.layer) {
        _activeLyr = e.layer;
        initActiveLayer(e.layer, e.dataset);
      } else {
        _activeLyr = null;
      }

      if (popupCanStayOpen(e.flags)) {
        // data may have changed; if popup is open, it needs to be refreshed
        gui.dispatchEvent('popup-needs-refresh');
      } else if (_hit) {
        _hit.clearSelection();
      }
      _hit.setLayer(_activeLyr); // need this every time, to support dynamic reprojection

      updateVisibleMapLayers();
      fullBounds = calcFullBounds();

      if (prevLyr?.gui.tabular || _activeLyr?.gui.tabular) {
        needReset = true;
      } else if (_activeLyr && internal.layerIsEmpty(_activeLyr)) {
        needReset = false;
      } else if (!prevLyr) {
        needReset = true;
      } else {
        needReset = mapNeedsReset(fullBounds, _ext.getFullBounds(), _ext.getBounds(), e.flags);
      }

      _ext.setFullBounds(fullBounds, getStrictBounds()); // update 'home' button extent

      if (needReset) {
        _ext.reset();
        gui?.basemap.refresh();
      }
      drawLayers();
      map.dispatchEvent('updated');
    }


    function updateOverlayLayer(e) {
      var style = !_activeLyr?.gui?.style ? null :
        getOverlayStyle(_activeLyr.gui.displayLayer, e, getGlobalStyleOptions());
      if (style) {
        var displayLayer = filterLayerByIds(_activeLyr.gui.displayLayer, style.ids);
        var gui = Object.assign({}, _activeLyr.gui, {style, displayLayer});
        style.dotScale = _activeLyr.gui.style.dotScale;
        _overlayLyr = utils$1.defaults({gui}, _activeLyr);
      } else {
        _overlayLyr = null;
      }

      // 'hover' avoids redrawing all svg symbols when only highlight needs to refresh
      drawLayers('hover');
    }

    function getDisplayOptions() {
      return {
        crs: _dynamicCRS
      };
    }

    function getStrictBounds() {
      // if (internal.isWebMercator(map.getDisplayCRS())) {
      if (_dynamicCRS && internal.isWebMercator(map.getDisplayCRS())) {
        return getMapboxBounds();
      }
      return null;
    }

    function updateFullBounds() {
      _ext.setFullBounds(calcFullBounds(), getStrictBounds());
    }

    function getContentLayerBounds() {
      var b = new Bounds();
      var layers = getContentLayers();
      layers.forEach(function(lyr) {
        b.mergeBounds(lyr.gui.bounds);
      });

      if (!b.hasBounds()) {
        // assign bounds to empty layers, to prevent rendering errors downstream
        // b.setBounds(0,0,0,0);
        b.setBounds(projectLatLonBBox([11.28,33.43,32.26,46.04], _dynamicCRS));
      }
      return b;
    }

    function calcFullBounds() {
      var b;
      if (isPreviewView()) {
        b = new Bounds(getFrameLayerData().bbox);
      } else {
        b = getContentLayerBounds();
      }

      // add margin
      // use larger margin for small sizes
      var widthPx = _ext.width();
      var marginPct = widthPx < 700 && 3.5 || widthPx < 800 && 3 || 2.5;
      if (isTableView()) {
        var n = internal.getFeatureCount(_activeLyr);
        marginPct = n < 5 && 20 || n < 100 && 10 || 4;
      }
      b.scale(1 + marginPct / 100 * 2);

      // Inflate display bounding box by a tiny amount (gives extent to single-point layers and collapsed shapes)
      b.padBounds(1e-4, 1e-4, 1e-4, 1e-4);
      return b;
    }

    function isActiveLayer(lyr) {
      return _activeLyr && lyr == _activeLyr || false;
    }

    function isVisibleLayer(lyr) {
      return isActiveLayer(lyr) || lyr.pinned;
    }

    function isTableView() {
      return !!_activeLyr?.gui.tabular;
    }

    function findFrameLayer() {
      return getVisibleMapLayers().find(function(lyr) {
        return internal.isFrameLayer(lyr.gui.displayLayer, lyr.gui.displayArcs);
      });
    }

    // Preview view: symbols are scaled based on display size of frame layer
    function isPreviewView() {
      return !isTableView() && !!getFrameLayerData();
    }

    function getFrameLayerData() {
      var lyr = findFrameLayer();
      return lyr && internal.getFrameLayerData(lyr, lyr.gui.displayArcs) || null;
    }

    function clearAllDisplayArcs() {
      model.forEachLayer(function(lyr) {
        if (lyr.gui) delete lyr.gui.arcCounts;
      });
      model.getDatasets().forEach(function(o) {
        delete o.gui;
      });
    }

    function updateVisibleMapLayers() {
      var layers = [];
      model.getLayers().forEach(function(o) {
        if (!isVisibleLayer(o.layer)) return;
        if (isActiveLayer(o.layer)) {
          layers.push(_activeLyr);
        } else if (!isTableView()) {
          enhanceLayerForDisplay(o.layer, o.dataset, getDisplayOptions());
          layers.push(o.layer);
        }
      });
      _visibleLayers = layers;
    }

    function getVisibleMapLayers() {
      return _visibleLayers;
    }

    function findActiveLayer(layers) {
      return layers.filter(function(o) {
        return o == _activeLyr;
      });
    }

    function getContentLayers() {
      var layers = getVisibleMapLayers();
      if (isTableView()) {
        return findActiveLayer(layers);
      }
      return layers.filter(function(o) {
        return !!o.gui.geographic;
      });
    }

    function getDrawableContentLayers() {
      return getContentLayers().filter(function(lyr) {
        if (isActiveLayer(lyr) && lyr.hidden) return false;
        return true;
      });
    }

    function initActiveLayer(lyr, dataset) {
      enhanceLayerForDisplay(lyr, dataset, getDisplayOptions());
      lyr.gui.style = getActiveLayerStyle(lyr.gui.displayLayer, getGlobalStyleOptions());
    }

    function getDrawableFurnitureLayers(layers) {
      if (!isPreviewView()) return [];
      return getVisibleMapLayers().filter(function(o) {
        return internal.isFurnitureLayer(o);
      });
    }

    function updateLayerStyles(layers) {
      layers.forEach(function(mapLayer, i) {
        var style;
        if (isActiveLayer(mapLayer)) {
          // regenerating active style everytime, to support style change when
          // switching between outline and preview modes.
          style = getActiveLayerStyle(mapLayer.gui.displayLayer, getGlobalStyleOptions());
          if (style.type != 'styled' && layers.length > 1 && style.strokeColors) {
            // kludge to hide ghosted layers when reference layers are present
            // TODO: consider never showing ghosted layers (which appear after
            // commands like dissolve and filter).
            style = utils$1.defaults({
              strokeColors: [null, style.strokeColors[1]]
            }, style);
          }
        } else {
          if (mapLayer == _activeLyr) {
            console.error("Error: shared map layer");
          }
          style = getReferenceLayerStyle(mapLayer.gui.displayLayer, getGlobalStyleOptions());
        }
        mapLayer.gui.style = style;
      });
    }

    function sortMapLayers(layers) {
      layers.sort(function(a, b) {
        // assume that each layer has a menu_order (assigned by updateLayerStackOrder())
        return a.menu_order - b.menu_order;
      });
    }

    function drawLayers(action) {
      // This seems to smooth out navigation and keep overlay and basemap in sync.
      requestAnimationFrame(function() {drawLayers2(action);});
    }

    // action:
    //   'nav'      map was panned/zoomed -- only map extent has changed
    //   'hover'    highlight has changed -- only refresh overlay
    //   (default)  anything could have changed
    function drawLayers2(action) {
      // sometimes styles need to be regenerated with 'hover' action (when?)
      var layersMayHaveChanged = action != 'nav'; // !action;
      var fullBounds;
      var contentLayers = getDrawableContentLayers();
      // var furnitureLayers = getDrawableFurnitureLayers();
      if (!(_ext.width() > 0 && _ext.height() > 0)) {
        // TODO: track down source of these errors
        console.error("Collapsed map container, unable to draw.");
        return;
      }
      if (layersMayHaveChanged) {
        // kludge to handle layer visibility toggling
        _ext.setFrameData(isPreviewView() ? getFrameLayerData() : null);
        updateFullBounds();
        updateLayerStyles(contentLayers);
        updateLayerStackOrder(model.getLayers());// update menu_order property of all layers
      }
      sortMapLayers(contentLayers);
      if (_intersectionLyr) {
        contentLayers = contentLayers.concat(_intersectionLyr);
      }
      // moved this below intersection layer addition, so intersection dots get scaled
      adjustPointSymbolSizes(contentLayers, _overlayLyr, _ext);

      // RENDERING
      // draw main content layers
      _renderer.drawMainLayers(contentLayers, action);
      // draw hover & selection overlay
      _renderer.drawOverlayLayer(_overlayLyr, action);
      // draw furniture
      // _renderer.drawFurnitureLayers(furnitureLayers, action);
      gui.dispatchEvent('map_rendered');
    }
  }

  // This is a new way to handle compatibility problems between
  // interactive editing modes and other interface modes
  // (by default, interactive modes stay on when, e.g., the user clicks
  // "Export" or "Console").
  //
  function initModeRules(gui) {

    gui.on('interaction_mode_change', function(e) {
      var imode = e.mode;
      var mode = gui.getMode();

      // simplify and vertex editing are not compatible
      if (imode == 'vertices') {
        flattenArcs(gui.map.getActiveLayer());

        if (mode == 'simplify') {
          gui.clearMode(); // exit simplification
        }

      }

    });

    gui.on('mode', function(e) {
      var mode = e.name;
      var imode = gui.interaction.getMode();

      // simplify and vertex editing are not compatible
      if (mode == 'simplify' && imode == 'vertices') {
        gui.interaction.turnOff();
      }
    });
  }

  function loadScript(url, cb) {
    var script = document.createElement('script');
    script.onload = cb;
    script.src = url;
    document.head.appendChild(script);
  }

  function loadStylesheet(url) {
    var el = document.createElement('link');
    el.rel = 'stylesheet';
    el.type = 'text/css';
    el.media = 'screen';
    el.href = url;
    document.head.appendChild(el);
  }

  function Basemap(gui) {
    var menu = gui.container.findChild('.basemap-options');
    var fadeBtn = new SimpleButton(menu.findChild('.fade-btn'));
    var closeBtn = new SimpleButton(menu.findChild('.close2-btn'));
    var clearBtn = new SimpleButton(menu.findChild('.clear-btn'));
    var menuButtons = menu.findChild('.basemap-styles');
    var overlayButtons = gui.container.findChild('.basemap-overlay-buttons');
    var container = gui.container.findChild('.basemap-container');
    var basemapBtn = gui.container.findChild('.basemap-btn');
    var basemapNote = gui.container.findChild('.basemap-note');
    var basemapWarning = gui.container.findChild('.basemap-warning');
    var mapEl = gui.container.findChild('.basemap');
    var extentNote = El('div').addClass('basemap-prompt').appendTo(container).hide();
    var params = window.mapboxParams;
    var map;
    var activeStyle;
    var loading = false;
    var faded = false;

    if (params) {
      //  TODO: check page URL for compatibility with mapbox key
      init();
    } else {
      basemapBtn.hide();
    }

    function init() {
      gui.addMode('basemap', turnOn, turnOff, basemapBtn);

      closeBtn.on('click', function() {
        gui.clearMode();
        turnOff();
      });

      clearBtn.on('click', function() {
        if (activeStyle) {
          turnOffBasemap();
          updateButtons();
          closeMenu();
        }
      });

      fadeBtn.on('click', function() {
        if (faded) {
          mapEl.css('opacity', 1);
          faded = false;
          fadeBtn.text('Fade');
        } else if (activeStyle) {
          mapEl.css('opacity', 0.35);
          faded = true;
          fadeBtn.text('Unfade');
        }
      });

      gui.model.on('update', onUpdate);

      gui.on('map_click', function() {
        // close menu if user click on the map
        if (gui.getMode() == 'basemap') gui.clearMode();
      });

      params.styles.forEach(function(style) {
        El('div')
        .html(`<div class="basemap-style-btn"><img src="${style.icon}"></img></div><div class="basemap-style-label">${style.name}</div>`)
        .appendTo(menuButtons)
        .findChild('.basemap-style-btn').on('click', onClick);

        El('div').addClass('basemap-overlay-btn basemap-style-btn')
          .html(`<img src="${style.icon}"></img>`).on('click', onClick)
          .appendTo(overlayButtons);

        function onClick() {
          if (overlayButtons.hasClass('disabled')) return;
          if (style == activeStyle) {
            turnOffBasemap();
          } else {
            showBasemap(style);
          }
          updateButtons();
          closeMenu();
        }
      });
    }

    // close and turn off mode
    function closeMenu() {
      setTimeout(function() {
        gui.clearMode();
      }, 200);
    }

    function turnOffBasemap() {
      activeStyle = null;
      gui.map.setDisplayCRS(null);
      refresh();
    }

    function showBasemap(style) {
      activeStyle = style;
      // TODO: consider enabling dark basemap mode
      // Make sure that the selected layer style gets updated in gui-map.js
      // gui.state.dark_basemap = style && style.dark || false;
      if (map) {
        map.setStyle(style.url);
        refresh();
      } else if (prepareMapView()) {
        initMap();
      }
    }

    function updateButtons() {
      menuButtons.findChildren('.basemap-style-btn').forEach(function(el, i) {
        el.classed('active', params.styles[i] == activeStyle);
      });
      overlayButtons.findChildren('.basemap-style-btn').forEach(function(el, i) {
        el.classed('active', params.styles[i] == activeStyle);
      });
    }

    function turnOn() {
      onUpdate();
      menu.show();
    }

    function onUpdate() {
      var activeLyr = gui.model.getActiveLayer(); // may be null
      var info = getDatasetCrsInfo(activeLyr?.dataset); // defaults to wgs84
      var dataCRS = info.crs || null;
      var displayCRS = gui.map.getDisplayCRS();
      var warning, note;


      if (!dataCRS || !displayCRS || !crsIsUsable(displayCRS) || !crsIsUsable(dataCRS)) {
        warning = 'This data is incompatible with the basemaps.';
        if (!internal.layerHasGeometry(activeLyr.layer)) {
          warning += ' Reason: layer is missing geographic data';
        } else if (!dataCRS) {
          warning += ' Reason: unknown projection.';
        }
        basemapWarning.html(warning).show();
        basemapNote.hide();
        overlayButtons.addClass('disabled');
        activeStyle = null;
        updateButtons();
      } else {
        note = `Your data ${activeStyle ? 'is' : 'will be'} displayed using the Mercator projection.`;
        basemapNote.text(note).show();
        overlayButtons.show();
        overlayButtons.removeClass('disabled');
      }
    }

    function turnOff() {
      basemapWarning.hide();
      basemapNote.hide();
      menu.hide();
    }

    function enabled() {
      return !!(mapEl && params);
    }

    function show() {
      gui.container.addClass('basemap-on');
      mapEl.node().style.display = 'block';
    }

    function hide() {
      gui.container.removeClass('basemap-on');
      mapEl.node().style.display = 'none';
    }

    function getLonLatBounds() {
      var ext = gui.map.getExtent();
      var bbox = ext.getBounds().toArray();
      var bbox2 = fromWebMercator(bbox[0], bbox[1])
          .concat(fromWebMercator(bbox[2], bbox[3]));
      return bbox2;
    }

    function initMap() {
      if (!enabled() || map || loading) return;
      loading = true;
      loadStylesheet(params.css);
      loadScript(params.js, function() {
        map = new window.mapboxgl.Map({
          accessToken: params.key,
          logoPosition: 'bottom-left',
          container: mapEl.node(),
          style: activeStyle.url,
          bounds: getLonLatBounds(),
          doubleClickZoom: false,
          dragPan: false,
          dragRotate: false,
          scrollZoom: false,
          interactive: false,
          keyboard: false,
          maxPitch: 0,
          renderWorldCopies: true // false // false prevents panning off the map
        });
        map.on('load', function() {
          loading = false;
          refresh();
        });
      });
    }

    // @bbox: latlon bounding box of current map extent
    function checkBounds(bbox) {
      var ext = gui.map.getExtent();
      var mpp = ext.getBounds().width() / ext.width();
      var z = scaleToZoom(mpp);
      var msg;
      if (bbox[1] >= -85 && bbox[3] <= 85 && z <= 20) {
        extentNote.hide();
        return true;
      }
      if (z > 20) {
        msg = 'zoom out';
      } else if (bbox[1] > 0) {
        msg = 'pan south';
      } else if (bbox[3] < 0) {
        msg = 'pan north';
      } else {
        msg = msg = 'zoom in';
      }
      extentNote.html(msg + ' to see the basemap').show();
      return false;
    }

    function crsIsUsable(crs) {
      if (!crs) return false;
      if (!internal.isInvertibleCRS(crs)) return false;
      return true;
    }

    function prepareMapView() {
      var crs = gui.map.getDisplayCRS();
      if (!crs) return false;
      if (!internal.isWebMercator(crs)) {
        gui.map.setDisplayCRS(internal.parseCrsString('webmercator'));
      }
      return true;
    }

    function refresh() {
      var crs = gui.map.getDisplayCRS();
      var off = !crs || !enabled() || !map || loading || !activeStyle;
      fadeBtn.active(!off);
      clearBtn.active(!off);
      if (off) {
        hide();
        extentNote.hide();
        return;
      }

      prepareMapView();
      var bbox = getLonLatBounds();
      if (!checkBounds(bbox)) {
        // map does not display outside these bounds
        hide();
      } else {
        show();
        map.resize();
        map.fitBounds(bbox, {animate: false});
      }
    }

    return {refresh, show: onUpdate};
  }

  function GuiInstance(container, opts) {
    var gui = new ModeSwitcher();
    opts = utils$1.extend({
      // defaults
      homeControl: true,
      zoomControl: true,
      inspectorControl: true,
      saveControl: true,
      disableNavigation: false,
      focus: true
    }, opts);

    gui.options = opts;
    gui.container = El(container);
    gui.model = new Model(gui);
    gui.keyboard = new KeyboardEvents(gui);
    gui.buttons = new SidebarButtons(gui);
    gui.basemap = new Basemap(gui);
    gui.session = new SessionHistory(gui);
    gui.contextMenu = new ContextMenu();
    gui.undo = new Undo(gui);
    gui.map = new MshpMap(gui);
    if (opts.saveControl) {
      new SessionSnapshots(gui);
    }
    gui.interaction = new InteractionMode(gui);
    gui.state = {};

    var msgCount = 0;
    var clearMsg;

    initModeRules(gui);
    gui.map.init();

    gui.showProgressMessage = function(msg) {
      if (!gui.progressMessage) {
        gui.progressMessage = El('div').addClass('progress-message')
          .appendTo('body');
      }
      El('<div>').text(msg).appendTo(gui.progressMessage.empty().show());
      clearMsg = getClearFunction(msgCount);
    };

    function getClearFunction(count) {
      var time = Date.now();
      // wait at least [min] milliseconds before closing
      var min = 400;
      msgCount = ++count;
      return function() {
        setTimeout(function() {
          if (count != msgCount) return;
          if (gui.progressMessage) gui.progressMessage.hide();
        }, Math.max(min - (Date.now() - time), 0));
      };
    }

    gui.clearProgressMessage = function() {
      if (clearMsg) clearMsg();
      // if (gui.progressMessage) gui.progressMessage.hide();
    };

    gui.consoleIsOpen = function() {
      return gui.container.hasClass('console-open');
    };

    // Make this instance interactive and editable
    gui.focus = function() {
      var curr = GUI.__active;
      if (curr == gui) return;
      if (curr) {
        curr.blur();
      }
      GUI.__active = gui;
      setLoggingForGUI(gui);
      ImportFileProxy(gui);
      WriteFilesProxy(gui);
      gui.dispatchEvent('active');
    };

    gui.blur = function() {
      if (GUI.isActiveInstance(gui)) {
        GUI.__active = null;
        gui.dispatchEvent('inactive');
      }
    };

    // switch between multiple gui instances on mouse click
    gui.container.node().addEventListener('mouseup', function(e) {
      if (GUI.isActiveInstance(gui)) return;
      e.stopPropagation();
      gui.focus();
    }, true); // use capture

    if (opts.focus) {
      gui.focus();
    }

    return gui;
  }

  // This is the entry point for bundling mapshaper's web UI

  onload(function() {
    if (!GUI.browserIsSupported()) {
      El("#mshp-not-supported").show();
      return;
    }
    startEditing();
  });

  function getManifest() {
    return window.mapshaper.manifest || {}; // kludge -- bin/mapshaper-gui sets this
  }

  function getImportOpts(manifest) {
    var vars = GUI.getUrlVars();
    var opts = {};
    if (manifest.files) {
      opts.files = manifest.files.concat();
    } else {
      opts.files = [];
    }
    if (vars.files) {
      opts.files = opts.files.concat(vars.files.split(','));
    }
    if (manifest.catalog) {
      opts.catalog = manifest.catalog;
    }
    opts.display_all = vars['display-all'] || vars.a || !!manifest.display_all;
    opts.quick_view = vars['quick-view'] || vars.q || !!manifest.quick_view;
    opts.target = vars.target || manifest.target || null;
    opts.name = vars.name || manifest.name || null;
    return opts;
  }

  function getInitialConsoleCommands() {
    return getManifest().commands || '';
  }

  var startEditing = function() {
    var dataLoaded = false,
        manifest = getManifest(),
        importOpts = getImportOpts(manifest),
        gui = new GuiInstance('body');

    // TODO: re-enable the "blurb"
    // if (manifest.blurb) {
    //   El('#splash-screen-blurb').text(manifest.blurb);
    // }

    new AlertControl(gui);
    new RepairControl(gui);
    new SimplifyControl(gui);
    new ImportControl(gui, importOpts);
    new ExportControl(gui);
    new LayerControl(gui);
    gui.console = new Console(gui);

    startEditing = function() {};

    window.addEventListener('beforeunload', function(e) {
      // don't prompt if there are no datasets (this means the last layer was deleted,
      // hitting the 'cancel' button would leave the interface in a bad state)
      if (gui.session.unsavedChanges() && !gui.model.isEmpty()) {
        e.returnValue = 'There are unsaved changes.';
        e.preventDefault();
      }
    });

    window.addEventListener('unload', function(e) {
      if (window.location.hostname == 'localhost') {
        // send termination signal for mapshaper-gui
        var req = new XMLHttpRequest();
        req.open('GET', '/close');
        req.send();
      }
    });

    // Initial display configuration
    gui.on('mode', function(e) {
      if (dataLoaded) return;
      dataLoaded = true;
      gui.buttons.show();
      gui.basemap.show();
      El('#mode-buttons').show(); // show Simplify, Console, Export, etc.
      El('#splash-buttons').hide(); // hide Wiki, Github buttons
      El('body').addClass('map-view');
      gui.console.runInitialCommands(getInitialConsoleCommands());
    });
  };

})();
