
function getSvgSymbolTransform(xy, ext) {
  var scale = ext.getSymbolScale();
  var p = ext.translateCoords(xy[0], xy[1]);
  return internal.svg.getTransform(p, scale);
}

function repositionSymbols(container, layer, ext) {
  var fwd = ext.getTransform();
  var symbols = El.findAll('.mapshaper-svg-symbol', container);
  var n = symbols.length;
  var sym, idx, p;
  for (var i=0; i<n; i++) {
    sym = symbols[i];
    idx = +sym.getAttribute('data-id');
    p = layer.shapes[idx];
    if (!p) continue;
    sym.setAttribute('transform', getSvgSymbolTransform(p[0], ext));
  }
}

function renderSymbols(lyr, ext) {
  var records = lyr.data.getRecords();
  var symbols = lyr.shapes.map(function(shp, i) {
    var d = records[i];
    var obj = internal.svg.importSymbol(d['svg-symbol']);
    obj.properties.transform = getSvgSymbolTransform(shp[0], ext);
    obj.properties['data-id'] = i;
    return obj;
  });
  var obj = internal.getEmptyLayerForSVG(lyr, {});
  obj.children = symbols;
  return internal.svg.stringify(obj);
}
