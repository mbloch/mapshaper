

function repositionSymbols(container, layer, fwd) {
  var symbols = El.findAll('.mapshaper-svg-symbol', container);
  var n = symbols.length;
  var sym, xy, idx, p;
  for (var i=0; i<n; i++) {
    sym = symbols[i];
    idx = +sym.getAttribute('data-id');
    p = layer.shapes[idx];
    if (!p) continue;
    xy = fwd.transform(p[0][0], p[0][1]);
    sym.setAttribute('transform', internal.svg.getTransform(xy));
  }
}

function renderSymbols(lyr, fwd) {
  var records = lyr.data.getRecords();
  var symbols = lyr.shapes.map(function(shp, i) {
    var d = records[i];
    var p = shp[0];
    var p2 = fwd.transform(p[0], p[1]);
    var obj = internal.svg.importSymbol(p2, d['svg-symbol']);
    obj.properties['data-id'] = i;
    return obj;
  });
  var obj = internal.getEmptyLayerForSVG(lyr, {});
  obj.children = symbols;
  return internal.svg.stringify(obj);
}
