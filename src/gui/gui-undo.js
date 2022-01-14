import { internal } from './gui-core';
import { snapVerticesToPoint } from './gui-symbol-dragging2';
// import { cloneShape } from '../paths/mapshaper-shape-utils';
// import { copyRecord } from '../datatable/mapshaper-data-utils';
var cloneShape = internal.cloneShape;
var copyRecord = internal.copyRecord;

export function Undo(gui) {
  var history, offset, stashedUndo;
  reset();

  function reset() {
    history = [];
    stashedUndo = null;
    offset = 0;
  }

  function refreshMap() {
    gui.dispatchEvent('undo_redo');
  }

  function isUndoEvt(e) {
    return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key == 'z';
  }

  function isRedoEvt(e) {
    return (e.ctrlKey || e.metaKey) && (e.shiftKey && e.key == 'z' || !e.shiftKey && e.key == 'y');
  }

  gui.keyboard.on('keydown', function(evt) {
    var e = evt.originalEvent,
        kc = e.keyCode;
    if (isUndoEvt(e)) {
      this.undo();
      e.stopPropagation();
      e.preventDefault();
    }
    if (isRedoEvt(e)) {
      this.redo();
      e.stopPropagation();
      e.preventDefault();
    }

  }, this, 10);

  // undo/redo point/symbol dragging
  //
  gui.on('symbol_dragstart', function(e) {
    stashedUndo = this.makePointSetter(e.FID);
  }, this);

  gui.on('symbol_dragend', function(e) {
    var redo = this.makePointSetter(e.FID);
    this.addHistoryState(stashedUndo, redo);
  }, this);

  // undo/redo label dragging
  //
  gui.on('label_dragstart', function(e) {
    stashedUndo = this.makeDataSetter(e.FID);
  }, this);

  gui.on('label_dragend', function(e) {
    var redo = this.makeDataSetter(e.FID);
    this.addHistoryState(stashedUndo, redo);
  }, this);

  // undo/redo data editing
  // TODO: consider setting selected feature to the undo/redo target feature
  //
  gui.on('data_preupdate', function(e) {
    stashedUndo = this.makeDataSetter(e.FID);
  }, this);

  gui.on('data_postupdate', function(e) {
    var redo = this.makeDataSetter(e.FID);
    this.addHistoryState(stashedUndo, redo);
  }, this);

  // undo/redo vertex dragging
  gui.on('vertex_dragstart', function(e) {
    stashedUndo = this.makeVertexSetter(e.FID, e.vertex_ids);
  }, this);

  gui.on('vertex_dragend', function(e) {
    var redo = this.makeVertexSetter(e.FID, e.vertex_ids);
    this.addHistoryState(stashedUndo, redo);
  }, this);

  this.clear = function() {
    reset();
  };

  this.makePointSetter = function(i) {
    var target = gui.model.getActiveLayer();
    var shp = cloneShape(target.layer.shapes[i]);
    return function() {
      target.layer.shapes[i] = shp;
    };
  };

  this.makeDataSetter = function(id) {
    var target = gui.model.getActiveLayer();
    var rec = copyRecord(target.layer.data.getRecordAt(id));
    return function() {
      target.layer.data.getRecords()[id] = rec;
      gui.dispatchEvent('popup-needs-refresh');
    };
  };

  this.makeVertexSetter = function(fid, ids) {
    var target = gui.model.getActiveLayer();
    var arcs = target.dataset.arcs;
    var p = arcs.getVertex2(ids[0]);
    return function() {
      snapVerticesToPoint(ids, p, arcs, true);
    };
  };

  this.addHistoryState = function(undo, redo) {
    if (offset > 0) {
      history.splice(-offset);
      offset = 0;
    }
    history.push({undo, redo});
  };

  this.undo = function() {
    var item = getHistoryItem();
    if (item) {
      offset++;
      item.undo();
      refreshMap();
    }
  };

  this.redo = function() {
    if (offset <= 0) return;
    offset--;
    var item = getHistoryItem();
    item.redo();
    refreshMap();
  };

  function getHistoryItem() {
    var item = history[history.length - offset - 1];
    return item || null;
  }

}
