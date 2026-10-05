import { El } from './gui-el';
import { isTextInput } from './gui-panel-focus';

// A popup beside the color scheme panel for importing a palette: a file
// dropped on it, or text pasted while it's open. The app loads
// dropped and pasted files as data (see gui-import-control.mjs), so the popup
// keeps its drops and pastes from reaching the page.
//
// opts.onImport(text)  imports a palette, returning a note about what
//                      couldn't be imported (or null); throws an Error
//                      if the text isn't a palette
// opts.onClose()       the dialog was closed
var maxFileSize = 1e6;

export function ColorSchemeImportDialog(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel color-scheme-import-dialog').appendTo(parent).hide();
  var isOpen = false;
  var dropEl, messageEl;

  initDialog();

  this.open = function() {
    if (isOpen) return;
    isOpen = true;
    showMessage('');
    panel.show();
    document.addEventListener('paste', onPaste, true);
  };

  this.close = close;

  this.isOpen = function() {
    return isOpen;
  };

  function close() {
    if (!isOpen) return;
    isOpen = false;
    document.removeEventListener('paste', onPaste, true);
    dropEl.removeClass('over');
    panel.hide();
    if (opts.onClose) opts.onClose();
  }

  function initDialog() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    El('span').appendTo(header).text('Import a palette');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', close);
    dropEl = El('div').addClass('color-scheme-import-drop').appendTo(panel)
      .text('Drop a GMT (.cpt) or JSON palette file here, or paste a palette or a list of colors');
    messageEl = El('div').addClass('color-scheme-import-message').appendTo(panel);

    ['dragenter', 'dragover'].forEach(function(type) {
      panel.node().addEventListener(type, function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropEl.addClass('over');
      });
    });
    panel.node().addEventListener('dragleave', function(e) {
      e.stopPropagation();
      if (!panel.node().contains(e.relatedTarget)) dropEl.removeClass('over');
    });
    panel.node().addEventListener('drop', function(e) {
      var transfer = e.dataTransfer;
      e.preventDefault();
      e.stopPropagation();
      dropEl.removeClass('over');
      if (transfer.files.length > 0) {
        readFile(transfer.files[0]);
      } else {
        importText(transfer.getData('text/plain'));
      }
    });
  }

  // Pastes while the popup is open are palettes, unless they're into
  // another text field. Copied text can come with a picture of itself,
  // which isn't a palette, and a copied file with its name as text.
  function onPaste(e) {
    var data = e.clipboardData;
    var file = data && Array.from(data.files || []).find(function(f) {
      return !/^image\//.test(f.type);
    });
    if (isTextInput(e.target) && !panel.node().contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (file) {
      readFile(file);
    } else {
      importText(data ? data.getData('text/plain') : '');
    }
  }

  function readFile(file) {
    if (file.size > maxFileSize) {
      showMessage('The file is too big to be a palette.', true);
      return;
    }
    file.text().then(importText, function() {
      showMessage('The file can\'t be read.', true);
    });
  }

  function importText(text) {
    var note;
    if (!isOpen) return;
    try {
      note = opts.onImport(text);
    } catch(e) {
      showMessage(e.message, true);
      return;
    }
    if (note) {
      showMessage(note, false);
    } else {
      close();
    }
  }

  function showMessage(msg, isError) {
    messageEl.text(msg).classed('hidden', !msg).classed('error', !!isError);
  }
}
