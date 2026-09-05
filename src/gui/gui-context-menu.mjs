import { internal, mapshaper, geom } from './gui-core';
import { El } from './gui-el';
import { saveFileContentToClipboard } from './gui-export-control';
import { deleteFeature } from './gui-drawing-utils';
import { GUI } from './gui-lib';


var openMenu;
var openMenuId;
// One menu element per parent element, created on demand.
var menus = new WeakMap();
// Prefixes shown to the left of a menu item. The checkmark is what a copyable
// item shows after it has been copied.
var BULLET = '• &nbsp;';
var CHECKMARK = '✓ &nbsp;';
var COPIED_DELAY = 1200;

document.addEventListener('mousedown', function(e) {
  // Clicks inside the menu are handled by the menu itself: an item that runs a
  // command closes the menu, one that copies a value leaves it open.
  if (e.target.closest?.('.contextmenu')) {
    return;
  }
  closeOpenMenu();
});

function closeOpenMenu(immediate) {
  if (openMenu) {
    openMenu.close(immediate);
    openMenu = null;
    openMenuId = null;
  }
}

// Menus are re-used, rather than created per click: a discarded menu stays in
// the DOM, and an empty one is a 10px sliver at the bottom of the page, which
// is enough to make the page scrollable (see the note in ContextMenu()).
export function getContextMenu(parentArg) {
  var parent = parentArg || document.querySelector('body');
  var menu = menus.get(parent);
  if (!menu) {
    menu = new ContextMenu(parent);
    menus.set(parent, menu);
  }
  return menu;
}

export function openContextMenu(e, lyr, parent) {
  if (e.contextMenuId && e.contextMenuId == openMenuId) {
    closeOpenMenu(true);
    return;
  }
  closeOpenMenu(true);
  getContextMenu(parent).open(e, lyr);
  openMenuId = e.contextMenuId || null;
}

export function ContextMenu(parentArg) {
  var body = document.querySelector('body');
  var parent = parentArg || body;
  // var menu = El('div').addClass('contextmenu rollover').appendTo(body);
  var menu = El('div').addClass('contextmenu rollover').appendTo(parent);
  var _open = false;
  var _openCount = 0;

  // The menu is hidden until it is opened. A visible empty menu is 10px of
  // padding and border at the end of the page, and the page is exactly as tall
  // as the window, so those 10px make the document scrollable. The body is
  // overflow:hidden, but that only stops the user from scrolling: the browser
  // still scrolls the page to reveal a focused element or a caret, and once it
  // does, the whole UI stays shifted up (mbloch/mapshaper#702).
  menu.hide();

  this.isOpen = function() {
    return _open;
  };

  this.close = close;

  function close(immediate) {
    var count = _openCount;
    if (!_open) return;
    if (immediate) {
      menu.hide();
      _open = false;
      return;
    }
    setTimeout(function() {
      if (count == _openCount) {
        menu.hide();
        _open = false;
      }
    }, 200);
  }

  function createMenuItem(label, prefixArg) {
    var prefix = prefixArg === undefined ? BULLET : prefixArg;
    return El('div')
      .appendTo(menu)
      .addClass('contextmenu-item')
      .html(prefix + label)
      .show();
  }

  function addMenuItem(label, func, prefixArg) {
    var item = createMenuItem(label, prefixArg);
    GUI.onClick(item, function(e) {
      func();
      closeOpenMenu();
    });
  }

  // An item that copies a value to the clipboard. Unlike a command item, it
  // leaves the menu open, so that several values from the same click point can
  // be copied in turn. The menu closing is therefore no longer the sign that the
  // copy happened, so the item's prefix briefly becomes a checkmark instead.
  // content: the string to copy, or a function returning it
  function addCopyItem(label, content, prefixArg) {
    var prefix = prefixArg === undefined ? BULLET : prefixArg;
    var item = createMenuItem(label, prefix);
    var timeout;

    GUI.onClick(item, function() {
      var str = typeof content == 'function' ? content() : content;
      saveFileContentToClipboard(str).then(showCopied);
    });

    function showCopied() {
      item.html(CHECKMARK + label);
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        item.html(prefix + label);
      }, COPIED_DELAY);
    }
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
    if (e.duplicateLayer) {
     addMenuItem('duplicate layer', e.duplicateLayer, '');
    }
    if (e.styleLayer) {
     addMenuItem('style layer', e.styleLayer, '');
    }
    if (e.showLayerInfo) {
     addMenuItem('show info', e.showLayerInfo, '');
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
          addCopyItem('copy as GeoJSON', getSelectionGeoJSON);
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
      if (e.raster_pixel) {
        addRasterPixel(e.raster_pixel);
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
    keepInsideWindow();

    _open = true;
    _openCount++;

    // A menu opened near the bottom of the window would otherwise hang off the
    // screen, out of reach and adding to the page's scrollable overflow.
    function keepInsideWindow() {
      var pad = 6;
      var rect = menu.node().getBoundingClientRect();
      var overflow = rect.bottom + pad - document.documentElement.clientHeight;
      var shift = Math.min(overflow, rect.top - pad);
      if (shift > 0) {
        menu.css('top', (parseFloat(menu.node().style.top) - shift) + 'px');
      }
    }

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

    // info: pixel data from internal.getRasterPixelAtMapXY()
    function addRasterPixel(info) {
      var values = info.values.map(function(val) {
        return internal.formatRasterSampleValue(val, info.isFloat);
      });
      var valueStr = values.join(', ');
      addMenuLabel(getBandLabel(info.values.length) +
        (info.valid ? '' : ' (no data)'));
      addCopyItem(valueStr, valueStr);
      if (info.color) {
        addColor(getColorString(info.color));
      }
    }

    function addColor(color) {
      addMenuLabel('color');
      addCopyItem(color, color, getSwatchHtml(color));
    }

    function addCoords(p) {
      var coordStr = p[0] + ',' + p[1];
      var displayStr = coordStr.replace(/-/g, '–').replace(',', ', ');
      addCopyItem(displayStr, coordStr);
    }

    function getSelectionGeoJSON() {
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
      return internal.geojson.formatCollection({"type": "FeatureCollection"}, features);
    }
  };
}


// rgba: [r, g, b, a] channels in the 0-255 range
function getColorString(rgba) {
  return internal.formatColor({
    r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] / 255
  });
}

function getBandLabel(bands) {
  if (bands == 1) return 'band value';
  if (bands == 3) return 'red, green, blue';
  if (bands == 4) return 'red, green, blue, alpha';
  return 'band values';
}

// A color tile, used in place of the bullet that other menu items get.
function getSwatchHtml(color) {
  return '<span class="contextmenu-swatch" style="background-color: ' +
    color + '"></span>';
}

function layerHasOpenPaths(layer, arcs) {
  var retn = false;
  internal.editShapes(layer.shapes, function(part) {
    if (!geom.pathIsClosed(part, arcs)) retn = true;
  });
  return retn;
}
