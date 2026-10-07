import { FloatingToolbar, getVisibleFloatingToolbars, makeToolbarButton } from './gui-floating-toolbar';
import { appUndoIsEnabled } from './gui-app-undo';
import { El } from './gui-el';

// Undo/redo while the user is in an editing interaction mode. The buttons are
// a group that joins the start of the bottom tool toolbar when there is one,
// ahead of a separator, so that a tool and undo take one row rather than two
// stacked over the map. With no tool toolbar showing, the group has a toolbar
// of its own.

export function EditToolbar(gui) {
  var toolbar = new FloatingToolbar(gui, { name: 'edit-toolbar' });
  var group = El('div').addClass('undo-redo-buttons');
  var isMac = navigator.userAgent.includes('Mac');
  var modKey = isMac ? '\u2318' : 'Ctrl+';
  var shiftKey = isMac ? '\u21e7' : 'Shift+';
  var wanted = false;

  var undoBtn = makeToolbarButton(group, '#undo-icon', {
    tooltip: 'Undo (' + modKey + 'Z)'
  }).on('click', function() {
    gui.undo.undo();
  });

  var redoBtn = makeToolbarButton(group, '#redo-icon', {
    tooltip: 'Redo (' + shiftKey + modKey + 'Z)'
  }).on('click', function() {
    gui.undo.redo();
  });
  El('div').addClass('floating-toolbar-separator').appendTo(group);

  toolbar.dock(group);
  updateButtons();

  gui.on('interaction_mode_change', function() {
    updateVisibility();
    // history is cleared on mode change; refresh button states next tick
    updateButtons();
  });

  gui.on('app_undo_setting_change', updateVisibility);

  gui.on('floating_toolbar_change', placeGroup);

  gui.on('history_change', function(e) {
    undoBtn.setEnabled(!!e.canUndo);
    redoBtn.setEnabled(!!e.canRedo);
    // Visibility may also depend on history (e.g. attribute edits via popup
    // happen in modes that don't otherwise support undo).
    updateVisibility();
  });

  updateVisibility();

  // A mode that supports undo shows the buttons before anything has been
  // edited, so that they are where the user expects them. That is only
  // a promise worth making if undo is switched on: the modes that edit through
  // commands (label, the style panels) get their history from the stored undo
  // flow, so with the History menu's checkbox off nothing they do is undoable
  // and the buttons would sit there permanently greyed out.
  //
  // `hasHistory` still shows them in that case, which matters for the drawing
  // and vertex modes: they add their own undo states as edits happen, without
  // going through stored undo, so their undo works with the checkbox off and
  // Ctrl-Z works too. There the buttons appear with the first edit rather
  // than on entering the mode.
  function updateVisibility() {
    if (!gui.interaction) {
      wanted = false;
    } else {
      var mode = gui.interaction.getMode();
      var hasHistory = gui.undo.canUndo() || gui.undo.canRedo();
      var modeExpectsUndo = gui.interaction.modeSupportsUndo(mode) &&
        appUndoIsEnabled(gui);
      wanted = modeExpectsUndo || hasHistory;
    }
    placeGroup();
  }

  function placeGroup() {
    var host = getVisibleFloatingToolbars(gui).filter(function(o) {
      return o != toolbar;
    })[0];
    if (wanted && host) {
      host.dock(group);
      toolbar.hide();
    } else {
      toolbar.dock(group);
      if (wanted) toolbar.show();
      else toolbar.hide();
    }
  }

  function updateButtons() {
    undoBtn.setEnabled(gui.undo.canUndo());
    redoBtn.setEnabled(gui.undo.canRedo());
  }
}
