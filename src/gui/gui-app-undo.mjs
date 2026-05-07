// Shared helpers for GUI controls that need to create app-level undo entries
// (the storage-backed undo flow used by console commands and a few GUI actions).
//
// The five GUI controls that grew their own copies of these helpers in the
// initial undo/redo commit (gui-add-layer-popup, gui-import-control,
// gui-layer-control, gui-simplify-control, gui-undo) should import from here
// instead.

import { internal } from './gui-core';
import { createStoredUndoHistory } from './gui-stored-undo-history';

var DEFAULT_HISTORY_LIMIT = 10;

// Returns true if the manifest, URL query, gui-installed checker, or
// localStorage indicates that app-level undo should be active.
export function appUndoIsEnabled(gui) {
  var opt = gui && gui.options && (gui.options.undoCommands || gui.options.appUndo);
  var query = getUndoQueryValue();
  if (opt === true || query == 'on' || query == 'commands') return true;
  if (gui && gui.appUndoIsEnabled) return gui.appUndoIsEnabled();
  return appUndoSettingIsOn();
}

// True when the undo URL flag forces app undo on regardless of UI settings.
// Mirrors the toggle-disable behavior in HistoryMenu.
export function appUndoForcedByUrl() {
  var query = getUndoQueryValue();
  return query == 'on' || query == 'commands';
}

// Read the persisted localStorage opt-in. Returns false in non-browser
// environments or when storage is blocked.
export function appUndoSettingIsOn() {
  try {
    return !!(typeof window != 'undefined' && window.localStorage &&
      window.localStorage.getItem('mapshaper.undo') == 'on');
  } catch(e) {
    return false;
  }
}

// Returns the per-gui-instance stored undo history, creating it on first use.
// Memoizing on `gui` avoids constructing parallel histories from different
// callers (the original code created multiple instances depending on which
// control ran first).
export function getStoredUndoHistory(gui) {
  if (!gui.storedUndoHistory) {
    gui.storedUndoHistory = createStoredUndoHistory(gui);
  }
  return gui.storedUndoHistory;
}

export function getUndoHistoryLimit(gui) {
  var opt = gui && gui.options && gui.options.undoHistoryLimit;
  return opt > 0 ? opt : DEFAULT_HISTORY_LIMIT;
}

// Construct an UndoTransaction if and only if app undo is enabled and the
// transaction can plausibly be added to history. Returns null when undo is
// off, when the gui's undo manager is missing, or when the UndoTransaction
// constructor cannot be located on the internal namespace.
export function createUndoTransaction(gui, label) {
  var Transaction;
  if (!appUndoIsEnabled(gui)) return null;
  if (!gui || !gui.undo || typeof gui.undo.addHistoryState != 'function') return null;
  Transaction = internal.UndoTransaction &&
    (internal.UndoTransaction.UndoTransaction || internal.UndoTransaction);
  return Transaction ? new Transaction(label || '') : null;
}

// Add a captured transaction to gui-level history. Pass options through to
// stored-undo-history.addTransaction(); fills in maxStates when not provided.
export function addUndoTransactionToHistory(gui, tx, opts) {
  if (!tx) return Promise.resolve(null);
  var fullOpts = Object.assign({maxStates: getUndoHistoryLimit(gui)}, opts || {});
  return getStoredUndoHistory(gui).addTransaction(tx, fullOpts).catch(function(e) {
    console.error(e);
  });
}

export function getUndoQueryValue() {
  return getQueryValue('undo');
}

function getQueryValue(key) {
  var rxp, match;
  if (typeof window == 'undefined' || !window.location) return null;
  rxp = new RegExp('[?&]' + key + '=([^&]+)');
  match = rxp.exec(window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}
