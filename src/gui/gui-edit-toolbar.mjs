import { FloatingToolbar } from './gui-floating-toolbar';

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

  gui.on('history_change', function(e) {
    undoBtn.setEnabled(!!e.canUndo);
    redoBtn.setEnabled(!!e.canRedo);
    // Visibility may also depend on history (e.g. attribute edits via popup
    // happen in modes that don't otherwise support undo).
    updateVisibility();
  });

  updateVisibility();

  function updateVisibility() {
    if (!gui.interaction) {
      toolbar.hide();
      return;
    }
    var mode = gui.interaction.getMode();
    var hasHistory = gui.undo.canUndo() || gui.undo.canRedo();
    if (gui.interaction.modeSupportsUndo(mode) || hasHistory) {
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
