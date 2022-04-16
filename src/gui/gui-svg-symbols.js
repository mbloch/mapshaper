import { internal } from './gui-core';

export function getSymbolNodeId(node) {
  return parseInt(node.getAttribute('data-id'));
}

export function getSvgSymbolTransform(xy, ext) {
  var scale = ext.getSymbolScale();
  var p = ext.translateCoords(xy[0], xy[1]);
  return internal.svg.getTransform(p, scale);
}


export function repositionSymbols(elements, layer, ext) {
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

export function renderSymbols(lyr, ext, type) {
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
