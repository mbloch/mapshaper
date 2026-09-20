import { El } from './gui-el';
import { internal } from './gui-core';

var SVG_NS = 'http://www.w3.org/2000/svg';

export function PreviewMode(gui) {
  var self = this;
  var ext = gui.map.getExtent();
  var mapLayers = gui.container.findChild('.map-layers').node();
  var map = gui.container.findChild('.mshp-main-map');
  var toggle = gui.buttons.addButton('#preview-icon')
    .addClass('menu-btn preview-toggle')
    .attr('title', 'Toggle map preview');
  var readout = El('div')
    .addClass('preview-readout')
    .appendTo(map)
    .hide();
  var readoutLabel = El('span').addClass('preview-readout-label').appendTo(readout);
  El('span').addClass('preview-readout-arrow').text('⌄').appendTo(readout);
  var menu = El('div').addClass('preview-scale-menu').appendTo(readout);
  var svg = createSvgNode('svg');
  var mask = createSvgNode('path');
  var border = createSvgNode('rect');

  gui.state.preview_mode = false;
  gui.previewMode = this;

  svg.classList.add('preview-overlay');
  mask.classList.add('preview-outside-mask');
  mask.setAttribute('fill-rule', 'evenodd');
  border.classList.add('preview-page-border');
  svg.appendChild(mask);
  svg.appendChild(border);
  mapLayers.appendChild(svg);
  hideOverlay();

  [
    {label: '100%', scale: 1},
    {label: '50%', scale: 0.5},
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
    if (!hasFrame()) return;
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

  refreshControls();

  function hasFrame() {
    return !!internal.getActiveFrame(gui.model);
  }

  function refreshControls() {
    var available = hasFrame();
    toggle.classed('disabled', !available);
    toggle.classed('selected', available && self.isOn());
    toggle.attr('aria-disabled', available ? 'false' : 'true');
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
    var frame = gui.map.getPreviewFrameData();
    if (!frame) return;
    var size = internal.formatFrameSizeForDisplay(frame);
    var pct = Math.round(ext.getSymbolScale() * 100);
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
    svg.style.display = '';
  }

  function hideOverlay() {
    svg.style.display = 'none';
  }

  function closeMenu() {
    readout.removeClass('open');
  }
}

function createSvgNode(name) {
  return document.createElementNS(SVG_NS, name);
}
