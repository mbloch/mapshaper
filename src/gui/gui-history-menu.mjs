import {
  appUndoForcedByUrl,
  appUndoSettingIsOn
} from './gui-app-undo';

var APP_UNDO_KEY = 'mapshaper.undo';

export function HistoryMenu(gui) {
  var btn = gui.container.findChild('.history-btn');
  var menu = gui.container.findChild('.history-menu-dropdown');
  if (!btn || !menu) return;

  var closeBtn = menu.findChild('.close2-btn');
  // var undoBtn = menu.findChild('.history-undo-btn');
  // var redoBtn = menu.findChild('.history-redo-btn');
  var toggleBtn = menu.findChild('.history-toggle-btn');
  var toggleCheckbox = menu.findChild('.history-undo-checkbox');
  var note = menu.findChild('.history-menu-note');
  var clearBtn = menu.findChild('.history-clear-btn');
  var commandLogBtn = menu.findChild('.history-command-log-btn');

  gui.appUndoIsEnabled = isAppUndoEnabled;

  gui.addMode('history_menu', turnOn, turnOff, btn);

  btn.on('keydown', function(e) {
    if (e.key == 'Enter' || e.key == ' ') {
      e.preventDefault();
      gui.enterMode(gui.getMode() == 'history_menu' ? null : 'history_menu');
    }
  });

  closeBtn.on('click', gui.clearMode);

  // undoBtn.on('click', function(e) {
  //   e.stopPropagation();
  //   if (gui.undo.canUndo()) gui.undo.undo();
  //   gui.clearMode();
  // });

  // redoBtn.on('click', function(e) {
  //   e.stopPropagation();
  //   if (gui.undo.canRedo()) gui.undo.redo();
  //   gui.clearMode();
  // });

  toggleBtn.on('click', function(e) {
    e.stopPropagation();
  });

  toggleCheckbox.on('change', function(e) {
    e.stopPropagation();
    if (appUndoForcedByUrl()) return;
    setAppUndoEnabled(!!toggleCheckbox.node().checked);
    updateMenuState();
  });

  clearBtn.on('click', function(e) {
    e.stopPropagation();
    gui.undo.clear();
    updateMenuState();
    clearUndoPayloadStore().then(updateMenuState).catch(function(err) {
      console.error(err);
    });
  });

  commandLogBtn.on('click', function(e) {
    e.stopPropagation();
    if (gui.console) gui.console.runCommand('history');
    gui.clearMode();
  });

  document.addEventListener('keydown', function(e) {
    if (gui.getMode() == 'history_menu' && e.key == 'Escape') {
      gui.clearMode();
      btn.node().focus();
    }
  });

  gui.on('history_change', updateMenuState);
  updateMenuState();

  function turnOn() {
    btn.attr('aria-expanded', 'true');
    updateMenuState();
    menu.show();
  }

  function turnOff() {
    btn.attr('aria-expanded', 'false');
    menu.hide();
  }

  function updateMenuState() {
    // setItemEnabled(undoBtn, gui.undo.canUndo());
    // setItemEnabled(redoBtn, gui.undo.canRedo());
    setItemEnabled(clearBtn, gui.undo.canUndo() || gui.undo.canRedo());
    updateToggle();
  }

  function updateToggle() {
    var enabled = isAppUndoEnabled();
    var forced = appUndoForcedByUrl();
    toggleBtn.classed('disabled', forced);
    toggleCheckbox.node().checked = enabled;
    toggleCheckbox.node().disabled = forced;
    toggleCheckbox.attr('aria-disabled', forced ? 'true' : 'false');
    note.text(enabled ?
      getRestoreDataNote(gui) :
      'Turn on undo before running commands you may want to undo.');
  }

  function clearUndoPayloadStore() {
    var store = gui.undoPayloadStore;
    if (store && store.clear) {
      return store.clear();
    }
    return Promise.resolve();
  }
}

export function isAppUndoEnabled() {
  return appUndoForcedByUrl() || appUndoSettingIsOn();
}

function setItemEnabled(el, enabled) {
  el.classed('disabled', !enabled);
  el.attr('aria-disabled', enabled ? 'false' : 'true');
}

function setAppUndoEnabled(enabled) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(APP_UNDO_KEY, enabled ? 'on' : 'off');
    }
  } catch(e) {}
}

function getRestoreDataNote(gui) {
  var stats = getUndoPayloadStats(gui);
  var bytes = stats ? stats.ownBytes || 0 : 0;
  return 'estimated on-disk restore data: ' + formatBytes(bytes);
}

function getUndoPayloadStats(gui) {
  var store = gui && gui.undoPayloadStore;
  return store && store.getStats ? store.getStats() : null;
}

function formatBytes(bytes) {
  var units = ['KB', 'MB', 'GB'];
  var value = bytes / 1000;
  var i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return value.toFixed(value < 10 && value >= 0.5 ? 1 : 0) + ' ' + units[i];
}
