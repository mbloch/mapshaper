import { internal } from './gui-core';
import { setPointCoords, setVertexCoords, getVertexCoords, insertVertex, deleteVertex } from './gui-display-utils';

var copyRecord = internal.copyRecord;

export function Undo(gui) {
  var history, offset, stashedUndo;
  reset();

  // Undo history is cleared when the editing mode changes.
  gui.on('interaction_mode_change', function(e) {
    gui.undo.clear();
  });

  function reset() {
    history = [];
    stashedUndo = null;
    offset = 0;
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

  gui.on('symbol_dragend', function(e) {
    var target = e.data.target;
    var undo = function() {
      setPointCoords(target, e.FID, e.startCoords);
    };
    var redo = function() {
      setPointCoords(target, e.FID, e.endCoords);
    };
    this.addHistoryState(undo, redo);
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

  gui.on('vertex_dragend', function(e) {
    var target = e.data.target;
    var startPoint = e.points[0]; // in data coords
    var endPoint = getVertexCoords(target, e.ids[0]);
    var undo = function() {
      if (e.insertion) {
        deleteVertex(target, e.ids[0]);
      } else {
        setVertexCoords(target, e.ids, startPoint);
      }
    };
    var redo = function() {
      if (e.insertion) {
        insertVertex(target, e.ids[0], endPoint);
      }
      setVertexCoords(target, e.ids, endPoint);
    };
    this.addHistoryState(undo, redo);
  }, this);

  gui.on('vertex_delete', function(e) {
    // get vertex coords in data coordinates (not display coordinates);
    var p = getVertexCoords(e.data.target, e.vertex_id);
    var redo = function() {
      deleteVertex(e.data.target, e.vertex_id);
    };
    var undo = function() {
      insertVertex(e.data.target, e.vertex_id, p);
    };
    this.addHistoryState(undo, redo);
  }, this);

  this.clear = function() {
    reset();
  };

  this.makeDataSetter = function(id) {
    var target = gui.model.getActiveLayer();
    var rec = copyRecord(target.layer.data.getRecordAt(id));
    return function() {
      target.layer.data.getRecords()[id] = rec;
      gui.dispatchEvent('popup-needs-refresh');
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
      gui.dispatchEvent('map-needs-refresh');
    }
  };

  this.redo = function() {
    if (offset <= 0) return;
    offset--;
    var item = getHistoryItem();
    item.redo();
    gui.dispatchEvent('map-needs-refresh');
  };

  function getHistoryItem() {
    var item = history[history.length - offset - 1];
    return item || null;
  }

}
