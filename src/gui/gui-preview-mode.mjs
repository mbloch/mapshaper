import { El } from './gui-el';
import { internal } from './gui-core';

var SVG_NS = 'http://www.w3.org/2000/svg';

export function PreviewMode(gui) {
  var self = this;
  var ext = gui.map.getExtent();
  var mapLayers = gui.container.findChild('.map-layers').node();
  var map = gui.container.findChild('.mshp-main-map');
  var toggle = gui.buttons.addButton('#frame-tool-icon')
    .addClass('menu-btn preview-toggle')
    .attr('title', 'Toggle map preview');
  var readout = El('div')
    .addClass('preview-readout')
    .appendTo(map)
    .hide();
  var readoutLabel = El('span').addClass('preview-readout-label').appendTo(readout);
  El('span').addClass('preview-readout-arrow').text('⌄').appendTo(readout);
  var menu = El('div').addClass('preview-scale-menu').appendTo(readout);
  var temporaryReadout = null;
  var backgroundSvg = createSvgNode('svg');
  var background = createSvgNode('rect');
  var svg = createSvgNode('svg');
  var mask = createSvgNode('path');
  var neatline = createSvgNode('rect');
  var border = createSvgNode('rect');

  gui.state.preview_mode = false;
  gui.previewMode = this;

  backgroundSvg.classList.add('preview-background-overlay');
  background.classList.add('preview-page-background');
  backgroundSvg.appendChild(background);
  mapLayers.insertBefore(backgroundSvg, mapLayers.firstChild);
  svg.classList.add('preview-overlay');
  mask.classList.add('preview-outside-mask');
  mask.setAttribute('fill-rule', 'evenodd');
  neatline.classList.add('preview-page-neatline');
  border.classList.add('preview-page-border');
  svg.appendChild(mask);
  svg.appendChild(neatline);
  svg.appendChild(border);
  mapLayers.appendChild(svg);
  hideOverlay();

  [
    {label: '50%', scale: 0.5},
    {label: '67%', scale: 0.67},
    {label: '100%', scale: 1},
    {label: '150%', scale: 1.5},
    {label: '200%', scale: 2},
    {label: 'Fit page', fit: true}
  ].forEach(function(item) {
    El('div')
      .addClass('preview-scale-menu-item')
      .attr('data-preview-scale', item.fit ? 'fit' : String(item.scale))
      .text(item.label)
      .appendTo(menu)
      .on('click', function(e) {
        e.stopPropagation();
        closeMenu();
        if (item.fit) {
          ext.home();
        } else {
          ext.zoomToFrameMagnification(item.scale);
        }
        gui.dispatchEvent('map_interaction_end');
      });
  });

  toggle.on('click', function(e) {
    e.stopPropagation();
    if (!hasFrame()) {
      if (gui.frameTool) gui.frameTool.openCreateDialog();
      return;
    }
    self.setOn(!self.isOn());
  });

  readout.on('click', function(e) {
    e.stopPropagation();
    readout.classed('open', !readout.hasClass('open'));
  });

  gui.on('map_click', closeMenu);
  gui.on('map_rendered', function() {
    refreshControls();
    renderOverlay();
  });
  gui.on('preview_mode_change', refreshControls);
  gui.model.on('update', function() {
    if (!hasFrame() && self.isOn()) {
      gui.map.setPreviewMode(false, false);
    }
    refreshControls();
  });
  ext.on('change', updateReadout);

  this.isOn = function() {
    return !!gui.state.preview_mode;
  };

  this.setOn = function(on) {
    gui.map.setPreviewMode(!!on, true);
    refreshControls();
  };

  this.getReadoutText = function() {
    return readoutLabel.text();
  };

  this.setTemporaryReadout = function(frame, scale) {
    temporaryReadout = {frame: frame, scale: scale};
    updateReadout();
  };

  this.clearTemporaryReadout = function() {
    temporaryReadout = null;
    updateReadout();
  };

  refreshControls();

  function hasFrame() {
    return !!internal.getActiveFrame(gui.model);
  }

  function refreshControls() {
    var available = hasFrame();
    toggle.removeClass('disabled');
    toggle.classed('selected', available && self.isOn());
    toggle.attr('title', available ? 'Toggle map preview' : 'Add map frame');
    toggle.attr('aria-disabled', 'false');
    toggle.attr('aria-pressed', available && self.isOn() ? 'true' : 'false');
    if (gui.map.isPreviewView()) {
      readout.show();
      updateReadout();
    } else {
      readout.hide();
      closeMenu();
    }
  }

  function updateReadout() {
    if (!gui.map.isPreviewView()) return;
    var frame = temporaryReadout ?
      temporaryReadout.frame : gui.map.getPreviewFrameData();
    if (!frame) return;
    var size = internal.formatFrameSizeForDisplay(frame);
    var scale = temporaryReadout ?
      temporaryReadout.scale : ext.getSymbolScale();
    var pct = Math.round(scale * 100);
    readoutLabel.text(size + ' · ' + pct + '%');
  }

  function renderOverlay() {
    if (!gui.map.isPreviewView()) {
      hideOverlay();
      return;
    }
    var frame = gui.map.getPreviewFrameData();
    if (!frame) {
      hideOverlay();
      return;
    }
    var p1 = ext.translateCoords(frame.bbox[0], frame.bbox[3]);
    var p2 = ext.translateCoords(frame.bbox[2], frame.bbox[1]);
    var x = Math.min(p1[0], p2[0]);
    var y = Math.min(p1[1], p2[1]);
    var w = Math.abs(p2[0] - p1[0]);
    var h = Math.abs(p2[1] - p1[1]);
    var viewW = ext.width();
    var viewH = ext.height();
    var style = getFrameStyle();
    backgroundSvg.setAttribute('width', viewW);
    backgroundSvg.setAttribute('height', viewH);
    backgroundSvg.setAttribute('viewBox', '0 0 ' + viewW + ' ' + viewH);
    svg.setAttribute('width', viewW);
    svg.setAttribute('height', viewH);
    svg.setAttribute('viewBox', '0 0 ' + viewW + ' ' + viewH);
    mask.setAttribute(
      'd',
      'M0 0H' + viewW + 'V' + viewH + 'H0Z ' +
      'M' + x + ' ' + y + 'V' + (y + h) + 'H' + (x + w) +
      'V' + y + 'H' + x + 'Z'
    );
    border.setAttribute('x', x);
    border.setAttribute('y', y);
    border.setAttribute('width', w);
    border.setAttribute('height', h);
    setRectGeometry(background, x, y, w, h);
    setRectGeometry(neatline, x, y, w, h);
    applyFrameStyle(style);
    svg.style.display = '';
  }

  function hideOverlay() {
    backgroundSvg.style.display = 'none';
    svg.style.display = 'none';
  }

  function getFrameStyle() {
    var target = internal.getActiveFrame(gui.model);
    return target && target.layer.data ?
      target.layer.data.getReadOnlyRecordAt(0) || {} : {};
  }

  function applyFrameStyle(style) {
    var strokeWidth = Number(style['stroke-width']);
    var hasFill = style.fill && style.fill != 'none';
    var hasStroke = style.stroke && style.stroke != 'none' && strokeWidth > 0;
    if (hasFill) {
      background.setAttribute('fill', style.fill);
      background.setAttribute('fill-opacity',
        style['fill-opacity'] === undefined ? 1 : style['fill-opacity']);
      backgroundSvg.style.display = '';
    } else {
      backgroundSvg.style.display = 'none';
    }
    if (hasStroke) {
      neatline.setAttribute('fill', 'none');
      neatline.setAttribute('stroke', style.stroke);
      // Stroke width is in output pixels, so it has to be scaled to the size
      // the page is drawn at or the neatline reads thinner than it will print.
      neatline.setAttribute('stroke-width', strokeWidth * ext.getSymbolScale());
      neatline.setAttribute('stroke-opacity',
        style['stroke-opacity'] === undefined ? 1 : style['stroke-opacity']);
      neatline.style.display = '';
    } else {
      neatline.style.display = 'none';
    }
    // The border is chrome, there to show where the page is when nothing else
    // marks it. A neatline is the page edge, and since the border is painted
    // last it was covering every neatline with the same dark grey line.
    border.style.display = hasStroke ? 'none' : '';
  }

  function closeMenu() {
    readout.removeClass('open');
  }
}

function createSvgNode(name) {
  return document.createElementNS(SVG_NS, name);
}

function setRectGeometry(rect, x, y, width, height) {
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
}
