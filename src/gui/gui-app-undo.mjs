// Shared helpers for GUI controls that need to create app-level undo entries
// (the storage-backed undo flow used by console commands and a few GUI actions).
//
// The five GUI controls that grew their own copies of these helpers in the
// initial undo/redo commit (gui-add-layer, gui-import-control,
// gui-layer-control, gui-simplify-control, gui-undo) should import from here
// instead.

import { internal } from './gui-core';
import { createStoredUndoHistory } from './gui-stored-undo-history';

// Undo is on unless it has been turned off. Undoing is what a user expects by
// default; the History menu's checkbox exists so that sessions working with
// data too large to store restore payloads for can opt out.
var APP_UNDO_DEFAULT = true;

// Returns true if the manifest, URL query, gui-installed checker, or
// localStorage indicates that app-level undo should be active.
export function appUndoIsEnabled(gui) {
  var opt = gui && gui.options && (gui.options.undoCommands || gui.options.appUndo);
  var query = getUndoQueryValue();
  if (query == 'off') return false;
  if (opt === true || query == 'on' || query == 'commands') return true;
  if (gui && gui.appUndoIsEnabled) return gui.appUndoIsEnabled();
  return appUndoSettingIsOn();
}

// True when the undo URL flag pins app undo on or off regardless of UI
// settings. Mirrors the toggle-disable behavior in HistoryMenu.
export function appUndoForcedByUrl() {
  var query = getUndoQueryValue();
  return query == 'on' || query == 'commands' || query == 'off';
}

// Read the persisted setting. Only an explicit opt-out turns undo off, so a
// first-time session (and one where storage is unreadable) gets the default.
export function appUndoSettingIsOn() {
  try {
    if (typeof window == 'undefined' || !window.localStorage) return APP_UNDO_DEFAULT;
    return window.localStorage.getItem('mapshaper.undo') != 'off';
  } catch(e) {
    return APP_UNDO_DEFAULT;
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

// Add a captured transaction to gui-level history. Options are passed through
// to stored-undo-history.addTransaction(). History is not capped by entry
// count: entries are dropped only when their restore data no longer fits in
// the payload store.
export function addUndoTransactionToHistory(gui, tx, opts) {
  if (!tx) return Promise.resolve(null);
  // Undo can be switched off between the start of an edit and its end, and the
  // transaction was captured at the start -- a simplify session or an import
  // can easily straddle the moment. Adding it now would put a state back into
  // a history the History menu had just emptied, on purpose.
  if (!appUndoIsEnabled(gui)) return Promise.resolve(null);
  return getStoredUndoHistory(gui).addTransaction(tx, opts || {}).catch(function(e) {
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
