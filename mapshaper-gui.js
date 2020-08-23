(function () {
  var utils$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    get default () { return utils$1; },
    get getUniqueName () { return getUniqueName; },
    get isFunction () { return isFunction; },
    get isObject () { return isObject; },
    get clamp () { return clamp; },
    get isArray () { return isArray; },
    get isNumber () { return isNumber; },
    get isInteger () { return isInteger; },
    get isString () { return isString; },
    get isBoolean () { return isBoolean; },
    get toArray () { return toArray; },
    get isArrayLike () { return isArrayLike; },
    get addslashes () { return addslashes; },
    get regexEscape () { return regexEscape; },
    get htmlEscape () { return htmlEscape; },
    get defaults () { return defaults; },
    get extend () { return extend; },
    get inherit () { return inherit; },
    get reduceAsync () { return reduceAsync; },
    get merge () { return merge; },
    get difference () { return difference; },
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
    get mean () { return mean; },
    get format () { return format; },
    get formatter () { return formatter; },
    get wildcardToRegExp () { return wildcardToRegExp; },
    get createBuffer () { return createBuffer; },
    get expandoBuffer () { return expandoBuffer; },
    get copyElements () { return copyElements; },
    get extendBuffer () { return extendBuffer; },
    get mergeNames () { return mergeNames; },
    get findStringPrefix () { return findStringPrefix; },
    get isFiniteNumber () { return isFiniteNumber; },
    get isNonNegNumber () { return isNonNegNumber; },
    get parsePercent () { return parsePercent; },
    get formatVersionedName () { return formatVersionedName; },
    get uniqifyNames () { return uniqifyNames; },
    get cleanNumericString () { return cleanNumericString; },
    get parseString () { return parseString; },
    get parseNumber () { return parseNumber; },
    get trimQuotes () { return trimQuotes; }
  });

  var api = window.mapshaper; // assuming mapshaper is in global scope
  var mapshaper = api,
    utils = api.utils,
    cli = api.cli,
    geom = api.geom,
    internal = api.internal,
    Bounds = internal.Bounds,
    UserError = internal.UserError,
    message = internal.message, // stop, error and message are overridden in gui-proxy.js
    stop = internal.stop,
    error = internal.error;

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
      html += utils.format('<tr><th colspan="%d"><h4>%s</h4></th></tr>', cols, catalog.title);
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
      return utils.format(template, i, item.title, item.subtitle || '');
    }

  }

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

  GUI.getUrlVars = function() {
    var q = window.location.search.substring(1);
    return q.split('&').reduce(function(memo, chunk) {
      var pair = chunk.split('=');
      var key = decodeURIComponent(pair[0]);
      memo[key] = decodeURIComponent(pair[1]);
      return memo;
    }, {});
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
  GUI.onClick = function(el, cb) {
    var time;
    el.on('mousedown', function() {
      time = +new Date();
    });
    el.on('mouseup', function(e) {
      if (+new Date() - time < 300) cb(e);
    });
  };

  // tests if filename is a type that can be used
  GUI.isReadableFileType = function(filename) {
    var ext = internal.getFileExtension(filename).toLowerCase();
    return !!internal.guessInputFileType(filename) || internal.couldBeDsvFile(filename) ||
      internal.isZipFile(filename);
  };

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
      stop("Unable to parse command line options");
    }
    return parsed[0].options;
  };

  // @file: Zip file
  // @cb: function(err, <files>)
  //
  GUI.readZipFile = function(file, cb) {
    var zip = window.zip; // Assume zip.js is loaded and zip is defined globally
    var _files = [];
    zip.createReader(new zip.BlobReader(file), importZipContent, onError);

    function onError(err) {
      cb(err);
    }

    function onDone() {
      cb(null, _files);
    }

    function importZipContent(reader) {
      var _entries;
      reader.getEntries(readEntries);

      function readEntries(entries) {
        _entries = entries || [];
        readNext();
      }

      function readNext() {
        if (_entries.length > 0) {
          readEntry(_entries.pop());
        } else {
          reader.close();
          onDone();
        }
      }

      function readEntry(entry) {
        var filename = entry.filename,
            isValid = !entry.directory && GUI.isReadableFileType(filename) &&
                !/^__MACOSX/.test(filename); // ignore "resource-force" files
        if (isValid) {
          entry.getData(new zip.BlobWriter(), function(file) {
            file.name = filename; // Give the Blob a name, like a File object
            _files.push(file);
            readNext();
          });
        } else {
          readNext();
        }
      }
    }
  };

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
      error("[Handler] event target/type have changed.");
    }
    this.callback.call(this.listener, evt);
  };

  function EventData(type, target, data) {
    this.type = type;
    this.target = target;
    if (data) {
      utils.defaults(this, data);
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
      console.error("[Element.setStyle()] css property:", jsName);
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
  };

  El.findAll = function(sel, root) {
    return El.__select(sel, root);
  };

  function El(ref) {
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
      if (val != null) {
        El.setStyle(this.el, css, val);
      }
      else if (utils.isString(css)) {
        addCSS(this.el, css);
      }
      else if (utils.isObject(css)) {
        utils.forEachProperty(css, function(val, key) {
          El.setStyle(this.el, key, val);
        }, this);
      }
      return this;
    },

    attr: function(obj, value) {
      if (utils.isString(obj)) {
        if (arguments.length == 1) {
          return this.el.getAttribute(obj);
        }
        this.el.setAttribute(obj, value);
        // this.el[obj] = value;
      }
      // else if (!value) {
      //   Opts.copyAllParams(this.el, obj);
      // }
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
      if (!this.visible()) {
        this.css('display:block;');
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
      if (utils.isString(str)) {
        el.node().textContent = str;
      } else {
        return el.node().textContent;
      }
    };
  }

  utils.inherit(ClickText2, EventDispatcher);

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
      var val = utils.clamp(arg, _min, _max);
      if (!_validator(val)) {
        error("ClickText#value() invalid value:", arg);
      } else {
        _value = val;
      }
      _el.el.value = _formatter(val);
      return this;
    };
  }

  utils.inherit(ClickText, EventDispatcher);


  function Checkbox(ref) {
    var _el = El(ref);
  }

  utils.inherit(Checkbox, EventDispatcher);

  function SimpleButton(ref) {
    var _el = El(ref),
        _self = this,
        _active = !_el.hasClass('disabled');

    _el.on('click', function(e) {
      if (_active) _self.dispatchEvent('click');
      return false;
    });

    this.active = function(a) {
      if (a === void 0) return _active;
      if (a !== _active) {
        _active = a;
        _el.toggleClass('disabled');
      }
      return this;
    };

    this.node = function() {return _el.node();};

    function isVisible() {
      var el = _el.node();
      return el.offsetParent !== null;
    }
  }

  utils.inherit(SimpleButton, EventDispatcher);

  // @cb function(<FileList>)
  function DropControl(el, cb) {
    var area = El(el);
    area.on('dragleave', ondragleave)
        .on('dragover', ondragover)
        .on('drop', ondrop);
    function ondragleave(e) {
      block(e);
      out();
    }
    function ondragover(e) {
      // blocking drag events enables drop event
      block(e);
      over();
    }
    function ondrop(e) {
      block(e);
      out();
      cb(e.dataTransfer.files);
    }
    function over() {
      area.addClass('dragover');
    }
    function out() {
      area.removeClass('dragover');
    }
    function block(e) {
      e.preventDefault();
      e.stopPropagation();
    }
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

    function onchange(e) {
      var files = e.target.files;
      // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
      if (files) {
        // disable the button while files are being processed
        btn.addClass('selected');
        input.attr('disabled', true);
        cb(files);
        btn.removeClass('selected');
        input.attr('disabled', false);
      }
    }
  }

  function ImportControl(gui, opts) {
    var model = gui.model;
    var importCount = 0;
    var useQuickView = opts.quick_view; // may be set by mapshaper-gui
    var queuedFiles = [];
    var manifestFiles = opts.files || [];
    var cachedFiles = {};
    var catalog;

    if (opts.catalog) {
      catalog = new CatalogControl(gui, opts.catalog, downloadFiles);
    }

    new SimpleButton('#import-buttons .submit-btn').on('click', onSubmit);
    new SimpleButton('#import-buttons .cancel-btn').on('click', gui.clearMode);
    new DropControl('body', receiveFiles); // default drop area is entire page
    new DropControl('#import-drop', receiveFiles);
    new DropControl('#import-quick-drop', receiveFilesQuickView);
    new FileChooser('#file-selection-btn', receiveFiles);
    new FileChooser('#import-buttons .add-btn', receiveFiles);
    new FileChooser('#add-file-btn', receiveFiles);

    gui.keyboard.onMenuSubmit(El('#import-options'), onSubmit);

    gui.addMode('import', turnOn, turnOff);
    gui.enterMode('import');

    gui.on('mode', function(e) {
      // re-open import opts if leaving alert or console modes and nothing has been imported yet
      if (!e.name && model.isEmpty()) {
        gui.enterMode('import');
      }
    });

    function findMatchingShp(filename) {
      // use case-insensitive matching
      var base = internal.getPathBase(filename).toLowerCase();
      return model.getDatasets().filter(function(d) {
        var fname = d.info.input_files && d.info.input_files[0] || "";
        var ext = internal.getFileExtension(fname).toLowerCase();
        var base2 = internal.getPathBase(fname).toLowerCase();
        return base == base2 && ext == 'shp';
      });
    }

    function turnOn() {
      if (manifestFiles.length > 0) {
        downloadFiles(manifestFiles, true);
        manifestFiles = [];
      } else if (model.isEmpty()) {
        gui.container.addClass('splash-screen');
      }
    }

    function turnOff() {
      var target;
      if (catalog) catalog.reset(); // re-enable clickable catalog
      if (importCount > 0) {
        // display last layer of last imported dataset
        // target = model.getDefaultTargets()[0];
        // model.selectLayer(target.layers[target.layers.length-1], target.dataset);
        model.updated({select: true});
      }
      gui.clearProgressMessage();
      importCount = 0;
      useQuickView = false; // unset 'quick view' mode, if on
      close();
    }

    function close() {
      clearQueuedFiles();
      cachedFiles = {};
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
        if (GUI.isReadableFileType(f.name) && f.name in index === false) {
          index[f.name] = true;
          memo.push(f);
        }
        return memo;
      }, []);
    }

    // When a Shapefile component is at the head of the queue, move the entire
    // Shapefile to the front of the queue, sorted in reverse alphabetical order,
    // (a kludge), so .shp is read before .dbf and .prj
    // (If a .dbf file is imported before a .shp, it becomes a separate dataset)
    // TODO: import Shapefile parts without relying on this kludge
    function sortQueue(queue) {
      var nextFile = queue[0];
      var basename, parts;
      if (!isShapefilePart(nextFile.name)) {
        return queue;
      }
      basename = internal.getFileBase(nextFile.name).toLowerCase();
      parts = [];
      queue = queue.filter(function(file) {
        if (internal.getFileBase(file.name).toLowerCase() == basename) {
          parts.push(file);
          return false;
        }
        return true;
      });
      parts.sort(function(a, b) {
        // Sorting on LC filename so Shapefiles with mixed-case
        // extensions are sorted correctly
        return a.name.toLowerCase() < b.name.toLowerCase() ? 1 : -1;
      });
      return parts.concat(queue);
    }

    function showQueuedFiles() {
      var list = gui.container.findChild('.dropped-file-list').empty();
      queuedFiles.forEach(function(f) {
        El('<p>').text(f.name).appendTo(list);
      });
    }

    function receiveFilesQuickView(files) {
      useQuickView = true;
      receiveFiles(files);
    }

    function receiveFiles(files) {
      var prevSize = queuedFiles.length;
      files = handleZipFiles(utils.toArray(files));
      addFilesToQueue(files);
      if (queuedFiles.length === 0) return;
      gui.enterMode('import');

      if (useQuickView) {
        onSubmit();
      } else {
        gui.container.addClass('queued-files');
        El('#path-import-options').classed('hidden', !filesMayContainPaths(queuedFiles));
        showQueuedFiles();
      }
    }

    function filesMayContainPaths(files) {
      return utils.some(files, function(f) {
          var type = internal.guessInputFileType(f.name);
          return type == 'shp' || type == 'json' || internal.isZipFile(f.name);
      });
    }

    function onSubmit() {
      gui.container.removeClass('queued-files');
      gui.container.removeClass('splash-screen');
      procNextQueuedFile();
    }

    function addDataset(dataset) {
      if (!datasetIsEmpty(dataset)) {
        model.addDataset(dataset);
        importCount++;
      }
      procNextQueuedFile();
    }

    function datasetIsEmpty(dataset) {
      return dataset.layers.every(function(lyr) {
        return internal.getFeatureCount(lyr) === 0;
      });
    }

    function procNextQueuedFile() {
      if (queuedFiles.length === 0) {
        gui.clearMode();
      } else {
        queuedFiles = sortQueue(queuedFiles);
        readFile(queuedFiles.shift());
      }
    }

    // TODO: support .cpg
    function isShapefilePart(name) {
      return /\.(shp|shx|dbf|prj)$/i.test(name);
    }


    function readImportOpts() {
      if (useQuickView) return {};
      var freeform = El('#import-options .advanced-options').node().value,
          opts = GUI.parseFreeformOptions(freeform, 'i');
      opts.no_repair = !El("#repair-intersections-opt").node().checked;
      opts.snap = !!El("#snap-points-opt").node().checked;
      return opts;
    }

    // for CLI output
    function readImportOptsAsString() {
      if (useQuickView) return '';
      var freeform = El('#import-options .advanced-options').node().value;
      var opts = readImportOpts();
      if (opts.snap) freeform = 'snap ' + freeform;
      return freeform.trim();
    }

    // @file a File object
    function readFile(file) {
      var name = file.name,
          reader = new FileReader(),
          useBinary = internal.isSupportedBinaryInputType(name) ||
            internal.isZipFile(name) ||
            internal.guessInputFileType(name) == 'json' ||
            internal.guessInputFileType(name) == 'text';

      reader.addEventListener('loadend', function(e) {
        if (!reader.result) {
          handleImportError("Web browser was unable to load the file.", name);
        } else {
          importFileContent(name, reader.result);
        }
      });
      if (useBinary) {
        reader.readAsArrayBuffer(file);
      } else {
        // TODO: consider using "encoding" option, to support CSV files in other encodings than utf8
        reader.readAsText(file, 'UTF-8');
      }
    }

    function importFileContent(fileName, content) {
      var fileType = internal.guessInputType(fileName, content),
          importOpts = readImportOpts(),
          matches = findMatchingShp(fileName),
          dataset, lyr;

      // Add dbf data to a previously imported .shp file with a matching name
      // (.shp should have been queued before .dbf)
      if (fileType == 'dbf' && matches.length > 0) {
        // find an imported .shp layer that is missing attribute data
        // (if multiple matches, try to use the most recently imported one)
        dataset = matches.reduce(function(memo, d) {
          if (!d.layers[0].data) {
            memo = d;
          }
          return memo;
        }, null);
        if (dataset) {
          lyr = dataset.layers[0];
          lyr.data = new internal.ShapefileTable(content, importOpts.encoding);
          if (lyr.shapes && lyr.data.size() != lyr.shapes.length) {
            stop("Different number of records in .shp and .dbf files");
          }
          if (!lyr.geometry_type) {
            // kludge: trigger display of table cells if .shp has null geometry
            // TODO: test case if lyr is not the current active layer
            model.updated({});
          }
          procNextQueuedFile();
          return;
        }
      }

      if (fileType == 'shx') {
        // save .shx for use when importing .shp
        // (queue should be sorted so that .shx is processed before .shp)
        cachedFiles[fileName.toLowerCase()] = {filename: fileName, content: content};
        procNextQueuedFile();
        return;
      }

      // Add .prj file to previously imported .shp file
      if (fileType == 'prj') {
        matches.forEach(function(d) {
          if (!d.info.prj) {
            d.info.prj = content;
          }
        });
        procNextQueuedFile();
        return;
      }

      importNewDataset(fileType, fileName, content, importOpts);
    }

    function importNewDataset(fileType, fileName, content, importOpts) {
      var size = content.byteLength || content.length, // ArrayBuffer or string
          delay = 0;

      // show importing message if file is large
      if (size > 4e7) {
        gui.showProgressMessage('Importing');
        delay = 35;
      }
      setTimeout(function() {
        var dataset;
        var input = {};
        try {
          input[fileType] = {filename: fileName, content: content};
          if (fileType == 'shp') {
            // shx file should already be cached, if it was added together with the shp
            input.shx = cachedFiles[fileName.replace(/shp$/i, 'shx').toLowerCase()] || null;
          }
          dataset = internal.importContent(input, importOpts);
          // save import options for use by repair control, etc.
          dataset.info.import_options = importOpts;
          gui.session.fileImported(fileName, readImportOptsAsString());
          addDataset(dataset);

        } catch(e) {
          handleImportError(e, fileName);
        }
      }, delay);
    }

    function handleImportError(e, fileName) {
      var msg = utils.isString(e) ? e : e.message;
      if (fileName) {
        msg = "Error importing <i>" + fileName + "</i><br>" + msg;
      }
      clearQueuedFiles();
      gui.alert(msg);
      console.error(e);
    }

    function handleZipFiles(files) {
      return files.filter(function(file) {
        var isZip = internal.isZipFile(file.name);
        if (isZip) {
          importZipFile(file);
        }
        return !isZip;
      });
    }

    function importZipFile(file) {
      // gui.showProgressMessage('Importing');
      setTimeout(function() {
        GUI.readZipFile(file, function(err, files) {
          if (err) {
            handleImportError(err, file.name);
          } else {
            // don't try to import .txt files from zip files
            // (these would be parsed as dsv and throw errows)
            files = files.filter(function(f) {
              return !/\.txt$/i.test(f.name);
            });
            receiveFiles(files);
          }
        });
      }, 35);
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
        return GUI.isReadableFileType(item.basename) ? item : null;
      });
      return items.filter(Boolean);
    }

    function downloadFiles(paths) {
      var items = prepFilesForDownload(paths);
      utils.reduceAsync(items, [], downloadNextFile, function(err, files) {
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
      var req = new XMLHttpRequest();
      var blob;
      req.responseType = 'blob';
      req.addEventListener('load', function(e) {
        if (req.status == 200) {
          blob = req.response;
        }
      });
      req.addEventListener('progress', function(e) {
        var pct = e.loaded / e.total;
        if (catalog) catalog.progress(pct);
      });
      req.addEventListener('loadend', function() {
        var err;
        if (req.status == 404) {
          err = "Not&nbsp;found:&nbsp;" + item.name;
        } else if (!blob) {
          // Errors like DNS lookup failure, no CORS headers, no network connection
          // all are status 0 - it seems impossible to show a more specific message
          // actual reason is displayed on the console
          err = "Error&nbsp;loading&nbsp;" + item.name + ". Possible causes include: wrong URL, no network connection, server not configured for cross-domain sharing (CORS).";
        } else {
          blob.name = item.basename;
          memo.push(blob);
        }
        next(err, memo);
      });
      req.open('GET', item.url);
      req.send();
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
    var _el = El(ref);
    var _self = this;
    var defaults = {
      space: 7
    };
    opts = utils.extend(defaults, opts);

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

    function setHandlePos(x, fire) {
      x = utils.clamp(x, 0, size());
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

  utils.inherit(Slider, EventDispatcher);

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

    // init settings menu
    new SimpleButton(menu.findChild('.submit-btn').addClass('default-btn')).on('click', onSubmit);
    new SimpleButton(menu.findChild('.cancel-btn')).on('click', function() {
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
    gui.addMode('simplify', turnOn, turnOff, gui.container.findChild('.simplify-btn'));
    model.on('select', function() {
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
      pct = utils.parsePercent(text.text()); // use rounded value (for consistency w/ cli)
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
      return utils.formatNumber(pct, decimals) + "%";
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
        mapshaper.simplify(dataset, opts);
        gui.session.simplificationApplied(getSimplifyOptionsAsString());
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
        model.getActiveLayer().dataset.arcs.setRetainedInterval(fromPct(pct));
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

  function saveZipFile(zipfileName, files, done) {
    var zip = window.zip; // assumes zip library is loaded globally
    var toAdd = files;
    var zipWriter;
    try {
      zip.createWriter(new zip.BlobWriter("application/zip"), function(writer) {
        zipWriter = writer;
        nextFile();
      }, zipError);
    } catch(e) {
      done("This browser doesn't support Zip file creation.");
    }

    function zipError(err) {
      var str = "Error creating Zip file";
      var msg = '';
      // error events thrown by Zip library seem to be missing a message
      if (err && err.message) {
        msg = err.message;
      }
      if (msg) {
        str += ": " + msg;
      }
      done(str);
    }

    function nextFile() {
      if (toAdd.length === 0) {
        zipWriter.close(function(blob) {
          saveBlobToDownloadFolder(zipfileName, blob, done);
        });
      } else {
        var obj = toAdd.pop(),
            blob = new Blob([obj.content]);
        zipWriter.add(obj.filename, new zip.BlobReader(blob), nextFile);
      }
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

  function saveBlobToDownloadFolder(filename, blob, done) {
    var anchor, blobUrl;
    if (window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, filename);
      return done();
    }
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

  function MessageProxy(gui) {
    // replace stop function
    var stop = function() {
      // Show a popup error message, then throw an error
      var msg = GUI.formatMessageArgs(arguments);
      gui.alert(msg);
      throw new Error(msg);
    };

    // Replace error function in mapshaper lib
    var error = function() {
      stop.apply(null, utils.toArray(arguments));
    };

    var message = function() {
      internal.logArgs(arguments); // reset default
    };

    internal.setLoggingFunctions(message, error, stop);
  }

  function WriteFilesProxy(gui) {
    // replace CLI version of writeFiles()
    internal.replaceWriteFiles(function(files, opts, done) {
      var filename;
      if (!utils.isArray(files) || files.length === 0) {
        done("Nothing to export");
      } else if (GUI.canSaveToServer() && !opts.save_to_download_folder) {
        var paths = internal.getOutputPaths(utils.pluck(files, 'filename'), opts);
        var data = utils.pluck(files, 'content');
        saveFilesToServer(paths, data, function(err) {
          var msg;
          if (err) {
            msg = "<b>Direct save failed</b><br>Reason: " + err + ".";
            msg += "<br>Saving to download folder instead.";
            gui.alert(msg);
            // fall back to standard method if saving to server fails
            internal.writeFiles(files, {save_to_download_folder: true}, done);
          } else {
            if (files.length >= 1) {
              gui.alert('<b>Saved</b><br>' + paths.join('<br>'));
            }
            done();
          }
        });
      } else if (files.length == 1) {
        saveBlobToDownloadFolder(files[0].filename, new Blob([files[0].content]), done);
      } else {
        filename = internal.getCommonFileBase(utils.pluck(files, 'filename')) || "output";
        saveZipFile(filename + ".zip", files, done);
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
        lyr = utils.find(d.layers, function(lyr) {return lyr.name == src;});
        return lyr ? internal.isolateLayer(lyr, d) : null;
      }, null);
      if (!retn) stop("Missing data layer [" + src + "]");
      return retn;
    }

    internal.replaceImportFile(function(src, opts) {
      var dataset = find(src);
      // Return a copy with layers duplicated, so changes won't affect original layers
      // This makes an (unsafe) assumption that the dataset arcs won't be changed...
      // need to rethink this.
      return utils.defaults({
        layers: dataset.layers.map(internal.copyLayer)
      }, dataset);
    });
  }

  // load Proj.4 CRS definition files dynamically
  //
  internal.setProjectionLoader(function(opts, done) {
    var mproj = require('mproj');
    var libs = internal.findProjLibs([opts.init || '', opts.match || '', opts.crs || ''].join(' '));
    // skip loaded libs
    libs = libs.filter(function(name) {return !mproj.internal.mproj_search_libcache(name);});
    loadProjLibs(libs, done);
  });

  function loadProjLibs(libs, done) {
    var mproj = require('mproj');
    var i = 0;
    next();

    function next() {
      var libName = libs[i];
      var content, req;
      if (!libName) return done();
      req = new XMLHttpRequest();
      req.addEventListener('load', function(e) {
        if (req.status == 200) {
          content = req.response;
        }
      });
      req.addEventListener('loadend', function() {
        if (content) {
          mproj.internal.mproj_insert_libcache(libName, content);
        }
        // TODO: consider stopping with an error message if no content was loaded
        // (currently, a less specific error will occur when mapshaper tries to use the library)
        next();
      });
      req.open('GET', 'assets/' + libName);
      req.send();
      i++;
    }
  }

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

  function projectArcsForDisplay_v1(arcs, src, dest) {
    var copy = arcs.getCopy(); // need to flatten first?
    var proj = internal.getProjTransform(src, dest);
    internal.projectArcs(copy, proj); // need to densify arcs?
    return copy;
  }

  function projectArcsForDisplay(arcs, src, dest) {
    var copy = arcs.getCopy(); // need to flatten first?
    var proj = internal.getProjTransform2(src, dest);
    internal.projectArcs2(copy, proj); // need to densify arcs?
    return copy;
  }

  function projectPointsForDisplay(lyr, src, dest) {
    var copy = utils.extend({}, lyr);
    var proj = internal.getProjTransform2(src, dest);
    copy.shapes = internal.cloneShapes(lyr.shapes);
    internal.projectPointLayer(copy, proj);
    return copy;
  }


  // Update map extent and trigger redraw, after a new display CRS has been applied
  function projectMapExtent(ext, src, dest, newBounds) {
    var oldBounds = ext.getBounds();
    var oldScale = ext.scale();
    var newCP, proj;

    // if source or destination CRS is unknown, show full extent
    // if map is at full extent, show full extent
    // TODO: handle case that scale is 1 and map is panned away from center
    if (ext.scale() == 1 || !dest) {
      ext.setBounds(newBounds);
      ext.home(); // sets full extent and triggers redraw
    } else {
      // if map is zoomed, stay centered on the same geographic location, at the same relative scale
      proj = internal.getProjTransform2(src, dest);
      newCP = proj(oldBounds.centerX(), oldBounds.centerY());
      ext.setBounds(newBounds);
      if (!newCP) {
        // projection of center point failed; use center of bounds
        // (also consider just resetting the view using ext.home())
        newCP = [newBounds.centerX(), newBounds.centerY()];
      }
      ext.recenter(newCP[0], newCP[1], oldScale);
    }
  }

  // Called from console; for testing dynamic crs
  function setDisplayProjection(gui, cmd) {
    var arg = cmd.replace(/^projd[ ]*/, '');
    if (arg) {
      gui.map.setDisplayCRS(internal.getCRS(arg));
    } else {
      gui.map.setDisplayCRS(null);
    }
  }

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

    // expose this function, so other components can run commands (e.g. box tool)
    this.runMapshaperCommands = runMapshaperCommands;

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
      var hist;
      try {
        hist = JSON.parse(window.localStorage.getItem('console_history'));
      } catch(e) {}
      return hist && hist.length > 0 ? hist : [];
    }

    function saveHistory() {
      try {
        history = history.filter(Boolean); // TODO: fix condition that leaves a blank line on the history
        window.localStorage.setItem('console_history', JSON.stringify(history.slice(-50)));
      } catch(e) {}
    }

    function toLog(str, cname) {
      var msg = El('div').text(str).appendTo(log);
      if (cname) {
        msg.addClass(cname);
      }
      scrollDown();
    }

    function turnOn() {
      if (!_isOpen && !model.isEmpty()) {
        btn.addClass('active');
        _isOpen = true;
        // use console for messages while open
        // TODO: find a solution for logging problem when switching between multiple
        // gui instances with the console open. E.g. console could close
        // when an instance loses focus.
        internal.setLoggingFunctions(consoleMessage, consoleError, consoleStop);
        gui.container.addClass('console-open');
        gui.dispatchEvent('resize');
        el.show();
        input.node().focus();
        history = getHistory();
      }
    }

    function turnOff() {
      if (_isOpen) {
        btn.removeClass('active');
        _isOpen = false;
        if (GUI.isActiveInstance(gui)) {
          MessageProxy(gui); // reset stop, message and error functions
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
      var cmd = str.replace(/\\?\n/g, '').trim();
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
          message("Available layers:",
            internal.getFormattedLayerList(model));
        } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
          turnOff();
        } else if (/^projd/.test(cmd)) {
          // set the display CRS (for testing)
          setDisplayProjection(gui, cmd);
        } else {
          line.hide(); // hide cursor while command is being run
          runMapshaperCommands(cmd, function(err) {
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
          gui.session.consoleCommands(internal.standardizeConsoleCommands(str));
        }
        if (flags) {
          // if the command may have changed data, and a tool with an edit mode is being used,
          // close the tool. (we may need a better way to allow the console and other tools
          // to be used at the same time).
          gui.clearMode();

          model.updated(flags); // info commands do not return flags
        }
        done(err);
      });
    }

    function applyParsedCommands(commands, done) {
      var active = model.getActiveLayer(),
          prevArcs = active.dataset.arcs,
          prevTable = active.layer.data,
          prevTableSize = prevTable ? prevTable.size() : 0,
          prevArcCount = prevArcs ? prevArcs.size() : 0;

      internal.runParsedCommands(commands, model, function(err) {
        var flags = getCommandFlags(commands),
            active2 = model.getActiveLayer(),
            postArcs = active2.dataset.arcs,
            postArcCount = postArcs ? postArcs.size() : 0,
            postTable = active2.layer.data,
            postTableSize = postTable ? postTable.size() : 0,
            sameTable = prevTable == postTable && prevTableSize == postTableSize,
            sameArcs = prevArcs == postArcs && postArcCount == prevArcCount;

        // restore default logging options, in case they were changed by the command
        internal.setStateVar('QUIET', false);
        internal.setStateVar('VERBOSE', false);

        // kludge to signal map that filtered arcs need refreshing
        // TODO: find a better solution, outside the console
        if (!sameArcs) {
          flags.arc_count = true;
        }
        if (sameTable) {
          flags.same_table = true;
        }
        if (active.layer != active2.layer) {
          flags.select = true;
        }
        // signal the map to update even if an error has occured, because the
        // commands may have partially succeeded and changes may have occured to
        // the data.
        done(err, flags);
      });
    }

    function onError(err) {
      if (utils.isString(err)) {
        consoleStop(err);
      } else if (err.name == 'UserError') {
        // stop() has already been called, don't need to log
      } else if (err.name) {
        // log stack trace to browser console
        console.error(err.stack);
        // log to console window
        consoleWarning(err.message);
      }
    }

    function consoleStop() {
      var msg = GUI.formatMessageArgs(arguments);
      consoleWarning(msg);
      throw new UserError(msg);
    }

    function consoleWarning() {
      var msg = GUI.formatMessageArgs(arguments);
      toLog(msg, 'console-error');
    }

    function consoleMessage() {
      var msg = GUI.formatMessageArgs(arguments);
      if (internal.loggingEnabled() && !internal.getStateVar('QUIET')) {
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

  function AlertControl(gui) {
    var el;
    gui.addMode('alert', function() {}, turnOff);

    gui.alert = function(str) {
      var infoBox;
      if (!el) {
        el = El('div').appendTo('body').addClass('error-wrapper');
        infoBox = El('div').appendTo(el).addClass('error-box info-box selectable');
        El('p').addClass('error-message').appendTo(infoBox);
        El('div').addClass("btn dialog-btn").appendTo(infoBox).html('close').on('click', gui.clearMode);
      }
      el.findChild('.error-message').html(str);
      gui.enterMode('alert');
    };

    function turnOff() {
      if (el) {
        el.remove();
        el = null;
      }
    }
  }

  function RepairControl(gui) {
    var map = gui.map,
        model = gui.model,
        el = gui.container.findChild(".intersection-display"),
        readout = el.findChild(".intersection-count"),
        repairBtn = el.findChild(".repair-btn"),
        // keeping a reference to current arcs and intersections, so intersections
        // don't need to be recalculated when 'repair' button is pressed.
        _currArcs,
        _currXX;

    gui.on('simplify_drag_start', hide);
    gui.on('simplify_drag_end', updateAsync);

    model.on('update', function(e) {
      var flags = e.flags;
      var needUpdate = flags.simplify || flags.proj || flags.arc_count ||
          flags.affine || flags.points || flags['merge-layers'] || flags.select;
      if (needUpdate) {
        if (flags.select) {
          // preserve cached intersections
        } else {
          // delete any cached intersection data
          e.dataset.info.intersections = null;
        }
        updateAsync();
      }
    });

    repairBtn.on('click', function() {
      var fixed = internal.repairIntersections(_currArcs, _currXX);
      showIntersections(fixed, _currArcs);
      repairBtn.addClass('disabled');
      model.updated({repair: true});
      gui.session.simplificationRepair();
    });

    function hide() {
      el.hide();
      map.setIntersectionLayer(null);
    }

    function enabledForDataset(dataset) {
      var info = dataset.info || {};
      var opts = info.import_options || {};
      return !opts.no_repair && !info.no_intersections;
    }

    // Delay intersection calculation, so map can redraw after previous
    // operation (e.g. layer load, simplification change)
    function updateAsync() {
      reset();
      setTimeout(updateSync, 10);
    }

    function updateSync() {
      var e = model.getActiveLayer();
      var dataset = e.dataset;
      var arcs = dataset && dataset.arcs;
      var XX, showBtn;
      var opts = {
        unique: true,
        tolerance: 0
      };
      if (!arcs || !internal.layerHasPaths(e.layer) || !enabledForDataset(dataset)) return;
      if (arcs.getRetainedInterval() > 0) {
        // TODO: cache these intersections
        XX = internal.findSegmentIntersections(arcs, opts);
        showBtn = XX.length > 0;
      } else { // no simplification
        XX = dataset.info.intersections;
        if (!XX) {
          // cache intersections at 0 simplification, to avoid recalculating
          // every time the simplification slider is set to 100% or the layer is selected at 100%
          XX = dataset.info.intersections = internal.findSegmentIntersections(arcs, opts);
        }
        showBtn = false;
      }
      el.show();
      showIntersections(XX, arcs);
      repairBtn.classed('disabled', !showBtn);
    }

    function reset() {
      _currArcs = null;
      _currXX = null;
      hide();
    }

    function dismiss() {
      var dataset = model.getActiveLayer().dataset;
      dataset.info.intersections = null;
      dataset.info.no_intersections = true;
      reset();
    }

    function showIntersections(XX, arcs) {
      var n = XX.length, pointLyr;
      _currXX = XX;
      _currArcs = arcs;
      if (n > 0) {
        // console.log("first intersection:", internal.getIntersectionDebugData(XX[0], arcs));
        pointLyr = {geometry_type: 'point', shapes: [internal.getIntersectionPoints(XX)]};
        map.setIntersectionLayer(pointLyr, {layers:[pointLyr]});
        readout.html(utils.format('<span class="icon"></span>%s line intersection%s <img class="close-btn" src="images/close.png">', n, utils.pluralSuffix(n)));
        readout.findChild('.close-btn').on('click', dismiss);
      } else {
        map.setIntersectionLayer(null);
        readout.html('');
      }
    }
  }

  utils.inherit(RepairControl, EventDispatcher);

  function updateLayerStackOrder(layers) {
    // 1. assign ascending ids to unassigned layers above the range of other layers
    layers.forEach(function(o, i) {
      if (!o.layer.stack_id) o.layer.stack_id = 1e6 + i;
    });
    // 2. sort in ascending order
    layers.sort(function(a, b) {
      return a.layer.stack_id - b.layer.stack_id;
    });
    // 3. assign consecutve ids
    layers.forEach(function(o, i) {
      o.layer.stack_id = i + 1;
    });
    return layers;
  }

  function sortLayersForMenuDisplay(layers) {
    layers = updateLayerStackOrder(layers);
    return layers.reverse();
  }

  // Export buttons and their behavior
  var ExportControl = function(gui) {
    var model = gui.model;
    var unsupportedMsg = "Exporting is not supported in this browser";
    var menu = gui.container.findChild('.export-options').on('click', GUI.handleDirectEvent(gui.clearMode));
    var checkboxes = []; // array of layer checkboxes
    var exportBtn = gui.container.findChild('.export-btn');
    new SimpleButton(menu.findChild('.cancel-btn')).on('click', gui.clearMode);

    if (!GUI.exportIsSupported()) {
      exportBtn.on('click', function() {
        gui.alert(unsupportedMsg);
      });

      internal.writeFiles = function() {
        error(unsupportedMsg);
      };
    } else {
      new SimpleButton(menu.findChild('.save-btn').addClass('default-btn')).on('click', onExportClick);
      gui.addMode('export', turnOn, turnOff, exportBtn);
      gui.keyboard.onMenuSubmit(menu, onExportClick);
    }

    function onExportClick() {
      gui.showProgressMessage('Exporting');
      gui.clearMode();
      setTimeout(function() {
        exportMenuSelection(function(err) {
          if (err) {
            if (utils.isString(err)) {
              gui.alert(err);
            } else {
              // stack seems to change if Error is logged directly
              console.error(err.stack);
              gui.alert("Export failed for an unknown reason");
            }
          }
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
      return freeform.trim();
    }

    // @done function(string|Error|null)
    function exportMenuSelection(done) {
      var opts, files;
      try {
        opts = getExportOpts();
        // ignoring command line "target" option
        files = internal.exportTargetLayers(getTargetLayers(), opts);
        gui.session.layersExported(getTargetLayerIds(), getExportOptsAsString());
      } catch(e) {
        return done(e);
      }
      internal.writeFiles(files, opts, done);
    }

    function initLayerMenu() {
      var list = menu.findChild('.export-layer-list').empty();
      var template = '<label><input type="checkbox" value="%s" checked> %s</label>';
      var objects = model.getLayers().map(function(o, i) {
        var html = utils.format(template, i + 1, o.layer.name || '[unnamed layer]');
        return {layer: o.layer, html: html};
      });
      sortLayersForMenuDisplay(objects);
      checkboxes = objects.map(function(o) {
        return El('div').html(o.html).appendTo(list).findChild('input').node();
      });
      menu.findChild('.export-layers').css('display', checkboxes.length < 2 ? 'none' : 'block');
    }

    function getInputFormats() {
      return model.getDatasets().reduce(function(memo, d) {
        var fmts = d.info && d.info.input_formats || [];
        return memo.concat(fmts);
      }, []);
    }

    function getDefaultExportFormat() {
      var dataset = model.getActiveLayer().dataset;
      return dataset.info && dataset.info.input_formats &&
          dataset.info.input_formats[0] || 'geojson';
    }

    function initFormatMenu() {
      var defaults = ['shapefile', 'geojson', 'topojson', 'json', 'dsv', 'svg'];
      var formats = utils.uniq(defaults.concat(getInputFormats()));
      var items = formats.map(function(fmt) {
        return utils.format('<div><label><input type="radio" name="format" value="%s"' +
          ' class="radio">%s</label></div>', fmt, internal.getFormatName(fmt));
      });
      menu.findChild('.export-formats').html(items.join('\n'));
      menu.findChild('.export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
    }

    function turnOn() {
      initLayerMenu();
      initFormatMenu();
      menu.show();
    }

    function turnOff() {
      menu.hide();
    }

    function getSelectedFormat() {
      return menu.findChild('.export-formats input:checked').node().value;
    }

    function getTargetLayerIds() {
      return checkboxes.reduce(function(memo, box, i) {
        if (box.checked) memo.push(box.value);
        return memo;
      }, []);
    }

    function getTargetLayers() {
      var ids = getTargetLayerIds().join(',');
      return ids ? model.findCommandTargets(ids) : [];
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

  function LayerControl(gui) {
    var map = gui.map;
    var model = gui.model;
    var el = gui.container.findChild(".layer-control").on('click', GUI.handleDirectEvent(gui.clearMode));
    var btn = gui.container.findChild('.layer-control-btn');
    var buttonLabel = btn.findChild('.layer-name');
    var isOpen = false;
    var cache = new DomCache();
    var pinAll = el.findChild('.pin-all'); // button for toggling layer visibility

    // layer repositioning
    var dragTargetId = null;
    var dragging = false;
    var layerOrderSlug;

    gui.addMode('layer_menu', turnOn, turnOff, btn.findChild('.header-btn'));
    model.on('update', function(e) {
      updateMenuBtn();
      if (isOpen) render();
    });

    el.on('mouseup', stopDragging);
    el.on('mouseleave', stopDragging);

    // init layer visibility button
    pinAll.on('click', function() {
      var allOn = testAllLayersPinned();
      model.getLayers().forEach(function(target) {
        map.setLayerVisibility(target, !allOn);
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
      var yes = true;
      model.forEachLayer(function(lyr, dataset) {
        if (isPinnable(lyr) && !map.isVisibleLayer(lyr)) {
          yes = false;
        }
      });
      return yes;
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
        render(); // in case menu changed...
        dragging = false;
      }
    }

    function insertLayer(dragId, dropId, above) {
      var dragLyr = findLayerById(dragId);
      var dropLyr = findLayerById(dropId);
      var slug;
      if (dragId == dropId) return;
      dragLyr.layer.stack_id = dropLyr.layer.stack_id + (above ? 0.5 : -0.5);
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
      var name = model.getActiveLayer().layer.name || "[unnamed layer]";
      buttonLabel.html(name + " &nbsp;&#9660;");
    }

    function render() {
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
          lyr.menu_id = utils.getUniqueName();
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
      var warnings = getWarnings(lyr, dataset);
      var classes = 'layer-item';
      var entry, html;

      if (opts.pinnable) classes += ' pinnable';
      if (map.isActiveLayer(lyr)) classes += ' active';
      if (map.isVisibleLayer(lyr)) classes += ' pinned';

      html = '<!-- ' + lyr.menu_id + '--><div class="' + classes + '">';
      html += rowHTML('name', '<span class="layer-name colored-text dot-underline">' + getDisplayName(lyr.name) + '</span>', 'row1');
      if (opts.show_source) {
        html += rowHTML('source file', describeSrc(lyr, dataset) || 'n/a');
      }
      html += rowHTML('contents', describeLyr(lyr));
      if (warnings) {
        html += rowHTML('problems', warnings, 'layer-problems');
      }
      html += '<img class="close-btn" draggable="false" src="images/close.png">';
      if (opts.pinnable) {
        html += '<img class="pin-btn unpinned" draggable="false" src="images/eye.png">';
        html += '<img class="pin-btn pinned" draggable="false" src="images/eye2.png">';
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

      // init delete button
      GUI.onClick(entry.findChild('img.close-btn'), function(e) {
        var target = findLayerById(id);
        e.stopPropagation();
        if (map.isVisibleLayer(target.layer)) {
          // TODO: check for double map refresh after model.deleteLayer() below
          map.setLayerVisibility(target, false);
        }
        model.deleteLayer(target.layer, target.dataset);
      });

      if (pinnable) {
        // init pin button
        GUI.onClick(entry.findChild('img.unpinned'), function(e) {
          var target = findLayerById(id);
          e.stopPropagation();
          if (map.isVisibleLayer(target.layer)) {
            map.setLayerVisibility(target, false);
            entry.removeClass('pinned');
          } else {
            map.setLayerVisibility(target, true);
            entry.addClass('pinned');
          }
          updatePinAllButton();
          map.redraw();
        });

        // catch click event on pin button
        GUI.onClick(entry.findChild('img.unpinned'), function(e) {
          e.stopPropagation();
        });
      }

      // init name editor
      new ClickText2(entry.findChild('.layer-name'))
        .on('change', function(e) {
          var target = findLayerById(id);
          var str = cleanLayerName(this.value());
          this.value(getDisplayName(str));
          target.layer.name = str;
          gui.session.layerRenamed(target.layer, str);
          updateMenuBtn();
        });

      // init click-to-select
      GUI.onClick(entry, function() {
        var target = findLayerById(id);
        // don't select if user is typing or dragging
        if (!GUI.getInputElement() && !dragging) {
          gui.clearMode();
          if (!map.isActiveLayer(target.layer)) {
            model.selectLayer(target.layer, target.dataset);
          }
        }
      });
    }

    function describeLyr(lyr) {
      var n = internal.getFeatureCount(lyr),
          str, type;
      if (lyr.data && !lyr.shapes) {
        type = 'data record';
      } else if (lyr.geometry_type) {
        type = lyr.geometry_type + ' feature';
      }
      if (type) {
        str = utils.format('%,d %s%s', n, type, utils.pluralSuffix(n));
      } else {
        str = "[empty]";
      }
      return str;
    }

    function getWarnings(lyr, dataset) {
      var file = internal.getLayerSourceFile(lyr, dataset);
      var missing = [];
      var msg;
      if (utils.endsWith(file, '.shp') && lyr == dataset.layers[0]) {
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

    function getDisplayName(name) {
      return name || '[unnamed]';
    }

    function isPinnable(lyr) {
      return internal.layerHasGeometry(lyr) || internal.layerHasFurniture(lyr);
    }


    function cleanLayerName(raw) {
      return raw.replace(/[\n\t/\\]/g, '')
        .replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
    }

    function rowHTML(c1, c2, cname) {
      return utils.format('<div class="row%s"><div class="col1">%s</div>' +
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

    this.dataValueUpdated = function(id, field, value) {
      var cmd = `-each 'd[${JSON.stringify(field)}] = ${JSON.stringify(value)}' where='this.id == ${id}'`;
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

  function SidebarButtons(gui) {
    var root = gui.container.findChild('.mshp-main-map');
    var buttons = El('div').addClass('nav-buttons').appendTo(root).hide();
    var _hidden = true;
    gui.on('active', updateVisibility);
    gui.on('inactive', updateVisibility);

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
      modes.enterMode(active ? null : name);
    });
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

  utils.inherit(ModeSwitcher, EventDispatcher);

  function KeyboardEvents(gui) {
    var self = this;
    var shiftDown = false;
    document.addEventListener('keyup', function(e) {
      if (!GUI.isActiveInstance(gui)) return;
      if (e.keyCode == 16) shiftDown = false;
    });

    document.addEventListener('keydown', function(e) {
      if (!GUI.isActiveInstance(gui)) return;
      if (e.keyCode == 16) shiftDown = true;
      self.dispatchEvent('keydown', {originalEvent: e});
    });

    this.shiftIsPressed = function() { return shiftDown; };

    this.onMenuSubmit = function(menuEl, cb) {
      gui.on('enter_key', function(e) {
        if (menuEl.visible()) {
          e.originalEvent.stopPropagation();
          cb();
        }
      });
    };
  }

  utils.inherit(KeyboardEvents, EventDispatcher);

  function InteractionMode(gui) {

    var menus = {
      standard: ['info', 'selection', 'data', 'box'],
      lines: ['info', 'selection', 'data', 'box', 'vertices'],
      table: ['info', 'selection', 'data'],
      labels: ['info', 'selection', 'data', 'box', 'labels', 'location'],
      points: ['info', 'selection', 'data', 'box', 'location']
    };

    var prompts = {
      box: 'Shift-drag to draw a box',
      data: 'Click-select features to edit their attributes',
      selection: 'Click-select or shift-drag to select features'
    };

    // mode name -> menu text lookup
    var labels = {
      info: 'inspect features',
      box: 'shift-drag box tool',
      data: 'edit attributes',
      labels: 'position labels',
      location: 'drag points',
      vertices: 'drag vertices',
      selection: 'select features',
      off: 'turn off'
    };
    var btn, menu;
    var _menuTimeout;

    // state variables
    var _editMode = 'off';
    var _menuOpen = false;

    // Only render edit mode button/menu if this option is present
    if (gui.options.inspectorControl) {
      btn = gui.buttons.addButton('#pointer-icon');
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
        return menus.standard; // TODO: more sensible handling of missing layer
      }
      if (!internal.layerHasGeometry(o.layer)) {
        return menus.table;
      }
      if (internal.layerHasLabels(o.layer)) {
        return menus.labels;
      }
      if (internal.layerHasPoints(o.layer)) {
        return menus.points;
      }
      if (internal.layerHasPaths(o.layer) && o.layer.geometry_type == 'polyline') {
        return menus.lines;
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
        _editMode = mode;
        onModeChange();
        updateArrowButton();
        updateSelectionHighlight();
      }
    }

    function onModeChange() {
      gui.dispatchEvent('interaction_mode_change', {mode: getInteractionMode()});
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
    utils.extend(self, EventDispatcher.prototype);

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
      self.dispatchEvent('update', utils.extend({flags: flags}, active));
    };

    self.selectLayer = function(lyr, dataset) {
      if (self.getActiveLayer().layer == lyr) return;
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

  function getShapeHitTest(displayLayer, ext) {
    var geoType = displayLayer.layer.geometry_type;
    var test;
    if (geoType == 'point' && displayLayer.style.type == 'styled') {
      test = getGraduatedCircleTest(getRadiusFunction(displayLayer.style));
    } else if (geoType == 'point') {
      test = pointTest;
    } else if (geoType == 'polyline') {
      test = polylineTest;
    } else if (geoType == 'polygon') {
      test = polygonTest;
    } else {
      error("Unexpected geometry type:", geoType);
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
      var maxDist = getZoomAdjustedHitBuffer(5, 1),
          cands = findHitCandidates(x, y, maxDist),
          hits = [],
          cand, hitId;
      for (var i=0; i<cands.length; i++) {
        cand = cands[i];
        if (geom.testPointInPolygon(x, y, cand.shape, displayLayer.arcs)) {
          hits.push(cand.id);
        }
      }
      if (cands.length > 0 && hits.length === 0) {
        // secondary detection: proximity, if not inside a polygon
        sortByDistance(x, y, cands, displayLayer.arcs);
        hits = pickNearestCandidates(cands, 0, maxDist);
      }
      return hits;
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
        hits.push(cand.id);
      }
      return hits;
    }

    function polylineTest(x, y) {
      var maxDist = getZoomAdjustedHitBuffer(15, 2),
          bufDist = getZoomAdjustedHitBuffer(0.05), // tiny threshold for hitting almost-identical lines
          cands = findHitCandidates(x, y, maxDist);
      sortByDistance(x, y, cands, displayLayer.arcs);
      return pickNearestCandidates(cands, bufDist, maxDist);
    }

    function sortByDistance(x, y, cands, arcs) {
      for (var i=0; i<cands.length; i++) {
        cands[i].dist = geom.getPointToShapeDistance(x, y, cands[i].shape, arcs);
      }
      utils.sortOn(cands, 'dist');
    }

    function pointTest(x, y) {
      var bullseyeDist = 2, // hit all points w/in 2 px
          tinyDist = 0.5,
          toPx = ext.getTransform().mx,
          hits = [],
          hitThreshold = 25,
          newThreshold = Infinity;

      internal.forEachPoint(displayLayer.layer.shapes, function(p, id) {
        var dist = geom.distance2D(x, y, p[0], p[1]) * toPx;
        if (dist > hitThreshold) return;
        // got a hit
        if (dist < newThreshold) {
          // start a collection of hits
          hits = [id];
          hitThreshold = Math.max(bullseyeDist, dist + tinyDist);
          newThreshold = dist < bullseyeDist ? -1 : dist - tinyDist;
        } else {
          // add to hits if inside bullseye or is same dist as previous hit
          hits.push(id);
        }
      });
      // console.log(hitThreshold, bullseye);
      return hits;
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
        internal.forEachPoint(displayLayer.layer.shapes, function(p, id) {
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
        return hits;
      };
    }

    function findHitCandidates(x, y, dist) {
      var arcs = displayLayer.arcs,
          index = {},
          cands = [],
          bbox = [];
      displayLayer.layer.shapes.forEach(function(shp, shpId) {
        var cand;
        for (var i = 0, n = shp && shp.length; i < n; i++) {
          arcs.getSimpleShapeBounds2(shp[i], bbox);
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

  function renderSymbols(lyr, ext, type) {
    var records = lyr.data.getRecords();
    var symbols = lyr.shapes.map(function(shp, i) {
      var d = records[i];
      var obj = type == 'label' ? internal.svg.importStyledLabel(d) :
          internal.svg.importSymbol(d['svg-symbol']);
      if (!obj || !shp) return null;
      obj.properties.transform = getSvgSymbolTransform(shp[0], ext);
      obj.properties['data-id'] = i;
      return obj;
    });
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

  function getPointerHitTest(mapLayer, ext) {
    var shapeTest, svgTest, targetLayer;
    if (!mapLayer || !internal.layerHasGeometry(mapLayer.layer)) {
      return null;
    }
    shapeTest = getShapeHitTest(mapLayer, ext);
    svgTest = getSvgHitTest(mapLayer);

    // e: pointer event
    return function(e) {
      var p = ext.translatePixelCoords(e.x, e.y);
      var data = {
        ids: shapeTest(p[0], p[1]) || []
      };
      var svgData = svgTest(e); // null or a data object
      if (svgData) { // mouse is over an SVG symbol
        utils.extend(data, svgData);
        // placing symbol id in front of any other hits
        data.ids = utils.uniq([svgData.targetId].concat(data.ids));
      }
      data.id = data.ids.length > 0 ? data.ids[0] : -1;
      return data;
    };
  }

  function InteractiveSelection(gui, ext, mouse) {
    var self = new EventDispatcher();
    var storedData = noHitData(); // may include additional data from SVG symbol hit (e.g. hit node)
    var selectionIds = [];
    var active = false;
    var interactionMode;
    var targetLayer;
    var hitTest;
    // event priority is higher than navigation, so stopping propagation disables
    // pan navigation
    var priority = 2;

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
      if (pinnedId() == -1 || GUI.getInputElement()) return;

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
          internal.deleteFeatureById(targetLayer.layer, pinnedId());
          self.clearSelection();
          gui.model.updated({flags: 'filter'}); // signal map to update
        }
      }
    }, !!'capture'); // preempt the layer control's arrow key handler

    self.setLayer = function(mapLayer) {
      hitTest = getPointerHitTest(mapLayer, ext);
      if (!hitTest) {
        hitTest = function() {return {ids: []};};
      }
      targetLayer = mapLayer;
    };

    function turnOn(mode) {
      interactionMode = mode;
      active = true;
    }

    function turnOff() {
      if (active) {
        updateSelectionState(null); // no hit data, no event
        active = false;
      }
    }

    function selectable() {
      return interactionMode == 'selection';
    }

    function pinnable() {
      return clickable() && interactionMode != 'selection';
    }

    function draggable() {
      return interactionMode == 'vertices' || interactionMode == 'location' || interactionMode == 'labels';
    }

    function clickable() {
      // click used to pin popup and select features
      return interactionMode == 'data' || interactionMode == 'info' || interactionMode == 'selection';
    }

    self.getHitId = function() {return storedData.id;};

    // Get a reference to the active layer, so listeners to hit events can interact
    // with data and shapes
    self.getHitTarget = function() {
      return targetLayer;
    };

    self.addSelectionIds = function(ids) {
      turnOn('selection');
      selectionIds = utils.uniq(selectionIds.concat(ids));
      ids = utils.uniq(storedData.ids.concat(ids));
      updateSelectionState({ids: ids});
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
      return targ && targ.layer.data || null;
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
      var n = internal.getFeatureCount(targetLayer.layer);
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
      updateSelectionState(null);
      if (e.mode == 'off' || e.mode == 'box') {
        turnOff();
      } else {
        turnOn(e.mode);
      }
    });

    gui.on('box_drag_start', function() {
      self.clearHover();
    });

    mouse.on('dblclick', handlePointerEvent, null, priority);
    mouse.on('dragstart', handlePointerEvent, null, priority);
    mouse.on('drag', handlePointerEvent, null, priority);
    mouse.on('dragend', handlePointerEvent, null, priority);

    mouse.on('click', function(e) {
      if (!hitTest || !active) return;
      e.stopPropagation();

      // TODO: move pinning to inspection control?
      if (clickable()) {
        updateSelectionState(mergeClickData(hitTest(e)));
      }
      triggerHitEvent('click', e.data);
    }, null, priority);

    // Hits are re-detected on 'hover' (if hit detection is active)
    mouse.on('hover', function(e) {
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

    function mergeClickData(hitData) {
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
        return utils.difference(ids, [id]);
      }
      return [id].concat(ids);
    }

    // If hit ids have changed, update stored hit ids and fire 'hover' event
    // evt: (optional) mouse event
    function updateSelectionState(newData) {
      var nonEmpty = newData && (newData.ids.length || newData.id > -1);
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
      if (type == 'click' && !clickable()) {
        return false;
      }
      if ((type == 'drag' || type == 'dragstart' || type == 'dragend') && !draggable()) {
        return false;
      }
      return true;
    }

    function isOverMap(e) {
      return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
    }

    function handlePointerEvent(e) {
      if (!hitTest || !active) return;
      if (self.getHitId() == -1) return; // ignore pointer events when no features are being hit
      // don't block pan and other navigation in modes when they are not being used
      if (eventIsEnabled(e.type)) {
        e.stopPropagation(); // block navigation
        triggerHitEvent(e.type, e.data);
      }
    }

    // d: event data (may be a pointer event object, an ordinary object or null)
    function triggerHitEvent(type, d) {
      // Merge stored hit data into the event data
      var eventData = utils.extend({mode: interactionMode}, d || {}, storedData);
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

  function CoordinatesDisplay(gui, ext, mouse) {
    var readout = gui.container.findChild('.coordinate-info').hide();
    var enabled = false;

    gui.model.on('select', function(e) {
      enabled = !!e.layer.geometry_type; // no display on tabular layers
      readout.hide();
    });

    readout.on('copy', function(e) {
      // remove selection on copy (using timeout or else copy is cancelled)
      setTimeout(function() {
        window.getSelection().removeAllRanges();
      }, 50);
    });

    // clear coords when map pans
    ext.on('change', function() {
      clearCoords();
      // shapes may change along with map scale
      // target = lyr ? lyr.getDisplayLayer() : null;
    });

    mouse.on('leave', clearCoords);

    mouse.on('click', function(e) {
      if (!enabled) return;
      GUI.selectElement(readout.node());
    });

    mouse.on('hover', onMouseChange);
    mouse.on('drag', onMouseChange, null, 10); // high priority so editor doesn't block propagation

    function onMouseChange(e) {
      if (!enabled) return;
      if (isOverMap(e)) {
        displayCoords(ext.translatePixelCoords(e.x, e.y));
      } else {
        clearCoords();
      }
    }

    function displayCoords(p) {
      var decimals = internal.getBoundsPrecisionForDisplay(ext.getBounds().toArray());
      var str = internal.getRoundedCoordString(p, decimals);
      readout.text(str).show();
    }

    function clearCoords() {
      readout.hide();
    }

    function isOverMap(e) {
      return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
    }
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

  utils.inherit(Timer, EventDispatcher);

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

  utils.inherit(Tween, EventDispatcher);

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

  utils.inherit(ElementPosition, EventDispatcher);

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
        obj = utils.extend({direction: wheelDirection, multiplier: multiplier}, mouse.mouseData());
        self.dispatchEvent('mousewheel', obj);
      }
    }
  }

  utils.inherit(MouseWheel, EventDispatcher);


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
      return utils.extend({}, _prevEvt);
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
        _self.dispatchEvent('drag', utils.extend(obj, evt));
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

  utils.inherit(MouseArea, EventDispatcher);

  function MapNav(gui, ext, mouse) {
    var wheel = new MouseWheel(mouse),
        zoomTween = new Tween(Tween.sineInOut),
        boxDrag = false,
        zoomScale = 1.5,
        zoomScaleMultiplier = 1,
        inBtn, outBtn,
        dragStartEvt,
        _fx, _fy; // zoom foci, [0,1]

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
      inBtn = gui.buttons.addButton("#zoom-in-icon").on('click', zoomIn);
      outBtn = gui.buttons.addButton("#zoom-out-icon").on('click', zoomOut);
      ext.on('change', function() {
        inBtn.classed('disabled', ext.scale() >= ext.maxScale());
      });
    }

    gui.on('map_reset', function() {
      ext.home();
    });

    zoomTween.on('change', function(e) {
      ext.zoomToExtent(e.value, _fx, _fy);
    });

    mouse.on('dblclick', function(e) {
      if (disabled()) return;
      zoomByPct(1 + zoomScale * zoomScaleMultiplier, e.x / ext.width(), e.y / ext.height());
    });

    mouse.on('dragstart', function(e) {
      if (disabled()) return;
      if (!internal.layerHasGeometry(gui.model.getActiveLayer().layer)) return;
      // zoomDrag = !!e.metaKey || !!e.ctrlKey; // meta is command on mac, windows key on windows
      boxDrag = !!e.shiftKey;
      if (boxDrag) {
        dragStartEvt = e;
        gui.dispatchEvent('box_drag_start');
      }
    });

    mouse.on('drag', function(e) {
      if (disabled()) return;
      if (boxDrag) {
        gui.dispatchEvent('box_drag', getBoxData(e));
      } else {
        ext.pan(e.dx, e.dy);
      }
    });

    mouse.on('dragend', function(e) {
      var bbox;
      if (disabled()) return;
      if (boxDrag) {
        boxDrag = false;
        gui.dispatchEvent('box_drag_end', getBoxData(e));
      }
    });

    wheel.on('mousewheel', function(e) {
      var tickFraction = 0.11; // 0.15; // fraction of zoom step per wheel event;
      var k = 1 + (tickFraction * e.multiplier * zoomScaleMultiplier),
          delta = e.direction > 0 ? k : 1 / k;
      if (disabled()) return;
      ext.zoomByPct(delta, e.x / ext.width(), e.y / ext.height());
    });

    function swapElements(arr, i, j) {
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }

    function getBoxData(e) {
      var pageBox = [e.pageX, e.pageY, dragStartEvt.pageX, dragStartEvt.pageY];
      var mapBox = [e.x, e.y, dragStartEvt.x, dragStartEvt.y];
      var tmp;
      if (pageBox[0] > pageBox[2]) {
        swapElements(pageBox, 0, 2);
        swapElements(mapBox, 0, 2);
      }
      if (pageBox[1] > pageBox[3]) {
        swapElements(pageBox, 1, 3);
        swapElements(mapBox, 1, 3);
      }
      return {
        map_bbox: mapBox,
        page_bbox: pageBox
      };
    }

    function disabled() {
      return !!gui.options.disableNavigation;
    }

    function zoomIn() {
      if (disabled()) return;
      zoomByPct(1 + zoomScale * zoomScaleMultiplier, 0.5, 0.5);
    }

    function zoomOut() {
      if (disabled()) return;
      zoomByPct(1/(1 + zoomScale * zoomScaleMultiplier), 0.5, 0.5);
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

  function HighlightBox(el) {
    var box = El('div').addClass('zoom-box').appendTo(el),
        show = box.show.bind(box), // original show() function
        stroke = 2;
    box.hide();
    box.show = function(x1, y1, x2, y2) {
      var w = Math.abs(x1 - x2),
          h = Math.abs(y1 - y2);
      box.css({
        top: Math.min(y1, y2),
        left: Math.min(x1, x2),
        width: Math.max(w - stroke * 2, 1),
        height: Math.max(h - stroke * 2, 1)
      });
      show();
    };
    return box;
  }

  function SelectionTool(gui, ext, hit) {
    var popup = gui.container.findChild('.selection-tool-options');
    var box = new HighlightBox('body');
    var _on = false;

    gui.addMode('selection_tool', turnOn, turnOff);

    gui.on('interaction_mode_change', function(e) {
      if (e.mode === 'selection') {
        gui.enterMode('selection_tool');
      } else if (gui.getMode() == 'selection_tool') {
        gui.clearMode();
      }
    });

    gui.on('box_drag', function(e) {
      if (!_on) return;
      var b = e.page_bbox;
      box.show(b[0], b[1], b[2], b[3]);
    });

    gui.on('box_drag_end', function(e) {
      if (!_on) return;
      box.hide();
      var bboxPixels = e.map_bbox;
      var bbox = bboxToCoords(bboxPixels);
      var active = gui.model.getActiveLayer();
      var ids = internal.findShapesIntersectingBBox(bbox, active.layer, active.dataset.arcs);
      if (!ids.length) return;
      hit.addSelectionIds(ids);
    });

    function turnOn() {
      _on = true;
    }

    function bboxToCoords(bbox) {
      var a = ext.translatePixelCoords(bbox[0], bbox[1]);
      var b = ext.translatePixelCoords(bbox[2], bbox[3]);
      return [a[0], b[1], b[0], a[1]];
    }

    function turnOff() {
      reset();
      _on = false;
      if (gui.interaction.getMode() == 'selection') {
        // mode change was not initiated by interactive menu -- turn off interactivity
        gui.interaction.turnOff();
      }
    }

    function reset() {
      popup.hide();
      hit.clearSelection();
    }

    hit.on('change', function(e) {
      if (e.mode != 'selection') return;
      var ids = hit.getSelectionIds();
      if (ids.length > 0) {
        // enter this mode when we're ready to show the selection options
        // (this closes any other active mode, e.g. box_tool)
        gui.enterMode('selection_tool');
        popup.show();
      } else {
        popup.hide();
      }
    });

    new SimpleButton(popup.findChild('.delete-btn')).on('click', function() {
      var cmd = '-filter "' + getFilterExp(hit.getSelectionIds(), true) + '"';
      runCommand(cmd);
      hit.clearSelection();
    });

    new SimpleButton(popup.findChild('.filter-btn')).on('click', function() {
      var cmd = '-filter "' + getFilterExp(hit.getSelectionIds(), false) + '"';
      runCommand(cmd);
      hit.clearSelection();
    });

    new SimpleButton(popup.findChild('.split-btn')).on('click', function() {
      var cmd = '-each "split_id = ' + getFilterExp(hit.getSelectionIds(), false) +
        ' ? \'1\' : \'2\'" -split split_id';
      runCommand(cmd);
      hit.clearSelection();
    });

    new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
      hit.clearSelection();
    });

    function getFilterExp(ids, invert) {
      return JSON.stringify(ids) + '.indexOf(this.id) ' + (invert ? '== -1' : '> -1');
    }

    function runCommand(cmd) {
      if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {});
      reset();
    }
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
    var refresh = null;
    var currId = -1;

    el.addClass('rollover'); // used as a sentinel for the hover function

    nextLink.on('click', toNext);
    prevLink.on('click', toPrev);
    gui.on('popup-needs-refresh', function() {
      if (refresh) refresh();
    });

    self.show = function(id, ids, lyr, pinned) {
      var table = lyr.data; // table can be null (e.g. if layer has no attribute data)
      var editable = pinned && gui.interaction.getMode() == 'data';
      var maxHeight = parent.node().clientHeight - 36;
      currId = id;
      // stash a function for refreshing the current popup when data changes
      // while the popup is being displayed (e.g. while dragging a label)
      refresh = function() {
        var rec = table && (editable ? table.getRecordAt(id) : table.getReadOnlyRecordAt(id)) || {};
        render(content, rec, table, editable);
      };
      refresh();
      if (ids && ids.length > 1) {
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
      currId = -1;
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

    function showNav(id, ids, pinned) {
      var num = ids.indexOf(id) + 1;
      navInfo.text(' ' + num + ' / ' + ids.length + ' ');
      nextLink.css('display', pinned ? 'inline-block' : 'none');
      prevLink.css('display', pinned && ids.length > 2 ? 'inline-block' : 'none');
      tab.show();
    }

    function render(el, rec, table, editable) {
      var tableEl = El('table').addClass('selectable'),
          rows = 0;
      // self.hide(); // clean up if panel is already open
      el.empty(); // clean up if panel is already open
      utils.forEachProperty(rec, function(v, k) {
        var type;
        // missing GeoJSON fields are set to undefined on import; skip these
        if (v !== undefined) {
          type = getFieldType(v, k, table);
          renderRow(tableEl, rec, k, type, editable);
          rows++;
        }
      });

      if (rows > 0) {
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
        el.html(utils.format('<div class="note">This %s is missing attribute data.</div>',
            table && table.getFields().length > 0 ? 'feature': 'layer'));
      }
    }

    function renderRow(table, rec, key, type, editable) {
      var rowHtml = '<td class="field-name">%s</td><td><span class="value">%s</span> </td>';
      var val = rec[key];
      var str = formatInspectorValue(val, type);
      var cell = El('tr')
          .appendTo(table)
          .html(utils.format(rowHtml, key, utils.htmlEscape(str)))
          .findChild('.value');
      setFieldClass(cell, val, type);
      if (editable) {
        editItem(cell, rec, key, type);
      }
    }

    function setFieldClass(el, val, type) {
      var isNum = type ? type == 'number' : utils.isNumber(val);
      var isNully = val === undefined || val === null || val !== val;
      var isEmpty = val === '';
      el.classed('num-field', isNum);
      el.classed('object-field', type == 'object');
      el.classed('null-value', isNully);
      el.classed('empty', isEmpty);
    }

    function editItem(el, rec, key, type) {
      var input = new ClickText2(el),
          strval = formatInspectorValue(rec[key], type),
          parser = getInputParser(type);
      el.parent().addClass('editable-cell');
      el.addClass('colored-text dot-underline');
      input.on('change', function(e) {
        var val2 = parser(input.value()),
            strval2 = formatInspectorValue(val2, type);
        if (strval == strval2) {
          // contents unchanged
        } else if (val2 === null && type != 'object') { // allow null objects
          // invalid value; revert to previous value
          input.value(strval);
        } else {
          // field content has changed
          strval = strval2;
          rec[key] = val2;
          input.value(strval);
          setFieldClass(el, val2, type);
          self.dispatchEvent('update', {field: key, value: val2, id: currId});
        }
      });
    }
  }

  function formatInspectorValue(val, type) {
    var str;
    if (type == 'object') {
      str = val ? JSON.stringify(val) : "";
    } else {
      str = String(val);
    }
    return str;
  }

  var inputParsers = {
    string: function(raw) {
      return raw;
    },
    number: function(raw) {
      var val = Number(raw);
      if (raw == 'NaN') {
        val = NaN;
      } else if (isNaN(val)) {
        val = null;
      }
      return val;
    },
    object: function(raw) {
      var val = null;
      try {
        val = JSON.parse(raw);
      } catch(e) {}
      return val;
    },
    boolean: function(raw) {
      var val = null;
      if (raw == 'true') {
        val = true;
      } else if (raw == 'false') {
        val = false;
      }
      return val;
    },
    multiple: function(raw) {
      var val = Number(raw);
      return isNaN(val) ? raw : val;
    }
  };

  function getInputParser(type) {
    return inputParsers[type || 'multiple'];
  }

  function getFieldType(val, key, table) {
    // if a field has a null value, look at entire column to identify type
    return internal.getValueType(val) || internal.getColumnType(key, table.getRecords());
  }

  function InspectionControl2(gui, hit) {
    var _popup = new Popup(gui, hit.getSwitchTrigger(1), hit.getSwitchTrigger(-1));
    var _self = new EventDispatcher();

    gui.on('interaction_mode_change', function(e) {
      if (e.mode == 'off') {
        inspect(-1); // clear the popup
      }
    });

    _popup.on('update', function(e) {
      _self.dispatchEvent('data_change', e.data); // let map know which field has changed
    });

    hit.on('change', function(e) {
      var ids;
      if (!inspecting()) return;
      ids = e.mode == 'selection' ? null : e.ids;
      inspect(e.id, e.pinned, ids);
    });

    // id: Id of a feature in the active layer, or -1
    function inspect(id, pin, ids) {
      var target = hit.getHitTarget();
      if (id > -1 && inspecting() && target && target.layer) {
        _popup.show(id, ids, target.layer, pin);
      } else {
        _popup.hide();
      }
    }

    // does the attribute inspector appear on rollover
    function inspecting() {
      return gui.interaction && gui.interaction.getMode() != 'off';
    }

    return _self;
  }

  function isMultilineLabel(textNode) {
    return textNode.childNodes.length > 1;
  }

  function toggleTextAlign(textNode, rec) {
    var curr = rec['text-anchor'] || 'middle';
    var value = curr == 'middle' && 'start' || curr == 'start' && 'end' || 'middle';
    updateTextAnchor(value, textNode, rec);
  }

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

    // console.log("anchor() curr:", curr, "xpct:", xpct, "left:", rect.left, "anchorX:", anchorX, "targ:", targ, "dx:", xshift)
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
      applyDelta(rec, 'dx', Math.round(xshift));
    }
  }

  // handle either numeric strings or numbers in fields
  function applyDelta(rec, key, delta) {
    var currVal = rec[key];
    var isString = utils.isString(currVal);
    var newVal = (+currVal + delta) || 0;
    rec[key] = isString ? String(newVal) : newVal;
  }

  function filterLayerByIds(lyr, ids) {
    var shapes;
    if (lyr.shapes) {
      shapes = ids.map(function(id) {
        return lyr.shapes[id];
      });
      return utils.defaults({shapes: shapes, data: null}, lyr);
    }
    return lyr;
  }

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

  function translateDeltaDisplayCoords(dx, dy, ext) {
    var a = ext.translatePixelCoords(0, 0);
    var b = ext.translatePixelCoords(dx, dy);
    return [b[0] - a[0], b[1] - a[1]];
  }

  // TODO: remove this constant, use actual data from dataset CRS
  //       also consider using ellipsoidal formulas when appropriate
  var R = 6378137;
  var D2R = Math.PI / 180;

  // Equirectangular projection
  function degreesToMeters(deg) {
    return deg * D2R * R;
  }

  function distance3D(ax, ay, az, bx, by, bz) {
    var dx = ax - bx,
      dy = ay - by,
      dz = az - bz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function distanceSq(ax, ay, bx, by) {
    var dx = ax - bx,
        dy = ay - by;
    return dx * dx + dy * dy;
  }

  function distance2D(ax, ay, bx, by) {
    var dx = ax - bx,
        dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distanceSq3D(ax, ay, az, bx, by, bz) {
    var dx = ax - bx,
        dy = ay - by,
        dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
  }

  // atan2() makes this function fairly slow, replaced by ~2x faster formula
  function innerAngle2(ax, ay, bx, by, cx, cy) {
    var a1 = Math.atan2(ay - by, ax - bx),
        a2 = Math.atan2(cy - by, cx - bx),
        a3 = Math.abs(a1 - a2);
    if (a3 > Math.PI) {
      a3 = 2 * Math.PI - a3;
    }
    return a3;
  }

  // Return angle abc in range [0, 2PI) or NaN if angle is invalid
  // (e.g. if length of ab or bc is 0)
  /*
  function signedAngle2(ax, ay, bx, by, cx, cy) {
    var a1 = Math.atan2(ay - by, ax - bx),
        a2 = Math.atan2(cy - by, cx - bx),
        a3 = a2 - a1;

    if (ax == bx && ay == by || bx == cx && by == cy) {
      a3 = NaN; // Use NaN for invalid angles
    } else if (a3 >= Math.PI * 2) {
      a3 = 2 * Math.PI - a3;
    } else if (a3 < 0) {
      a3 = a3 + 2 * Math.PI;
    }
    return a3;
  }
  */

  function standardAngle(a) {
    var twoPI = Math.PI * 2;
    while (a < 0) {
      a += twoPI;
    }
    while (a >= twoPI) {
      a -= twoPI;
    }
    return a;
  }

  function signedAngle(ax, ay, bx, by, cx, cy) {
    if (ax == bx && ay == by || bx == cx && by == cy) {
      return NaN; // Use NaN for invalid angles
    }
    var abx = ax - bx,
        aby = ay - by,
        cbx = cx - bx,
        cby = cy - by,
        dotp = abx * cbx + aby * cby,
        crossp = abx * cby - aby * cbx,
        a = Math.atan2(crossp, dotp);
    return standardAngle(a);
  }

  function bearing2D(x1, y1, x2, y2) {
    var val = Math.PI/2 - Math.atan2(y2 - y1, x2 - x1);
    return val > Math.PI ? val - 2 * Math.PI : val;
  }

  // Calc bearing in radians at lng1, lat1
  function bearing(lng1, lat1, lng2, lat2) {
    var D2R = Math.PI / 180;
    lng1 *= D2R;
    lng2 *= D2R;
    lat1 *= D2R;
    lat2 *= D2R;
    var y = Math.sin(lng2-lng1) * Math.cos(lat2),
        x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(lng2-lng1);
    return Math.atan2(y, x);
  }

  // Calc angle of turn from ab to bc, in range [0, 2PI)
  // Receive lat-lng values in degrees
  function signedAngleSph(alng, alat, blng, blat, clng, clat) {
    if (alng == blng && alat == blat || blng == clng && blat == clat) {
      return NaN;
    }
    var b1 = bearing(blng, blat, alng, alat), // calc bearing at b
        b2 = bearing(blng, blat, clng, clat),
        a = Math.PI * 2 + b1 - b2;
    return standardAngle(a);
  }

  /*
  // Convert arrays of lng and lat coords (xsrc, ysrc) into
  // x, y, z coords (meters) on the most common spherical Earth model.
  //
  function convLngLatToSph(xsrc, ysrc, xbuf, ybuf, zbuf) {
    var deg2rad = Math.PI / 180,
        r = R;
    for (var i=0, len=xsrc.length; i<len; i++) {
      var lng = xsrc[i] * deg2rad,
          lat = ysrc[i] * deg2rad,
          cosLat = Math.cos(lat);
      xbuf[i] = Math.cos(lng) * cosLat * r;
      ybuf[i] = Math.sin(lng) * cosLat * r;
      zbuf[i] = Math.sin(lat) * r;
    }
  }
  */

  // Convert arrays of lng and lat coords (xsrc, ysrc) into
  // x, y, z coords (meters) on the most common spherical Earth model.
  //
  function convLngLatToSph(xsrc, ysrc, xbuf, ybuf, zbuf) {
    var p = [];
    for (var i=0, len=xsrc.length; i<len; i++) {
      lngLatToXYZ(xsrc[i], ysrc[i], p);
      xbuf[i] = p[0];
      ybuf[i] = p[1];
      zbuf[i] = p[2];
    }
  }

  function xyzToLngLat(x, y, z, p) {
    var d = distance3D(0, 0, 0, x, y, z); // normalize
    var lat = Math.asin(z / d) / D2R;
    var lng = Math.atan2(y / d, x / d) / D2R;
    p[0] = lng;
    p[1] = lat;
  }

  function lngLatToXYZ(lng, lat, p) {
    var cosLat;
    lng *= D2R;
    lat *= D2R;
    cosLat = Math.cos(lat);
    p[0] = Math.cos(lng) * cosLat * R;
    p[1] = Math.sin(lng) * cosLat * R;
    p[2] = Math.sin(lat) * R;
  }

  // Haversine formula (well conditioned at small distances)
  function sphericalDistance(lam1, phi1, lam2, phi2) {
    var dlam = lam2 - lam1,
        dphi = phi2 - phi1,
        a = Math.sin(dphi / 2) * Math.sin(dphi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dlam / 2) * Math.sin(dlam / 2),
        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return c;
  }

  // Receive: coords in decimal degrees;
  // Return: distance in meters on spherical earth
  function greatCircleDistance(lng1, lat1, lng2, lat2) {
    var D2R = Math.PI / 180,
        dist = sphericalDistance(lng1 * D2R, lat1 * D2R, lng2 * D2R, lat2 * D2R);
    return dist * R;
  }

  // TODO: make this safe for small angles
  function innerAngle(ax, ay, bx, by, cx, cy) {
    var ab = distance2D(ax, ay, bx, by),
        bc = distance2D(bx, by, cx, cy),
        theta, dotp;
    if (ab === 0 || bc === 0) {
      theta = 0;
    } else {
      dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / (ab * bc);
      if (dotp >= 1 - 1e-14) {
        theta = 0;
      } else if (dotp <= -1 + 1e-14) {
        theta = Math.PI;
      } else {
        theta = Math.acos(dotp); // consider using other formula at small dp
      }
    }
    return theta;
  }

  function innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var ab = distance3D(ax, ay, az, bx, by, bz),
        bc = distance3D(bx, by, bz, cx, cy, cz),
        theta, dotp;
    if (ab === 0 || bc === 0) {
      theta = 0;
    } else {
      dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
      if (dotp >= 1) {
        theta = 0;
      } else if (dotp <= -1) {
        theta = Math.PI;
      } else {
        theta = Math.acos(dotp); // consider using other formula at small dp
      }
    }
    return theta;
  }

  function triangleArea(ax, ay, bx, by, cx, cy) {
    var area = Math.abs(((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2);
    return area;
  }

  function detSq(ax, ay, bx, by, cx, cy) {
    var det = ax * by - ax * cy + bx * cy - bx * ay + cx * ay - cx * by;
    return det * det;
  }

  function cosine(ax, ay, bx, by, cx, cy) {
    var den = distance2D(ax, ay, bx, by) * distance2D(bx, by, cx, cy),
        cos = 0;
    if (den > 0) {
      cos = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / den;
      if (cos > 1) cos = 1; // handle fp rounding error
      else if (cos < -1) cos = -1;
    }
    return cos;
  }

  function cosine3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var den = distance3D(ax, ay, az, bx, by, bz) * distance3D(bx, by, bz, cx, cy, cz),
        cos = 0;
    if (den > 0) {
      cos = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / den;
      if (cos > 1) cos = 1; // handle fp rounding error
      else if (cos < -1) cos = -1;
    }
    return cos;
  }

  function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var area = 0.5 * Math.sqrt(detSq(ax, ay, bx, by, cx, cy) +
      detSq(ax, az, bx, bz, cx, cz) + detSq(ay, az, by, bz, cy, cz));
    return area;
  }

  // Given point B and segment AC, return the squared distance from B to the
  // nearest point on AC
  // Receive the squared length of segments AB, BC, AC
  // TODO: analyze rounding error. Returns 0 for these coordinates:
  //    P: [2, 3 - 1e-8]  AB: [[1, 3], [3, 3]]
  //
  function apexDistSq(ab2, bc2, ac2) {
    var dist2;
    if (ac2 === 0) {
      dist2 = ab2;
    } else if (ab2 >= bc2 + ac2) {
      dist2 = bc2;
    } else if (bc2 >= ab2 + ac2) {
      dist2 = ab2;
    } else {
      var dval = (ab2 + ac2 - bc2);
      dist2 = ab2 -  dval * dval / ac2  * 0.25;
    }
    if (dist2 < 0) {
      dist2 = 0;
    }
    return dist2;
  }

  function pointSegDistSq(ax, ay, bx, by, cx, cy) {
    var ab2 = distanceSq(ax, ay, bx, by),
        ac2 = distanceSq(ax, ay, cx, cy),
        bc2 = distanceSq(bx, by, cx, cy);
    return apexDistSq(ab2, ac2, bc2);
  }

  function pointSegDistSq3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var ab2 = distanceSq3D(ax, ay, az, bx, by, bz),
        ac2 = distanceSq3D(ax, ay, az, cx, cy, cz),
        bc2 = distanceSq3D(bx, by, bz, cx, cy, cz);
    return apexDistSq(ab2, ac2, bc2);
  }

  // Apparently better conditioned for some inputs than pointSegDistSq()
  //
  function pointSegDistSq2(px, py, ax, ay, bx, by) {
    var ab2 = distanceSq(ax, ay, bx, by);
    var t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ab2;
    if (ab2 === 0) return distanceSq(px, py, ax, ay);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return distanceSq(px, py, ax + t * (bx - ax), ay + t * (by - ay));
  }


  // internal.reversePathCoords = function(arr, start, len) {
  //   var i = start,
  //       j = start + len - 1,
  //       tmp;
  //   while (i < j) {
  //     tmp = arr[i];
  //     arr[i] = arr[j];
  //     arr[j] = tmp;
  //     i++;
  //     j--;
  //   }
  // };

  // merge B into A
  // function mergeBounds(a, b) {
  //   if (b[0] < a[0]) a[0] = b[0];
  //   if (b[1] < a[1]) a[1] = b[1];
  //   if (b[2] > a[2]) a[2] = b[2];
  //   if (b[3] > a[3]) a[3] = b[3];
  // }

  function containsBounds(a, b) {
    return a[0] <= b[0] && a[2] >= b[2] && a[1] <= b[1] && a[3] >= b[3];
  }

  // function boundsArea(b) {
  //   return (b[2] - b[0]) * (b[3] - b[1]);
  // }

  var Geom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    R: R,
    D2R: D2R,
    degreesToMeters: degreesToMeters,
    distance3D: distance3D,
    distanceSq: distanceSq,
    distance2D: distance2D,
    distanceSq3D: distanceSq3D,
    innerAngle2: innerAngle2,
    standardAngle: standardAngle,
    signedAngle: signedAngle,
    bearing2D: bearing2D,
    bearing: bearing,
    signedAngleSph: signedAngleSph,
    convLngLatToSph: convLngLatToSph,
    xyzToLngLat: xyzToLngLat,
    lngLatToXYZ: lngLatToXYZ,
    sphericalDistance: sphericalDistance,
    greatCircleDistance: greatCircleDistance,
    innerAngle: innerAngle,
    innerAngle3D: innerAngle3D,
    triangleArea: triangleArea,
    cosine: cosine,
    cosine3D: cosine3D,
    triangleArea3D: triangleArea3D,
    pointSegDistSq: pointSegDistSq,
    pointSegDistSq3D: pointSegDistSq3D,
    pointSegDistSq2: pointSegDistSq2,
    containsBounds: containsBounds
  });

  var Buffer = require('buffer').Buffer; // works with browserify

  var context = createContext(); // command context (persist for the current command cycle)

  function runningInBrowser() {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined';
  }

  function getStateVar(key) {
    return context[key];
  }

  function setStateVar(key, val) {
    context[key] = val;
  }

  function createContext() {
    return {
      DEBUG: false,
      QUIET: false,
      VERBOSE: false,
      defs: {},
      input_files: []
    };
  }

  // Install a new set of context variables, clear them when an async callback is called.
  // @cb callback function to wrap
  // returns wrapped callback function
  function createAsyncContext(cb) {
    context = createContext();
    return function() {
      cb.apply(null, utils$1.toArray(arguments));
      // clear context after cb(), so output/errors can be handled in current context
      context = createContext();
    };
  }

  // Save the current context, restore it when an async callback is called
  // @cb callback function to wrap
  // returns wrapped callback function
  function preserveContext(cb) {
    var ctx = context;
    return function() {
      context = ctx;
      cb.apply(null, utils$1.toArray(arguments));
    };
  }

  var LOGGING = false;
  var STDOUT = false; // use stdout for status messages

  // These three functions can be reset by GUI using setLoggingFunctions();
  var _error = function() {
    var msg = utils$1.toArray(arguments).join(' ');
    throw new Error(msg);
  };

  var _stop = function() {
    throw new UserError$1(formatLogArgs(arguments));
  };

  var _message = function() {
    logArgs(arguments);
  };

  function enableLogging() {
    LOGGING = true;
  }

  function loggingEnabled() {
    return !!LOGGING;
  }

  // Handle an unexpected condition (internal error)
  function error$1() {
    _error.apply(null, utils$1.toArray(arguments));
  }

  // Handle an error caused by invalid input or misuse of API
  function stop$1 () {
    _stop.apply(null, utils$1.toArray(arguments));
  }

  // Print a status message
  function message$1() {
    _message.apply(null, messageArgs(arguments));
  }

  // A way for the GUI to replace the CLI logging functions
  function setLoggingFunctions(message, error, stop) {
    _message = message;
    _error = error;
    _stop = stop;
  }


  // print a message to stdout
  function print() {
    STDOUT = true; // tell logArgs() to print to stdout, not stderr
    message$1.apply(null, arguments);
    STDOUT = false;
  }

  function verbose() {
    if (getStateVar('VERBOSE')) {
      message$1.apply(null, messageArgs(arguments));
    }
  }

  function debug() {
    if (getStateVar('DEBUG')) {
      logArgs(arguments);
    }
  }

  function printError(err) {
    var msg;
    if (!LOGGING) return;
    if (utils$1.isString(err)) {
      err = new UserError$1(err);
    }
    if (err.name == 'UserError') {
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

  function UserError$1(msg) {
    var err = new Error(msg);
    err.name = 'UserError';
    return err;
  }

  // Format an array of (preferably short) strings in columns for console logging.
  function formatStringsAsGrid(arr) {
    // TODO: variable column width
    var longest = arr.reduce(function(len, str) {
          return Math.max(len, str.length);
        }, 0),
        colWidth = longest + 2,
        perLine = Math.floor(80 / colWidth) || 1;
    return arr.reduce(function(memo, name, i) {
      var col = i % perLine;
      if (i > 0 && col === 0) memo += '\n';
      if (col < perLine - 1) { // right-pad all but rightmost column
        name = utils$1.rpad(name, colWidth - 2, ' ');
      }
      return memo +  '  ' + name;
    }, '');
  }

  // expose so GUI can use it
  function formatLogArgs(args) {
    return utils$1.toArray(args).join(' ');
  }

  function messageArgs(args) {
    var arr = utils$1.toArray(args);
    var cmd = getStateVar('current_command');
    if (cmd && cmd != 'help') {
      arr.unshift('[' + cmd + ']');
    }
    return arr;
  }

  function logArgs(args) {
    if (LOGGING && !getStateVar('QUIET') && utils$1.isArrayLike(args)) {
      (!STDOUT && console.error || console.log).call(console, formatLogArgs(args));
    }
  }

  var uniqCount = 0;
  function getUniqueName(prefix) {
    return (prefix || "__id_") + (++uniqCount);
  }

  function isFunction(obj) {
    return typeof obj == 'function';
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

  // NaN -> true
  function isNumber(obj) {
    // return toString.call(obj) == '[object Number]'; // ie8 breaks?
    return obj != null && obj.constructor == Number;
  }

  function isInteger(obj) {
    return isNumber(obj) && ((obj | 0) === obj);
  }

  function isString(obj) {
    return obj != null && obj.toString === String.prototype.toString;
    // TODO: replace w/ something better.
  }

  function isBoolean(obj) {
    return obj === true || obj === false;
  }

  // Convert an array-like object to an Array, or make a copy if @obj is an Array
  function toArray(obj) {
    var arr;
    if (!isArrayLike(obj)) error$1("toArray() requires an array-like object");
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
    if (obj.length === 0) return true;
    if (obj.length > 0) return true;
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
    return String(s).replace(/[&<>"'\/]/g, function(s) {
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
      error$1("Usage: merge(destArray, srcArray);");
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
    error$1("Expected Array or String argument");
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
    if (!isArrayLike(arr)) error$1 ("sum() expects an array, received:", arr);
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

  function uniq(src) {
    var index = {};
    return src.reduce(function(memo, el) {
      if (el in index === false) {
        index[el] = true;
        memo.push(el);
      }
      return memo;
    }, []);
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

  function formatNumber(num, decimals, nullStr, showPos) {
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
  //
  function genericSort(arr, asc) {
    var compare = getGenericComparator(asc);
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
      if (idx < 0 || idx >= len) error$1("Out-of-bounds array idx");
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
    asc = asc !== false;
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
    if (!arr.length || rank < 1 || rank > arr.length) error$1("[findValueByRank()] invalid input");

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

  //
  //
  function findMedian(arr) {
    var n = arr.length,
        rank = Math.floor(n / 2) + 1,
        median = findValueByRank(arr, rank);
    if ((n & 1) == 0) {
      median = (median + findValueByRank(arr, rank - 1)) / 2;
    }
    return median;
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
        isInt = type == 'd' || type == 'i',
        isFloat = type == 'f',
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
      str = numToStr(val, isInt ? 0 : decimals);
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
    var codeRxp = /%([\',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;
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
        error$1("[format()] Data does not match format string; format:", fmt, "data:", arguments);
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
      return Buffer.allocUnsafe ? Buffer.allocUnsafe(arg) : new Buffer(arg);
    } else {
      // check allocUnsafe to make sure Buffer.from() will accept strings (it didn't before Node v5.10)
      return Buffer.from && Buffer.allocUnsafe ? Buffer.from(arg, arg2) : new Buffer(arg, arg2);
    }
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
    if (src === dest && j > i) error$1 ("copy error");
    var inc = 1,
        offs = 0;
    if (rev) {
      inc = -1;
      offs = n - 1;
    }
    for (var k=0; k<n; k++, offs += inc) {
      dest[k + j] = src[i + offs];
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

  // Similar to isFinite() but does not convert strings or other types
  function isFiniteNumber(val) {
    return val === 0 || !!val && val.constructor == Number && val !== Infinity && val !== -Infinity;
  }

  function isNonNegNumber(val) {
    return val === 0 || val > 0 && val.constructor == Number;
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
      stop$1(format("Invalid percentage: %s", str));
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

  // Remove comma separators from strings
  // TODO: accept European-style numbers?
  function cleanNumericString(str) {
    return (str.indexOf(',') > 0) ? str.replace(/,([0-9]{3})/g, '$1') : str;
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
    var str = String(raw).trim();
    var parsed = str ? Number(cleanNumericString(str)) : NaN;
    return isNaN(parsed) ? null : parsed;
  }

  function trimQuotes(raw) {
    var len = raw.length, first, last;
    if (len >= 2) {
      first = raw.charAt(0);
      last = raw.charAt(len-1);
      if (first == '"' && last == '"' || first == "'" && last == "'") {
        return raw.substr(1, len-2);
      }
    }
    return raw;
  }

  function Transform() {
    this.mx = this.my = 1;
    this.bx = this.by = 0;
  }

  Transform.prototype.isNull = function() {
    return !this.mx || !this.my || isNaN(this.bx) || isNaN(this.by);
  };

  Transform.prototype.invert = function() {
    var inv = new Transform();
    inv.mx = 1 / this.mx;
    inv.my = 1 / this.my;
    //inv.bx = -this.bx * inv.mx;
    //inv.by = -this.by * inv.my;
    inv.bx = -this.bx / this.mx;
    inv.by = -this.by / this.my;
    return inv;
  };


  Transform.prototype.transform = function(x, y, xy) {
    xy = xy || [];
    xy[0] = x * this.mx + this.bx;
    xy[1] = y * this.my + this.by;
    return xy;
  };

  Transform.prototype.toString = function() {
    return JSON.stringify(Object.assign({}, this));
  };

  function Bounds$1() {
    if (arguments.length > 0) {
      this.setBounds.apply(this, arguments);
    }
  }

  Bounds$1.prototype.toString = function() {
    return JSON.stringify({
      xmin: this.xmin,
      xmax: this.xmax,
      ymin: this.ymin,
      ymax: this.ymax
    });
  };

  Bounds$1.prototype.toArray = function() {
    return this.hasBounds() ? [this.xmin, this.ymin, this.xmax, this.ymax] : [];
  };

  Bounds$1.prototype.hasBounds = function() {
    return this.xmin <= this.xmax && this.ymin <= this.ymax;
  };

  Bounds$1.prototype.sameBounds =
  Bounds$1.prototype.equals = function(bb) {
    return bb && this.xmin === bb.xmin && this.xmax === bb.xmax &&
      this.ymin === bb.ymin && this.ymax === bb.ymax;
  };

  Bounds$1.prototype.width = function() {
    return (this.xmax - this.xmin) || 0;
  };

  Bounds$1.prototype.height = function() {
    return (this.ymax - this.ymin) || 0;
  };

  Bounds$1.prototype.area = function() {
    return this.width() * this.height() || 0;
  };

  Bounds$1.prototype.empty = function() {
    this.xmin = this.ymin = this.xmax = this.ymax = void 0;
    return this;
  };

  Bounds$1.prototype.setBounds = function(a, b, c, d) {
    if (arguments.length == 1) {
      // assume first arg is a Bounds or array
      if (utils$1.isArrayLike(a)) {
        b = a[1];
        c = a[2];
        d = a[3];
        a = a[0];
      } else {
        b = a.ymin;
        c = a.xmax;
        d = a.ymax;
        a = a.xmin;
      }
    }

    this.xmin = a;
    this.ymin = b;
    this.xmax = c;
    this.ymax = d;
    if (a > c || b > d) this.update();
    // error("Bounds#setBounds() min/max reversed:", a, b, c, d);
    return this;
  };


  Bounds$1.prototype.centerX = function() {
    var x = (this.xmin + this.xmax) * 0.5;
    return x;
  };

  Bounds$1.prototype.centerY = function() {
    var y = (this.ymax + this.ymin) * 0.5;
    return y;
  };

  Bounds$1.prototype.containsPoint = function(x, y) {
    if (x >= this.xmin && x <= this.xmax &&
      y <= this.ymax && y >= this.ymin) {
      return true;
    }
    return false;
  };

  // intended to speed up slightly bubble symbol detection; could use intersects() instead
  // TODO: fix false positive where circle is just outside a corner of the box
  Bounds$1.prototype.containsBufferedPoint =
  Bounds$1.prototype.containsCircle = function(x, y, buf) {
    if ( x + buf > this.xmin && x - buf < this.xmax ) {
      if ( y - buf < this.ymax && y + buf > this.ymin ) {
        return true;
      }
    }
    return false;
  };

  Bounds$1.prototype.intersects = function(bb) {
    if (bb.xmin <= this.xmax && bb.xmax >= this.xmin &&
      bb.ymax >= this.ymin && bb.ymin <= this.ymax) {
      return true;
    }
    return false;
  };

  Bounds$1.prototype.contains = function(bb) {
    if (bb.xmin >= this.xmin && bb.ymax <= this.ymax &&
      bb.xmax <= this.xmax && bb.ymin >= this.ymin) {
      return true;
    }
    return false;
  };

  Bounds$1.prototype.shift = function(x, y) {
    this.setBounds(this.xmin + x,
      this.ymin + y, this.xmax + x, this.ymax + y);
  };

  Bounds$1.prototype.padBounds = function(a, b, c, d) {
    this.xmin -= a;
    this.ymin -= b;
    this.xmax += c;
    this.ymax += d;
  };

  // Rescale the bounding box by a fraction. TODO: implement focus.
  // @param {number} pct Fraction of original extents
  // @param {number} pctY Optional amount to scale Y
  //
  Bounds$1.prototype.scale = function(pct, pctY) { /*, focusX, focusY*/
    var halfWidth = (this.xmax - this.xmin) * 0.5;
    var halfHeight = (this.ymax - this.ymin) * 0.5;
    var kx = pct - 1;
    var ky = pctY === undefined ? kx : pctY - 1;
    this.xmin -= halfWidth * kx;
    this.ymin -= halfHeight * ky;
    this.xmax += halfWidth * kx;
    this.ymax += halfHeight * ky;
  };

  // Return a bounding box with the same extent as this one.
  Bounds$1.prototype.cloneBounds = // alias so child classes can override clone()
  Bounds$1.prototype.clone = function() {
    return new Bounds$1(this.xmin, this.ymin, this.xmax, this.ymax);
  };

  Bounds$1.prototype.clearBounds = function() {
    this.setBounds(new Bounds$1());
  };

  Bounds$1.prototype.mergePoint = function(x, y) {
    if (this.xmin === void 0) {
      this.setBounds(x, y, x, y);
    } else {
      // this works even if x,y are NaN
      if (x < this.xmin)  this.xmin = x;
      else if (x > this.xmax)  this.xmax = x;

      if (y < this.ymin) this.ymin = y;
      else if (y > this.ymax) this.ymax = y;
    }
  };

  // expands either x or y dimension to match @aspect (width/height ratio)
  // @focusX, @focusY (optional): expansion focus, as a fraction of width and height
  Bounds$1.prototype.fillOut = function(aspect, focusX, focusY) {
    if (arguments.length < 3) {
      focusX = 0.5;
      focusY = 0.5;
    }
    var w = this.width(),
        h = this.height(),
        currAspect = w / h,
        pad;
    if (isNaN(aspect) || aspect <= 0) {
      // error condition; don't pad
    } else if (currAspect < aspect) { // fill out x dimension
      pad = h * aspect - w;
      this.xmin -= (1 - focusX) * pad;
      this.xmax += focusX * pad;
    } else {
      pad = w / aspect - h;
      this.ymin -= (1 - focusY) * pad;
      this.ymax += focusY * pad;
    }
    return this;
  };

  Bounds$1.prototype.update = function() {
    var tmp;
    if (this.xmin > this.xmax) {
      tmp = this.xmin;
      this.xmin = this.xmax;
      this.xmax = tmp;
    }
    if (this.ymin > this.ymax) {
      tmp = this.ymin;
      this.ymin = this.ymax;
      this.ymax = tmp;
    }
  };

  Bounds$1.prototype.transform = function(t) {
    this.xmin = this.xmin * t.mx + t.bx;
    this.xmax = this.xmax * t.mx + t.bx;
    this.ymin = this.ymin * t.my + t.by;
    this.ymax = this.ymax * t.my + t.by;
    this.update();
    return this;
  };

  // Returns a Transform object for mapping this onto Bounds @b2
  // @flipY (optional) Flip y-axis coords, for converting to/from pixel coords
  //
  Bounds$1.prototype.getTransform = function(b2, flipY) {
    var t = new Transform();
    t.mx = b2.width() / this.width() || 1; // TODO: better handling of 0 w,h
    t.bx = b2.xmin - t.mx * this.xmin;
    if (flipY) {
      t.my = -b2.height() / this.height() || 1;
      t.by = b2.ymax - t.my * this.ymin;
    } else {
      t.my = b2.height() / this.height() || 1;
      t.by = b2.ymin - t.my * this.ymin;
    }
    return t;
  };

  Bounds$1.prototype.mergeCircle = function(x, y, r) {
    if (r < 0) r = -r;
    this.mergeBounds([x - r, y - r, x + r, y + r]);
  };

  Bounds$1.prototype.mergeBounds = function(bb) {
    var a, b, c, d;
    if (bb instanceof Bounds$1) {
      a = bb.xmin;
      b = bb.ymin;
      c = bb.xmax;
      d = bb.ymax;
    } else if (arguments.length == 4) {
      a = arguments[0];
      b = arguments[1];
      c = arguments[2];
      d = arguments[3];
    } else if (bb.length == 4) {
      // assume array: [xmin, ymin, xmax, ymax]
      a = bb[0];
      b = bb[1];
      c = bb[2];
      d = bb[3];
    } else {
      error$1("Bounds#mergeBounds() invalid argument:", bb);
    }

    if (this.xmin === void 0) {
      this.setBounds(a, b, c, d);
    } else {
      if (a < this.xmin) this.xmin = a;
      if (b < this.ymin) this.ymin = b;
      if (c > this.xmax) this.xmax = c;
      if (d > this.ymax) this.ymax = d;
    }
    return this;
  };

  function pathIsClosed(ids, arcs) {
    var firstArc = ids[0];
    var lastArc = ids[ids.length - 1];
    var p1 = arcs.getVertex(firstArc, 0);
    var p2 = arcs.getVertex(lastArc, -1);
    var closed = p1.x === p2.x && p1.y === p2.y;
    return closed;
  }

  function getPointToPathDistance(px, py, ids, arcs) {
    return getPointToPathInfo(px, py, ids, arcs).distance;
  }

  function getPointToPathInfo(px, py, ids, arcs) {
    var iter = arcs.getShapeIter(ids);
    var pPathSq = Infinity;
    var ax, ay, bx, by, axmin, aymin, bxmin, bymin, pabSq;
    if (iter.hasNext()) {
      ax = axmin = bxmin = iter.x;
      ay = aymin = bymin = iter.y;
    }
    while (iter.hasNext()) {
      bx = iter.x;
      by = iter.y;
      pabSq = pointSegDistSq2(px, py, ax, ay, bx, by);
      if (pabSq < pPathSq) {
        pPathSq = pabSq;
        axmin = ax;
        aymin = ay;
        bxmin = bx;
        bymin = by;
      }
      ax = bx;
      ay = by;
    }
    if (pPathSq == Infinity) return {distance: Infinity};
    return {
      segment: [[axmin, aymin], [bxmin, bymin]],
      distance: Math.sqrt(pPathSq)
    };
  }


  // Return unsigned distance of a point to the nearest point on a polygon or polyline path
  //
  function getPointToShapeDistance(x, y, shp, arcs) {
    var minDist = (shp || []).reduce(function(minDist, ids) {
      var pathDist = getPointToPathDistance(x, y, ids, arcs);
      return Math.min(minDist, pathDist);
    }, Infinity);
    return minDist;
  }

  // @ids array of arc ids
  // @arcs ArcCollection
  function getAvgPathXY(ids, arcs) {
    var iter = arcs.getShapeIter(ids);
    if (!iter.hasNext()) return null;
    var x0 = iter.x,
        y0 = iter.y,
        count = 0,
        sumX = 0,
        sumY = 0;
    while (iter.hasNext()) {
      count++;
      sumX += iter.x;
      sumY += iter.y;
    }
    if (count === 0 || iter.x !== x0 || iter.y !== y0) {
      sumX += x0;
      sumY += y0;
      count++;
    }
    return {
      x: sumX / count,
      y: sumY / count
    };
  }

  // Return path with the largest (area) bounding box
  // @shp array of array of arc ids
  // @arcs ArcCollection
  function getMaxPath(shp, arcs) {
    var maxArea = 0;
    return (shp || []).reduce(function(maxPath, path) {
      var bbArea = arcs.getSimpleShapeBounds(path).area();
      if (bbArea > maxArea) {
        maxArea = bbArea;
        maxPath = path;
      }
      return maxPath;
    }, null);
  }

  function countVerticesInPath(ids, arcs) {
    var iter = arcs.getShapeIter(ids),
        count = 0;
    while (iter.hasNext()) count++;
    return count;
  }

  function getPathBounds(points) {
    var bounds = new Bounds$1();
    for (var i=0, n=points.length; i<n; i++) {
      bounds.mergePoint(points[i][0], points[i][1]);
    }
    return bounds;
  }

  var calcPathLen;
  calcPathLen = (function() {
    var len, calcLen;
    function addSegLen(i, j, xx, yy) {
      len += calcLen(xx[i], yy[i], xx[j], yy[j]);
    }
    // @spherical (optional bool) calculate great circle length in meters
    return function(path, arcs, spherical) {
      if (spherical && arcs.isPlanar()) {
        error$1("Expected lat-long coordinates");
      }
      calcLen = spherical ? greatCircleDistance : distance2D;
      len = 0;
      for (var i=0, n=path.length; i<n; i++) {
        arcs.forEachArcSegment(path[i], addSegLen);
      }
      return len;
    };
  }());

  var PathGeom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    pathIsClosed: pathIsClosed,
    getPointToPathDistance: getPointToPathDistance,
    getPointToPathInfo: getPointToPathInfo,
    getPointToShapeDistance: getPointToShapeDistance,
    getAvgPathXY: getAvgPathXY,
    getMaxPath: getMaxPath,
    countVerticesInPath: countVerticesInPath,
    getPathBounds: getPathBounds,
    get calcPathLen () { return calcPathLen; }
  });

  // Get the centroid of the largest ring of a polygon
  // TODO: Include holes in the calculation
  // TODO: Add option to find centroid of all rings, not just the largest
  function getShapeCentroid(shp, arcs) {
    var maxPath = getMaxPath(shp, arcs);
    return maxPath ? getPathCentroid(maxPath, arcs) : null;
  }

  function getPathCentroid(ids, arcs) {
    var iter = arcs.getShapeIter(ids),
        sum = 0,
        sumX = 0,
        sumY = 0,
        dx, dy, ax, ay, bx, by, tmp, area;
    if (!iter.hasNext()) return null;
    // reduce effect of fp errors by shifting shape origin to 0,0 (issue #304)
    ax = 0;
    ay = 0;
    dx = -iter.x;
    dy = -iter.y;
    while (iter.hasNext()) {
      bx = ax;
      by = ay;
      ax = iter.x + dx;
      ay = iter.y + dy;
      tmp = bx * ay - by * ax;
      sum += tmp;
      sumX += tmp * (bx + ax);
      sumY += tmp * (by + ay);
    }
    area = sum / 2;
    if (area === 0) {
      return getAvgPathXY(ids, arcs);
    } else return {
      x: sumX / (6 * area) - dx,
      y: sumY / (6 * area) - dy
    };
  }

  var PolygonCentroid = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getShapeCentroid: getShapeCentroid,
    getPathCentroid: getPathCentroid
  });

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

  // Utility functions for working with ArcCollection and arrays of arc ids.

  // Return average segment length (with simplification)
  function getAvgSegment(arcs) {
    var sum = 0;
    var count = arcs.forEachSegment(function(i, j, xx, yy) {
      var dx = xx[i] - xx[j],
          dy = yy[i] - yy[j];
      sum += Math.sqrt(dx * dx + dy * dy);
    });
    return sum / count || 0;
  }

  // Return average magnitudes of dx, dy (with simplification)
  function getAvgSegment2(arcs) {
    var dx = 0, dy = 0;
    var count = arcs.forEachSegment(function(i, j, xx, yy) {
      dx += Math.abs(xx[i] - xx[j]);
      dy += Math.abs(yy[i] - yy[j]);
    });
    return [dx / count || 0, dy / count || 0];
  }

  /*
  this.getAvgSegmentSph2 = function() {
    var sumx = 0, sumy = 0;
    var count = this.forEachSegment(function(i, j, xx, yy) {
      var lat1 = yy[i],
          lat2 = yy[j];
      sumy += geom.degreesToMeters(Math.abs(lat1 - lat2));
      sumx += geom.degreesToMeters(Math.abs(xx[i] - xx[j]) *
          Math.cos((lat1 + lat2) * 0.5 * geom.D2R);
    });
    return [sumx / count || 0, sumy / count || 0];
  };
  */

  function getDirectedArcPresenceTest(shapes, n) {
    var flags = new Uint8Array(n);
    forEachArcId(shapes, function(id) {
      var absId = absArcId(id);
      if (absId < n === false) error$1('index error');
      flags[absId] |= id < 0 ? 2 : 1;
    });
    return function(arcId) {
      var absId = absArcId(arcId);
      return arcId < 0 ? (flags[absId] & 2) == 2 : (flags[absId] & 1) == 1;
    };
  }

  function getArcPresenceTest(shapes, arcs) {
    var counts = new Uint8Array(arcs.size());
    countArcsInShapes(shapes, counts);
    return function(id) {
      if (id < 0) id = ~id;
      return counts[id] > 0;
    };
  }

  // @counts A typed array for accumulating count of each abs arc id
  //   (assume it won't overflow)
  function countArcsInShapes(shapes, counts) {
    traversePaths(shapes, null, function(obj) {
      var arcs = obj.arcs,
          id;
      for (var i=0; i<arcs.length; i++) {
        id = arcs[i];
        if (id < 0) id = ~id;
        counts[id]++;
      }
    });
  }

  function getPathBounds$1(shapes, arcs) {
    var bounds = new Bounds$1();
    forEachArcId(shapes, function(id) {
      arcs.mergeArcBounds(id, bounds);
    });
    return bounds;
  }

  // Returns subset of shapes in @shapes that contain one or more arcs in @arcIds
  function findShapesByArcId(shapes, arcIds, numArcs) {
    var index = numArcs ? new Uint8Array(numArcs) : [],
        found = [];
    arcIds.forEach(function(id) {
      index[absArcId(id)] = 1;
    });
    shapes.forEach(function(shp, shpId) {
      var isHit = false;
      forEachArcId(shp || [], function(id) {
        isHit = isHit || index[absArcId(id)] == 1;
      });
      if (isHit) {
        found.push(shpId);
      }
    });
    return found;
  }

  function reversePath(ids) {
    ids.reverse();
    for (var i=0, n=ids.length; i<n; i++) {
      ids[i] = ~ids[i];
    }
    return ids;
  }

  function clampIntervalByPct(z, pct) {
    if (pct <= 0) z = Infinity;
    else if (pct >= 1) z = 0;
    return z;
  }

  // Return id of the vertex between @start and @end with the highest
  // threshold that is less than @zlim, or -1 if none
  //
  function findNextRemovableVertex(zz, zlim, start, end) {
    var tmp, jz = 0, j = -1, z;
    if (start > end) {
      tmp = start;
      start = end;
      end = tmp;
    }
    for (var i=start+1; i<end; i++) {
      z = zz[i];
      if (z < zlim && z > jz) {
        j = i;
        jz = z;
      }
    }
    return j;
  }

  // Visit each arc id in a path, shape or array of shapes
  // Use non-undefined return values of callback @cb as replacements.
  function forEachArcId(arr, cb) {
    var item;
    for (var i=0; i<arr.length; i++) {
      item = arr[i];
      if (item instanceof Array) {
        forEachArcId(item, cb);
      } else if (utils$1.isInteger(item)) {
        var val = cb(item);
        if (val !== void 0) {
          arr[i] = val;
        }
      } else if (item) {
        error$1("Non-integer arc id in:", arr);
      }
    }
  }

  function forEachSegmentInShape(shape, arcs, cb) {
    for (var i=0, n=shape ? shape.length : 0; i<n; i++) {
      forEachSegmentInPath(shape[i], arcs, cb);
    }
  }

  function forEachSegmentInPath(ids, arcs, cb) {
    for (var i=0, n=ids.length; i<n; i++) {
      arcs.forEachArcSegment(ids[i], cb);
    }
  }

  function traversePaths(shapes, cbArc, cbPart, cbShape) {
    var segId = 0;
    shapes.forEach(function(parts, shapeId) {
      if (!parts || parts.length === 0) return; // null shape
      var arcIds, arcId;
      if (cbShape) {
        cbShape(shapeId);
      }
      for (var i=0, m=parts.length; i<m; i++) {
        arcIds = parts[i];
        if (cbPart) {
          cbPart({
            i: i,
            shapeId: shapeId,
            shape: parts,
            arcs: arcIds
          });
        }

        if (cbArc) {
          for (var j=0, n=arcIds.length; j<n; j++, segId++) {
            arcId = arcIds[j];
            cbArc({
              i: j,
              shapeId: shapeId,
              partId: i,
              arcId: arcId,
              segId: segId
            });
          }
        }
      }
    });
  }

  function arcHasLength(id, coords) {
    var iter = coords.getArcIter(id), x, y;
    if (iter.hasNext()) {
      x = iter.x;
      y = iter.y;
      while (iter.hasNext()) {
        if (iter.x != x || iter.y != y) return true;
      }
    }
    return false;
  }

  function filterEmptyArcs(shape, coords) {
    if (!shape) return null;
    var shape2 = [];
    shape.forEach(function(ids) {
      var path = [];
      for (var i=0; i<ids.length; i++) {
        if (arcHasLength(ids[i], coords)) {
          path.push(ids[i]);
        }
      }
      if (path.length > 0) shape2.push(path);
    });
    return shape2.length > 0 ? shape2 : null;
  }

  // Return an array of information about each part/ring in a polygon or polyline shape
  function getPathMetadata(shape, arcs, type) {
    var data = [],
        ids;
    for (var i=0, n=shape && shape.length; i<n; i++) {
      ids = shape[i];
      data.push({
        ids: ids,
        area: type == 'polygon' ? geom$1.getPlanarPathArea(ids, arcs) : 0,
        bounds: arcs.getSimpleShapeBounds(ids)
      });
    }
    return data;
  }

  function quantizeArcs(arcs, quanta) {
    // Snap coordinates to a grid of @quanta locations on both axes
    // This may snap nearby points to the same coordinates.
    // Consider a cleanup pass to remove dupes, make sure collapsed arcs are
    //   removed on export.
    //
    var bb1 = arcs.getBounds(),
        bb2 = new Bounds$1(0, 0, quanta-1, quanta-1),
        fw = bb1.getTransform(bb2),
        inv = fw.invert();

    arcs.transformPoints(function(x, y) {
      var p = fw.transform(x, y);
      return inv.transform(Math.round(p[0]), Math.round(p[1]));
    });
  }

  // A compactness measure designed for testing electoral districts for gerrymandering.
  // Returns value in [0-1] range. 1 = perfect circle, 0 = collapsed polygon
  function calcPolsbyPopperCompactness(area, perimeter) {
    if (perimeter <= 0) return 0;
    return Math.abs(area) * Math.PI * 4 / (perimeter * perimeter);
  }

  // Larger values (less severe penalty) fthan Polsby Popper
  function calcSchwartzbergCompactness(area, perimeter) {
    if (perimeter <= 0) return 0;
    return 2 * Math.PI * Math.sqrt(Math.abs(area) / Math.PI) / perimeter;
  }

  // Returns: 1 if CW, -1 if CCW, 0 if collapsed
  function getPathWinding(ids, arcs) {
    var area = getPathArea(ids, arcs);
    return area > 0 && 1 || area < 0 && -1 || 0;
  }

  function getShapeArea(shp, arcs) {
    // return (arcs.isPlanar() ? geom.getPlanarShapeArea : geom.getSphericalShapeArea)(shp, arcs);
    return (shp || []).reduce(function(area, ids) {
      return area + getPathArea(ids, arcs);
    }, 0);
  }

  function getPlanarShapeArea(shp, arcs) {
    return (shp || []).reduce(function(area, ids) {
      return area + getPlanarPathArea(ids, arcs);
    }, 0);
  }

  function getSphericalShapeArea(shp, arcs) {
    if (arcs.isPlanar()) {
      error$1("[getSphericalShapeArea()] Function requires decimal degree coordinates");
    }
    return (shp || []).reduce(function(area, ids) {
      return area + getSphericalPathArea(ids, arcs);
    }, 0);
  }

  // Return true if point is inside or on boundary of a shape
  //
  function testPointInPolygon(x, y, shp, arcs) {
    var isIn = false,
        isOn = false;
    if (shp) {
      shp.forEach(function(ids) {
        var inRing = testPointInRing(x, y, ids, arcs);
        if (inRing == 1) {
          isIn = !isIn;
        } else if (inRing == -1) {
          isOn = true;
        }
      });
    }
    return isOn || isIn;
  }

  function getYIntercept(x, ax, ay, bx, by) {
    return ay + (x - ax) * (by - ay) / (bx - ax);
  }

  function getXIntercept(y, ax, ay, bx, by) {
    return ax + (y - ay) * (bx - ax) / (by - ay);
  }

  // Test if point (x, y) is inside, outside or on the boundary of a polygon ring
  // Return 0: outside; 1: inside; -1: on boundary
  //
  function testPointInRing(x, y, ids, arcs) {
    /*
    // arcs.getSimpleShapeBounds() doesn't apply simplification, can't use here
    //// wait, why not? simplifcation shoudn't expand bounds, so this test makes sense
    if (!arcs.getSimpleShapeBounds(ids).containsPoint(x, y)) {
      return false;
    }
    */
    var isIn = false,
        isOn = false;
    forEachSegmentInPath(ids, arcs, function(a, b, xx, yy) {
      var result = testRayIntersection(x, y, xx[a], yy[a], xx[b], yy[b]);
      if (result == 1) {
        isIn = !isIn;
      } else if (isNaN(result)) {
        isOn = true;
      }
    });
    return isOn ? -1 : (isIn ? 1 : 0);
  }

  // test if a vertical ray originating at (x, y) intersects a segment
  // returns 1 if intersection, 0 if no intersection, NaN if point touches segment
  // (Special rules apply to endpoint intersections, to support point-in-polygon testing.)
  function testRayIntersection(x, y, ax, ay, bx, by) {
    var val = getRayIntersection(x, y, ax, ay, bx, by);
    if (val != val) {
      return NaN;
    }
    return val == -Infinity ? 0 : 1;
  }

  function getRayIntersection(x, y, ax, ay, bx, by) {
    var hit = -Infinity, // default: no hit
        yInt;

    // case: p is entirely above, left or right of segment
    if (x < ax && x < bx || x > ax && x > bx || y > ay && y > by) {
        // no intersection
    }
    // case: px aligned with a segment vertex
    else if (x === ax || x === bx) {
      // case: vertical segment or collapsed segment
      if (x === ax && x === bx) {
        // p is on segment
        if (y == ay || y == by || y > ay != y > by) {
          hit = NaN;
        }
        // else: no hit
      }
      // case: px equal to ax (only)
      else if (x === ax) {
        if (y === ay) {
          hit = NaN;
        } else if (bx < ax && y < ay) {
          // only score hit if px aligned to rightmost endpoint
          hit = ay;
        }
      }
      // case: px equal to bx (only)
      else {
        if (y === by) {
          hit = NaN;
        } else if (ax < bx && y < by) {
          // only score hit if px aligned to rightmost endpoint
          hit = by;
        }
      }
    // case: px is between endpoints
    } else {
      yInt = getYIntercept(x, ax, ay, bx, by);
      if (yInt > y) {
        hit = yInt;
      } else if (yInt == y) {
        hit = NaN;
      }
    }
    return hit;
  }

  function getPathArea(ids, arcs) {
    return (arcs.isPlanar() ? getPlanarPathArea : getSphericalPathArea)(ids, arcs);
  }

  function getSphericalPathArea(ids, arcs) {
    var iter = arcs.getShapeIter(ids),
        sum = 0,
        started = false,
        deg2rad = Math.PI / 180,
        x, y, xp, yp;
    while (iter.hasNext()) {
      x = iter.x * deg2rad;
      y = Math.sin(iter.y * deg2rad);
      if (started) {
        sum += (x - xp) * (2 + y + yp);
      } else {
        started = true;
      }
      xp = x;
      yp = y;
    }
    return sum / 2 * 6378137 * 6378137;
  }

  // Get path area from an array of [x, y] points
  // TODO: consider removing duplication with getPathArea(), e.g. by
  //   wrapping points in an iterator.
  //
  function getPlanarPathArea2(points) {
    var sum = 0,
        ax, ay, bx, by, dx, dy, p;
    for (var i=0, n=points.length; i<n; i++) {
      p = points[i];
      if (i === 0) {
        ax = 0;
        ay = 0;
        dx = -p[0];
        dy = -p[1];
      } else {
        ax = p[0] + dx;
        ay = p[1] + dy;
        sum += ax * by - bx * ay;
      }
      bx = ax;
      by = ay;
    }
    return sum / 2;
  }

  function getPlanarPathArea(ids, arcs) {
    var iter = arcs.getShapeIter(ids),
        sum = 0,
        ax, ay, bx, by, dx, dy;
    if (iter.hasNext()) {
      ax = 0;
      ay = 0;
      dx = -iter.x;
      dy = -iter.y;
      while (iter.hasNext()) {
        bx = ax;
        by = ay;
        ax = iter.x + dx;
        ay = iter.y + dy;
        sum += ax * by - bx * ay;
      }
    }
    return sum / 2;
  }

  function getPathPerimeter(ids, arcs) {
    return (arcs.isPlanar() ? getPlanarPathPerimeter : getSphericalPathPerimeter)(ids, arcs);
  }

  function getShapePerimeter(shp, arcs) {
    return (shp || []).reduce(function(len, ids) {
      return len + getPathPerimeter(ids, arcs);
    }, 0);
  }

  function getSphericalShapePerimeter(shp, arcs) {
    if (arcs.isPlanar()) {
      error$1("[getSphericalShapePerimeter()] Function requires decimal degree coordinates");
    }
    return (shp || []).reduce(function(len, ids) {
      return len + getSphericalPathPerimeter(ids, arcs);
    }, 0);
  }

  function getPlanarPathPerimeter(ids, arcs) {
    return calcPathLen(ids, arcs, false);
  }

  function getSphericalPathPerimeter(ids, arcs) {
    return calcPathLen(ids, arcs, true);
  }

  var PolygonGeom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    calcPolsbyPopperCompactness: calcPolsbyPopperCompactness,
    calcSchwartzbergCompactness: calcSchwartzbergCompactness,
    getPathWinding: getPathWinding,
    getShapeArea: getShapeArea,
    getPlanarShapeArea: getPlanarShapeArea,
    getSphericalShapeArea: getSphericalShapeArea,
    testPointInPolygon: testPointInPolygon,
    testPointInRing: testPointInRing,
    testRayIntersection: testRayIntersection,
    getRayIntersection: getRayIntersection,
    getPathArea: getPathArea,
    getSphericalPathArea: getSphericalPathArea,
    getPlanarPathArea2: getPlanarPathArea2,
    getPlanarPathArea: getPlanarPathArea,
    getPathPerimeter: getPathPerimeter,
    getShapePerimeter: getShapePerimeter,
    getSphericalShapePerimeter: getSphericalShapePerimeter,
    getPlanarPathPerimeter: getPlanarPathPerimeter,
    getSphericalPathPerimeter: getSphericalPathPerimeter
  });

  // Returns an interval for snapping together coordinates that be co-incident bug
  // have diverged because of floating point rounding errors. Intended to be small
  // enought not not to snap points that should be distinct.
  // This is not a robust method... e.g. some formulas for some inputs may produce
  // errors that are larger than this interval.
  // @coords: Array of relevant coordinates (e.g. bbox coordinates of vertex coordinates
  //   of two intersecting segments).
  //
  function getHighPrecisionSnapInterval(coords) {
    var maxCoord = Math.max.apply(null, coords.map(Math.abs));
    return maxCoord * 1e-14;
  }

  function snapCoords(arcs, threshold) {
      var avgDist = getAvgSegment(arcs),
          autoSnapDist = avgDist * 0.0025,
          snapDist = autoSnapDist;

    if (threshold > 0) {
      snapDist = threshold;
      message$1(utils$1.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
    }
    var snapCount = snapCoordsByInterval(arcs, snapDist);
    if (snapCount > 0) arcs.dedupCoords();
    message$1(utils$1.format("Snapped %s point%s", snapCount, utils$1.pluralSuffix(snapCount)));
  }

  // Snap together points within a small threshold
  //
  function snapCoordsByInterval(arcs, snapDist) {
    var snapCount = 0,
        data = arcs.getVertexData(),
        ids;

    if (snapDist > 0) {
      // Get sorted coordinate ids
      // Consider: speed up sorting -- try bucket sort as first pass.
      //
      ids = sortCoordinateIds(data.xx);
      for (var i=0, n=ids.length; i<n; i++) {
        snapCount += snapPoint(i, snapDist, ids, data.xx, data.yy);
      }
    }
    return snapCount;

    function snapPoint(i, limit, ids, xx, yy) {
      var j = i,
          n = ids.length,
          x = xx[ids[i]],
          y = yy[ids[i]],
          snaps = 0,
          id2, dx, dy;

      while (++j < n) {
        id2 = ids[j];
        dx = xx[id2] - x;
        if (dx > limit) break;
        dy = yy[id2] - y;
        if (dx === 0 && dy === 0 || dx * dx + dy * dy > limit * limit) continue;
        xx[id2] = x;
        yy[id2] = y;
        snaps++;
      }
      return snaps;
    }
  }

  function sortCoordinateIds(a) {
    var n = a.length,
        ids = new Uint32Array(n);
    for (var i=0; i<n; i++) {
      ids[i] = i;
    }
    quicksortIds(a, ids, 0, ids.length-1);
    return ids;
  }

  /*
  // Returns array of array ids, in ascending order.
  // @a array of numbers
  //
  utils.sortCoordinateIds = function(a) {
    return utils.bucketSortIds(a);
  };

  // This speeds up sorting of large datasets (~2x faster for 1e7 values)
  // worth the additional code?
  utils.bucketSortIds = function(a, n) {
    var len = a.length,
        ids = new Uint32Array(len),
        bounds = utils.getArrayBounds(a),
        buckets = Math.ceil(n > 0 ? n : len / 10),
        counts = new Uint32Array(buckets),
        offsets = new Uint32Array(buckets),
        i, j, offs, count;

    // get bucket sizes
    for (i=0; i<len; i++) {
      j = bucketId(a[i], bounds.min, bounds.max, buckets);
      counts[j]++;
    }

    // convert counts to offsets
    offs = 0;
    for (i=0; i<buckets; i++) {
      offsets[i] = offs;
      offs += counts[i];
    }

    // assign ids to buckets
    for (i=0; i<len; i++) {
      j = bucketId(a[i], bounds.min, bounds.max, buckets);
      offs = offsets[j]++;
      ids[offs] = i;
    }

    // sort each bucket with quicksort
    for (i = 0; i<buckets; i++) {
      count = counts[i];
      if (count > 1) {
        offs = offsets[i] - count;
        utils.quicksortIds(a, ids, offs, offs + count - 1);
      }
    }
    return ids;

    function bucketId(val, min, max, buckets) {
      var id = (buckets * (val - min) / (max - min)) | 0;
      return id < buckets ? id : buckets - 1;
    }
  };
  */

  function quicksortIds(a, ids, lo, hi) {
    if (hi - lo > 24) {
      var pivot = a[ids[lo + hi >> 1]],
          i = lo,
          j = hi,
          tmp;
      while (i <= j) {
        while (a[ids[i]] < pivot) i++;
        while (a[ids[j]] > pivot) j--;
        if (i <= j) {
          tmp = ids[i];
          ids[i] = ids[j];
          ids[j] = tmp;
          i++;
          j--;
        }
      }
      if (j > lo) quicksortIds(a, ids, lo, j);
      if (i < hi) quicksortIds(a, ids, i, hi);
    } else {
      insertionSortIds(a, ids, lo, hi);
    }
  }

  function insertionSortIds(arr, ids, start, end) {
    var id, i, j;
    for (j = start + 1; j <= end; j++) {
      id = ids[j];
      for (i = j - 1; i >= start && arr[id] < arr[ids[i]]; i--) {
        ids[i+1] = ids[i];
      }
      ids[i+1] = id;
    }
  }

  // Find the intersection between two 2D segments
  // Returns 0, 1 or 2 [x, y] locations as null, [x, y], or [x1, y1, x2, y2]
  // Special cases:
  // Endpoint-to-endpoint touches are not treated as intersections.
  // If the segments touch at a T-intersection, it is treated as an intersection.
  // If the segments are collinear and partially overlapping, each subsumed endpoint
  //    is counted as an intersection (there will be either one or two)
  //
  function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy, epsArg) {
    // Use a small tolerance interval, so collinear segments and T-intersections
    // are detected (floating point rounding often causes exact functions to fail)
    var eps = epsArg >= 0 ? epsArg :
        getHighPrecisionSnapInterval([ax, ay, bx, by, cx, cy, dx, dy]);
    var epsSq = eps * eps;
    var touches, cross;
    // Detect 0, 1 or 2 'touch' intersections, where a vertex of one segment
    // is very close to the other segment's linear portion.
    // One touch indicates either a T-intersection or two overlapping collinear
    // segments that share an endpoint. Two touches indicates overlapping
    // collinear segments that do not share an endpoint.
    touches = findPointSegTouches(epsSq, ax, ay, bx, by, cx, cy, dx, dy);
    // if (touches) return touches;
    // Ignore endpoint-only intersections
    if (!touches && testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy)) {
      return null;
    }
    // Detect cross intersection
    cross = findCrossIntersection(ax, ay, bx, by, cx, cy, dx, dy, eps);
    if (cross && touches) {
      // Removed this call -- using multiple snap/cut passes seems more
      // effective for repairing real-world datasets.
      // return reconcileCrossAndTouches(cross, touches, eps);
    }
    return touches || cross || null;
  }

  function reconcileCrossAndTouches(cross, touches, eps) {
    var hits;
    eps = eps || 0;
    if (touches.length > 2) {
      // two touches and a cross: cross should be between the touches, intersection at touches
      hits = touches;
    } else if (distance2D(cross[0], cross[1], touches[0], touches[1]) <= eps) {
      // cross is very close to touch point (e.g. small overshoot): intersection at touch point
      hits = touches;
    } else {
      // one touch and one cross: use both points
      hits = touches.concat(cross);
    }
    return hits;
  }


  // Find the intersection point of two segments that cross each other,
  // or return null if the segments do not cross.
  // Assumes endpoint intersections have already been detected
  function findCrossIntersection(ax, ay, bx, by, cx, cy, dx, dy, eps) {
    if (!segmentHit(ax, ay, bx, by, cx, cy, dx, dy)) return null;
    var den = determinant2D(bx - ax, by - ay, dx - cx, dy - cy);
    var m = orient2D(cx, cy, dx, dy, ax, ay) / den;
    var p = [ax + m * (bx - ax), ay + m * (by - ay)];
    if (Math.abs(den) < 1e-18) {
      // assume that collinear and near-collinear segment intersections have been
      // accounted for already.
      // TODO: is this a valid assumption?
      return null;
    }

    // Snap p to a vertex if very close to one
    // This avoids tiny segments caused by T-intersection overshoots and prevents
    //   pathfinder errors related to f-p rounding.
    // (NOTE: this may no longer be needed, since T-intersections are now detected
    // first)
    if (eps > 0) {
      snapIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy, eps);
    }
    // Clamp point to x range and y range of both segments
    // (This may occur due to fp rounding, if one segment is vertical or horizontal)
    clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy);
    return p;
  }

  function testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy) {
    return distanceSq(ax, ay, cx, cy) <= epsSq || distanceSq(ax, ay, dx, dy) <= epsSq ||
      distanceSq(bx, by, cx, cy) <= epsSq || distanceSq(bx, by, dx, dy) <= epsSq;
  }

  function findPointSegTouches(epsSq, ax, ay, bx, by, cx, cy, dx, dy) {
    var touches = [];
    collectPointSegTouch(touches, epsSq, ax, ay, cx, cy, dx, dy);
    collectPointSegTouch(touches, epsSq, bx, by, cx, cy, dx, dy);
    collectPointSegTouch(touches, epsSq, cx, cy, ax, ay, bx, by);
    collectPointSegTouch(touches, epsSq, dx, dy, ax, ay, bx, by);
    if (touches.length === 0) return null;
    if (touches.length > 4) {
      // Geometrically, more than two touch intersections can not occur.
      // Is it possible that fp rounding or a bug might result in >2 touches?
      debug('Intersection detection error');
    }
    return touches;
  }

  function collectPointSegTouch(arr, epsSq, px, py, ax, ay, bx, by) {
    // The original point-seg distance function caused errors in test data.
    // (probably because of large rounding errors with some inputs).
    // var pab = pointSegDistSq(px, py, ax, ay, bx, by);
    var pab = pointSegDistSq2(px, py, ax, ay, bx, by);
    if (pab > epsSq) return; // point is too far from segment to touch
    var pa = distanceSq(ax, ay, px, py);
    var pb = distanceSq(bx, by, px, py);
    if (pa <= epsSq || pb <= epsSq) return; // ignore endpoint hits
    arr.push(px, py); // T intersection at P and AB
  }


  // Used by mapshaper-undershoots.js
  // TODO: make more robust, make sure result is compatible with segmentIntersection()
  // (rounding errors currently must be handled downstream)
  function findClosestPointOnSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax,
        dy = by - ay,
        dotp = (px - ax) * dx + (py - ay) * dy,
        abSq = dx * dx + dy * dy,
        k = abSq === 0 ? -1 : dotp / abSq,
        eps = 0.1, // 1e-6, // snap to endpoint
        p;
    if (k <= eps) {
      p = [ax, ay];
    } else if (k >= 1 - eps) {
      p = [bx, by];
    } else {
      p = [ax + k * dx, ay + k * dy];
    }
    return p;
  }

  function snapIfCloser(p, minDist, x, y, x2, y2) {
    var dist = distance2D(x, y, x2, y2);
    if (dist < minDist) {
      minDist = dist;
      p[0] = x2;
      p[1] = y2;
    }
    return minDist;
  }

  function snapIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy, eps) {
    var x = p[0],
        y = p[1],
        snapDist = eps;
    snapDist = snapIfCloser(p, snapDist, x, y, ax, ay);
    snapDist = snapIfCloser(p, snapDist, x, y, bx, by);
    snapDist = snapIfCloser(p, snapDist, x, y, cx, cy);
    snapDist = snapIfCloser(p, snapDist, x, y, dx, dy);
  }

  function clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy) {
    // Handle intersection points that fall outside the x-y range of either
    // segment by snapping to nearest endpoint coordinate. Out-of-range
    // intersection points can be caused by floating point rounding errors
    // when a segment is vertical or horizontal. This has caused problems when
    // repeatedly applying bbox clipping along the same segment
    var x = p[0],
        y = p[1];
    // assumes that segment ranges intersect
    x = clampToCloseRange(x, ax, bx);
    x = clampToCloseRange(x, cx, dx);
    y = clampToCloseRange(y, ay, by);
    y = clampToCloseRange(y, cy, dy);
    p[0] = x;
    p[1] = y;
  }

  // a: coordinate of point
  // b: endpoint coordinate of segment
  // c: other endpoint of segment
  function outsideRange(a, b, c) {
    var out;
    if (b < c) {
      out = a < b || a > c;
    } else if (b > c) {
      out = a > b || a < c;
    } else {
      out = a != b;
    }
    return out;
  }

  function clampToCloseRange(a, b, c) {
    var lim;
    if (outsideRange(a, b, c)) {
      lim = Math.abs(a - b) < Math.abs(a - c) ? b : c;
      if (Math.abs(a - lim) > 1e-15) {
        debug("[clampToCloseRange()] large clamping interval", a, b, c);
      }
      a = lim;
    }
    return a;
  }

  // Determinant of matrix
  //  | a  b |
  //  | c  d |
  function determinant2D(a, b, c, d) {
    return a * d - b * c;
  }

  // returns a positive value if the points a, b, and c are arranged in
  // counterclockwise order, a negative value if the points are in clockwise
  // order, and zero if the points are collinear.
  // Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
  function orient2D(ax, ay, bx, by, cx, cy) {
    return determinant2D(ax - cx, ay - cy, bx - cx, by - cy);
  }

  // Source: Sedgewick, _Algorithms in C_
  // (Other functions were tried that were more sensitive to floating point errors
  //  than this function)
  function segmentHit(ax, ay, bx, by, cx, cy, dx, dy) {
    return orient2D(ax, ay, bx, by, cx, cy) *
        orient2D(ax, ay, bx, by, dx, dy) <= 0 &&
        orient2D(cx, cy, dx, dy, ax, ay) *
        orient2D(cx, cy, dx, dy, bx, by) <= 0;
  }

  var SegmentGeom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    segmentIntersection: segmentIntersection,
    findClosestPointOnSeg: findClosestPointOnSeg,
    orient2D: orient2D,
    segmentHit: segmentHit
  });

  var geom$1 = Object.assign({}, Geom, PolygonGeom, PathGeom, SegmentGeom, PolygonCentroid);

  // Find ids of vertices with identical coordinates to x,y in an ArcCollection
  // Caveat: does not exclude vertices that are not visible at the
  //   current level of simplification.
  function findVertexIds(x, y, arcs) {
    var data = arcs.getVertexData(),
        xx = data.xx,
        yy = data.yy,
        ids = [];
    for (var i=0, n=xx.length; i<n; i++) {
      if (xx[i] == x && yy[i] == y) ids.push(i);
    }
    return ids;
  }

  function getVertexCoords(i, arcs) {
    var data = arcs.getVertexData();
    return [data.xx[i], data.yy[i]];
  }

  function vertexIsArcEnd(idx, arcs) {
    // Test whether the vertex at index @idx is the endpoint of an arc
    var data = arcs.getVertexData(),
        ii = data.ii,
        nn = data.nn;
    for (var j=0, n=ii.length; j<n; j++) {
      if (idx === ii[j] + nn[j] - 1) return true;
    }
    return false;
  }

  function vertexIsArcStart(idx, arcs) {
    var ii = arcs.getVertexData().ii;
    for (var j=0, n=ii.length; j<n; j++) {
      if (idx === ii[j]) return true;
    }
    return false;
  }

  function setVertexCoords(x, y, i, arcs) {
    var data = arcs.getVertexData();
    data.xx[i] = x;
    data.yy[i] = y;
  }

  function findNearestVertex(x, y, shp, arcs, spherical) {
    var calcLen = spherical ? geom$1.greatCircleDistance : geom$1.distance2D,
        minLen = Infinity,
        minX, minY, dist, iter;
    for (var i=0; i<shp.length; i++) {
      iter = arcs.getShapeIter(shp[i]);
      while (iter.hasNext()) {
        dist = calcLen(x, y, iter.x, iter.y);
        if (dist < minLen) {
          minLen = dist;
          minX = iter.x;
          minY = iter.y;
        }
      }
    }
    return minLen < Infinity ? {x: minX, y: minY} : null;
  }

  function SymbolDragging2(gui, ext, hit) {
    // var targetTextNode; // text node currently being dragged
    var dragging = false;
    var activeRecord;
    var activeId = -1;
    var self = new EventDispatcher();
    var activeVertexIds = null; // for vertex dragging

    initDragging();

    return self;

    function labelEditingEnabled() {
      return gui.interaction && gui.interaction.getMode() == 'labels' ? true : false;
    }

    function locationEditingEnabled() {
      return gui.interaction && gui.interaction.getMode() == 'location' ? true : false;
    }

    function vertexEditingEnabled() {
      return gui.interaction && gui.interaction.getMode() == 'vertices' ? true : false;
    }

    // update symbol by setting attributes
    function updateSymbol(node, d) {
      var a = d['text-anchor'];
      if (a) node.setAttribute('text-anchor', a);
      setMultilineAttribute(node, 'dx', d.dx || 0);
      node.setAttribute('y', d.dy || 0);
    }

    // update symbol by re-rendering it
    function updateSymbol2(node, d, id) {
      var o = internal.svg.importStyledLabel(d); // TODO: symbol support
      var activeLayer = hit.getHitTarget().layer;
      var xy = activeLayer.shapes[id][0];
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      var node2;
      o.properties.transform = getSvgSymbolTransform(xy, ext);
      o.properties['data-id'] = id;
      // o.properties['class'] = 'selected';
      g.innerHTML = internal.svg.stringify(o);
      node2 = g.firstChild;
      node.parentNode.replaceChild(node2, node);
      gui.dispatchEvent('popup-needs-refresh');
      return node2;
    }

    function initDragging() {
      var downEvt;
      var eventPriority = 1;

      // inspector and label editing aren't fully synced - stop editing if inspector opens
      // gui.on('inspector_on', function() {
      //   stopEditing();
      // });

      gui.on('interaction_mode_change', function(e) {
        if (e.mode != 'labels') {
          stopDragging();
        }
      });

      // down event on svg
      // a: off text
      //    -> stop editing
      // b: on text
      //    1: not editing -> nop
      //    2: on selected text -> start dragging
      //    3: on other text -> stop dragging, select new text

      hit.on('dragstart', function(e) {
        if (labelEditingEnabled()) {
          onLabelDragStart(e);
        } else if (locationEditingEnabled()) {
          onLocationDragStart(e);
        } else if (vertexEditingEnabled()) {
          onVertexDragStart(e);
        }
      });

      hit.on('drag', function(e) {
        if (labelEditingEnabled()) {
          onLabelDrag(e);
        } else if (locationEditingEnabled()) {
          onLocationDrag(e);
        } else if (vertexEditingEnabled()) {
          onVertexDrag(e);
        }
      });

      hit.on('dragend', function(e) {
        if (locationEditingEnabled()) {
          onLocationDragEnd(e);
          stopDragging();
        } else if (labelEditingEnabled()) {
          stopDragging();
        } else if (vertexEditingEnabled()) {
          onVertexDragEnd(e);
          stopDragging();
        }
      });

      hit.on('click', function(e) {
        if (labelEditingEnabled()) {
          onLabelClick(e);
        }
      });

      function onLocationDragStart(e) {
        if (e.id >= 0) {
          dragging = true;
          triggerGlobalEvent('symbol_dragstart', e);
        }
      }

      function onVertexDragStart(e) {
        if (e.id >= 0) {
          dragging = true;
        }
      }

      function onLocationDrag(e) {
        var lyr = hit.getHitTarget().layer;
        var p = getPointCoordsById(e.id, hit.getHitTarget().layer);
        if (!p) return;
        var diff = translateDeltaDisplayCoords(e.dx, e.dy, ext);
        p[0] += diff[0];
        p[1] += diff[1];
        self.dispatchEvent('location_change'); // signal map to redraw
        triggerGlobalEvent('symbol_drag', e);
      }

      function onVertexDrag(e) {
        var target = hit.getHitTarget();
        var p = ext.translatePixelCoords(e.x, e.y);
        if (!activeVertexIds) {
          var p2 = findNearestVertex(p[0], p[1], target.layer.shapes[e.id], target.arcs);
          activeVertexIds = findVertexIds(p2.x, p2.y, target.arcs);
        }
        if (!activeVertexIds) return; // ignore error condition
        if (gui.keyboard.shiftIsPressed()) {
          snapEndpointCoords(p, target.arcs);
        }
        activeVertexIds.forEach(function(idx) {
          setVertexCoords(p[0], p[1], idx, target.arcs);
        });
        self.dispatchEvent('location_change'); // signal map to redraw
      }

      function snapEndpointCoords(p, arcs) {
        var p2, p3, dx, dy;
        activeVertexIds.forEach(function(idx) {
          if (vertexIsArcStart(idx, arcs)) {
            p2 = getVertexCoords(idx + 1, arcs);
          } else if (vertexIsArcEnd(idx, arcs)) {
            p2 = getVertexCoords(idx - 1, arcs);
          }
        });
        if (!p2) return;
        dx = p2[0] - p[0];
        dy = p2[1] - p[1];
        if (Math.abs(dx) > Math.abs(dy)) {
          p[1] = p2[1]; // snap y coord
        } else {
          p[0] = p2[0];
        }
      }

      function onLocationDragEnd(e) {
        triggerGlobalEvent('symbol_dragend', e);
      }

      function onVertexDragEnd(e) {
        // kludge to get dataset to recalculate internal bounding boxes
        hit.getHitTarget().arcs.transformPoints(function() {});
        activeVertexIds = null;
      }

      function onLabelClick(e) {
        var textNode = getTextTarget3(e);
        var rec = getLabelRecordById(e.id);
        if (textNode && rec && isMultilineLabel(textNode)) {
          toggleTextAlign(textNode, rec);
          updateSymbol2(textNode, rec, e.id);
          // e.stopPropagation(); // prevent pin/unpin on popup
        }
      }

      function triggerGlobalEvent(type, e) {
        if (e.id >= 0) {
          // fire event to signal external editor that symbol coords have changed
          gui.dispatchEvent(type, {FID: e.id, layer_name: hit.getHitTarget().layer.name});
        }
      }

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

      function onLabelDragStart(e) {
        var textNode = getTextTarget3(e);
        var table = hit.getTargetDataTable();
        if (!textNode || !table) return;
        activeId = e.id;
        activeRecord = getLabelRecordById(activeId);
        dragging = true;
        downEvt = e;
      }

      function onLabelDrag(e) {
        var scale = ext.getSymbolScale() || 1;
        var textNode;
        if (!dragging) return;
        if (e.id != activeId) {
          error("Mismatched hit ids:", e.id, activeId);
        }
        applyDelta(activeRecord, 'dx', e.dx / scale);
        applyDelta(activeRecord, 'dy', e.dy / scale);
        textNode = getTextTarget3(e);
        if (!isMultilineLabel(textNode)) {
          // update anchor position of single-line labels based on label position
          // relative to anchor point, for better placement when eventual display font is
          // different from mapshaper's font.
          autoUpdateTextAnchor(textNode, activeRecord, getDisplayCoordsById(activeId, hit.getHitTarget().layer, ext));
        }
        // updateSymbol(targetTextNode, activeRecord);
        updateSymbol2(textNode, activeRecord, activeId);
      }

      function getSymbolNodeById(id, parent) {
        // TODO: optimize selector
        var sel = '[data-id="' + id + '"]';
        return parent.querySelector(sel);
      }


      function getTextTarget3(e) {
        if (e.id > -1 === false || !e.container) return null;
        return getSymbolNodeById(e.id, e.container);
      }

      function getTextTarget2(e) {
        var el = e && e.targetSymbol || null;
        if (el && el.tagName == 'tspan') {
          el = el.parentNode;
        }
        return el && el.tagName == 'text' ? el : null;
      }

      function getTextTarget(e) {
        var el = e.target;
        if (el.tagName == 'tspan') {
          el = el.parentNode;
        }
        return el.tagName == 'text' ? el : null;
      }

      // svg.addEventListener('mousedown', function(e) {
      //   var textTarget = getTextTarget(e);
      //   downEvt = e;
      //   if (!textTarget) {
      //     stopEditing();
      //   } else if (!editing) {
      //     // nop
      //   } else if (textTarget == targetTextNode) {
      //     startDragging();
      //   } else {
      //     startDragging();
      //     editTextNode(textTarget);
      //   }
      // });

      // up event on svg
      // a: currently dragging text
      //   -> stop dragging
      // b: clicked on a text feature
      //   -> start editing it


      // svg.addEventListener('mouseup', function(e) {
      //   var textTarget = getTextTarget(e);
      //   var isClick = isClickEvent(e, downEvt);
      //   if (isClick && textTarget && textTarget == targetTextNode &&
      //       activeRecord && isMultilineLabel(targetTextNode)) {
      //     toggleTextAlign(targetTextNode, activeRecord);
      //     updateSymbol();
      //   }
      //   if (dragging) {
      //     stopDragging();
      //    } else if (isClick && textTarget) {
      //     editTextNode(textTarget);
      //   }
      // });

      // block dbl-click navigation when editing
      // mouse.on('dblclick', function(e) {
      //   if (editing) e.stopPropagation();
      // }, null, eventPriority);

      // mouse.on('dragstart', function(e) {
      //   onLabelDrag(e);
      // }, null, eventPriority);

      // mouse.on('drag', function(e) {
      //   var scale = ext.getSymbolScale() || 1;
      //   onLabelDrag(e);
      //   if (!dragging || !activeRecord) return;
      //   applyDelta(activeRecord, 'dx', e.dx / scale);
      //   applyDelta(activeRecord, 'dy', e.dy / scale);
      //   if (!isMultilineLabel(targetTextNode)) {
      //     // update anchor position of single-line labels based on label position
      //     // relative to anchor point, for better placement when eventual display font is
      //     // different from mapshaper's font.
      //     updateTextAnchor(targetTextNode, activeRecord);
      //   }
      //   // updateSymbol(targetTextNode, activeRecord);
      //   targetTextNode = updateSymbol2(targetTextNode, activeRecord, activeId);
      // }, null, eventPriority);

      // mouse.on('dragend', function(e) {
      //   onLabelDrag(e);
      //   stopDragging();
      // }, null, eventPriority);


      // function onLabelDrag(e) {
      //   if (dragging) {
      //     e.stopPropagation();
      //   }
      // }
    }

    function stopDragging() {
      dragging = false;
      activeId = -1;
      activeRecord = null;
      // targetTextNode = null;
      // svg.removeAttribute('class');
    }

    function isClickEvent(up, down) {
      var elapsed = Math.abs(down.timeStamp - up.timeStamp);
      var dx = up.screenX - down.screenX;
      var dy = up.screenY - down.screenY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= 4 && elapsed < 300;
    }


    // function deselectText(el) {
    //   el.removeAttribute('class');
    // }

    // function selectText(el) {
    //   el.setAttribute('class', 'selected');
    // }


  }

  var darkStroke = "#334",
      lightStroke = "#b7d9ea",
      violet = "#cc6acc",
      violetFill = "rgba(249, 170, 249, 0.32)",
      gold = "#efc100",
      black = "black",
      grey = "#888",
      selectionFill = "rgba(237, 214, 0, 0.12)",
      hoverFill = "rgba(255, 180, 255, 0.2)",
      activeStyle = { // outline style for the active layer
        type: 'outline',
        strokeColors: [lightStroke, darkStroke],
        strokeWidth: 0.7,
        dotColor: "#223",
        dotSize: 4
      },
      activeStyleForLabels = {
        dotColor: "rgba(250, 0, 250, 0.45)", // violet dot with transparency
        dotSize: 4
      },
      referenceStyle = { // outline style for reference layers
        type: 'outline',
        strokeColors: [null, '#86c927'],
        strokeWidth: 0.85,
        dotColor: "#73ba20",
        dotSize: 4
      },
      intersectionStyle = {
        dotColor: "#F24400",
        dotSize: 4
      },
      hoverStyles = {
        polygon: {
          fillColor: hoverFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: black,
          dotSize: 8
        }, polyline:  {
          strokeColor: black,
          strokeWidth: 2.5
        }
      },
      unfilledHoverStyles = {
        polygon: {
          fillColor: 'rgba(0,0,0,0)',
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: grey,
          dotSize: 8
        }, polyline:  {
          strokeColor: grey,
          strokeWidth: 2.5
        }
      },
      selectionStyles = {
        polygon: {
          fillColor: selectionFill,
          strokeColor: gold,
          strokeWidth: 1
        }, point:  {
          dotColor: gold,
          dotSize: 6
        }, polyline:  {
          strokeColor: gold,
          strokeWidth: 1.5
        }
      },
      selectionHoverStyles = {
        polygon: {
          fillColor: selectionFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: black,
          dotSize: 6
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
          dotColor: 'violet',
          dotSize: 8
        }, polyline:  {
          strokeColor: violet,
          strokeWidth: 3
        }
      };

  function getIntersectionStyle(lyr) {
    return utils.extend({}, intersectionStyle);
  }

  function getReferenceStyle(lyr) {
    var style;
    if (layerHasCanvasDisplayStyle(lyr)) {
      style = getCanvasDisplayStyle(lyr);
    } else if (internal.layerHasLabels(lyr)) {
      style = {dotSize: 0}; // no reference dots if labels are visible
    } else {
      style = utils.extend({}, referenceStyle);
    }
    return style;
  }

  function getActiveStyle(lyr) {
    var style;
    if (layerHasCanvasDisplayStyle(lyr)) {
      style = getCanvasDisplayStyle(lyr);
    } else if (internal.layerHasLabels(lyr)) {
      style = utils.extend({}, activeStyleForLabels);
    } else {
      style = utils.extend({}, activeStyle);
    }
    return style;
  }


  // Returns a display style for the overlay layer. This style displays any
  // hover or selection affects for the active data layer.
  function getOverlayStyle(lyr, o) {
    var type = lyr.geometry_type;
    var topId = o.id;
    var ids = [];
    var styles = [];
    var styler = function(o, i) {
      utils.extend(o, styles[i]);
    };
    var overlayStyle = {
      styler: styler
    };

    o.ids.forEach(function(i) {
      var style;
      if (i == topId) return;
      style = hoverStyles[type];
      // style = o.selection_ids.indexOf(i) > -1 ? selectionHoverStyles[type] : hoverStyles[type];
      ids.push(i);
      styles.push(style);
    });
    // top layer: feature that was selected by clicking in inspection mode ([i])
    if (topId > -1) {
      var isPinned = o.pinned;
      var inSelection = o.ids.indexOf(topId) > -1;
      var style;
      if (isPinned) {
        style = pinnedStyles[type];
      } else if (inSelection) {
        style = hoverStyles[type];
      } else {
        style = unfilledHoverStyles[type];
      }
      ids.push(topId);
      styles.push(style);
    }

    if (layerHasCanvasDisplayStyle(lyr)) {
      if (type == 'point') {
        overlayStyle = wrapOverlayStyle(getCanvasDisplayStyle(lyr), overlayStyle);
      }
      overlayStyle.type = 'styled';
    }
    overlayStyle.ids = ids;
    overlayStyle.overlay = true;
    return ids.length > 0 ? overlayStyle : null;
  }

  // Modify style to use scaled circle instead of dot symbol
  function wrapOverlayStyle(style, hoverStyle) {
    var styler = function(obj, i) {
      var dotColor;
      var id = obj.ids ? obj.ids[i] : -1;
      obj.strokeWidth = 0; // kludge to support setting minimum stroke width
      style.styler(obj, id);
      if (hoverStyle.styler) {
        hoverStyle.styler(obj, i);
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
    return {styler: styler};
  }

  function getCanvasDisplayStyle(lyr) {
    var styleIndex = {
          opacity: 'opacity',
          r: 'radius',
          fill: 'fillColor',
          stroke: 'strokeColor',
          'fill-hatch': 'fillHatch',
          'stroke-width': 'strokeWidth',
          'stroke-dasharray': 'lineDash',
          'stroke-opacity': 'strokeOpacity',
          'fill-opacity': 'fillOpacity'
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
    return utils.difference(fields, ['opacity', 'class']).length > 0;
  }


  function getCanvasStyleFields(lyr) {
    var fields = lyr.data ? lyr.data.getFields() : [];
    return internal.findPropertiesBySymbolGeom(fields, lyr.geometry_type);
  }

  function MapExtent(_position) {
    var _scale = 1,
        _cx, _cy, // center in geographic units
        _contentBounds,
        _self = this,
        _frame;

    _position.on('resize', function(e) {
      if (_contentBounds) {
        onChange({resize: true});
      }
    });

    this.reset = function() {
      recenter(_contentBounds.centerX(), _contentBounds.centerY(), 1, {reset: true});
    };

    this.home = function() {
      recenter(_contentBounds.centerX(), _contentBounds.centerY(), 1);
    };

    this.pan = function(xpix, ypix) {
      var t = this.getTransform();
      recenter(_cx - xpix / t.mx, _cy - ypix / t.my);
    };

    // Zoom to @w (width of the map viewport in coordinates)
    // @xpct, @ypct: optional focus, [0-1]...
    this.zoomToExtent = function(w, xpct, ypct) {
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
    };

    this.zoomByPct = function(pct, xpct, ypct) {
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
      if (!_contentBounds) return new Bounds();
      return calcBounds(_cx, _cy, _scale / (k || 1));
    };

    // Update the extent of 'full' zoom without navigating the current view
    this.setBounds = function(b) {
      var prev = _contentBounds;
      if (!b.hasBounds()) return; // kludge
      _contentBounds = _frame ? b : padBounds(b, 4); // padding if not in frame mode
      if (prev) {
        _scale = _scale * fillOut(_contentBounds).width() / fillOut(prev).width();
      } else {
        _cx = b.centerX();
        _cy = b.centerY();
      }
    };

    this.translateCoords = function(x, y) {
      return this.getTransform().transform(x, y);
    };

    this.setFrame = function(frame) {
      _frame = frame || null;
    };

    this.getFrame = function() {
      return _frame || null;
    };

    this.getSymbolScale = function() {
      if (!_frame) return 0;
      var bounds = new Bounds(_frame.bbox);
      var bounds2 = bounds.clone().transform(this.getTransform());
      return bounds2.width() / _frame.width;
    };

    this.translatePixelCoords = function(x, y) {
      return this.getTransform().invert().transform(x, y);
    };

    function recenter(cx, cy, scale, data) {
      scale = scale ? limitScale(scale) : _scale;
      if (!(cx == _cx && cy == _cy && scale == _scale)) {
        _cx = cx;
        _cy = cy;
        _scale = scale;
        onChange(data);
      }
    }

    function onChange(data) {
      data = data || {};
      _self.dispatchEvent('change', data);
    }

    // stop zooming before rounding errors become too obvious
    function maxScale() {
      var minPixelScale = 1e-16;
      var xmax = maxAbs(_contentBounds.xmin, _contentBounds.xmax, _contentBounds.centerX());
      var ymax = maxAbs(_contentBounds.ymin, _contentBounds.ymax, _contentBounds.centerY());
      var xscale = _contentBounds.width() / _position.width() / xmax / minPixelScale;
      var yscale = _contentBounds.height() / _position.height() / ymax / minPixelScale;
      return Math.min(xscale, yscale);
    }

    function maxAbs() {
      return Math.max.apply(null, utils.toArray(arguments).map(Math.abs));
    }

    function limitScale(scale) {
      return Math.min(scale, maxScale());
    }

    function calcBounds(cx, cy, scale) {
      var bounds, w, h;
      if (_frame) {
        bounds = fillOutFrameBounds(_frame);
      } else {
        bounds = fillOut(_contentBounds);
      }
      w = bounds.width() / scale;
      h = bounds.height() / scale;
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

    function padBounds(b, margin) {
      var wpix = _position.width() - 2 * margin,
          hpix = _position.height() - 2 * margin,
          xpad, ypad, b2;
      if (wpix <= 0 || hpix <= 0) {
        return new Bounds(0, 0, 0, 0);
      }
      b = b.clone();
      b2 = b.clone();
      b2.fillOut(wpix / hpix);
      xpad = b2.width() / wpix * margin;
      ypad = b2.height() / hpix * margin;
      b.padBounds(xpad, ypad, xpad, ypad);
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

  utils.inherit(MapExtent, EventDispatcher);

  // TODO: consider moving this upstream
  function getArcsForRendering(obj, ext) {
    var dataset = obj.source.dataset;
    var sourceArcs = dataset.arcs;
    if (obj.geographic && dataset.displayArcs) {
      return dataset.displayArcs.getScaledArcs(ext);
    }
    return obj.arcs;
  }

  function drawOutlineLayerToCanvas(obj, canv, ext) {
    var arcs;
    var style = obj.style;
    var darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
        lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
    var filter;
    if (internal.layerHasPaths(obj.layer)) {
      if (!obj.arcCounts) {
        obj.arcCounts = new Uint8Array(obj.arcs.size());
        internal.countArcsInShapes(obj.layer.shapes, obj.arcCounts);
      }
      if (obj.arcCounts) {
        arcs = getArcsForRendering(obj, ext);
        if (lightStyle.strokeColor) {
          filter = getArcFilter(arcs, ext, false, obj.arcCounts);
          canv.drawArcs(arcs, lightStyle, filter);
        }
        if (darkStyle.strokeColor && obj.layer.geometry_type != 'point') {
          filter = getArcFilter(arcs, ext, true, obj.arcCounts);
          canv.drawArcs(arcs, darkStyle, filter);
        }
      }
    }
    if (obj.layer.geometry_type == 'point') {
      canv.drawSquareDots(obj.layer.shapes, style);
    }
  }

  function drawStyledLayerToCanvas(obj, canv, ext) {
    // TODO: add filter for out-of-view shapes
    var style = obj.style;
    var layer = obj.layer;
    var arcs, filter;
    if (layer.geometry_type == 'point') {
      if (style.type == 'styled') {
        canv.drawPoints(layer.shapes, style);
      } else {
        canv.drawSquareDots(layer.shapes, style);
      }
    } else {
      arcs = getArcsForRendering(obj, ext);
      filter = getShapeFilter(arcs, ext);
      canv.drawPathShapes(layer.shapes, arcs, style, filter);
    }
  }


  // Return a function for testing if an arc should be drawn in the current view
  function getArcFilter(arcs, ext, usedFlag, arcCounts) {
    var minPathLen = 0.5 * ext.getPixelSize(),
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
    return function(col) {
      var ctx = canv.getContext('2d');
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
        _ctx = _canvas.getContext('2d'),
        _pixelColor = getPixelColorFunction(),
        _ext;

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
    _self.drawPathShapes = function(shapes, arcs, style) {
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

    // Optimized to draw paths in same-style batches (faster Canvas drawing)
    _self.drawPathShapes = function(shapes, arcs, style, filter) {
      var styleIndex = {};
      var batchSize = 1500;
      var startPath = getPathStart(_ext, getScaledLineScale(_ext));
      var draw = getShapePencil(arcs, _ext);
      var key, item, shp;
      var styler = style.styler || null;
      for (var i=0; i<shapes.length; i++) {
        shp = shapes[i];
        if (!shp || filter && !filter(shp)) continue;
        if (styler) styler(style, i);
        key = getStyleKey(style);
        if (key in styleIndex === false) {
          styleIndex[key] = {
            style: utils.defaults({}, style),
            shapes: []
          };
        }
        item = styleIndex[key];
        item.shapes.push(shp);
        // overlays should not be batched, so transparency of overlapping shapes
        // is drawn correctly
        if (item.shapes.length >= batchSize || style.overlay) {
          drawPaths(item.shapes, startPath, draw, item.style);
          item.shapes = [];
        }
      }
      Object.keys(styleIndex).forEach(function(key) {
        var item = styleIndex[key];
        drawPaths(item.shapes, startPath, draw, item.style);
      });
    };

    function drawPaths(shapes, begin, draw, style) {
      begin(_ctx, style);
      for (var i=0, n=shapes.length; i<n; i++) {
        draw(shapes[i], _ctx);
      }
      endPath(_ctx, style);
    }

    _self.drawSquareDots = function(shapes, style) {
      var t = getScaledTransform(_ext),
          scaleRatio = getDotScale2(shapes, _ext),
          size = Math.ceil((style.dotSize >= 0 ? style.dotSize : 3) * scaleRatio),
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
      if (size <= 4 && !styler) {
        // optimized drawing of many small same-colored dots
        _self.drawSquareDotsFaster(shapes, color, size, t);
        return;
      }
      _ctx.fillStyle = color;
      for (i=0, n=shapes.length; i<n; i++) {
        if (styler !== null) { // e.g. selected points
          styler(style, i);
          size = style.dotSize * scaleRatio;
          _ctx.fillStyle = style.dotColor;
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
          // imageData = _ctx.createImageData(w, h),
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
      var xmin = (x - size * 0.5) | 0;
      var ymin = (y - size * 0.5) | 0;
      var xmax = xmin + size - 1;
      var ymax = ymin + size - 1;
      var c, r;
      for (c = xmin; c <= xmax; c++) {
        if (c < 0 || c >= w) continue;
        for (r = ymin; r <= ymax && r >= 0 && r < h; r++) {
          pixels[r * w + c] = rgba;
        }
      }
    }

    // TODO: consider using drawPathShapes(), which draws paths in batches
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
        drawPath(iter, t, ctx, 0.6);
      }
      endPath(ctx, style);
    };

    function getStyleKey(style) {
      return (style.strokeWidth > 0 ? style.strokeColor + '~' + style.strokeWidth +
        '~' + (style.lineDash ? style.lineDash + '~' : '') +
        (style.strokeOpacity >= 0 ? style.strokeOpacity + '~' : '') : '') +
        (style.fillColor || '') +
        (style.fillOpacity ? '~' + style.fillOpacity : '') +
        (style.fillHatch ? '~' + style.fillHatch : '') +
        (style.opacity < 1 ? '~' + style.opacity : '');
    }

    return _self;
  }

  function getScaledLineScale(ext) {
    return ext.getSymbolScale() || getLineScale(ext);
  }

  // Vary line width according to zoom ratio.
  // For performance and clarity don't start widening until zoomed quite far in.
  function getLineScale(ext) {
    var mapScale = ext.scale(),
        s = 1;
    if (mapScale < 0.5) {
      s *= Math.pow(mapScale + 0.5, 0.35);
    } else if (mapScale > 100) {
      if (!internal.getStateVar('DEBUG')) // thin lines for debugging
        s *= Math.pow(mapScale - 99, 0.10);
    }
    return s;
  }

  function getDotScale(ext) {
    return Math.pow(getLineScale(ext), 0.7);
  }

  function countPoints(shapes, test, max) {
    var count = 0;
    var i, n, j, m, shp;
    max = max || Infinity;
    for (i=0, n=shapes.length; i<n && count<=max; i++) {
      shp = shapes[i];
      for (j=0, m=shp ? shp.length : 0; j<m; j++) {
        if (!test || test(shp[j])) {
          count++;
        }
      }
    }
    return count;
  }


  function getDotScale2(shapes, ext) {
    var pixRatio = GUI.getPixelRatio();
    var scale = ext.scale();
    var side = Math.min(ext.width(), ext.height());
    var bounds = ext.getBounds();
    var topTier = 50000;
    var test, n, k, j;
    if (scale >= 2) {
      test = function(p) {
        return bounds.containsPoint(p[0], p[1]);
      };
    }
    n = countPoints(shapes, test, topTier + 2); // short-circuit point counting above top threshold
    k = n >= topTier && 0.25 || n > 10000 && 0.45 || n > 2500 && 0.65 || n > 200 && 0.85 || 1;
    j = side < 200 && 0.5 || side < 400 && 0.75 || 1;
    return getDotScale(ext) * k * j * pixRatio;
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

  function drawPath(vec, t, ctx, minLen) {
    // copy to local variables because of odd performance regression in Chrome 80
    var mx = t.mx,
        my = t.my,
        bx = t.bx,
        by = t.by;
    var x, y, xp, yp;
    if (!vec.hasNext()) return;
    minLen = utils.isNonNegNumber(minLen) ? minLen : 0.4;
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

  function getShapePencil(arcs, ext) {
    var t = getScaledTransform(ext);
    var iter = new internal.ShapeIter(arcs);
    return function(shp, ctx) {
      for (var i=0, n=shp ? shp.length : 0; i<n; i++) {
        iter.init(shp[i]);
        // 0.2 trades visible seams for performance
        drawPath(protectIterForDrawing(iter, ext), t, ctx, 0.2);
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
      // if (style.opacity >= 0) {
      //   ctx.globalAlpha = style.opacity;
      // }
      if (style.strokeWidth > 0) {
        strokeWidth = style.strokeWidth;
        if (pixRatio > 1) {
          // bump up thin lines on retina, but not to more than 1px (too slow)
          strokeWidth = strokeWidth < 1 ? 1 : strokeWidth * pixRatio;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = strokeWidth * lineScale;
        ctx.strokeStyle = style.strokeColor;
        if (style.lineDash){
          ctx.lineCap = 'butt';
          ctx.setLineDash(style.lineDash.split(' '));
        }
      }

      if (style.fillHatch) {
        ctx.fillStyle = getCanvasFillHatch(style);
      } else if (style.fillColor) {
        ctx.fillStyle = style.fillColor;
      }
    };
  }

  function endPath(ctx, style) {
    var fo = style.opacity >= 0 ? style.opacity : 1,
        so = fo;
    if (style.strokeOpacity >= 0) so *= style.strokeOpacity;
    if (style.fillOpacity >= 0) fo *= style.fillOpacity;
    if (style.fillColor || style.fillHatch) {
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

  var hatches = {};

  function getCanvasFillHatch(style) {
    var fill = hatches[style.fillHatch];
    if (fill === undefined) {
      fill = makeHatchFill(style);
      hatches[style.fillHatch] = fill;
    }
    return fill || style.fill || '#000'; // use fill if hatches are invalid
  }

  function makeHatchFill(style) {
    var hatch = internal.parseHatch(style.fillHatch);
    if (!hatch) return null;
    var size = utils.sum(hatch.widths);
    var res = GUI.getPixelRatio();
    var canv = document.createElement('canvas');
    var ctx = canv.getContext('2d');
    var w;
    canv.setAttribute('width', size * res);
    canv.setAttribute('height', 10);
    for (var i=0, x=0; i<hatch.widths.length; i++) {
      w = hatch.widths[i] * res;
      ctx.fillStyle = hatch.colors[i];
      ctx.fillRect(x, 0, x + w, 10);
      x += w;
    }
    var pattern = ctx.createPattern(canv, 'repeat');
    if (hatch.rotation) {
      pattern.setTransform(new DOMMatrix('rotate(' + hatch.rotation + 'deg)'));
    }
    return pattern;
  }

  function getSvgFurnitureTransform(ext) {
    var scale = ext.getSymbolScale();
    var frame = ext.getFrame();
    var p = ext.translateCoords(frame.bbox[0], frame.bbox[3]);
    return internal.svg.getTransform(p, scale);
  }

  function repositionFurniture(container, layer, ext) {
    var g = El.findAll('.mapshaper-svg-furniture', container)[0];
    g.setAttribute('transform', getSvgFurnitureTransform(ext));
  }

  function renderFurniture(lyr, ext) {
    var frame = ext.getFrame(); // frame should be set if we're rendering a furniture layer
    var obj = internal.getEmptyLayerForSVG(lyr, {});
    if (!frame) {
      stop('Missing map frame data');
    }
    obj.properties.transform = getSvgFurnitureTransform(ext);
    obj.properties.class = 'mapshaper-svg-furniture';
    obj.children = internal.importFurniture(internal.getFurnitureLayerData(lyr), frame);
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

    el.reposition = function(target, type) {
      resize(ext);
      reposition(target, type, ext);
    };

    el.drawLayer = function(target, type) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      var html = '';
      // generate a unique id so layer can be identified when symbols are repositioned
      // use it as a class name to avoid id collisions
      var id = utils.getUniqueName();
      var classNames = [id, 'mapshaper-svg-layer', 'mapshaper-' + type + '-layer'];
      g.setAttribute('class', classNames.join(' '));
      target.svg_id = id;
      resize(ext);
      if (type == 'label' || type == 'symbol') {
        html = renderSymbols(target.layer, ext, type);
      } else if (type == 'furniture') {
        html = renderFurniture(target.layer, ext);
      }
      g.innerHTML = html;
      svg.append(g);

      // prevent svg hit detection on inactive layers
      if (!target.active) {
        g.style.pointerEvents = 'none';
      }
    };

    function reposition(target, type, ext) {
      var container = el.findChild('.' + target.svg_id).node();
      var elements;
      if (type == 'label' || type == 'symbol') {
        elements = type == 'label' ? container.getElementsByTagName('text') :
            El.findAll('.mapshaper-svg-symbol', container);
        repositionSymbols(elements, target.layer, ext);
      } else if (type == 'furniture') {
        repositionFurniture(container, target.layer, ext);
      }
    }

    function resize(ext) {
      svg.style.width = ext.width() + 'px';
      svg.style.height = ext.height() + 'px';
    }

    return el;
  }

  function LayerStack(gui, container, ext, mouse) {
    var el = El(container),
        _mainCanv = new DisplayCanvas().appendTo(el),
        _overlayCanv = new DisplayCanvas().appendTo(el),
        _svg = new SvgDisplayLayer(gui, ext, mouse).appendTo(el),
        _furniture = new SvgDisplayLayer(gui, ext, null).appendTo(el),
        _ext = ext;

    // don't let furniture container block events to symbol layers
    _furniture.css('pointer-events', 'none');

    this.drawMainLayers = function(layers, action) {
      if (skipMainLayerRedraw(action)) return;
      _mainCanv.prep(_ext);
      if (action != 'nav') {
        _svg.clear();
      }
      layers.forEach(function(lyr) {
        var svgType = getSvgLayerType(lyr.layer);
        if (!svgType || svgType == 'label') { // svg labels may have canvas dots
          drawCanvasLayer(lyr, _mainCanv);
        }
        if (svgType && action == 'nav') {
          _svg.reposition(lyr, svgType);
        } else if (svgType) {
          _svg.drawLayer(lyr, svgType);
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

    function drawCanvasLayer(target, canv) {
      if (!target) return;
      if (target.style.type == 'outline') {
        drawOutlineLayerToCanvas(target, canv, ext);
      } else {
        drawStyledLayerToCanvas(target, canv, ext);
      }
    }

    function getSvgLayerType(layer) {
      var type = null;
      if (internal.layerHasLabels(layer)) {
        type = 'label';
      } else if (internal.layerHasSvgSymbols(layer)) {
        type = 'symbol';
      }
      return type;
    }
  }

  function BoxTool(gui, ext, mouse, nav) {
    var self = new EventDispatcher();
    var box = new HighlightBox('body');
    var popup = gui.container.findChild('.box-tool-options');
    var coords = popup.findChild('.box-coords');
    var _on = false;
    var bbox, bboxPixels;

    var infoBtn = new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
      if (coords.visible()) hideCoords(); else showCoords();
    });

    new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
      reset();
    });

    // Removing zoom-in button -- cumbersome way to zoom
    // new SimpleButton(popup.findChild('.zoom-btn')).on('click', function() {
    //   nav.zoomToBbox(bboxPixels);
    //   reset();
    // });

    new SimpleButton(popup.findChild('.select-btn')).on('click', function() {
      gui.enterMode('selection_tool');
      gui.interaction.setMode('selection');
      // kludge to pass bbox to the selection tool
      gui.dispatchEvent('box_drag_end', {map_bbox: bboxPixels});
    });

    // Removing button for creating a layer containing a single rectangle.
    // You can get the bbox with the Info button and create a rectangle in the console
    // using -rectangle bbox=<coordinates>
    // new SimpleButton(popup.findChild('.rectangle-btn')).on('click', function() {
    //   runCommand('-rectangle bbox=' + bbox.join(','));
    // });

    new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
      runCommand('-clip bbox2=' + bbox.join(','));
    });

    gui.addMode('box_tool', turnOn, turnOff);

    gui.on('interaction_mode_change', function(e) {
      if (e.mode === 'box') {
        gui.enterMode('box_tool');
      } else if (gui.getMode() == 'box_tool') {
        gui.clearMode();
      }
    });

    ext.on('change', function() {
      if (!_on || !box.visible()) return;
      var b = bboxToPixels(bbox);
      var pos = ext.position();
      var dx = pos.pageX,
          dy = pos.pageY;
      box.show(b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy);
    });

    gui.on('box_drag_start', function() {
      box.classed('zooming', zoomDragging());
      hideCoords();
    });

    gui.on('box_drag', function(e) {
      var b = e.page_bbox;
      if (_on || zoomDragging()) {
        box.show(b[0], b[1], b[2], b[3]);
      }
    });

    gui.on('box_drag_end', function(e) {
      bboxPixels = e.map_bbox;
      if (zoomDragging()) {
        box.hide();
        nav.zoomToBbox(bboxPixels);
      } else if (_on) {
        bbox = bboxToCoords(bboxPixels);
        // round coords, for nicer 'info' display
        // (rounded precision should be sub-pixel)
        bbox = internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
        popup.show();
      }
    });

    function zoomDragging() {
      return !_on && gui.getMode() != 'selection_tool';
    }

    function runCommand(cmd) {
      if (gui.console) {
        gui.console.runMapshaperCommands(cmd, function(err) {
          reset();
        });
      }
      // reset(); // TODO: exit interactive mode
    }

    function showCoords() {
      El(infoBtn.node()).addClass('selected-btn');
      coords.text(bbox.join(','));
      coords.show();
      GUI.selectElement(coords.node());
    }

    function hideCoords() {
      El(infoBtn.node()).removeClass('selected-btn');
      coords.hide();
    }

    function turnOn() {
      _on = true;
    }

    function turnOff() {
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

    function bboxToCoords(bbox) {
      var a = ext.translatePixelCoords(bbox[0], bbox[1]);
      var b = ext.translatePixelCoords(bbox[2], bbox[3]);
      return [a[0], b[1], b[0], a[1]];
    }

    function bboxToPixels(bbox) {
      var a = ext.translateCoords(bbox[0], bbox[1]);
      var b = ext.translateCoords(bbox[2], bbox[3]);
      return [a[0], b[1], b[0], a[1]];
    }

    return self;
  }

  // Create low-detail versions of large arc collections for faster rendering
  // at zoomed-out scales.
  function MultiScaleArcCollection(unfilteredArcs) {
    var size = unfilteredArcs.getPointCount(),
        filteredArcs, filteredSegLen;

    // Only generate low-detail arcs for larger datasets
    if (size > 5e5) {
      if (!!unfilteredArcs.getVertexData().zz) {
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

    unfilteredArcs.getScaledArcs = function(ext) {
      if (filteredArcs) {
        // match simplification of unfiltered arcs
        filteredArcs.setRetainedInterval(unfilteredArcs.getRetainedInterval());
      }
      // switch to filtered version of arcs at small scales
      var unitsPerPixel = 1/ext.getTransform().mx,
          useFiltering = filteredArcs && unitsPerPixel > filteredSegLen * 1.5;
      return useFiltering ? filteredArcs : unfilteredArcs;
    };

    return unfilteredArcs;
  }

  function getDisplayLayerForTable(table) {
    var n = table.size(),
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

  // displayCRS: CRS to use for display, or null (which clears any current display CRS)
  function projectDisplayLayer(lyr, displayCRS) {
    var sourceCRS = internal.getDatasetCRS(lyr.source.dataset);
    var lyr2;
    if (!lyr.geographic || !sourceCRS) {
      return lyr;
    }
    if (lyr.dynamic_crs && internal.crsAreEqual(sourceCRS, lyr.dynamic_crs)) {
      return lyr;
    }
    lyr2 = getDisplayLayer(lyr.source.layer, lyr.source.dataset, {crs: displayCRS});
    // kludge: copy projection-related properties to original layer
    lyr.dynamic_crs = lyr2.dynamic_crs;
    lyr.layer = lyr2.layer;
    if (lyr.style && lyr.style.ids) {
      // re-apply layer filter
      lyr.layer = filterLayerByIds(lyr.layer, lyr.style.ids);
    }
    lyr.bounds = lyr2.bounds;
    lyr.arcs = lyr2.arcs;
  }


  // Wrap a layer in an object along with information needed for rendering
  function getDisplayLayer(layer, dataset, opts) {
    var obj = {
      layer: null,
      arcs: null,
      // display_arcs: null,
      style: null,
      source: {
        layer: layer,
        dataset: dataset
      },
      empty: internal.getFeatureCount(layer) === 0
    };

    var sourceCRS = opts.crs && internal.getDatasetCRS(dataset); // get src iff display CRS is given
    var displayCRS = opts.crs || null;
    var displayArcs = dataset.displayArcs;
    var emptyArcs;

    // Assume that dataset.displayArcs is in the display CRS
    // (it should have been deleted upstream if reprojection is needed)
    if (dataset.arcs && !displayArcs) {
      // project arcs, if needed
      if (needReprojectionForDisplay(sourceCRS, displayCRS)) {
        displayArcs = projectArcsForDisplay(dataset.arcs, sourceCRS, displayCRS);
      } else {
        displayArcs = dataset.arcs;
      }

      // init filtered arcs
      dataset.displayArcs = new MultiScaleArcCollection(displayArcs);
    }

    if (internal.layerHasFurniture(layer)) {
      obj.furniture = true;
      obj.furniture_type = internal.getFurnitureLayerType(layer);
      obj.layer = layer;
      // treating furniture layers (other than frame) as tabular for now,
      // so there is something to show if they are selected
      obj.tabular = obj.furniture_type != 'frame';
    } else if (obj.empty) {
      obj.layer = {shapes: []}; // ideally we should avoid empty layers
    } else if (!layer.geometry_type) {
      obj.tabular = true;
    } else {
      obj.geographic = true;
      obj.layer = layer;
      obj.arcs = displayArcs;
    }

    if (obj.tabular) {
      utils.extend(obj, getDisplayLayerForTable(layer.data));
    }

    // dynamic reprojection (arcs were already reprojected above)
    if (obj.geographic && needReprojectionForDisplay(sourceCRS, displayCRS)) {
      obj.dynamic_crs = displayCRS;
      if (internal.layerHasPoints(layer)) {
        obj.layer = projectPointsForDisplay(layer, sourceCRS, displayCRS);
      } else if (internal.layerHasPaths(layer)) {
        emptyArcs = findEmptyArcs(displayArcs);
        if (emptyArcs.length > 0) {
          // Don't try to draw paths containing coordinates that failed to project
          obj.layer = internal.filterPathLayerByArcIds(obj.layer, emptyArcs);
        }
      }
    }

    obj.bounds = getDisplayBounds(obj.layer, obj.arcs);
    return obj;
  }


  function getDisplayBounds(lyr, arcs) {
    var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
        bounds = arcBounds, // default display extent: all arcs in the dataset
        lyrBounds;

    if (lyr.geometry_type == 'point') {
      lyrBounds = internal.getLayerBounds(lyr);
      if (lyrBounds && lyrBounds.hasBounds()) {
        if (lyrBounds.area() > 0 || !arcBounds.hasBounds()) {
          bounds = lyrBounds;
        } else {
          // if a point layer has no extent (e.g. contains only a single point),
          // then merge with arc bounds, to place the point in context.
          bounds = arcBounds.mergeBounds(lyrBounds);
        }
      }
    }

    if (!bounds || !bounds.hasBounds()) { // empty layer
      bounds = new Bounds();
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

  utils.inherit(MshpMap, EventDispatcher);

  function MshpMap(gui) {
    var opts = gui.options,
        el = gui.container.findChild('.map-layers').node(),
        position = new ElementPosition(el),
        model = gui.model,
        map = this,
        _mouse = new MouseArea(el, position),
        _ext = new MapExtent(position),
        _hit = new InteractiveSelection(gui, _ext, _mouse),
        _nav = new MapNav(gui, _ext, _mouse),
        _boxTool = new BoxTool(gui, _ext, _mouse, _nav),
        _selectionTool = new SelectionTool(gui, _ext, _hit),
        _visibleLayers = [], // cached visible map layers
        _fullBounds = null,
        _intersectionLyr, _activeLyr, _overlayLyr,
        _inspector, _stack, _editor,
        _dynamicCRS;

    if (gui.options.showMouseCoordinates) {
      new CoordinatesDisplay(gui, _ext, _mouse);
    }
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

    model.on('update', onUpdate);

    // Update display of segment intersections
    this.setIntersectionLayer = function(lyr, dataset) {
      if (lyr == _intersectionLyr) return; // no change
      if (lyr) {
        _intersectionLyr = getDisplayLayer(lyr, dataset, getDisplayOptions());
        _intersectionLyr.style = getIntersectionStyle(_intersectionLyr.layer);
      } else {
        _intersectionLyr = null;
      }
      // TODO: try to avoid redrawing layers twice (in some situations)
      drawLayers();
    };

    this.setLayerVisibility = function(target, isVisible) {
      var lyr = target.layer;
      lyr.visibility = isVisible ? 'visible' : 'hidden';
      // if (_inspector && isActiveLayer(lyr)) {
      //   _inspector.updateLayer(isVisible ? _activeLyr : null);
      // }
      if (isActiveLayer(lyr)) {
        _hit.setLayer(isVisible ? _activeLyr : null);
        _hit.clearSelection();
      }
    };

    this.getCenterLngLat = function() {
      var bounds = _ext.getBounds();
      var crs = this.getDisplayCRS();
      // TODO: handle case where active layer is a frame layer
      if (!bounds.hasBounds() || !crs) {
        return null;
      }
      return internal.toLngLat([bounds.centerX(), bounds.centerY()], crs);
    };

    this.getDisplayCRS = function() {
      var crs;
      if (_activeLyr && _activeLyr.geographic) {
        crs = _activeLyr.dynamic_crs || internal.getDatasetCRS(_activeLyr.source.dataset);
      }
      return crs || null;
    };

    this.getExtent = function() {return _ext;};
    this.isActiveLayer = isActiveLayer;
    this.isVisibleLayer = isVisibleLayer;

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
      var newCRS = utils.isString(crs) ? internal.getCRS(crs) : crs;
      // TODO: handle case that old and new CRS are the same
      _dynamicCRS = newCRS;
      if (!_activeLyr) return; // stop here if no layers have been selected

      // clear any stored FilteredArcs objects (so they will be recreated with the desired projection)
      clearAllDisplayArcs();

      // Reproject all visible map layers
      if (_activeLyr) projectDisplayLayer(_activeLyr, newCRS);
      if (_intersectionLyr) projectDisplayLayer(_intersectionLyr, newCRS);
      if (_overlayLyr) {
        projectDisplayLayer(_overlayLyr, newCRS);
      }
      updateVisibleMapLayers(); // any other display layers will be projected as they are regenerated
      updateLayerStyles(getDrawableContentLayers()); // kludge to make sure all layers have styles

      // Update map extent (also triggers redraw)
      projectMapExtent(_ext, oldCRS, this.getDisplayCRS(), getFullBounds());
    };

    // Refresh map display in response to data changes, layer selection, etc.
    function onUpdate(e) {
      var prevLyr = _activeLyr || null;
      var fullBounds;
      var needReset;

      if (!prevLyr) {
        initMap(); // first call
      }

      if (arcsMayHaveChanged(e.flags)) {
        // regenerate filtered arcs the next time they are needed for rendering
        // delete e.dataset.displayArcs;
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

      _activeLyr = getDisplayLayer(e.layer, e.dataset, getDisplayOptions());
      _activeLyr.style = getActiveStyle(_activeLyr.layer);
      _activeLyr.active = true;
      // if (_inspector) _inspector.updateLayer(_activeLyr);
      _hit.setLayer(_activeLyr);
      if (e.flags.same_table) {
        // data may have changed; if popup is open, it needs to be refreshed
        gui.dispatchEvent('popup-needs-refresh');
      } else {
        _hit.clearSelection();
      }
      updateVisibleMapLayers();
      fullBounds = getFullBounds();

      if (!prevLyr || !_fullBounds || prevLyr.tabular || _activeLyr.tabular || isFrameView()) {
        needReset = true;
      } else {
        needReset = GUI.mapNeedsReset(fullBounds, _fullBounds, _ext.getBounds());
      }

      if (isFrameView()) {
        _nav.setZoomFactor(0.05); // slow zooming way down to allow fine-tuning frame placement // 0.03
        _ext.setFrame(getFullBounds()); // TODO: remove redundancy with drawLayers()
        needReset = true; // snap to frame extent
      } else {
        _nav.setZoomFactor(1);
      }
      _ext.setBounds(fullBounds); // update 'home' button extent
      _fullBounds = fullBounds;
      if (needReset) {
        _ext.reset();
      }
      drawLayers();
      map.dispatchEvent('updated');
    }

    // Initialization just before displaying the map for the first time
    function initMap() {
      _ext.resize();
      _stack = new LayerStack(gui, el, _ext, _mouse);
      gui.buttons.show();

      if (opts.inspectorControl) {
        _inspector = new InspectionControl2(gui, _hit);
        _inspector.on('data_change', function(e) {
          // Add an entry to the session history
          gui.session.dataValueUpdated(e.id, e.field, e.value);
          // Refresh the display if a style variable has been changed interactively
          if (internal.isSupportedSvgStyleProperty(e.field)) {
            drawLayers();
          }
        });
      }

      if (true) { // TODO: add option to disable?
        _editor = new SymbolDragging2(gui, _ext, _hit);
        _editor.on('location_change', function(e) {
          // TODO: look into optimizing, so only changed symbol is redrawn
          drawLayers();
        });
      }

      _ext.on('change', function(e) {
        if (e.reset) return; // don't need to redraw map here if extent has been reset
        if (isFrameView()) {
          updateFrameExtent();
        }
        drawLayers('nav');
      });

      _hit.on('change', function(e) {
        // draw highlight effect for hover and select
        _overlayLyr = getDisplayLayerOverlay(_activeLyr, e);
        drawLayers('hover');
        // _stack.drawOverlayLayer(_overlayLyr);
      });

      gui.on('resize', function() {
        position.update(); // kludge to detect new map size after console toggle
      });
    }

    function getDisplayOptions() {
      return {
        crs: _dynamicCRS
      };
    }

    // Test if an update may have affected the visible shape of arcs
    // @flags Flags from update event
    function arcsMayHaveChanged(flags) {
      return flags.simplify_method || flags.simplify || flags.proj ||
        flags.arc_count || flags.repair || flags.clip || flags.erase ||
        flags.slice || flags.affine || flags.rectangle || flags.buffer ||
        flags.union || flags.mosaic || flags.snap || flags.clean || false;
    }

    // Update map frame after user navigates the map in frame edit mode
    function updateFrameExtent() {
      var frameLyr = internal.findFrameLayer(model);
      var rec = frameLyr.data.getRecordAt(0);
      var viewBounds = _ext.getBounds();
      var w = viewBounds.width() * rec.width / _ext.width();
      var h = w * rec.height / rec.width;
      var cx = viewBounds.centerX();
      var cy = viewBounds.centerY();
      rec.bbox = [cx - w/2, cy - h/2, cx + w/2, cy + h/2];
      _ext.setFrame(getFrameData());
      _ext.setBounds(new Bounds(rec.bbox));
      _ext.reset();
    }

    function getFullBounds() {
      var b = new Bounds();
      var marginPct = 0.025;
      var pad = 1e-4;
      if (isPreviewView()) {
        return internal.getFrameLayerBounds(internal.findFrameLayer(model));
      }
      getDrawableContentLayers().forEach(function(lyr) {
        b.mergeBounds(lyr.bounds);
        if (isTableView()) {
          marginPct = getTableMargin(lyr.layer);
        }
      });
      if (!b.hasBounds()) {
        // assign bounds to empty layers, to prevent rendering errors downstream
        b.setBounds(0,0,0,0);
      }
      // Inflate display bounding box by a tiny amount (gives extent to single-point layers and collapsed shapes)
      b.padBounds(pad,pad,pad,pad);
      // add margin
      b.scale(1 + marginPct * 2);
      return b;
    }

    // Calculate margin when displaying content at full zoom, as pct of screen size
    function getTableMargin(lyr) {
      var n = internal.getFeatureCount(lyr);
      var pct = 0.04;
      if (n < 5) {
        pct = 0.2;
      } else if (n < 100) {
        pct = 0.1;
      }
      return pct;
    }

    function isActiveLayer(lyr) {
      return _activeLyr && lyr == _activeLyr.source.layer || false;
    }

    function isVisibleLayer(lyr) {
      if (isActiveLayer(lyr)) {
        return lyr.visibility != 'hidden';
      }
      return lyr.visibility == 'visible';
    }

    function isVisibleDataLayer(lyr) {
      return isVisibleLayer(lyr) && !internal.isFurnitureLayer(lyr);
    }

    function isFrameLayer(lyr) {
      return !!(lyr && lyr == internal.findFrameLayer(model));
    }

    function isTableView() {
      return !isPreviewView() && !!_activeLyr.tabular;
    }

    function isPreviewView() {
      var frameLyr = internal.findFrameLayer(model);
      return !!frameLyr; //  && isVisibleLayer(frameLyr)
    }

    // Frame view means frame layer is visible and active (selected)
    function isFrameView() {
      var frameLyr = internal.findFrameLayer(model);
      return isActiveLayer(frameLyr) && isVisibleLayer(frameLyr);
    }

    function getFrameData() {
      var frameLyr = internal.findFrameLayer(model);
      return frameLyr && internal.getFurnitureLayerData(frameLyr) || null;
    }

    function clearAllDisplayArcs() {
      model.getDatasets().forEach(function(o) {
        delete o.displayArcs;
      });
    }

    function updateVisibleMapLayers() {
      var layers = [];
      model.getLayers().forEach(function(o) {
        if (!isVisibleLayer(o.layer)) return;
        if (isActiveLayer(o.layer)) {
          layers.push(_activeLyr);
        } else if (!isTableView()) {
          layers.push(getDisplayLayer(o.layer, o.dataset, getDisplayOptions()));
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

    function getDrawableContentLayers() {
      var layers = getVisibleMapLayers();
      if (isTableView()) return findActiveLayer(layers);
      return layers.filter(function(o) {
        return !!o.geographic;
      });
    }

    function getDrawableFurnitureLayers(layers) {
      if (!isPreviewView()) return [];
      return getVisibleMapLayers().filter(function(o) {
        return internal.isFurnitureLayer(o);
      });
    }

    function updateLayerStyles(layers) {
      layers.forEach(function(mapLayer, i) {
        if (mapLayer.active) {
          // assume: style is already assigned
          if (mapLayer.style.type != 'styled' && layers.length > 1 && mapLayer.style.strokeColors) {
          // if (false) { // always show ghosted arcs
            // kludge to hide ghosted layers when reference layers are present
            // TODO: consider never showing ghosted layers (which appear after
            // commands like dissolve and filter).
            mapLayer.style = utils.defaults({
              strokeColors: [null, mapLayer.style.strokeColors[1]]
            }, mapLayer.style);
          }
        } else {
          if (mapLayer.layer == _activeLyr.layer) {
            console.error("Error: shared map layer");
          }
          mapLayer.style = getReferenceStyle(mapLayer.layer);
        }
      });
    }

    function sortMapLayers(layers) {
      layers.sort(function(a, b) {
        // assume that each layer has a stack_id (assigned by updateLayerStackOrder())
        return a.source.layer.stack_id - b.source.layer.stack_id;
      });
    }

    // action:
    //   'nav'      map was panned/zoomed -- only map extent has changed
    //   'hover'    highlight has changed -- only draw overlay
    //   (default)  anything could have changed
    function drawLayers(action) {
      var layersMayHaveChanged = !action;
      var contentLayers = getDrawableContentLayers();
      var furnitureLayers = getDrawableFurnitureLayers();
      if (!(_ext.width() > 0 && _ext.height() > 0)) {
        // TODO: track down source of these errors
        console.error("Collapsed map container, unable to draw.");
        return;
      }
      if (layersMayHaveChanged) {
        // kludge to handle layer visibility toggling
        _ext.setFrame(isPreviewView() ? getFrameData() : null);
        _ext.setBounds(getFullBounds());
        updateLayerStyles(contentLayers);
        updateLayerStackOrder(model.getLayers());// update stack_id property of all layers
      }
      sortMapLayers(contentLayers);
      if (_intersectionLyr) {
        contentLayers = contentLayers.concat(_intersectionLyr);
      }
      // RENDERING
      // draw main content layers
      _stack.drawMainLayers(contentLayers, action);
      // draw hover & selection overlay
      _stack.drawOverlayLayer(_overlayLyr, action);
      // draw furniture
      _stack.drawFurnitureLayers(furnitureLayers, action);
    }
  }

  function getDisplayLayerOverlay(obj, e) {
    var style = getOverlayStyle(obj.layer, e);
    if (!style) return null;
    return utils.defaults({
      layer: filterLayerByIds(obj.layer, style.ids),
      style: style
    }, obj);
  }

  // Test if map should be re-framed to show updated layer
  GUI.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
    var viewportPct = GUI.getIntersectionPct(newBounds, mapBounds);
    var contentPct = GUI.getIntersectionPct(mapBounds, newBounds);
    var boundsChanged = !prevBounds.equals(newBounds);
    var inView = newBounds.intersects(mapBounds);
    var areaChg = newBounds.area() / prevBounds.area();
    if (!boundsChanged) return false; // don't reset if layer extent hasn't changed
    if (!inView) return true; // reset if layer is out-of-view
    if (viewportPct < 0.3 && contentPct < 0.9) return true; // reset if content is mostly offscreen
    if (areaChg > 1e8 || areaChg < 1e-8) return true; // large area chg, e.g. after projection
    return false;
  };

  // TODO: move to utilities file
  GUI.getBoundsIntersection = function(a, b) {
    var c = new Bounds();
    if (a.intersects(b)) {
      c.setBounds(Math.max(a.xmin, b.xmin), Math.max(a.ymin, b.ymin),
      Math.min(a.xmax, b.xmax), Math.min(a.ymax, b.ymax));
    }
    return c;
  };

  // Returns proportion of bb2 occupied by bb1
  GUI.getIntersectionPct = function(bb1, bb2) {
    return GUI.getBoundsIntersection(bb1, bb2).area() / bb2.area() || 0;
  };

  function GuiInstance(container, opts) {
    var gui = new ModeSwitcher();
    opts = utils.extend({
      // defaults
      homeControl: true,
      zoomControl: true,
      inspectorControl: true,
      disableNavigation: false,
      showMouseCoordinates: true,
      focus: true
    }, opts);

    gui.options = opts;
    gui.container = El(container);
    gui.model = new Model(gui);
    gui.keyboard = new KeyboardEvents(gui);
    gui.buttons = new SidebarButtons(gui);
    gui.map = new MshpMap(gui);
    gui.interaction = new InteractionMode(gui);
    gui.session = new SessionHistory(gui);

    gui.showProgressMessage = function(msg) {
      if (!gui.progressMessage) {
        gui.progressMessage = El('div').addClass('progress-message')
          .appendTo('body');
      }
      El('<div>').text(msg).appendTo(gui.progressMessage.empty().show());
    };

    gui.clearProgressMessage = function() {
      if (gui.progressMessage) gui.progressMessage.hide();
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
      MessageProxy(gui);
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

  function getImportOpts() {
    var vars = GUI.getUrlVars();
    var opts = {};
    var manifest = window.mapshaper.manifest || {}; // kludge -- bin/mapshaper-gui sets this
    if (Array.isArray(manifest)) {
      // old-style manifest: an array of filenames
      opts.files = manifest;
    } else if (manifest.files) {
      opts.files = manifest.files.concat();
      opts.quick_view = !!manifest.quick_view;
    } else {
      opts.files = [];
    }
    if (vars.files) {
      opts.files = opts.files.concat(vars.files.split(','));
    }
    if (manifest.catalog) {
      opts.catalog = manifest.catalog;
    }
    opts.display_all = !!manifest.display_all;
    return opts;
  }

  var startEditing = function() {
    var dataLoaded = false,
        importOpts = getImportOpts(),
        gui = new GuiInstance('body');

    new AlertControl(gui);
    new RepairControl(gui);
    new SimplifyControl(gui);
    new ImportControl(gui, importOpts);
    new ExportControl(gui);
    new LayerControl(gui);
    gui.console = new Console(gui);

    startEditing = function() {};

    window.addEventListener('beforeunload', function(e) {
      if (gui.session.unsavedChanges()) {
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

    gui.model.on('select', function() {
      if (!dataLoaded) {
        dataLoaded = true;
        El('#mode-buttons').show();
        if (importOpts.display_all) {
          gui.model.getLayers().forEach(function(o) {
            gui.map.setLayerVisibility(o, true);
          });
        }
      }
    });
  };

}());
