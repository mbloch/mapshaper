/* @requires
mapshaper-gui-lib
mapshaper-svg-symbols
mapshaper-svg-furniture
mapshaper-symbol-dragging
*/

function SvgDisplayLayer(gui, ext, mouse) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var el = El(svg);
  var editor;

  if (mouse) editor = new SymbolDragging(gui, ext, mouse, svg);

  el.clear = function() {
    while (svg.childNodes.length > 0) {
      svg.removeChild(svg.childNodes[0]);
    }
    if (editor) editor.clear();
  };

  el.reposition = function(target, type) {
    resize(ext);
    reposition(target, type, ext);
  };

  el.drawLayer = function(target, type) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var html = '';
    // generate a unique id so layer can be identified when symbols are repositioned
    // use it as a class name to avoid id collisions
    var id = utils.getUniqueName();
    g.setAttribute('class', id);
    target.svg_id = id;
    resize(ext);
    if (type == 'label' || type == 'symbol') {
      html = renderSymbols(target.layer, ext, type);
    } else if (type == 'furniture') {
      html = renderFurniture(target.layer, ext);
    }
    g.innerHTML = html;
    svg.append(g);
    // TODO: support mouse dragging on symbol layers
    if (editor && target.active && type == 'label') {
      editor.editLayer(target, type);
    } else {
      g.style.pointerEvents = 'none';
    }
  };

  function reposition(target, type, ext) {
    var container = el.findChild('.' + target.svg_id).node();
    var elements;
    if (type == 'label' || type == 'symbol') {
      elements = type == 'label' ? container.getElementsByTagName('text') :
          El.findAll('.mapshaper-svg-symbol', container);
      repositionSymbols(elements, target.layer, ext);
    } else if (type == 'furniture') {
      repositionFurniture(container, target.layer, ext);
    }
  }

  function resize(ext) {
    svg.style.width = ext.width() + 'px';
    svg.style.height = ext.height() + 'px';
  }

  return el;
}
