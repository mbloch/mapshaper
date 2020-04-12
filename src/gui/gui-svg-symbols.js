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
  var el, idx, p;
  for (var i=0, n=elements.length; i<n; i++) {
    el = elements[i];
    idx = getSymbolNodeId(el);
    p = layer.shapes[idx];
    if (!p) continue;
    el.setAttribute('transform', getSvgSymbolTransform(p[0], ext));
  }
}

export function renderSymbols(lyr, ext, type) {
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
