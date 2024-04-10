import { internal, mapshaper, geom } from './gui-core';
import { El } from './gui-el';
import { saveFileContentToClipboard } from './gui-export-control';
import { deleteFeature } from './gui-drawing-utils';

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
    }, 200);
  }

  function addMenuItem(label, func) {
    var prefix = '• &nbsp;';

    El('div')
      .appendTo(menu)
      .addClass('contextmenu-item')
      .html(prefix + label)
      .on('click', func)
      .show();
  }

  function addMenuLabel(label) {
    El('div')
      .appendTo(menu)
      .addClass('contextmenu-label')
      .html(label);
  }

  this.open = function(e, lyr) {
    var copyable = e.ids?.length;
    if (lyr && !lyr.gui.geographic) return; // no popup for tabular data
    menu.empty();

    // menu contents
    //
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
      addMenuLabel('easting, northing');
      addCoords(e.projected_coordinates);
    }

    if (menu.node().childNodes.length === 0) {
      return;
    }

    _open = true;
    _openCount++;
    var rspace = body.clientWidth - e.pageX;
    var xoffs = 10;
    if (rspace > 150) {
      menu.css('left', e.pageX + xoffs + 'px');
      menu.css('right', null);
    } else {
      menu.css('right', (body.clientWidth - e.pageX + xoffs) + 'px');
      menu.css('left', null);
    }
    menu.css('top', (e.pageY - 15) + 'px');
    menu.show();

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
