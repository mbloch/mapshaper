import { repositionSymbols, renderSymbols, updateLabelPaths, markLabelPathScale } from './gui-svg-symbols';
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

  // Sizes the <svg> to the map without drawing anything into it.
  //
  // Needed because an <svg> with no size falls back to 300x150, which clips
  // everything outside it and takes no pointer events there. Drawing a layer
  // sizes it, so any content that does not come from a layer -- the label being
  // typed into before it has been created -- has to ask for the size itself.
  el.ensureSize = function() {
    resize(ext);
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
      html = renderSymbols(lyr.gui.displayLayer, ext, id);
    } else if (type == 'furniture') {
      html = renderFurniture(lyr.gui.displayLayer, ext);
    }
    g.innerHTML = html;
    if (type == 'label' || type == 'symbol') {
      markLabelPathScale(g, ext);
    }
    svg.append(g);

    // prevent svg hit detection on inactive layers
    if (!gui.map.isActiveLayer(lyr)) {
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
      // a symbol group's transform absorbs panning, and zooming too when a
      // frame is defined; anything it can't absorb needs the baselines rebuilt
      updateLabelPaths(container.node(), lyr.gui.displayLayer, ext);
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
