import { showPopupAlert } from './gui-alert';
import { internal } from './gui-core';
import { createStoredUndoHistory } from './gui-stored-undo-history';

export function openAddLayerPopup(gui) {
  var popup = showPopupAlert('', 'Add empty layer');
  var el = popup.container();
  el.addClass('option-menu');
  var html = `<div><input type="text" class="layer-name text-input" placeholder="layer name"></div>
  <div style="margin: 2px 0 4px;">
    Type: &nbsp;
    <label><input type="radio" name="geomtype" checked value="point" class="radio">point</label> &nbsp;
    <label><input type="radio" name="geomtype" value="polygon" class="radio">polygon</label> &nbsp;
    <label><input type="radio" name="geomtype" value="polyline" class="radio">line</label>
  </div>
  <div tabindex="0" class="btn dialog-btn">Create</div></span>`;
  el.html(html);
  var name = el.findChild('.layer-name');
  name.node().focus();
  var btn = el.findChild('.btn').on('click', function() {
    var nameStr = name.node().value.trim();
    var type = el.findChild('input:checked').node().value;
    addEmptyLayer(gui, nameStr, type);
    popup.close();
  });
}

export function addEmptyLayer(gui, name, type) {
  var targ = gui.model.getActiveLayer();
  var crsInfo = targ && internal.getDatasetCrsInfo(targ.dataset);
  var undoTransaction = createAddLayerUndoTransaction(gui);
  var dataset = {
    layers: [{
      name: name || undefined,
      geometry_type: type,
      shapes: []
    }],
    info: {}
  };
  if (type == 'polygon' || type == 'polyline') {
    dataset.arcs = new internal.ArcCollection();
  }
  if (crsInfo) {
    internal.setDatasetCrsInfo(dataset, crsInfo);
  }
  if (undoTransaction) {
    undoTransaction.captureCatalogBefore(gui.model, {operation: 'addEmptyLayer'});
  }
  gui.model.addDataset(dataset);
  gui.model.updated({select: true});
  addEmptyLayerUndoHistory(gui, undoTransaction);
}

function createAddLayerUndoTransaction(gui) {
  var Transaction;
  if (!appUndoIsEnabled(gui)) return null;
  if (!gui.undo || typeof gui.undo.addHistoryState != 'function') return null;
  Transaction = internal.UndoTransaction && (internal.UndoTransaction.UndoTransaction || internal.UndoTransaction);
  return Transaction ? new Transaction('add empty layer') : null;
}

function addEmptyLayerUndoHistory(gui, tx) {
  if (!tx) return;
  getStoredUndoHistory(gui).addTransaction(tx, {
    flags: {select: true},
    entryPrefix: 'add-layer',
    maxStates: getUndoHistoryLimit(gui)
  }).catch(function(e) {
    console.error(e);
  });
}

function getStoredUndoHistory(gui) {
  if (!gui.storedUndoHistory) {
    gui.storedUndoHistory = createStoredUndoHistory(gui);
  }
  return gui.storedUndoHistory;
}

function getUndoHistoryLimit(gui) {
  var opt = gui.options && gui.options.undoHistoryLimit;
  return opt > 0 ? opt : 10;
}

function appUndoIsEnabled(gui) {
  var opt = gui.options && (gui.options.undoCommands || gui.options.appUndo);
  var query = getQueryValue('undo');
  if (opt === true || query == 'on' || query == 'commands') return true;
  if (gui.appUndoIsEnabled) return gui.appUndoIsEnabled();
  try {
    return window.localStorage && window.localStorage.getItem('mapshaper.undo') == 'on';
  } catch(e) {
    return false;
  }
}

function getQueryValue(key) {
  var rxp, match;
  if (typeof window == 'undefined' || !window.location) return null;
  rxp = new RegExp('[?&]' + key + '=([^&]+)');
  match = rxp.exec(window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}
