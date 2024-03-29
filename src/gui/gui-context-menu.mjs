import { internal, mapshaper, geom } from './gui-core';
import { El } from './gui-el';
import { saveFileContentToClipboard } from './gui-export-control';

export function ContextMenu() {
  var body = document.querySelector('body');
  var menu = El('div').addClass('contextmenu rollover').appendTo(body);
  var _open = false;
  var _openCount = 0;
  document.addEventListener('mousedown', close);

  this.isOpen = function() {
    return _open;
  };

  function close() {
    var count = _openCount;
    if (!_open) return;
    setTimeout(function() {
      if (count == _openCount) {
        menu.hide();
        _open = false;
      }
    }, 300);
  }

  function addMenuItem(label, func) {
    El('div')
      .appendTo(menu)
      .addClass('contextmenu-item')
      .html(label)
      .on('click', func)
      .show();
  }

  this.open = function(e, lyr) {
    if (!lyr || !lyr.gui.geographic) return;
    _open = true;
    _openCount++;
    var rspace = body.clientWidth - e.pageX;
    var xoffs = 10;
    menu.empty().show();
    if (rspace > 150) {
      menu.css('left', e.pageX + xoffs + 'px');
      menu.css('right', null);
    } else {
      menu.css('right', (body.clientWidth - e.pageX + xoffs) + 'px');
      menu.css('left', null);
    }
    menu.css('top', (e.pageY - 15) + 'px');

    // menu contents
    if (e.coordinates) {
      addCopyCoords();
    }
    if (e.deleteVertex) {
      addMenuItem('Delete vertex', e.deleteVertex);
    }
    if (e.ids?.length) {
      addMenuItem('Copy as GeoJSON', copyGeoJSON);
    }

    function addCopyCoords() {
      var bbox = internal.getLayerBounds(lyr, lyr.gui.source.dataset.arcs).toArray();
      var coordStr = internal.getRoundedCoordString(e.coordinates, internal.getBoundsPrecisionForDisplay(bbox));
      var displayStr = '• &nbsp;' + coordStr.replace(/-/g, '–').replace(',', ', ');
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
