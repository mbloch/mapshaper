import {
  appUndoForcedByUrl,
  appUndoSettingIsOn,
  getUndoQueryValue
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
  var createSnapshotBtn = menu.findChild('.history-create-snapshot-btn');
  var snapshotList = menu.findChild('.history-snapshot-list');

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
    var enabled = !!toggleCheckbox.node().checked;
    e.stopPropagation();
    if (appUndoForcedByUrl()) return;
    setAppUndoEnabled(enabled);
    if (!enabled) discardUndoHistory();
    updateMenuState();
    // The setting lives in localStorage, which nothing can observe, so
    // controls whose appearance depends on it (the floating undo toolbar) have
    // to be told that it changed.
    gui.dispatchEvent('app_undo_setting_change', {enabled: enabled});
  });

  // Everything recorded before undo was switched off has to go, because from
  // here on edits are not all recorded and a state captured earlier restores
  // the data as it stood before them. Undoing one would take back work the
  // user never asked to take back, and leave a redo stack describing a version
  // of the layer that never existed.
  //
  // Emptying the history is also what takes the floating toolbar away: it
  // shows itself for any history it can see, whether or not the setting is on,
  // because interaction undo does not depend on the setting.
  function discardUndoHistory() {
    var hadHistory = gui.undo.canUndo() || gui.undo.canRedo();
    gui.undo.clear();
    // The restore payloads go too. Disposing the history items releases the
    // ones they own, so this is for anything left over -- and it is what makes
    // the menu's "restore data stored on-disk" figure honest.
    clearUndoPayloadStore().then(updateMenuState).catch(function(err) {
      console.error(err);
    });
    if (!hadHistory) return;
    // Worth a word: the undo the user could have reached a moment ago is gone,
    // and the menu's own on-disk figure is about to drop to zero.
    if (gui.notify) {
      gui.notify({
        severity: 'info',
        title: 'Undo history discarded',
        body: 'Turning off undo clears what was already recorded, because later edits are not.',
        dedupKey: 'undo:history-discarded'
      });
    }
  }

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

  createSnapshotBtn.on('click', function(e) {
    e.stopPropagation();
    if (!createSnapshotBtn.hasClass('disabled') && gui.sessionSnapshots) {
      gui.sessionSnapshots.saveSnapshot().then(renderSnapshotList);
    }
  });

  document.addEventListener('keydown', function(e) {
    if (gui.getMode() == 'history_menu' && e.key == 'Escape') {
      gui.clearMode();
    }
  });

  gui.on('history_change', updateMenuState);
  updateMenuState();

  function turnOn() {
    btn.attr('aria-expanded', 'true');
    updateMenuState();
    renderSnapshotList();
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
    setItemEnabled(createSnapshotBtn, !!(gui.sessionSnapshots && gui.sessionSnapshots.enabled));
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

  function renderSnapshotList() {
    if (gui.sessionSnapshots && gui.sessionSnapshots.enabled && snapshotList) {
      gui.sessionSnapshots.renderSnapshotList(snapshotList);
    } else if (snapshotList) {
      snapshotList.empty();
    }
  }
}

export function isAppUndoEnabled() {
  if (getUndoQueryValue() == 'off') return false;
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
  return 'restore data stored on-disk: ' + formatBytes(bytes);
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
