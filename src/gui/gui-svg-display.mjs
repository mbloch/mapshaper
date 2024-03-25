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

  el.reposition = function(lyr, type) {
    resize(ext);
    reposition(lyr, type, ext);
  };

  el.drawLayer = function(lyr, type) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var html = '';
    // generate a unique id so layer can be identified when symbols are repositioned
    // use it as a class name to avoid id collisions
    var id = utils.getUniqueName();
    var classNames = [id, 'mapshaper-svg-layer', 'mapshaper-' + type + '-layer'];
    g.setAttribute('class', classNames.join(' '));
    lyr.gui.svg_id = id;
    lyr.gui.svg_container = g;
    resize(ext);
    if (type == 'label' || type == 'symbol') {
      html = renderSymbols(lyr.gui.displayLayer, ext);
    } else if (type == 'furniture') {
      html = renderFurniture(lyr.gui.displayLayer, ext);
    }
    g.innerHTML = html;
    svg.append(g);

    // prevent svg hit detection on inactive layers
    if (!lyr.active) {
      g.style.pointerEvents = 'none';
    }
  };

  function reposition(lyr, type, ext) {
    var container = el.findChild('.' + lyr.gui.svg_id);
    if (!container || !container.node()) {
      console.error('[reposition] missing SVG container');
      return;
    }
    var elements;
    if (type == 'symbol') {
      elements = El.findAll('.mapshaper-svg-symbol', container.node());
      repositionSymbols(elements, lyr.gui.displayLayer, ext);
    } else if (type == 'furniture') {
      repositionFurniture(container.node(), lyr.gui.displayLayer, ext);
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
