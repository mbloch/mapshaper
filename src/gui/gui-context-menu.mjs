import { internal, mapshaper, geom } from './gui-core';
import { El } from './gui-el';
import { saveFileContentToClipboard } from './gui-export-control';

var closingMenu;

export function showContextMenu(e, lyr) {
  var body = document.querySelector('body');
  var menu = El('div').addClass('contextmenu rollover').appendTo(body);
  var rspace = body.clientWidth - e.pageX;
  var xoffs = 10;
  if (rspace > 150) {
    menu.css('left', e.pageX + xoffs + 'px');
  } else {
    menu.css('right', (body.clientWidth - e.pageX + xoffs) + 'px');
  }
  menu.css('top', (e.pageY - 15) + 'px');
  if (closingMenu) closingMenu.remove();
  document.addEventListener('mousedown', close);

  // menu contents
  if (e.deleteVertex) {
    addMenuItem('Delete vertex', e.deleteVertex);
  }
  if (e.coordinates) {
    addCopyCoords();
  }
  if (e.ids?.length) {
    addMenuItem('Copy as GeoJSON', copyGeoJSON);
  }


  function addMenuItem(label, func) {
    El('div')
      .appendTo(menu)
      .addClass('contextmenu-item')
      .text(label)
      .on('click', func)
      .show();
  }

  function close() {
    closingMenu = menu;
    setTimeout(function() {
      if (closingMenu == menu) {
        menu.remove();
        closingMenu = null;
      }
    }, 300);
    document.removeEventListener('mousedown', close);
  }

  function addCopyCoords() {
    var bbox = internal.getLayerBounds(lyr, lyr.gui.source.dataset.arcs).toArray();
    var p = internal.getRoundedCoords(e.coordinates, internal.getBoundsPrecisionForDisplay(bbox));
    var coordStr = p.join(',');
    addMenuItem(coordStr, function() {
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
    if (layerHasOpenPaths(layer, dataset.arcs)) {
      layer.geometry_type = 'polyline';
    }
    var features = internal.exportLayerAsGeoJSON(layer, dataset, {rfc7946: true, prettify: true}, true, 'string');
    var str = internal.geojson.formatCollection({"type": "FeatureCollection"}, features);
    saveFileContentToClipboard(str);
  }

  function layerHasOpenPaths(layer, arcs) {
    var retn = false;
    internal.editShapes(layer.shapes, function(part) {
      if (!geom.pathIsClosed(part, arcs)) retn = true;
    });
    return retn;
  }

}
