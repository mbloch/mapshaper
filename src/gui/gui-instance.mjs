import { WriteFilesProxy, ImportFileProxy } from './gui-proxy';
import { SessionHistory } from './gui-session-history';
import { Undo } from './gui-undo';
import { SidebarButtons } from './gui-sidebar-buttons';
import { ModeSwitcher } from './gui-modes';
import { KeyboardEvents } from './gui-keyboard';
import { InteractionMode } from './gui-interaction-mode-control';
import { EditToolbar } from './gui-edit-toolbar';
import { LabelTool } from './gui-label-tool';
import { LayerStyleTool } from './gui-layer-style-tool';
import { PointStyleTool } from './gui-point-style-tool';
import { SessionSnapshots } from './gui-session-snapshot-control';
import { Model } from './gui-model';
import { MshpMap } from './gui-map';
import { utils } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { setLoggingForGUI } from './gui-proxy';
import { initModeRules } from './gui-mode-rules';
import { ContextMenu } from './gui-context-menu';
import { Basemap } from './gui-basemap-control';
import { DisplayOptions } from './gui-display-options-menu';
import { MessageControl } from './gui-messages';
import { getRuntimeStateContext, stringifyRuntimeStateContext } from './gui-runtime-context';
import { startRasterSourceStoreLifecycle } from './gui-raster-source-store';
// import { ProjectOptions } from './gui-project-control';


export function GuiInstance(container, opts) {
  var gui = new ModeSwitcher();
  opts = utils.extend({
    // defaults
    homeControl: true,
    zoomControl: true,
    inspectorControl: true,
    saveControl: true,
    disableNavigation: false,
    focus: true
  }, opts);

  gui.options = opts;
  gui.container = El(container);
  gui.model = new Model(gui);
  gui.keyboard = new KeyboardEvents(gui);
  gui.buttons = new SidebarButtons(gui);
  gui.display = new DisplayOptions(gui);
  gui.messages = new MessageControl(gui);
  gui.basemap = new Basemap(gui);
  gui.session = new SessionHistory(gui);
  gui.contextMenu = new ContextMenu();
  gui.undo = new Undo(gui);
  gui.map = new MshpMap(gui);
  // gui.project = new ProjectOptions(gui);


  gui.state = {};
  var sidebarPanel = null;
  var lastSidebarPanel = 'console';
  var sidebarWidth = GUI.getSavedValue('sidebar_width') || 0;
  var sidebarResizeFrame = null;

  var msgCount = 0;
  var clearMsg;

  initModeRules(gui);
  startRasterSourceStoreLifecycle();
  gui.map.init();

  if (opts.saveControl) {
    new SessionSnapshots(gui);
  }
  gui.interaction = new InteractionMode(gui);
  gui.editToolbar = new EditToolbar(gui);
  gui.labelTool = new LabelTool(gui);
  gui.layerStyleTool = new LayerStyleTool(gui);
  gui.pointStyleTool = new PointStyleTool(gui);

  gui.showProgressMessage = function(msg) {
    if (!gui.progressMessage) {
      gui.progressMessage = El('div').addClass('progress-message')
        .appendTo('body');
    }
    El('<div>').text(msg).appendTo(gui.progressMessage.empty().show());
    clearMsg = getClearFunction(msgCount);
  };

  function getClearFunction(count) {
    var time = Date.now();
    // wait at least [min] milliseconds before closing
    var min = 400;
    msgCount = ++count;
    return function() {
      setTimeout(function() {
        if (count != msgCount) return;
        if (gui.progressMessage) gui.progressMessage.hide();
      }, Math.max(min - (Date.now() - time), 0));
    };
  }

  gui.clearProgressMessage = function() {
    if (clearMsg) clearMsg();
    // if (gui.progressMessage) gui.progressMessage.hide();
  };

  if (sidebarWidth) {
    setSidebarWidth(sidebarWidth);
  }

  gui.getSidebarPanel = function() {
    return sidebarPanel;
  };

  gui.setSidebarPanel = function(name) {
    var prev = sidebarPanel;
    sidebarPanel = name || null;
    if (sidebarPanel && gui.getMode()) {
      gui.clearMode();
    }
    if (sidebarPanel == prev) return;
    if (sidebarPanel) {
      lastSidebarPanel = sidebarPanel;
    }
    gui.container
      .classed('sidebar-open', !!sidebarPanel)
      .classed('layers-open', sidebarPanel == 'layers')
      .classed('console-open', sidebarPanel == 'console');
    gui.dispatchEvent('sidebar', {name: sidebarPanel, prev: prev});
    gui.dispatchEvent('resize');
  };

  gui.toggleSidebarPanel = function(name) {
    gui.setSidebarPanel(sidebarPanel == name ? null : name);
  };

  gui.toggleSidebar = function() {
    gui.setSidebarPanel(sidebarPanel ? null : lastSidebarPanel);
  };

  gui.sidebarPanelIsOpen = function() {
    return !!sidebarPanel;
  };

  gui.consoleIsOpen = function() {
    return sidebarPanel == 'console';
  };

  initSidebarResizing();

  gui.getRuntimeStateContext = function() {
    return getRuntimeStateContext(gui);
  };

  gui.stringifyRuntimeStateContext = function() {
    return stringifyRuntimeStateContext(gui);
  };

  // Make this instance interactive and editable
  gui.focus = function() {
    var curr = GUI.__active;
    if (curr == gui) return;
    if (curr) {
      curr.blur();
    }
    GUI.__active = gui;
    setLoggingForGUI(gui);
    ImportFileProxy(gui);
    WriteFilesProxy(gui);
    gui.dispatchEvent('active');
  };

  gui.blur = function() {
    if (GUI.isActiveInstance(gui)) {
      GUI.__active = null;
      gui.dispatchEvent('inactive');
    }
  };

  // switch between multiple gui instances on mouse click
  gui.container.node().addEventListener('mouseup', function(e) {
    if (GUI.isActiveInstance(gui)) return;
    e.stopPropagation();
    gui.focus();
  }, true); // use capture

  if (opts.focus) {
    gui.focus();
  }

  return gui;

  function initSidebarResizing() {
    var handle = gui.container.findChild('.sidebar-resize-handle');
    if (!handle) return;
    handle.on('mousedown', function(e) {
      if (!gui.sidebarPanelIsOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      gui.container.addClass('sidebar-resizing');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onRelease);
    });

    function onMove(e) {
      setSidebarWidth(e.pageX);
      scheduleSidebarResize();
    }

    function onRelease() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onRelease);
      gui.container.removeClass('sidebar-resizing');
      GUI.setSavedValue('sidebar_width', sidebarWidth);
      scheduleSidebarResize();
    }
  }

  function setSidebarWidth(width) {
    sidebarWidth = clampSidebarWidth(width);
    gui.container.node().style.setProperty('--left-sidebar-width', sidebarWidth + 'px');
  }

  function clampSidebarWidth(width) {
    var max = Math.min(720, Math.round(window.innerWidth * 0.6));
    return Math.max(220, Math.min(max, Math.round(width)));
  }

  function scheduleSidebarResize() {
    if (sidebarResizeFrame) return;
    sidebarResizeFrame = requestAnimationFrame(function() {
      sidebarResizeFrame = null;
      gui.dispatchEvent('resize');
    });
  }
}
