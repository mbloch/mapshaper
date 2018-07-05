

function repositionLabels(container, layer, ext) {
  var fwd = ext.getTransform();
  var texts = container.getElementsByTagName('text');
  var n = texts.length;
  var text, idx, p;
  for (var i=0; i<n; i++) {
    text = texts[i];
    idx = +text.getAttribute('data-id');
    p = layer.shapes[idx];
    if (!p) continue;
    text.setAttribute('transform', getSvgSymbolTransform(p[0], ext));
  }
}

function renderLabels(lyr, ext) {
  var fwd = ext.getTransform();
  var records = lyr.data.getRecords();
  var symbols = lyr.shapes.map(function(shp, i) {
    var d = records[i];
    var obj = internal.svg.importLabel(d);
    obj.properties.transform = getSvgSymbolTransform(shp[0], ext);
    internal.svg.applyStyleAttributes(obj, 'Point', d);
    obj.properties['data-id'] = i;
    return obj;
  });
  var obj = internal.getEmptyLayerForSVG(lyr, {});
  obj.children = symbols;
  return internal.svg.stringify(obj);
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
