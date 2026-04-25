import { El } from './gui-el';
import { GUI } from './gui-lib';

// A reusable floating toolbar anchored at the bottom-center of the map area.
//
// Multiple toolbars stack vertically inside a shared container, so additional
// per-mode toolbars (e.g. feature styling) can coexist with the edit toolbar.
//
// The DOM is structured to leave room for a future drag handle without
// requiring rework: the toolbar element is a flex row with a content slot,
// and a sibling drag-handle slot can be added later.
//
// Constructor options:
//   name:       optional CSS class added to the toolbar element
//   transition: ms for the show/hide transition (default 150)
//
// API:
//   toolbar.addButton(iconRef, opts) -> ToolbarButton
//   toolbar.addSeparator()
//   toolbar.show()
//   toolbar.hide()
//   toolbar.visible()
//   toolbar.node()

export function FloatingToolbar(gui, opts) {
  opts = opts || {};
  var transitionMs = opts.transition || 150;
  var root = gui.container.findChild('.mshp-main-map');
  var stack = root.findChild('.floating-toolbar-stack');
  if (!stack) {
    stack = El('div').addClass('floating-toolbar-stack').appendTo(root);
  }
  var el = El('div').addClass('floating-toolbar');
  if (opts.name) el.addClass(opts.name);
  var content = El('div').addClass('floating-toolbar-content').appendTo(el);
  var visible = false;
  var hideTimer = null;

  el.appendTo(stack);
  el.css('display', 'none');

  // Hide when this gui instance becomes inactive (e.g. multi-instance mode)
  gui.on('active', updateVisibility);
  gui.on('inactive', updateVisibility);

  this.addButton = function(iconRef, btnOpts) {
    return new ToolbarButton(content, iconRef, btnOpts || {});
  };

  this.addSeparator = function() {
    return El('div').addClass('floating-toolbar-separator').appendTo(content);
  };

  this.show = function() {
    if (visible) return;
    visible = true;
    updateVisibility();
  };

  this.hide = function() {
    if (!visible) return;
    visible = false;
    updateVisibility();
  };

  this.visible = function() {
    return visible;
  };

  this.node = function() {
    return el.node();
  };

  function updateVisibility() {
    var shouldShow = visible && GUI.isActiveInstance(gui);
    if (shouldShow) {
      clearTimeout(hideTimer);
      hideTimer = null;
      el.css('display', 'flex');
      // wait one frame so the browser registers the initial state before
      // the transition kicks in
      requestAnimationFrame(function() {
        el.addClass('visible');
      });
    } else {
      el.removeClass('visible');
      // wait for the transition to finish before hiding completely
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function() {
        if (!(visible && GUI.isActiveInstance(gui))) {
          el.css('display', 'none');
        }
      }, transitionMs);
    }
  }
}

function ToolbarButton(parent, iconRef, opts) {
  var btn = El('div').addClass('floating-toolbar-btn').appendTo(parent);
  if (iconRef) {
    var iconNode = El('body').findChild(iconRef);
    if (iconNode) {
      var icon = iconNode.node().cloneNode(true);
      if (icon.hasAttribute('id')) icon.removeAttribute('id');
      btn.node().appendChild(icon);
    }
  }
  var enabled = true;
  var clickHandlers = [];

  if (opts.tooltip) setTooltip(opts.tooltip);

  // Block native dblclick to avoid the map's double-click zoom
  btn.on('dblclick', function(e) { e.stopPropagation(); });

  btn.on('click', function(e) {
    if (!enabled) return;
    for (var i = 0; i < clickHandlers.length; i++) {
      clickHandlers[i](e);
    }
  });

  this.on = function(event, fn) {
    if (event == 'click') {
      clickHandlers.push(fn);
    } else {
      btn.on(event, fn);
    }
    return this;
  };

  this.enable = function() { return this.setEnabled(true); };
  this.disable = function() { return this.setEnabled(false); };

  this.setEnabled = function(b) {
    enabled = !!b;
    btn.classed('disabled', !enabled);
    return this;
  };

  this.setTooltip = setTooltip;

  this.node = function() {
    return btn.node();
  };

  function setTooltip(text) {
    btn.attr('data-tooltip', text);
  }
}
