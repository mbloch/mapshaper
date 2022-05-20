import { repositionSymbols, renderSymbols } from './gui-svg-symbols';
import { renderFurniture, repositionFurniture } from './gui-svg-furniture';
import { El } from './gui-el';
import { utils } from './gui-core';
import { error } from '../utils/mapshaper-logging';

export function SvgDisplayLayer(gui, ext, mouse) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var el = El(svg);

  el.clear = function() {
    while (svg.childNodes.length > 0) {
      svg.removeChild(svg.childNodes[0]);
    }
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
    var classNames = [id, 'mapshaper-svg-layer', 'mapshaper-' + type + '-layer'];
    g.setAttribute('class', classNames.join(' '));
    target.svg_id = id;
    resize(ext);
    if (type == 'label' || type == 'symbol') {
      html = renderSymbols(target.layer, ext, type);
    } else if (type == 'furniture') {
      html = renderFurniture(target.layer, ext);
    }
    g.innerHTML = html;
    svg.append(g);

    // prevent svg hit detection on inactive layers
    if (!target.active) {
      g.style.pointerEvents = 'none';
    }
  };

  function reposition(target, type, ext) {
    var container = el.findChild('.' + target.svg_id).node();
    var elements;
    if (type == 'symbol') {
      elements = El.findAll('.mapshaper-svg-symbol', container);
      repositionSymbols(elements, target.layer, ext);
    } else if (type == 'furniture') {
      repositionFurniture(container, target.layer, ext);
    } else {
      // container.getElementsByTagName('text')
      error('Unsupported symbol type:', type);
    }
  }

  function resize(ext) {
    svg.style.width = ext.width() + 'px';
    svg.style.height = ext.height() + 'px';
  }

  return el;
}
