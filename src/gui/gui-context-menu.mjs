import { internal, mapshaper, geom } from './gui-core';
import { El } from './gui-el';
import { saveFileContentToClipboard } from './gui-export-control';
import { deleteFeature } from './gui-drawing-utils';
import { GUI } from './gui-lib';


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

export function openContextMenu(e, lyr, parent) {
  var menu = new ContextMenu(parent);
  closeOpenMenu();
  menu.open(e, lyr);
}

export function ContextMenu(parentArg) {
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
