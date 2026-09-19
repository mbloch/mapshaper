import { FloatingToolbar } from './gui-floating-toolbar';
import { appUndoIsEnabled } from './gui-app-undo';

// Floating toolbar that exposes undo/redo while the user is in an editing
// interaction mode. The toolbar is the first consumer of FloatingToolbar;
// future per-mode toolbars (e.g. feature styling) can follow the same pattern.

export function EditToolbar(gui) {
  var toolbar = new FloatingToolbar(gui, { name: 'edit-toolbar' });
  var isMac = navigator.userAgent.includes('Mac');
  var modKey = isMac ? '\u2318' : 'Ctrl+';
  var shiftKey = isMac ? '\u21e7' : 'Shift+';

  var undoBtn = toolbar.addButton('#undo-icon', {
    tooltip: 'Undo (' + modKey + 'Z)'
  }).on('click', function() {
    gui.undo.undo();
  });

  var redoBtn = toolbar.addButton('#redo-icon', {
    tooltip: 'Redo (' + shiftKey + modKey + 'Z)'
  }).on('click', function() {
    gui.undo.redo();
  });

  updateButtons();

  gui.on('interaction_mode_change', function() {
    updateVisibility();
    // history is cleared on mode change; refresh button states next tick
    updateButtons();
  });

  gui.on('app_undo_setting_change', updateVisibility);

  gui.on('history_change', function(e) {
    undoBtn.setEnabled(!!e.canUndo);
    redoBtn.setEnabled(!!e.canRedo);
    // Visibility may also depend on history (e.g. attribute edits via popup
    // happen in modes that don't otherwise support undo).
    updateVisibility();
  });

  updateVisibility();

  // A mode that supports undo shows the toolbar before anything has been
  // edited, so that the buttons are where the user expects them. That is only
  // a promise worth making if undo is switched on: the modes that edit through
  // commands (label, the style panels) get their history from the stored undo
  // flow, so with the History menu's checkbox off nothing they do is undoable
  // and the toolbar would sit there permanently greyed out.
  //
  // `hasHistory` still shows it in that case, which matters for the drawing
  // and vertex modes: they add their own undo states as edits happen, without
  // going through stored undo, so their undo works with the checkbox off and
  // Ctrl-Z works too. There the toolbar appears with the first edit rather
  // than on entering the mode.
  function updateVisibility() {
    if (!gui.interaction) {
      toolbar.hide();
      return;
    }
    var mode = gui.interaction.getMode();
    var hasHistory = gui.undo.canUndo() || gui.undo.canRedo();
    var modeExpectsUndo = gui.interaction.modeSupportsUndo(mode) &&
      appUndoIsEnabled(gui);
    if (modeExpectsUndo || hasHistory) {
      toolbar.show();
    } else {
      toolbar.hide();
    }
  }

  function updateButtons() {
    undoBtn.setEnabled(gui.undo.canUndo());
    redoBtn.setEnabled(gui.undo.canRedo());
  }
}
